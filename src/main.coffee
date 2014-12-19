stream = require 'stream'
repl = require './repl'
util = require 'util'
promisify = require('repl-promised').promisify
temp = require 'temp'
PNG = require('pngjs').PNG
open = require 'open'
q = require 'q'
ansi = require 'ansi-to-html'
convertor = new ansi()
Bridge = require 'panel-photoshop-bridge'

pkg = require '../package.json'

module.exports.init = (generator, logger) ->
  pixmaps = {}
  pixmapID = 0
  getPixmapURL = (pixmap, callback) ->
    if pixmap.__replTempURL
      return callback pixmap.__replTempURL

    id = ++pixmapID
    pixmaps[id] = png = new PNG
      width: pixmap.width
      height: pixmap.height

    pixmap.__replTempURL = "http://sourcelocalhost.com:" + pkg.panel.port + "/pixmap/#{id}"

    pixels = new Buffer pixmap.pixels.length
    pixmap.pixels.copy pixels

    i = 0
    while i < pixels.length
      alpha = pixels[i]
      pixels[i] = pixels[i + 1]
      pixels[i + 1] = pixels[i + 2]
      pixels[i + 2] = pixels[i + 3]
      pixels[i + 3] = alpha
      i += pixmap.channelCount

    png.data = pixels

    callback pixmap.__replTempURL

  cmd = repl.start()
  promisify cmd
  cmd.on 'output', (data) ->
    if data and data.constructor and data.constructor.name is 'Pixmap'
      getPixmapURL data, (url) ->
        process.nextTick ->
          bridge.emit 'pixmap', data

    bridge.emit 'html', convertor.toHtml(util.inspect(data, false, 3, true))

  bridge = new Bridge
    pkg: pkg
    generator: generator

  bridge.on 'cmd', (command) ->
    cmd.emit 'line', command

  bridge.on 'complete', (command) ->
    cmd.complete command, (err, data) ->
      bridge.emit 'completions', data

  bridge.on 'fn', (command) ->
    cmd.getFunctionParams command, (err, data) ->
      bridge.emit 'params', data

  bridge.app.get '/pixmap/:id', (req, res) ->
    if pixmaps[req.params.id]
      pixmaps[req.params.id].pack().pipe(res)
    else
      res.status(404).send('404 :(')

  cmd.context.generator = generator
  cmd.context.logger = logger
  cmd.context.cmd = cmd
  cmd.context.jsx = (jsxString) -> generator.evaluateJSXString jsxString
  cmd.context.copy = (text) -> generator.copyToClipboard text
  cmd.context.clear = ->
    process.nextTick bridge.emit.bind(bridge, 'clear')

  cmd.context.showPixmap = (pixmap) ->
    getPixmapURL pixmap, (url) ->
      open url
