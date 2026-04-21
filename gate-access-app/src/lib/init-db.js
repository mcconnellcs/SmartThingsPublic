const bcrypt = require('bcryptjs');
const db = require('./db');

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'changeme';

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (existing) {
  console.log(`Admin "${username}" already exists.`);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
console.log(`Created admin "${username}". Change the password via the web UI.`);
