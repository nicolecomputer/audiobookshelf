const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const LocalAuthStrategy = require('../auth/LocalAuthStrategy')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class GpodderController {
  constructor(Server) {
    this.Server = Server
    this.localAuthStrategy = new LocalAuthStrategy()
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
   * Helper function to parse HTTP Basic Auth credentials from Authorization header
   *
   * @param {Request} req
   * @returns {{username: string, password: string} | null}
   */
  parseBasicAuth(req) {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null
    }

    try {
      // Extract the base64 encoded credentials
      const base64Credentials = authHeader.substring(6)
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [username, password] = credentials.split(':')

      if (!username || !password) {
        return null
      }

      return { username, password }
    } catch (error) {
      Logger.error('[GpodderController] Error parsing basic auth:', error)
      return null
    }
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
    const credentials = this.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderController] Invalid or missing Authorization header')
      return res.sendStatus(401)
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username !== username) {
      Logger.error(`[GpodderController] Username mismatch: URL has "${username}", Auth header has "${credentials.username}"`)
      return res.sendStatus(400)
    }

    // Find the user in the database
    const user = await Database.userModel.getUserByUsername(credentials.username.toLowerCase())
    if (!user) {
      Logger.error(`[GpodderController] User not found: ${credentials.username}`)
      return res.sendStatus(401)
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(credentials.password, user)
    if (!isValid) {
      Logger.error(`[GpodderController] Invalid password for user: ${credentials.username}`)
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
   * POST: /api/2/auth/:username/logout.json
   * Log out the given user
   *
   * @param {Request} req
   * @param {Response} res
   */
  async logout(req, res) {
    // TODO: Uncomment this check once API is enabled in settings
    // if (!Database.serverSettings.enableGpodderAPI) {
    //   Logger.error('[GpodderController] Gpodder API is disabled')
    //   return res.sendStatus(404)
    // }

    const { username } = req.params

    // Parse HTTP Basic Auth credentials
    const credentials = this.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderController] Invalid or missing Authorization header')
      return res.sendStatus(401)
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username !== username) {
      Logger.error(`[GpodderController] Username mismatch: URL has "${username}", Auth header has "${credentials.username}"`)
      return res.sendStatus(400)
    }

    Logger.info(`[GpodderController] User "${credentials.username}" logged out successfully via gpodder API`)

    // Return success
    res.sendStatus(200)
  }

  /**
   * Helper to authenticate user either via Basic Auth or session cookie
   *
   * @param {Request} req
   * @param {string} usernameFromUrl - Username from URL path
   * @returns {Promise<{user: import('../models/User'), authenticated: boolean}>}
   */
  async authenticateUser(req, usernameFromUrl) {
    // Try session-based auth first (from cookies)
    if (req.session && req.session.userId) {
      Logger.info('[GpodderController] Authenticating via session cookie')
      const user = await Database.userModel.getUserById(req.session.userId)
      if (user && user.username.toLowerCase() === usernameFromUrl.toLowerCase()) {
        Logger.info(`[GpodderController] Session auth successful for user: ${user.username}`)
        return { user, authenticated: true }
      }
      Logger.warn('[GpodderController] Session exists but user mismatch or not found')
    }

    // Fall back to Basic Auth
    const credentials = this.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderController] No valid session or Basic Auth credentials')
      return { user: null, authenticated: false }
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username.toLowerCase() !== usernameFromUrl.toLowerCase()) {
      Logger.error(`[GpodderController] Username mismatch: URL has "${usernameFromUrl}", Auth header has "${credentials.username}"`)
      return { user: null, authenticated: false }
    }

    // Find the user in the database
    const user = await Database.userModel.getUserByUsername(credentials.username.toLowerCase())
    if (!user) {
      Logger.error(`[GpodderController] User not found: ${credentials.username}`)
      return { user: null, authenticated: false }
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(credentials.password, user)
    if (!isValid) {
      Logger.error(`[GpodderController] Invalid password for user: ${credentials.username}`)
      return { user: null, authenticated: false }
    }

    Logger.info(`[GpodderController] Basic auth successful for user: ${user.username}`)
    return { user, authenticated: true }
  }

  /**
   * GET: /api/2/devices/:username.json
   * Get list of devices for a user
   *
   * @param {Request} req
   * @param {Response} res
   */
  async getDevices(req, res) {
    if (!Database.serverSettings.enableGpodderAPI) {
      Logger.error('[GpodderController] Gpodder API is disabled')
      return res.sendStatus(404)
    }

    const { username } = req.params

    // Authenticate user via session or Basic Auth
    const { user, authenticated } = await this.authenticateUser(req, username)
    if (!authenticated || !user) {
      return res.sendStatus(401)
    }

    // Return test data following the reference implementation format
    const devices = [
      {
        id: 'test-device-1',
        caption: 'Test Device 1',
        type: 'desktop',
        subscriptions: 5
      },
      {
        id: 'antennapod-device',
        caption: 'My AntennaPod',
        type: 'mobile',
        subscriptions: 10
      },
      {
        id: 'web-player',
        caption: 'Web Browser',
        type: 'laptop',
        subscriptions: 3
      }
    ]

    res.json(devices)
  }
}

module.exports = GpodderController
