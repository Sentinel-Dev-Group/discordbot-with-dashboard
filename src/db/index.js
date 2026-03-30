const mysql = require('mysql2/promise');
require('dotenv').config();

// ─── Connection Pool ──────────────────────────────────────
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             process.env.DB_PORT     || 3306,
  user:             process.env.DB_USER,
  password:         process.env.DB_PASS,
  database:         process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  timezone:         'Z',           // store all dates as UTC
  decimalNumbers:   true,
});

// ─── Health check on startup ──────────────────────────────
pool.getConnection()
  .then(conn => {
    console.log('[DB] Connected to MariaDB successfully');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] Failed to connect to MariaDB:', err.message);
    process.exit(1);              // hard stop — no point running without DB
  });

// ─── Helpers ──────────────────────────────────────────────

/**
 * Run a SELECT and return all rows.
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<any[]>}
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Run an INSERT / UPDATE / DELETE.
 * Returns the raw ResultSetHeader (includes insertId, affectedRows).
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<import('mysql2').ResultSetHeader>}
 */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * Run multiple statements inside a single transaction.
 * Pass an async callback that receives the connection.
 * Automatically commits on success and rolls back on error.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<void>} callback
 */
async function transaction(callback) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    await callback(conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, execute, transaction };