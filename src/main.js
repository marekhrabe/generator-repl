var stream = require('stream')
var repl = require('./repl')
var util = require('util')
var promisify = require('repl-promised').promisify
var temp = require('temp')
var open = require('open')
var q = require('q')
var ansi = require('ansi-to-html')
var convertor = new ansi()

var Bridge = require('panel-photoshop-bridge')

module.exports.init = function (generator, logger) {
  savePixmap = function (pixmap, callback) {
    if (pixmap.__replTempFile) {
      return process.nextTick(callback.bind(pixmap.__replTempFile))
    }

    var file = temp.openSync({ suffix: '.png' }).path
    pixmap.__replTempFile = file
    generator.savePixmap(pixmap, file, {
      ppi: 72,
      quality: 32,
      format: 'png',
    }).then(function () {
      callback(file)
    })
  }

  cmd = repl.start()
  promisify(cmd)

  cmd.on('output', function (data) {
    if (data && data.constructor && data.constructor.name === 'Pixmap') {
      savePixmap(data, function (url) {
        bridge.emit('pixmap', data)
      })
    }
    bridge.emit('html', convertor.toHtml(util.inspect(data, false, 3, true)))
  })

  bridge = new Bridge({
    pkg: require('../package.json'),
    generator: generator
  })

  bridge.on('cmd', function (command) {
    cmd.emit('line', command)
  })

  bridge.on('complete', function (command) {
    cmd.complete(command, function (err, data) {
      bridge.emit('completions', data)
    })
  })

  bridge.on('fn', function (command) {
    cmd.getFunctionParams(command, function (err, data) {
      bridge.emit('params', data)
    })
  })

  cmd.context.generator = generator
  cmd.context.logger = logger
  cmd.context.cmd = cmd
  cmd.context.jsx = generator.evaluateJSXString.bind(generator)
  cmd.context.copy = generator.copyToClipboard.bind(generator)
  cmd.context.clear = function () {
    process.nextTick(bridge.emit.bind(bridge, 'clear'))
  }

  cmd.context.showPixmap = function (pixmap) {
    savePixmap(pixmap, open)
  }
}
