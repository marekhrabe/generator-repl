{div, span, pre, img} = Reactionary

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

      for data, id in @props.output
        div
          key: id
          if typeof data is 'string'
            data
          else if data.type?
            switch data.type
              when 'html'
                div
                  dangerouslySetInnerHTML: __html: data.value
              when 'pixmap'
                div
                  className: 'pixmap'
                  img
                    src: 'file://' + data.value.__replTempFile
                    height: 100
                  span "#{data.value.width}×#{data.value.height}px, #{data.value.bitsPerChannel}bit, #{data.value.channelCount} channels"
              when 'command'
                div
                  className: 'command'
                  "> #{data.value}"
