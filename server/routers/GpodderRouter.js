const express = require('express')
const GpodderController = require('../controllers/GpodderController')
const GpodderMiddleware = require('../utils/GpodderMiddleware')

class GpodderRouter {
  constructor(Server) {
    this.router = express()
    this.router.disable('x-powered-by')
    this.gpodderController = new GpodderController(Server)
    this.gpodderMiddleware = new GpodderMiddleware()
    this.init()
  }

  init() {
    // Add logging middleware for all gpodder routes
    this.router.use(this.gpodderController.middleware.bind(this.gpodderController))

    // Check if Gpodder API is enabled and library is selected
    this.router.use(this.gpodderMiddleware.checkApiEnabled.bind(this.gpodderMiddleware))

    //
    // Authentication Routes
    //
    this.router.post('/auth/:username/login.json', this.gpodderController.login.bind(this.gpodderController))

    //
    // Device Routes
    //
    this.router.get('/devices/:username.json', this.gpodderMiddleware.authenticate.bind(this.gpodderMiddleware), this.gpodderController.getDevices.bind(this.gpodderController))
    this.router.post('/devices/:username/:deviceid.json', this.gpodderMiddleware.authenticate.bind(this.gpodderMiddleware), this.gpodderController.updateDevice.bind(this.gpodderController))
  }
}

module.exports = GpodderRouter
