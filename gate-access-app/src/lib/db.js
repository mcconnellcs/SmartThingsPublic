const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.GATE_DB_PATH || path.join(DATA_DIR, 'gate.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    resident_id INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('resident','guest','vendor','staff')),
    enabled INTEGER NOT NULL DEFAULT 1,
    valid_from TEXT,
    valid_until TEXT,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pins_code ON pins(code);
  CREATE INDEX IF NOT EXISTS idx_pins_resident ON pins(resident_id);

  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER,
    code_attempted TEXT NOT NULL,
    gate TEXT,
    result TEXT NOT NULL CHECK (result IN ('granted','denied')),
    reason TEXT,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pin_id) REFERENCES pins(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_occurred ON access_logs(occurred_at);
  CREATE INDEX IF NOT EXISTS idx_logs_pin ON access_logs(pin_id);
`);

module.exports = db;
