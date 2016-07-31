
const Server = require('electron-rpc/server')
const menubar = require('menubar')
const mb = menubar({width: 400})

const app = new Server()

app.on('terminate', () => {
  mb.app.quit();
})

mb.on('ready', function ready () {
  console.log('app is ready');
})

mb.on('after-create-window', () => {

  // Uncomment for debugging
  mb.window.openDevTools()

})
