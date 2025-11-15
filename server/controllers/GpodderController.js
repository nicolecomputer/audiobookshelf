const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const GpodderMiddleware = require('../utils/GpodderMiddleware')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class GpodderController {
  constructor(Server) {
    this.Server = Server
    this.podcastManager = Server.podcastManager
    this.gpodderMiddleware = new GpodderMiddleware()
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

    const { username } = req.params

    // Parse HTTP Basic Auth credentials
    const credentials = this.gpodderMiddleware.parseBasicAuth(req)
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
    const user = await this.gpodderMiddleware.verifyBasicAuth(credentials.username, credentials.password)
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

  /**
   * POST: /api/2/devices/:username/:deviceid.json
   * Update Device Data
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateDevice(req, res) {
    const { deviceid } = req.params
    const { caption, type } = req.body || {}

    // Default values if not provided
    const deviceData = {
      caption: caption || deviceid,
      type: type || 'other'
    }

    try {
      const device = await Database.gpodderDeviceModel.createOrUpdate(req.user.id, deviceid, deviceData)

      Logger.info(`[GpodderController] Device ${deviceid} updated for user ${req.user.username}`)

      res.json(device.toJSONForAPI())
    } catch (error) {
      Logger.error('[GpodderController] Error updating device:', error)
      res.sendStatus(500)
    }
  }

  /**
   * GET: /api/2/subscriptions/:username/:deviceid.json
   * Get subscription changes for a device
   * Query params:
   *  - since: timestamp (Unix epoch in seconds) of the last sync
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getSubscriptions(req, res) {
    const { deviceid } = req.params
    const { since } = req.query

    try {
      // Get all podcast library items from the gpodder library
      const libraryItems = await Database.libraryItemModel.findAll({
        where: {
          libraryId: Database.serverSettings.gpodderLibraryId,
          mediaType: 'podcast'
        }
      })

      // Build the server URL from the request
      const protocol = req.protocol
      const host = req.get('host')
      const serverUrl = `${protocol}://${host}`

      // Map library items to their local URLs
      const podcastUrls = libraryItems.map((item) => `${serverUrl}/item/${item.id}`)

      // Get the current timestamp in seconds
      const timestamp = Math.floor(Date.now() / 1000)

      // Return subscription changes in gpodder format
      // For now, we return all podcasts as "add" when since=0 (initial sync)
      // TODO: Track actual subscription changes in the future
      const response = {
        add: podcastUrls,
        remove: [],
        timestamp: timestamp
      }

      Logger.info(`[GpodderController] Returning ${podcastUrls.length} podcasts for device ${deviceid}`)
      res.json(response)
    } catch (error) {
      Logger.error('[GpodderController] Error getting subscriptions:', error)
      res.sendStatus(500)
    }
  }

  /**
   * POST: /api/2/subscriptions/:username/:deviceid.json
   * Upload subscription changes for a device
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async uploadSubscriptions(req, res) {
    const { deviceid } = req.params
    const { add, remove } = req.body || {}

    // Validate request body - at least one array should be provided
    if ((add !== undefined && !Array.isArray(add)) || (remove !== undefined && !Array.isArray(remove))) {
      Logger.error('[GpodderController] Invalid request body: add and remove must be arrays if provided')
      return res.sendStatus(400)
    }

    try {
      // Process additions - create podcasts from RSS feed URLs
      if (add && add.length > 0) {
        Logger.info(`[GpodderController] Creating ${add.length} podcast(s) from RSS feeds for device ${deviceid}:`, add)

        // Get the gpodder library folder
        const gpodderLibraryId = Database.serverSettings.gpodderLibraryId
        if (!gpodderLibraryId) {
          Logger.error('[GpodderController] Gpodder library not configured')
          return res.status(500).send('Gpodder library not configured')
        }

        const library = await Database.libraryModel.findByPk(gpodderLibraryId)
        if (!library) {
          Logger.error('[GpodderController] Gpodder library not found')
          return res.status(500).send('Gpodder library not found')
        }

        // Get the first folder in the library
        const folders = await library.getLibraryFolders()
        if (!folders || !folders.length) {
          Logger.error('[GpodderController] No folders found in gpodder library')
          return res.status(500).send('No folders in gpodder library')
        }
        const folder = folders[0]

        // Create podcasts from the RSS feed URLs
        // autoDownloadEpisodes = false for gpodder sync
        this.podcastManager.createPodcastsFromFeedUrls(add, folder, false, null)
      }

      // Log removals (not implemented yet)
      if (remove && remove.length > 0) {
        Logger.info(`[GpodderController] Would remove ${remove.length} subscription(s) for device ${deviceid}:`, remove)
      }

      // Get the current timestamp in seconds
      const timestamp = Math.floor(Date.now() / 1000)

      // Return response with updated timestamp
      const response = {
        timestamp: timestamp,
        update_urls: []
      }

      Logger.info(`[GpodderController] Subscription upload successful for device ${deviceid}`)
      res.json(response)
    } catch (error) {
      Logger.error('[GpodderController] Error uploading subscriptions:', error)
      res.sendStatus(500)
    }
  }
}

module.exports = GpodderController
