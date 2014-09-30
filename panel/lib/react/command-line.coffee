{div, input, span} = Reactionary

module.exports = React.createClass
  displayName: 'CommandLine'
  render: ->
    div
      className: 'command-line',

      span '>'
      input
        type: 'text'
        value: @props.input
        onChange: (e) => @props.update e.target.value
        onKeyUp: (e) => @props.update e.target.value
        onKeyDown: (e) =>
          if e.keyCode is 13
            @props.send e.target.value
            @props.update ''
          else if e.keyCode is 9
            @props.complete e.target.value
            e.preventDefault()
          else if e.keyCode is 67 and e.ctrlKey
            @props.update ''
