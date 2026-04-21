const express = require('express');
const db = require('../lib/db');

const router = express.Router();

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT * FROM residents
      WHERE name LIKE ? OR unit LIKE ? OR email LIKE ? OR phone LIKE ?
      ORDER BY unit, name
    `).all(like, like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM residents ORDER BY unit, name').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const pins = db.prepare('SELECT * FROM pins WHERE resident_id = ? ORDER BY created_at DESC').all(row.id);
  res.json({ ...row, pins });
});

router.post('/', (req, res) => {
  const { name, unit, email, phone, notes } = req.body || {};
  if (!name || !unit) {
    return res.status(400).json({ error: 'name and unit are required' });
  }
  const info = db.prepare(`
    INSERT INTO residents (name, unit, email, phone, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, unit, email || null, phone || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM residents WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, unit, email, phone, notes } = req.body || {};
  const existing = db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE residents SET name = ?, unit = ?, email = ?, phone = ?, notes = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    unit ?? existing.unit,
    email ?? existing.email,
    phone ?? existing.phone,
    notes ?? existing.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM residents WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM residents WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
