/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a suquelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.30.1'
const migrationName = `${migrationVersion}-create-gpodder-devices-table`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * This upward migration creates the gpodderDevices table to track gpodder devices per user.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function up({ context: { queryInterface, logger } }) {
  // Upwards migration script
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  // Check if table exists
  if (await queryInterface.tableExists('gpodderDevices')) {
    logger.info(`${loggerPrefix} table "gpodderDevices" already exists`)
  } else {
    // Create table
    logger.info(`${loggerPrefix} creating table "gpodderDevices"`)
    const DataTypes = queryInterface.sequelize.Sequelize.DataTypes
    await queryInterface.createTable('gpodderDevices', {
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
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      userId: {
        type: DataTypes.UUID,
        references: {
          model: {
            tableName: 'users'
          },
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      }
    })
    logger.info(`${loggerPrefix} created table "gpodderDevices"`)

    // Create unique index on userId + deviceId
    logger.info(`${loggerPrefix} creating index "gpodderDevice_userId_deviceId"`)
    await queryInterface.addIndex('gpodderDevices', ['userId', 'deviceId'], {
      name: 'gpodderDevice_userId_deviceId',
      unique: true
    })
    logger.info(`${loggerPrefix} created index "gpodderDevice_userId_deviceId"`)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * This downward migration script removes the gpodderDevices table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function down({ context: { queryInterface, logger } }) {
  // Downward migration script
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  // Check if table exists
  if (await queryInterface.tableExists('gpodderDevices')) {
    logger.info(`${loggerPrefix} dropping table "gpodderDevices"`)
    // Drop table
    await queryInterface.dropTable('gpodderDevices')
    logger.info(`${loggerPrefix} dropped table "gpodderDevices"`)
  } else {
    logger.info(`${loggerPrefix} table "gpodderDevices" does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
