{div, input, span} = Reactionary

module.exports = React.createClass
  displayName: 'CommandLine'

  componentDidMount: ->
    window.addEventListener 'blur', @blur

  componentWillUnmount: ->
    window.removeEventListener 'blur', @blur

  blur: ->
    @refs.input.getDOMNode().blur()

  render: ->
    div
      className: 'command-line',

      span '>'
      input
        type: 'text'
        value: @props.input
        ref: 'input'
        onChange: (e) => @props.update e.target.value
        onKeyUp: (e) => @props.update e.target.value
        onKeyDown: (e) =>
          if e.keyCode is 13
            @props.send e.target.value
            @props.update ''
          if e.keyCode is 38
            @props.history(-1)
            e.preventDefault()
          if e.keyCode is 40
            @props.history(1)
            e.preventDefault()
          else if e.keyCode is 9
            @props.complete e.target.value
            e.preventDefault()
          else if e.keyCode is 67 and e.ctrlKey
            @props.update ''
