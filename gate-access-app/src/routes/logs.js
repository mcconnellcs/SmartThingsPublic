const express = require('express');
const db = require('../lib/db');

const router = express.Router();

router.get('/', (req, res) => {
  const { result, pinId, limit } = req.query;
  const clauses = [];
  const params = [];
  if (result === 'granted' || result === 'denied') {
    clauses.push('l.result = ?');
    params.push(result);
  }
  if (pinId) {
    clauses.push('l.pin_id = ?');
    params.push(pinId);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const lim = Math.min(parseInt(limit, 10) || 200, 1000);
  const rows = db.prepare(`
    SELECT l.*, p.label AS pin_label, p.kind AS pin_kind,
           r.name AS resident_name, r.unit AS resident_unit
    FROM access_logs l
    LEFT JOIN pins p ON p.id = l.pin_id
    LEFT JOIN residents r ON r.id = p.resident_id
    ${where}
    ORDER BY l.occurred_at DESC
    LIMIT ?
  `).all(...params, lim);
  res.json(rows);
});

router.get('/stats', (req, res) => {
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN result='granted' THEN 1 ELSE 0 END) AS granted,
      SUM(CASE WHEN result='denied' THEN 1 ELSE 0 END) AS denied
    FROM access_logs
    WHERE occurred_at >= datetime('now','-7 days')
  `).get();
  const activePins = db.prepare(`SELECT COUNT(*) AS n FROM pins WHERE enabled = 1`).get().n;
  const totalPins = db.prepare(`SELECT COUNT(*) AS n FROM pins`).get().n;
  const residents = db.prepare(`SELECT COUNT(*) AS n FROM residents`).get().n;
  res.json({
    last7days: { granted: totals.granted || 0, denied: totals.denied || 0 },
    activePins,
    totalPins,
    residents,
  });
});

module.exports = router;
