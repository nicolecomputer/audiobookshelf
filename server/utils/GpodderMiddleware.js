const { Request, Response, NextFunction } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const LocalAuthStrategy = require('../auth/LocalAuthStrategy')

/**
 * Gpodder API middleware helpers
 * Handles authentication, authorization, and API validation for Gpodder API endpoints
 *
 */
class GpodderMiddleware {
  constructor() {
    this.localAuthStrategy = new LocalAuthStrategy()
  }

  /**
   * Parse HTTP Basic Auth credentials from Authorization header
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
      Logger.error('[GpodderMiddleware] Error parsing basic auth:', error)
      return null
    }
  }

  /**
   * Middleware to authenticate user via Basic Auth or session cookie
   * Attaches the authenticated user to req.user
   * Returns 401 if authentication fails
   *
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async authenticate(req, res, next) {
    const usernameFromUrl = req.params.username

    // Try session-based auth first (from cookies)
    if (req.session && req.session.userId) {
      Logger.info('[GpodderMiddleware] Authenticating via session cookie')
      const user = await Database.userModel.getUserById(req.session.userId)
      if (user && user.username.toLowerCase() === usernameFromUrl.toLowerCase()) {
        Logger.info(`[GpodderMiddleware] Session auth successful for user: ${user.username}`)
        req.user = user
        return next()
      }
      Logger.warn('[GpodderMiddleware] Session exists but user mismatch or not found')
    }

    // Fall back to Basic Auth
    const credentials = this.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderMiddleware] No valid session or Basic Auth credentials')
      return res.sendStatus(401)
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username.toLowerCase() !== usernameFromUrl.toLowerCase()) {
      Logger.error(`[GpodderMiddleware] Username mismatch: URL has "${usernameFromUrl}", Auth header has "${credentials.username}"`)
      return res.sendStatus(401)
    }

    // Find the user in the database
    const user = await Database.userModel.getUserByUsername(credentials.username.toLowerCase())
    if (!user) {
      Logger.error(`[GpodderMiddleware] User not found: ${credentials.username}`)
      return res.sendStatus(401)
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(credentials.password, user)
    if (!isValid) {
      Logger.error(`[GpodderMiddleware] Invalid password for user: ${credentials.username}`)
      return res.sendStatus(401)
    }

    Logger.info(`[GpodderMiddleware] Basic auth successful for user: ${user.username}`)
    req.user = user
    next()
  }

  /**
   * Verify Basic Auth credentials and return user or null
   * Used for login endpoint
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<import('../models/User') | null>}
   */
  async verifyBasicAuth(username, password) {
    // Find the user in the database
    const user = await Database.userModel.getUserByUsername(username.toLowerCase())
    if (!user) {
      Logger.error(`[GpodderMiddleware] User not found: ${username}`)
      return null
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(password, user)
    if (!isValid) {
      Logger.error(`[GpodderMiddleware] Invalid password for user: ${username}`)
      return null
    }

    Logger.info(`[GpodderMiddleware] Basic auth verification successful for user: ${user.username}`)
    return user
  }

  /**
   * Middleware to check if Gpodder API is enabled and library is selected
   *
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  checkApiEnabled(req, res, next) {
    if (!Database.serverSettings.enableGpodderAPI) {
      Logger.error('[GpodderMiddleware] Gpodder API is disabled')
      return res.sendStatus(404)
    }

    if (!Database.serverSettings.gpodderLibraryId) {
      Logger.error('[GpodderMiddleware] Gpodder library is not selected')
      return res.sendStatus(500)
    }

    next()
  }
}

module.exports = GpodderMiddleware
