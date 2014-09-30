{div, span, pre} = Reactionary

module.exports = React.createClass
  displayName: 'History'

  componentWillUpdate: ->
    node = @getDOMNode()
    @shouldScrollBottom = node.scrollTop + node.offsetHeight is node.scrollHeight

  componentDidUpdate: ->
    if @shouldScrollBottom
      node = @getDOMNode()
      node.scrollTop = node.scrollHeight

  render: ->
    pre
      className: 'history',

      for data in @props.output
        div data
