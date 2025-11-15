const express = require('express')
const GpodderController = require('../controllers/GpodderController')

class GpodderRouter {
  constructor(Server) {
    this.router = express()
    this.router.disable('x-powered-by')
    this.gpodderController = new GpodderController(Server)
    this.init()
  }

  init() {
    // Add logging middleware for all gpodder routes
    this.router.use(this.gpodderController.middleware.bind(this.gpodderController))

    //
    // Authentication Routes
    //
    this.router.post('/auth/:username/login.json', this.gpodderController.login.bind(this.gpodderController))

    //
    // Device Routes
    //
    this.router.get('/devices/:username.json', this.gpodderController.authenticate.bind(this.gpodderController), this.gpodderController.getDevices.bind(this.gpodderController))
    this.router.post('/devices/:username/:deviceid.json', this.gpodderController.authenticate.bind(this.gpodderController), this.gpodderController.updateDevice.bind(this.gpodderController))
  }
}

module.exports = GpodderRouter
