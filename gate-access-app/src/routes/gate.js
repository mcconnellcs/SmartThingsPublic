const express = require('express');
const db = require('../lib/db');
const { isPinCurrentlyValid } = require('../lib/pins');

const router = express.Router();

// Gate terminal endpoint — accepts a code attempt and records the result.
// Auth is via a shared header token so gate hardware can call this
// without a browser session.
router.post('/verify', (req, res) => {
  const expected = process.env.GATE_API_TOKEN;
  if (expected) {
    const presented = req.get('x-gate-token');
    if (presented !== expected) {
      return res.status(401).json({ error: 'invalid gate token' });
    }
  }
  const { code, gate } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });

  const pin = db.prepare('SELECT * FROM pins WHERE code = ?').get(String(code));
  const check = isPinCurrentlyValid(pin);

  db.prepare(`
    INSERT INTO access_logs (pin_id, code_attempted, gate, result, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    pin ? pin.id : null,
    String(code),
    gate || null,
    check.ok ? 'granted' : 'denied',
    check.ok ? null : check.reason
  );

  if (check.ok) {
    db.prepare('UPDATE pins SET use_count = use_count + 1 WHERE id = ?').run(pin.id);
    return res.json({
      granted: true,
      label: pin.label,
      kind: pin.kind,
    });
  }
  return res.status(403).json({ granted: false, reason: check.reason });
});

module.exports = router;
