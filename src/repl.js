var stream = require('stream')
var repl = require('repl')
var promisify = require('repl-promised').promisify
var temp = require('temp')
var open = require('open')

var Bridge = require('panel-photoshop-bridge')

module.exports.init = function (generator, logger) {
  var read = new stream.Readable
  read._read = function () {}
  var write = new stream.Writable
  write._write = function () {}

  cmd = repl.start({
    prompt: '',
    ignoreUndefined: true,
    input: read,
    output: write,
    terminal: false
  })

  bridge = new Bridge({
    pkg: require('../package.json'),
    generator: generator
  })

  bridge.on('cmd', function (command) {
    read.push(command + '\n')
  })

  bridge.on('complete', function (command) {
    cmd.complete(command, function (err, data) {
      bridge.emit('completions', data)
    })
  })

  write.write = function (data) {
    bridge.emit('output', data)
  }

  promisify(cmd)

  jsxEnabled = false

  nodeLineListener = cmd.rli.listeners('line')[0]
  cmd.rli.removeListener('line', nodeLineListener)
  cmd.rli.on('line', function (input) {
    if (jsxEnabled) {
      cmd.context.__tempJsxCmd = input
      nodeLineListener('jsx(__tempJsxCmd)')
    } else {
      nodeLineListener(input)
    }
  })

  cmd.inputStream.on('keypress', function (char, key) {
    if (key && key.name === 'escape') {
      if (jsxEnabled) {
        cmd.rli.setPrompt('generator> ')
        cmd.prompt = 'generator> '
      } else {
        cmd.rli.setPrompt('jsx> ')
        cmd.prompt = 'jsx> '
      }

      jsxEnabled = !jsxEnabled
      cmd.rli.prompt(true)
    }
  })

  cmd.context.generator = generator
  cmd.context.logger = logger
  cmd.context.cmd = cmd
  cmd.context.jsx = generator.evaluateJSXString.bind(generator)

  cmd.context.showPixmap = function (pixmap) {
    var file = temp.openSync({ suffix: '.png' }).path
    generator.savePixmap(pixmap, file, {
      ppi: 72,
      quality: 32,
      format: 'png',
    }).then(function () {
      open(file)
    })
  }
}
