const db = require('./db');

function generateUniquePin(length = 4) {
  const max = 10 ** length;
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(Math.random() * max)).padStart(length, '0');
    const existing = db.prepare('SELECT id FROM pins WHERE code = ?').get(code);
    if (!existing) return code;
  }
  throw new Error('could not generate a unique PIN; try a longer length');
}

function isPinCurrentlyValid(pin, now = new Date()) {
  if (!pin) return { ok: false, reason: 'not_found' };
  if (!pin.enabled) return { ok: false, reason: 'disabled' };
  if (pin.valid_from && new Date(pin.valid_from) > now) {
    return { ok: false, reason: 'not_yet_valid' };
  }
  if (pin.valid_until && new Date(pin.valid_until) < now) {
    return { ok: false, reason: 'expired' };
  }
  if (pin.max_uses != null && pin.use_count >= pin.max_uses) {
    return { ok: false, reason: 'max_uses_reached' };
  }
  return { ok: true };
}

module.exports = { generateUniquePin, isPinCurrentlyValid };
