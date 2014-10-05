// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');
var inherits = require('util').inherits;
var Stream = require('stream');
var vm = require('vm');
var path = require('path');
var fs = require('fs');
var rl = require('readline');
var Console = require('console').Console;
var domain = require('domain');
var events = require('events');
var debug = function noop () {};

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}


// hack for require.resolve("./relative") to work properly.
module.filename = path.resolve('repl');

// hack for repl require to work properly with node_modules folders
module.paths = require('module')._nodeModulePaths(module.filename);

exports._builtinLibs = ['assert', 'buffer', 'child_process', 'cluster',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https', 'net',
  'os', 'path', 'punycode', 'querystring', 'readline', 'stream',
  'string_decoder', 'tls', 'tty', 'url', 'util', 'vm', 'zlib', 'smalloc',
  'tracing'];


function REPLServer() {
  if (!(this instanceof REPLServer)) {
    return new REPLServer();
  }

  events.EventEmitter.call(this);

  var self = this;

  self._domain = domain.create();

  self.outputStream = {
    write: function (out) {
      self.emit('output', out)
    }
  }

  eval_ = function defaultEval(code, context, file, cb) {
    var err, result;
    // first, create the Script object to check the syntax
    try {
      var script = vm.createScript(code, {
        filename: file,
        displayErrors: false
      });
    } catch (e) {
      debug('parse error %j', code, e);
      if (isRecoverableError(e))
        err = new Recoverable(e);
      else
        err = e;
    }

    if (!err) {
      try {
        result = script.runInContext(context, { displayErrors: false });
      } catch (e) {
        err = e;
        if (err && process.domain) {
          debug('not recoverable, send to domain');
          process.domain.emit('error', err);
          process.domain.exit();
          return;
        }
      }
    }

    cb(err, result);
  };

  self.eval = self._domain.bind(eval_);

  self._domain.on('error', function(e) {
    debug('domain error');
    self.emit('output', (e.stack || e) + '\n');
  });

  self.resetContext();

  function complete(text, callback) {
    self.complete(text, callback);
  }

  self.on('line', function (cmd) {
    debug('line %j', cmd);
    cmd = trimWhitespace(cmd);

    var evalCmd = cmd;
    if (/^\s*\{/.test(evalCmd) && /\}\s*$/.test(evalCmd)) {
      // It's confusing for `{ a : 1 }` to be interpreted as a block
      // statement rather than an object literal.  So, we first try
      // to wrap it in parentheses, so that it will be interpreted as
      // an expression.
      evalCmd = '(' + evalCmd + ')\n';
    } else {
      // otherwise we just append a \n so that it will be either
      // terminated, or continued onto the next expression if it's an
      // unexpected end of input.
      evalCmd = evalCmd + '\n';
    }

    debug('eval %j', evalCmd);
    self.eval(evalCmd, self.context, 'repl', finish);

    function finish(e, ret) {
      debug('finish', e, ret);

      // If error was SyntaxError and not JSON.parse error
      if (e) {
        debug('finish error')
        self._domain.emit('error', e);
      } else {
        debug('emit')
        self.context._ = ret;
        self.emit('output', ret);
      }
    };
  });
}
util.inherits(REPLServer, events.EventEmitter);
exports.REPLServer = REPLServer;


// prompt is a string to print on each line for the prompt,
// source is a stream to use for I/O, defaulting to stdin/stdout.
exports.start = function() {
  var repl = new REPLServer();
  if (!exports.repl) exports.repl = repl;
  return repl;
};

REPLServer.prototype.createContext = function() {
  var context = vm.createContext();
  for (var i in global) context[i] = global[i];
  context.console = new Console(this.outputStream);
  context.global = context;
  context.global.global = context;

  context.module = module;
  context.require = require;

  // make built-in modules available directly
  // (loaded lazily)
  exports._builtinLibs.forEach(function(name) {
    Object.defineProperty(context, name, {
      get: function() {
        var lib = require(name);
        context._ = context[name] = lib;
        return lib;
      },
      // allow the creation of other globals with this name
      set: function(val) {
        delete context[name];
        context[name] = val;
      },
      configurable: true
    });
  });

  return context;
};

REPLServer.prototype.resetContext = function() {
  this.context = this.createContext();

  // Allow REPL extensions to extend the new context
  this.emit('reset', this.context);
};

// A stream to push an array into a REPL
// used in REPLServer.complete
function ArrayStream() {
  Stream.call(this);

  this.run = function(data) {
    var self = this;
    data.forEach(function(line) {
      self.emit('data', line + '\n');
    });
  }
}
util.inherits(ArrayStream, Stream);
ArrayStream.prototype.readable = true;
ArrayStream.prototype.writable = true;
ArrayStream.prototype.resume = function() {};
ArrayStream.prototype.write = function() {};

var requireRE = /\brequire\s*\(['"](([\w\.\/-]+\/)?([\w\.\/-]*))/;
var simpleExpressionRE =
    /(([a-zA-Z_$](?:\w|\$)*)\.)*([a-zA-Z_$](?:\w|\$)*)\.?$/;

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '')
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
  if(result === null)
     result = []
  return result
}

REPLServer.prototype.getFunctionParams = function (line, callback) {
  line = line.substr(0, line.length - 1);
  if (simpleExpressionRE.exec(line)) {
    var expr = '(' + line + ')';
    this.eval(expr, this.context, 'repl', function(e, obj) {
      if (typeof obj === 'function') {
        callback(null, getParamNames(obj))
      }
    });
  }
}

// Provide a list of completions for the given leading text. This is
// given to the readline interface for handling tab completion.
//
// Example:
//  complete('var foo = util.')
//    -> [['util.print', 'util.debug', 'util.log', 'util.inspect', 'util.pump'],
//        'util.' ]
//
// Warning: This eval's code like "foo.bar.baz", so it will run property
// getter code.
REPLServer.prototype.complete = function(line, callback) {
  var completions;

  // list of completion lists, one for each inheritance "level"
  var completionGroups = [];

  var completeOn, match, filter, i, group, c;

  var match = null;
  if (match = line.match(requireRE)) {
    // require('...<Tab>')
    var exts = Object.keys(require.extensions);
    var indexRe = new RegExp('^index(' + exts.map(regexpEscape).join('|') +
                             ')$');

    completeOn = match[1];
    var subdir = match[2] || '';
    var filter = match[1];
    var dir, files, f, name, base, ext, abs, subfiles, s;
    group = [];
    var paths = module.paths.concat(require('module').globalPaths);
    for (i = 0; i < paths.length; i++) {
      dir = path.resolve(paths[i], subdir);
      try {
        files = fs.readdirSync(dir);
      } catch (e) {
        continue;
      }
      for (f = 0; f < files.length; f++) {
        name = files[f];
        ext = path.extname(name);
        base = name.slice(0, -ext.length);
        if (base.match(/-\d+\.\d+(\.\d+)?/) || name === '.npm') {
          // Exclude versioned names that 'npm' installs.
          continue;
        }
        if (exts.indexOf(ext) !== -1) {
          if (!subdir || base !== 'index') {
            group.push(subdir + base);
          }
        } else {
          abs = path.resolve(dir, name);
          try {
            if (fs.statSync(abs).isDirectory()) {
              group.push(subdir + name + '/');
              subfiles = fs.readdirSync(abs);
              for (s = 0; s < subfiles.length; s++) {
                if (indexRe.test(subfiles[s])) {
                  group.push(subdir + name);
                }
              }
            }
          } catch (e) {}
        }
      }
    }
    if (group.length) {
      completionGroups.push(group);
    }

    if (!subdir) {
      completionGroups.push(exports._builtinLibs);
    }

    completionGroupsLoaded();

  // Handle variable member lookup.
  // We support simple chained expressions like the following (no function
  // calls, etc.). That is for simplicity and also because we *eval* that
  // leading expression so for safety (see WARNING above) don't want to
  // eval function calls.
  //
  //   foo.bar<|>     # completions for 'foo' with filter 'bar'
  //   spam.eggs.<|>  # completions for 'spam.eggs' with filter ''
  //   foo<|>         # all scope vars with filter 'foo'
  //   foo.<|>        # completions for 'foo' with filter ''
  } else if (line.length === 0 || line[line.length - 1].match(/\w|\.|\$/)) {
    match = simpleExpressionRE.exec(line);
    if (line.length === 0 || match) {
      var expr;
      completeOn = (match ? match[0] : '');
      if (line.length === 0) {
        filter = '';
        expr = '';
      } else if (line[line.length - 1] === '.') {
        filter = '';
        expr = match[0].slice(0, match[0].length - 1);
      } else {
        var bits = match[0].split('.');
        filter = bits.pop();
        expr = bits.join('.');
      }

      // Resolve expr and get its completions.
      var memberGroups = [];
      if (!expr) {
        // If context is instance of vm.ScriptContext
        // Get global vars synchronously
        var contextProto = this.context;
        while (contextProto = Object.getPrototypeOf(contextProto)) {
          completionGroups.push(Object.getOwnPropertyNames(contextProto));
        }
        completionGroups.push(Object.getOwnPropertyNames(this.context));
        addStandardGlobals(completionGroups, filter);
        completionGroupsLoaded();
      } else {
        this.eval(expr, this.context, 'repl', function(e, obj) {
          if (e) console.log(e);

          if (obj != null) {
            if (typeof obj === 'object' || typeof obj === 'function') {
              memberGroups.push(Object.getOwnPropertyNames(obj));
            }
            try {
              var sentinel = 5;
              var p;
              if (typeof obj === 'object' || typeof obj === 'function') {
                p = Object.getPrototypeOf(obj);
              } else {
                p = obj.constructor ? obj.constructor.prototype : null;
              }
              while (p !== null) {
                memberGroups.push(Object.getOwnPropertyNames(p));
                p = Object.getPrototypeOf(p);
                // Circular refs possible? Let's guard against that.
                sentinel--;
                if (sentinel <= 0) {
                  break;
                }
              }
            } catch (e) {
              console.log("completion error walking prototype chain:" + e);
            }
          }

          if (memberGroups.length) {
            for (i = 0; i < memberGroups.length; i++) {
              completionGroups.push(memberGroups[i].map(function(member) {
                return expr + '.' + member;
              }));
            }
            if (filter) {
              filter = expr + '.' + filter;
            }
          }

          completionGroupsLoaded();
        });
      }
    } else {
      completionGroupsLoaded();
    }
  } else {
    completionGroupsLoaded();
  }

  // Will be called when all completionGroups are in place
  // Useful for async autocompletion
  function completionGroupsLoaded(err) {
    if (err) throw err;

    // Filter, sort (within each group), uniq and merge the completion groups.
    if (completionGroups.length && filter) {
      var newCompletionGroups = [];
      for (i = 0; i < completionGroups.length; i++) {
        group = completionGroups[i].filter(function(elem) {
          return elem.indexOf(filter) == 0;
        });
        if (group.length) {
          newCompletionGroups.push(group);
        }
      }
      completionGroups = newCompletionGroups;
    }

    if (completionGroups.length) {
      var uniq = {};  // unique completions across all groups
      completions = [];
      // Completion group 0 is the "closest"
      // (least far up the inheritance chain)
      // so we put its completions last: to be closest in the REPL.
      for (i = completionGroups.length - 1; i >= 0; i--) {
        group = completionGroups[i];
        group.sort();
        for (var j = 0; j < group.length; j++) {
          c = group[j];
          if (!hasOwnProperty(uniq, c)) {
            completions.push(c);
            uniq[c] = true;
          }
        }
        completions.push(''); // separator btwn groups
      }
      while (completions.length && completions[completions.length - 1] === '') {
        completions.pop();
      }
    }

    callback(null, [completions || [], completeOn]);
  }
};


function addStandardGlobals(completionGroups, filter) {
  // Global object properties
  // (http://www.ecma-international.org/publications/standards/Ecma-262.htm)
  completionGroups.push(['NaN', 'Infinity', 'undefined',
    'eval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI',
    'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
    'Object', 'Function', 'Array', 'String', 'Boolean', 'Number',
    'Date', 'RegExp', 'Error', 'EvalError', 'RangeError',
    'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
    'Math', 'JSON']);
  // Common keywords. Exclude for completion on the empty string, b/c
  // they just get in the way.
  if (filter) {
    completionGroups.push(['break', 'case', 'catch', 'const',
      'continue', 'debugger', 'default', 'delete', 'do', 'else',
      'export', 'false', 'finally', 'for', 'function', 'if',
      'import', 'in', 'instanceof', 'let', 'new', 'null', 'return',
      'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined',
      'var', 'void', 'while', 'with', 'yield']);
  }
}

function trimWhitespace(cmd) {
  var trimmer = /^\s*(.+)\s*$/m,
      matches = trimmer.exec(cmd);

  if (matches && matches.length === 2) {
    return matches[1];
  }
  return '';
}


function regexpEscape(s) {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// If the error is that we've unexpectedly ended the input,
// then let the user try to recover by adding more input.
function isRecoverableError(e) {
  return e &&
      e.name === 'SyntaxError' &&
      /^(Unexpected end of input|Unexpected token :)/.test(e.message);
}

function Recoverable(err) {
  this.err = err;
}
inherits(Recoverable, SyntaxError);
