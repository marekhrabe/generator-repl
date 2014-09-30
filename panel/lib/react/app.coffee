{div, span} = Reactionary

CommandLine = require './command-line'
History = require './history'
Error = require './error'

updateObject = React.addons.update
classSet = React.addons.classSet

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

  updateInput: (str) ->
    @setState input: str

  append: (str) ->
    @setState updateObject @state, output: $push: [str]

  componentDidMount: ->
    bridge.emit 'init'

    bridge.on 'output', (str) =>
      @append str
    bridge.on 'completions', (completions) =>
      @append completions[0].join '\t'
      prefix = commonPrefix completions[0]
      console.log input: @state.input, prefix: prefix.length
      if prefix and @state.input.length < prefix.length
        @setState input: prefix
    bridge.on 'error', (err) =>
      @setState error: err

  send: (cmd) ->
    return unless cmd

    if cmd is 'clear'
      @setState output: []
    else
      @append '> ' + cmd
      bridge.emit 'cmd', cmd

  complete: (cmd) ->
    @append '> ' + cmd
    bridge.emit 'complete', cmd

  copy: (str) ->
    bridge.emit 'copy', str

  open: (url) ->
    bridge.emit 'open', url

  render: ->
    div className: 'wrap',
      div className: 'content',

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

      div className: 'bottom-bar',
        span
          className: 'plugin-version'
          bridge.qs.version

        # span
        #   className: classSet
        #     state: true
        #     icon: nowExporting
        #     'icon-syncing': nowExporting
        #   if nowExporting
        #     span "Syncing #{nowExporting} design#{if nowExporting > 1 then "s" else ""}. "
        #   if (nowPending > 1) or nowPending is 1 and pendingTask isnt @state.activeDocument
        #     span null,
        #       span "#{nowPending} design#{if nowPending > 1 then "s" else ""} synced. "
        #       # unless @state.exporting[@state.activeDocument]?.completed
        #       #   a
        #       #     onClick: @openPending
        #       #     "Click to share"

        # button
        #   className: 'flat icon icon-logout'
        #   onClick: -> top.postMessage 'logout', '*'
