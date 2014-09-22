var repl = require('repl')
var promisify = require('repl-promised').promisify
var temp = require('temp')
var open = require('open')

module.exports.init = function (generator, logger) {
  process.nextTick(function () {
    cmd = repl.start({
      prompt: 'generator> ',
      ignoreUndefined: true,
    })

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
  })
}
