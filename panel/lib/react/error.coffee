{div, button, strong, p, i} = Reactionary

module.exports = React.createClass
  displayName: 'Error'
  render: ->
    div className: 'error',
      div null,
        button
          className: 'close'
          onClick: @props.dismiss
        i className: 'icon icon-error'
        strong 'Something went wrong'
        p @props.message

        button
          className: 'green'
          'Report a problem'
