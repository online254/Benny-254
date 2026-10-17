const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath =
    process.env.DB_PATH ||
    path.join(__dirname, "online-sphere.sqlite");

fs.mkdirSync(path.dirname(dbPath), {
    recursive: true
});

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaPath = path.join(__dirname, "schema.sql");

if (!fs.existsSync(schemaPath)) {
    throw new Error(
        "Missing database/schema.sql"
    );
}

db.exec(
    fs.readFileSync(schemaPath, "utf8")
);

db.exec(`
CREATE TABLE IF NOT EXISTS payment_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    package_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    merchant_request_id TEXT,
    checkout_request_id TEXT UNIQUE,
    mpesa_receipt TEXT UNIQUE,
    result_code INTEGER,
    result_description TEXT,
    transaction_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
idx_payment_attempts_phone
ON payment_attempts(phone);

CREATE INDEX IF NOT EXISTS
idx_payment_attempts_status
ON payment_attempts(status);
`);

module.exports = db;
