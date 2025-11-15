const { DataTypes, Model } = require('sequelize')

/**
 * @typedef GpodderDeviceObject
 * @property {string} id
 * @property {string} deviceId
 * @property {string} caption
 * @property {string} type
 * @property {number} subscriptions
 * @property {string} userId
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

class GpodderDevice extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.deviceId
    /** @type {string} */
    this.caption
    /** @type {string} */
    this.type
    /** @type {number} */
    this.subscriptions
    /** @type {UUIDV4} */
    this.userId
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  /**
   * Get devices for a user
   * @param {string} userId
   * @returns {Promise<GpodderDevice[]>}
   */
  static async getDevicesForUser(userId) {
    return this.findAll({
      where: {
        userId
      },
      order: [['updatedAt', 'DESC']]
    })
  }

  /**
   * Create or update a gpodder device
   * @param {string} userId
   * @param {string} deviceId
   * @param {Object} deviceData
   * @param {string} deviceData.caption
   * @param {string} deviceData.type
   * @returns {Promise<GpodderDevice>}
   */
  static async createOrUpdate(userId, deviceId, deviceData) {
    const [device, created] = await this.findOrCreate({
      where: {
        userId,
        deviceId
      },
      defaults: {
        userId,
        deviceId,
        caption: deviceData.caption,
        type: deviceData.type,
        subscriptions: 0
      }
    })

    if (!created) {
      // Update existing device
      await device.update({
        caption: deviceData.caption,
        type: deviceData.type
      })
    }

    return device
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        deviceId: {
          type: DataTypes.STRING,
          allowNull: false
        },
        caption: {
          type: DataTypes.STRING,
          allowNull: false
        },
        type: {
          type: DataTypes.STRING,
          allowNull: false
        },
        subscriptions: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        }
      },
      {
        sequelize,
        modelName: 'gpodderDevice',
        indexes: [
          {
            name: 'gpodderDevice_userId_deviceId',
            fields: ['userId', 'deviceId'],
            unique: true
          }
        ]
      }
    )

    const { user } = sequelize.models

    user.hasMany(GpodderDevice, {
      onDelete: 'CASCADE'
    })
    GpodderDevice.belongsTo(user)
  }

  /**
   * Convert to JSON format for gpodder API response
   * @returns {Object}
   */
  toJSONForAPI() {
    return {
      id: this.deviceId,
      caption: this.caption,
      type: this.type,
      subscriptions: this.subscriptions
    }
  }
}

module.exports = GpodderDevice
