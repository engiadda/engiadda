const { Pool } = require('pg');
const { databaseUrl, nodeEnv } = require('./env');

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Enable TLS explicitly when required by the managed database provider.
  // Certificate verification remains enabled; do not disable it in production.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false
});

pool.on('error', (error) => {
  // Do not print connection strings or query parameters that could contain secrets.
  console.error('Unexpected idle PostgreSQL client error:', error.message);
});

async function checkDatabase() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0].now;
}

module.exports = { pool, checkDatabase };
