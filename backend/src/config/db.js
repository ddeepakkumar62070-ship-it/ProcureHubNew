const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvironment = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function getDatabaseConfig() {
  const missing = requiredEnvironment.filter((key) => process.env[key] === undefined || process.env[key] === '');
  if (missing.length) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }

  const port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port number.');
  }

  const config = {
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  if (process.env.DB_SSL?.toLowerCase() === 'true') {
    config.ssl = { rejectUnauthorized: true };
    if (process.env.DB_SSL_CA) {
      config.ssl.ca = fs.readFileSync(process.env.DB_SSL_CA);
    }
  }

  return config;
}

let pool;

function getPool() {
  if (!pool) {
    throw new Error('Database pool is not initialized. Start the server or run the database command first.');
  }
  return pool;
}

async function initializeDatabase() {
  const config = getDatabaseConfig();
  const nextPool = mysql.createPool(config);

  try {
    const connection = await nextPool.getConnection();
    await connection.ping();
    connection.release();
    pool = nextPool;
  } catch (error) {
    await nextPool.end();
    throw new Error(`Unable to connect to MySQL at ${config.host}:${config.port}/${config.database}: ${error.message}`, {
      cause: error,
    });
  }
}

async function closeDatabase() {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    await activePool.end();
  }
}

async function checkDatabaseHealth() {
  const [rows] = await getPool().query('SELECT 1 AS database_ok, DATABASE() AS database_name');
  return {
    connected: rows[0].database_ok === 1,
    database: rows[0].database_name,
  };
}

module.exports = { checkDatabaseHealth, closeDatabase, getDatabaseConfig, getPool, initializeDatabase };
