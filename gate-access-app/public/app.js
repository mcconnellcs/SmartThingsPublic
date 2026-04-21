const api = {
  async get(path) { return handle(await fetch(path)); },
  async post(path, body) {
    return handle(await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
  },
  async put(path, body) {
    return handle(await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
  },
  async del(path) { return handle(await fetch(path, { method: 'DELETE' })); },
};

async function handle(res) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('unauthenticated');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'onInput') node.addEventListener('input', v);
    else if (k === 'onChange') node.addEventListener('change', v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return s;
  return d.toLocaleString();
}

function formatRange(from, until) {
  if (!from && !until) return 'always';
  return `${from ? formatDate(from) : '—'} → ${until ? formatDate(until) : '—'}`;
}

// ---------- navigation ----------
const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('.nav-btn');
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

function showView(name) {
  views.forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'pins') loadPins();
  if (name === 'residents') loadResidents();
  if (name === 'logs') loadLogs();
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api.post('/api/auth/logout');
  window.location.href = '/login.html';
});

api.get('/api/auth/me').then((me) => {
  document.getElementById('current-user').textContent = me.username;
}).catch(() => {});

// ---------- dashboard ----------
async function loadDashboard() {
  const [stats, logs] = await Promise.all([
    api.get('/api/logs/stats'),
    api.get('/api/logs?limit=10'),
  ]);
  const statsEl = document.getElementById('stats');
  statsEl.innerHTML = '';
  statsEl.append(
    statCard('Residents', stats.residents),
    statCard('Active PINs', `${stats.activePins} / ${stats.totalPins}`),
    statCard('Granted (7d)', stats.last7days.granted, 'good'),
    statCard('Denied (7d)', stats.last7days.denied, 'bad'),
  );

  const tbody = document.getElementById('recent-activity');
  tbody.innerHTML = '';
  if (!logs.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'No activity yet.')));
    return;
  }
  for (const l of logs) tbody.append(renderLogRow(l));
}

function statCard(label, value, variant) {
  return el('div', { class: `stat-card ${variant || ''}` },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, value ?? 0));
}

// ---------- pins ----------
const pinSearch = document.getElementById('pin-search');
const pinKind = document.getElementById('pin-filter-kind');
const pinStatus = document.getElementById('pin-filter-status');
[pinSearch, pinKind, pinStatus].forEach((e) => e.addEventListener('input', debounce(loadPins, 200)));
document.getElementById('new-pin-btn').addEventListener('click', () => openPinModal());

async function loadPins() {
  const params = new URLSearchParams();
  if (pinSearch.value.trim()) params.set('q', pinSearch.value.trim());
  if (pinKind.value) params.set('kind', pinKind.value);
  if (pinStatus.value) params.set('status', pinStatus.value);
  const rows = await api.get('/api/pins?' + params.toString());
  const tbody = document.getElementById('pins-body');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'No PINs match.')));
    return;
  }
  for (const p of rows) tbody.append(renderPinRow(p));
}

function renderPinRow(p) {
  const residentLabel = p.resident_name
    ? `${p.resident_name} (${p.resident_unit})`
    : el('span', { class: 'muted' }, '—');
  return el('tr', {},
    el('td', {}, el('span', { class: 'pin-code' }, p.code)),
    el('td', {}, p.label),
    el('td', {}, el('span', { class: `badge kind-${p.kind}` }, p.kind)),
    el('td', {}, residentLabel),
    el('td', {}, el('span', { class: `badge ${p.status}` }, p.status.replace('_', ' '))),
    el('td', { class: 'muted' }, formatRange(p.valid_from, p.valid_until)),
    el('td', {}, p.max_uses == null ? `${p.use_count}` : `${p.use_count} / ${p.max_uses}`),
    el('td', { class: 'row-actions' },
      el('button', {
        class: 'btn small secondary',
        onClick: () => togglePin(p),
      }, p.enabled ? 'Disable' : 'Enable'),
      el('button', { class: 'btn small secondary', onClick: () => openPinModal(p) }, 'Edit'),
      el('button', { class: 'btn small danger', onClick: () => deletePin(p) }, 'Delete'),
    ),
  );
}

async function togglePin(p) {
  await api.post(`/api/pins/${p.id}/toggle`);
  loadPins();
}

async function deletePin(p) {
  if (!confirm(`Delete PIN ${p.code} (${p.label})?`)) return;
  await api.del(`/api/pins/${p.id}`);
  loadPins();
}

async function openPinModal(existing) {
  const residents = await api.get('/api/residents');
  const isEdit = !!existing;
  const e = existing || {};
  const modal = buildModal(isEdit ? 'Edit PIN' : 'New PIN', (form) => form.innerHTML = `
    <label>Label</label>
    <input name="label" required value="${escapeHtml(e.label || '')}" placeholder="e.g. John's front gate" />
    <div class="form-row">
      <div>
        <label>Code ${isEdit ? '' : '(leave empty to auto-generate)'}</label>
        <input name="code" value="${escapeHtml(e.code || '')}" ${isEdit ? 'disabled' : ''} placeholder="4-6 digits" />
      </div>
      <div>
        <label>Kind</label>
        <select name="kind" required>
          ${['resident','guest','vendor','staff'].map((k) =>
            `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>
    </div>
    <label>Resident (optional)</label>
    <select name="residentId">
      <option value="">— none —</option>
      ${residents.map((r) =>
        `<option value="${r.id}" ${e.resident_id === r.id ? 'selected' : ''}>${escapeHtml(r.unit)} — ${escapeHtml(r.name)}</option>`
      ).join('')}
    </select>
    <div class="form-row">
      <div>
        <label>Valid from</label>
        <input name="validFrom" type="datetime-local" value="${toDateTimeLocal(e.valid_from)}" />
      </div>
      <div>
        <label>Valid until</label>
        <input name="validUntil" type="datetime-local" value="${toDateTimeLocal(e.valid_until)}" />
      </div>
    </div>
    <div class="form-row">
      <div>
        <label>Max uses (blank = unlimited)</label>
        <input name="maxUses" type="number" min="1" value="${e.max_uses ?? ''}" />
      </div>
      ${isEdit ? '' : `
      <div>
        <label>Auto-generated length</label>
        <select name="length">
          <option value="4" selected>4 digits</option>
          <option value="5">5 digits</option>
          <option value="6">6 digits</option>
        </select>
      </div>`}
    </div>
    ${isEdit ? `
      <label><input type="checkbox" name="enabled" ${e.enabled ? 'checked' : ''}/> Enabled</label>
    ` : ''}
  `, async (data) => {
    const payload = {
      label: data.label,
      code: data.code || undefined,
      kind: data.kind,
      residentId: data.residentId ? parseInt(data.residentId, 10) : null,
      validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : null,
      validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : null,
      maxUses: data.maxUses || null,
      length: data.length,
    };
    if (isEdit) payload.enabled = !!data.enabled;
    if (isEdit) await api.put(`/api/pins/${e.id}`, payload);
    else await api.post('/api/pins', payload);
    closeModal();
    loadPins();
  });
  document.getElementById('modal-root').append(modal);
}

// ---------- residents ----------
const residentSearch = document.getElementById('resident-search');
residentSearch.addEventListener('input', debounce(loadResidents, 200));
document.getElementById('new-resident-btn').addEventListener('click', () => openResidentModal());

async function loadResidents() {
  const q = residentSearch.value.trim();
  const rows = await api.get('/api/residents' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const tbody = document.getElementById('residents-body');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'No residents yet.')));
    return;
  }
  for (const r of rows) {
    tbody.append(el('tr', {},
      el('td', {}, r.unit),
      el('td', {}, r.name),
      el('td', { class: 'muted' }, r.email || '—'),
      el('td', { class: 'muted' }, r.phone || '—'),
      el('td', { class: 'row-actions' },
        el('button', { class: 'btn small secondary', onClick: () => openResidentModal(r) }, 'Edit'),
        el('button', { class: 'btn small danger', onClick: () => deleteResident(r) }, 'Delete'),
      ),
    ));
  }
}

async function deleteResident(r) {
  if (!confirm(`Delete resident ${r.name}? Their PINs will remain but be unlinked.`)) return;
  await api.del(`/api/residents/${r.id}`);
  loadResidents();
}

function openResidentModal(existing) {
  const isEdit = !!existing;
  const e = existing || {};
  const modal = buildModal(isEdit ? 'Edit Resident' : 'New Resident', (form) => form.innerHTML = `
    <div class="form-row">
      <div>
        <label>Unit / Address</label>
        <input name="unit" required value="${escapeHtml(e.unit || '')}" />
      </div>
      <div>
        <label>Name</label>
        <input name="name" required value="${escapeHtml(e.name || '')}" />
      </div>
    </div>
    <div class="form-row">
      <div>
        <label>Email</label>
        <input name="email" type="email" value="${escapeHtml(e.email || '')}" />
      </div>
      <div>
        <label>Phone</label>
        <input name="phone" value="${escapeHtml(e.phone || '')}" />
      </div>
    </div>
    <label>Notes</label>
    <textarea name="notes" rows="3">${escapeHtml(e.notes || '')}</textarea>
  `, async (data) => {
    if (isEdit) await api.put(`/api/residents/${e.id}`, data);
    else await api.post('/api/residents', data);
    closeModal();
    loadResidents();
  });
  document.getElementById('modal-root').append(modal);
}

// ---------- logs ----------
const logResult = document.getElementById('log-filter-result');
logResult.addEventListener('change', loadLogs);
document.getElementById('log-refresh').addEventListener('click', loadLogs);

async function loadLogs() {
  const params = new URLSearchParams();
  if (logResult.value) params.set('result', logResult.value);
  const rows = await api.get('/api/logs?' + params.toString());
  const tbody = document.getElementById('logs-body');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 6, class: 'empty' }, 'No log entries.')));
    return;
  }
  for (const l of rows) tbody.append(renderLogRow(l));
}

function renderLogRow(l) {
  const residentLabel = l.resident_name
    ? `${l.resident_name} (${l.resident_unit})`
    : (l.pin_label || el('span', { class: 'muted' }, '—'));
  return el('tr', {},
    el('td', { class: 'muted' }, formatDate(l.occurred_at)),
    el('td', {}, el('span', { class: 'pin-code' }, l.code_attempted)),
    el('td', {}, el('span', { class: `badge ${l.result}` }, l.result)),
    el('td', { class: 'muted' }, l.reason || '—'),
    el('td', {}, residentLabel),
    el('td', { class: 'muted' }, l.gate || '—'),
  );
}

// ---------- modal helper ----------
function buildModal(title, fillForm, onSubmit) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  const modal = el('div', { class: 'modal' });
  modal.append(el('h2', {}, title));
  const form = el('form', {});
  fillForm(form);
  const err = el('div', { class: 'error' });
  const actions = el('div', { class: 'modal-actions' },
    el('button', { type: 'button', class: 'btn secondary', onClick: closeModal }, 'Cancel'),
    el('button', { type: 'submit', class: 'btn' }, 'Save'),
  );
  form.append(err, actions);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    const data = {};
    for (const field of form.querySelectorAll('input[name], select[name], textarea[name]')) {
      if (field.type === 'checkbox') data[field.name] = field.checked;
      else data[field.name] = field.value;
    }
    try { await onSubmit(data); }
    catch (e2) { err.textContent = e2.message; }
  });
  modal.append(form);
  backdrop.append(modal);
  return backdrop;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function toDateTimeLocal(s) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// initial load
loadDashboard();
