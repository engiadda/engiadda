const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../src/config/db');

async function main() {
  const migrationPath = path.join(__dirname, '..', 'migrations', '001_create_jobs.sql');
  const sql = await fs.readFile(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Database migration 001 applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
