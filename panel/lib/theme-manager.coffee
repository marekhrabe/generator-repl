tinycolor = require 'tinycolor2'

class ThemeManager
    getThemeId: (hex) ->
      if hex is '343434' or hex is '2e2e2e' then 0
      else if hex is 'b8b8b8' or hex is 'afafaf' then 2
      else if hex is 'd6d6d6' or hex is 'd1d1d1' then 3
      else 1

    colorToHex: (obj) ->
      color = tinycolor r: obj.red, g: obj.green, b: obj.blue, a: obj.alpha

      color.toHex()

    handleThemeChange: (e) =>
      if not e.data.skinInfo
        throw 'Please provide skinInfo instance as parameter'

      color = @colorToHex e.data.skinInfo.panelBackgroundColor.color
      newTheme = @getThemeId color

      if @currentTheme
        document.body.classList.remove @currentTheme

      if newTheme in [0, 1]
        document.body.classList.remove 'light'
        document.body.classList.add 'dark'
      else
        document.body.classList.remove 'dark'
        document.body.classList.add 'light'

      document.body.classList.add 'skin-' + newTheme
      @currentTheme = 'skin-' + newTheme

manager = new ThemeManager()
window.addEventListener 'message', manager.handleThemeChange
