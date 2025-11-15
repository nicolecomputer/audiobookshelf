const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const GpodderAuth = require('../utils/GpodderAuth')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class GpodderController {
  constructor(Server) {
    this.Server = Server
    this.gpodderAuth = new GpodderAuth()
  }

  /**
   * Middleware to log all incoming requests to the gpodder controller
   *
   * @param {Request} req
   * @param {Response} res
   * @param {Function} next
   */
  middleware(req, res, next) {
    Logger.info(`[GpodderController] ${req.method} ${req.originalUrl || req.url}`, {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      params: req.params,
      query: req.query,
      headers: {
        'user-agent': req.headers['user-agent'],
        cookies: req.headers.cookie
      },
      body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined
    })
    next()
  }

  /**
   * Middleware to authenticate requests using Gpodder auth
   * Binds properly to the gpodderAuth instance
   *
   * @param {Request} req
   * @param {Response} res
   * @param {Function} next
   */
  authenticate(req, res, next) {
    return this.gpodderAuth.authenticate(req, res, next)
  }

  /**
   * POST: /api/2/auth/:username/login.json
   * Log in the given user via HTTP Basic Auth
   *
   * According to the gpodder API spec:
   * - Returns 200 on success
   * - Returns 401 if authentication fails
   * - Returns 400 if cookies have different username than the one provided
   *
   * @param {Request} req
   * @param {Response} res
   */
  async login(req, res) {
    Logger.info(`[GpodderController] Login attempt for user: ${req.params.username}`)
    Logger.info(`[GpodderController] Gpodder API enabled: ${Database.serverSettings.enableGpodderAPI}`)

    if (!Database.serverSettings.enableGpodderAPI) {
      Logger.error('[GpodderController] Gpodder API is disabled')
      return res.sendStatus(404)
    }

    const { username } = req.params

    // Parse HTTP Basic Auth credentials
    const credentials = this.gpodderAuth.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderController] Invalid or missing Authorization header')
      return res.sendStatus(401)
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username !== username) {
      Logger.error(`[GpodderController] Username mismatch: URL has "${username}", Auth header has "${credentials.username}"`)
      return res.sendStatus(400)
    }

    // Verify credentials and get user
    const user = await this.gpodderAuth.verifyBasicAuth(credentials.username, credentials.password)
    if (!user) {
      return res.sendStatus(401)
    }

    Logger.info(`[GpodderController] User "${credentials.username}" logged in successfully via gpodder API`)

    // Initialize session for the user
    req.session.userId = user.id
    req.session.username = user.username

    // Save the session and return 200 OK
    // express-session will automatically set the 'sessionid' cookie in the response
    req.session.save((err) => {
      if (err) {
        Logger.error('[GpodderController] Error saving session:', err)
        return res.sendStatus(500)
      }

      Logger.info(`[GpodderController] Session created with ID: ${req.sessionID}`)
      res.sendStatus(200)
    })
  }

  /**
   * GET: /api/2/devices/:username.json
   * Get list of devices for a user
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getDevices(req, res) {
    if (!Database.serverSettings.enableGpodderAPI) {
      Logger.error('[GpodderController] Gpodder API is disabled')
      return res.sendStatus(404)
    }

    // User is already authenticated by middleware and available at req.user
    try {
      const gpodderDevices = await Database.gpodderDeviceModel.getDevicesForUser(req.user.id)

      // Convert to API format
      const devices = gpodderDevices.map((device) => device.toJSONForAPI())

      res.json(devices)
    } catch (error) {
      Logger.error('[GpodderController] Error fetching devices:', error)
      res.sendStatus(500)
    }
  }
}

module.exports = GpodderController
