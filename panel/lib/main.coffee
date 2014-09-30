window.bridge = new Bridge()

if bridge.platform is 'photoshop'
  require './theme-manager'

window.Reactionary = require 'reactionary-source-fork'

React.renderComponent(require('./react/app.coffee')(), document.getElementById('app'))
