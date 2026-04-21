const express = require('express');
const db = require('../lib/db');
const { generateUniquePin } = require('../lib/pins');

const router = express.Router();

const VALID_KINDS = new Set(['resident', 'guest', 'vendor', 'staff']);

function pinWithStatus(row, now = new Date()) {
  if (!row) return row;
  let status = 'active';
  if (!row.enabled) status = 'disabled';
  else if (row.valid_from && new Date(row.valid_from) > now) status = 'scheduled';
  else if (row.valid_until && new Date(row.valid_until) < now) status = 'expired';
  else if (row.max_uses != null && row.use_count >= row.max_uses) status = 'used_up';
  return { ...row, enabled: !!row.enabled, status };
}

router.get('/', (req, res) => {
  const { q, kind, status, residentId } = req.query;
  const clauses = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    clauses.push('(p.code LIKE ? OR p.label LIKE ? OR r.name LIKE ? OR r.unit LIKE ?)');
    params.push(like, like, like, like);
  }
  if (kind && VALID_KINDS.has(kind)) {
    clauses.push('p.kind = ?');
    params.push(kind);
  }
  if (residentId) {
    clauses.push('p.resident_id = ?');
    params.push(residentId);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT p.*, r.name AS resident_name, r.unit AS resident_unit
    FROM pins p
    LEFT JOIN residents r ON r.id = p.resident_id
    ${where}
    ORDER BY p.created_at DESC
  `).all(...params);
  let withStatus = rows.map((r) => pinWithStatus(r));
  if (status) withStatus = withStatus.filter((r) => r.status === status);
  res.json(withStatus);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, r.name AS resident_name, r.unit AS resident_unit
    FROM pins p LEFT JOIN residents r ON r.id = p.resident_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(pinWithStatus(row));
});

router.post('/', (req, res) => {
  const {
    code,
    label,
    residentId,
    kind,
    validFrom,
    validUntil,
    maxUses,
    length,
  } = req.body || {};
  if (!label || !kind || !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: 'label and a valid kind are required' });
  }
  let finalCode = (code || '').trim();
  if (finalCode) {
    if (!/^\d{3,10}$/.test(finalCode)) {
      return res.status(400).json({ error: 'code must be 3-10 digits' });
    }
    const dup = db.prepare('SELECT id FROM pins WHERE code = ?').get(finalCode);
    if (dup) return res.status(409).json({ error: 'code already in use' });
  } else {
    finalCode = generateUniquePin(Math.min(Math.max(parseInt(length, 10) || 4, 3), 10));
  }
  try {
    const info = db.prepare(`
      INSERT INTO pins (code, label, resident_id, kind, valid_from, valid_until, max_uses)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalCode,
      label,
      residentId || null,
      kind,
      validFrom || null,
      validUntil || null,
      maxUses == null || maxUses === '' ? null : parseInt(maxUses, 10)
    );
    const row = db.prepare(`
      SELECT p.*, r.name AS resident_name, r.unit AS resident_unit
      FROM pins p LEFT JOIN residents r ON r.id = p.resident_id
      WHERE p.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(pinWithStatus(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pins WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const {
    label,
    residentId,
    kind,
    enabled,
    validFrom,
    validUntil,
    maxUses,
  } = req.body || {};
  if (kind && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: 'invalid kind' });
  }
  db.prepare(`
    UPDATE pins
    SET label = ?, resident_id = ?, kind = ?, enabled = ?,
        valid_from = ?, valid_until = ?, max_uses = ?
    WHERE id = ?
  `).run(
    label ?? existing.label,
    residentId === undefined ? existing.resident_id : (residentId || null),
    kind ?? existing.kind,
    enabled === undefined ? existing.enabled : (enabled ? 1 : 0),
    validFrom === undefined ? existing.valid_from : (validFrom || null),
    validUntil === undefined ? existing.valid_until : (validUntil || null),
    maxUses === undefined
      ? existing.max_uses
      : (maxUses == null || maxUses === '' ? null : parseInt(maxUses, 10)),
    req.params.id
  );
  const row = db.prepare(`
    SELECT p.*, r.name AS resident_name, r.unit AS resident_unit
    FROM pins p LEFT JOIN residents r ON r.id = p.resident_id
    WHERE p.id = ?
  `).get(req.params.id);
  res.json(pinWithStatus(row));
});

router.post('/:id/toggle', (req, res) => {
  const existing = db.prepare('SELECT * FROM pins WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE pins SET enabled = ? WHERE id = ?').run(existing.enabled ? 0 : 1, existing.id);
  const row = db.prepare('SELECT * FROM pins WHERE id = ?').get(existing.id);
  res.json(pinWithStatus(row));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM pins WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
