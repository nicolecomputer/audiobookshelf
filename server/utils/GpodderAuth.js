const { Request, Response, NextFunction } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const LocalAuthStrategy = require('../auth/LocalAuthStrategy')

/**
 * Gpodder API authentication helper
 * Handles HTTP Basic Auth and session cookie authentication for Gpodder API endpoints
 *
 */
class GpodderAuth {
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
      Logger.error('[GpodderAuth] Error parsing basic auth:', error)
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
      Logger.info('[GpodderAuth] Authenticating via session cookie')
      const user = await Database.userModel.getUserById(req.session.userId)
      if (user && user.username.toLowerCase() === usernameFromUrl.toLowerCase()) {
        Logger.info(`[GpodderAuth] Session auth successful for user: ${user.username}`)
        req.user = user
        return next()
      }
      Logger.warn('[GpodderAuth] Session exists but user mismatch or not found')
    }

    // Fall back to Basic Auth
    const credentials = this.parseBasicAuth(req)
    if (!credentials) {
      Logger.error('[GpodderAuth] No valid session or Basic Auth credentials')
      return res.sendStatus(401)
    }

    // Check if the username in the URL matches the one in the Authorization header
    if (credentials.username.toLowerCase() !== usernameFromUrl.toLowerCase()) {
      Logger.error(`[GpodderAuth] Username mismatch: URL has "${usernameFromUrl}", Auth header has "${credentials.username}"`)
      return res.sendStatus(401)
    }

    // Find the user in the database
    const user = await Database.userModel.getUserByUsername(credentials.username.toLowerCase())
    if (!user) {
      Logger.error(`[GpodderAuth] User not found: ${credentials.username}`)
      return res.sendStatus(401)
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(credentials.password, user)
    if (!isValid) {
      Logger.error(`[GpodderAuth] Invalid password for user: ${credentials.username}`)
      return res.sendStatus(401)
    }

    Logger.info(`[GpodderAuth] Basic auth successful for user: ${user.username}`)
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
      Logger.error(`[GpodderAuth] User not found: ${username}`)
      return null
    }

    // Verify the password using LocalAuthStrategy
    const isValid = await this.localAuthStrategy.comparePassword(password, user)
    if (!isValid) {
      Logger.error(`[GpodderAuth] Invalid password for user: ${username}`)
      return null
    }

    Logger.info(`[GpodderAuth] Basic auth verification successful for user: ${user.username}`)
    return user
  }
}

module.exports = GpodderAuth
