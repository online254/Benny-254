const { Pool } = require("pg");

/*
 * Online Sphere Neon PostgreSQL connection.
 * This is separate from the existing SQLite/M-PESA database.
 */

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not configured");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (error) => {
  console.error("[postgres] Unexpected idle client error:", error.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function checkConnection() {
  const result = await pool.query(
    "SELECT current_database() AS database, NOW() AS server_time"
  );
  return result.rows[0];
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  checkConnection,
  close,
};
