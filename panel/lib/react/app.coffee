{div, span} = Reactionary

CommandLine = require './command-line'
History = require './history'
Error = require './error'

updateObject = React.addons.update
classSet = React.addons.classSet

isPixmap = /^pixmap#/
isCommand = /^command#/
isHTML = /^html#/
colors =
  '0AA': '66D9EF'
  '0A0': 'E6DB74'
  'A50': 'AE81FF'
  '555': '66D9EF'
prepareHtml = (html) ->
  html.replace /style="color:#(...)"/g, (str, color) ->
    "style=\"color:##{colors[color] or color};\""

commonPrefix = (strings) ->
  return ""  if not strings or strings.length is 0
  sorted = strings.slice().sort()
  min = sorted[0]
  max = sorted[sorted.length - 1]
  i = 0
  len = min.length

  while i < len
    return min.slice(0, i)  unless min[i] is max[i]
    i++
  min

module.exports = React.createClass
  displayName: 'REPL'

  getInitialState: ->
    error: null
    input: ''
    output: []
    history: []
    historyPosition: null
    latestInput: null

  updateInput: (str) ->
    if str isnt @state.input
      @setState input: str
      if str.substr(-1) is '('
        bridge.emit 'fn', str

  output: (out) ->
    @setState updateObject @state, output: $push: [out]

  addHistory: (ckd) ->
    @setState updateObject @state,
      history:
        $push: [ckd]
    @setState
      historyPosition: null

  walkHistory: (dir) ->
    newPos = @state.historyPosition

    if @state.historyPosition is null
      newPos = @state.history.length
      @setState latestInput: @state.input

    newPos += dir
    if newPos >= @state.history.length and @state.historyPosition isnt null
      @setState
        input: @state.latestInput
        historyPosition: null
    else if @state.history[newPos]
      @setState
        input: @state.history[newPos]
        historyPosition: newPos

  componentDidMount: ->
    bridge.emit 'init'

    bridge.on 'clear', =>
      @setState output: []
    bridge.on 'params', (params) =>
      @output @state.input + params.join(', ') + ')'
    bridge.on 'output', (str) =>
      @output str
    bridge.on 'html', (html) =>
      @output type: 'html', value: prepareHtml html
    bridge.on 'pixmap', (pixmap) =>
      @output type: 'pixmap', value: pixmap
    bridge.on 'completions', (completions) =>
      @output completions[0].join '\t'
      prefix = commonPrefix completions[0]
      console.log input: @state.input, prefix: prefix.length
      if prefix and @state.input.length < prefix.length
        @setState input: prefix
    bridge.on 'error', (err) =>
      @setState error: err

  send: (cmd) ->
    return unless cmd

    bridge.emit 'cmd', cmd
    @output type: 'command', value: cmd
    @addHistory cmd

  complete: (cmd) ->
    @output '> ' + cmd
    bridge.emit 'complete', cmd

  copy: (str) ->
    bridge.emit 'copy', str

  open: (url) ->
    bridge.emit 'open', url

  render: ->
    if @state.error
      Error
        message: @state.error
        dismiss: => @setState error: null

    div
      className: 'box'

      History
        output: @state.output

      CommandLine
        input: @state.input
        update: @updateInput
        send: @send
        complete: @complete
        history: @walkHistory
