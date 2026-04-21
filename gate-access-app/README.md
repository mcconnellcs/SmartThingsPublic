# Gate Access Manager

A self-hostable web app for managing PIN codes for a gated community. Admins
can manage residents, issue permanent and temporary PINs (for guests,
vendors, staff), and review an access log. Gate hardware or a keypad
controller can verify a PIN via a token-authenticated HTTP endpoint.

## Features

- Admin login with session cookies and bcrypt-hashed passwords
- Residents directory (unit / address, contact info, notes)
- PIN management
  - Resident, guest, vendor, and staff PINs
  - Manual code entry or auto-generated 4–6 digit codes
  - Optional `valid_from` / `valid_until` windows
  - Optional max-use counts (e.g. single-use guest codes)
  - Enable / disable without deleting
- Access log with granted/denied results and a denial reason
- Gate-terminal `POST /api/gate/verify` endpoint for hardware
- SQLite storage — one file, no external services

## Quick start

```sh
cd gate-access-app
npm install
ADMIN_USERNAME=admin ADMIN_PASSWORD=changeme123 npm run init-db
GATE_API_TOKEN=<shared-secret-for-gate-hardware> npm start
```

Open <http://localhost:3000> and sign in. Change the admin password from
the web UI on first login (API: `POST /api/auth/change-password`).

## Environment variables

| Variable         | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `PORT`           | HTTP port (default `3000`)                                   |
| `SESSION_SECRET` | Cookie signing secret. Set this in production.               |
| `GATE_DB_PATH`   | Path to the SQLite file (default `data/gate.db`)             |
| `GATE_API_TOKEN` | Shared token required on `POST /api/gate/verify`             |
| `NODE_ENV`       | Set to `production` to require HTTPS cookies                 |
| `ADMIN_USERNAME` | Used only by `npm run init-db` to seed the first admin       |
| `ADMIN_PASSWORD` | Used only by `npm run init-db` to seed the first admin       |

## HTTP API

All admin endpoints require an authenticated session cookie from
`POST /api/auth/login`.

### Auth

- `POST /api/auth/login` — `{ username, password }`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/auth/change-password` — `{ currentPassword, newPassword }`

### Residents

- `GET    /api/residents?q=<search>`
- `GET    /api/residents/:id`
- `POST   /api/residents` — `{ name, unit, email?, phone?, notes? }`
- `PUT    /api/residents/:id`
- `DELETE /api/residents/:id`

### PINs

- `GET    /api/pins?q=&kind=&status=&residentId=`
- `GET    /api/pins/:id`
- `POST   /api/pins` — `{ label, kind, code?, residentId?, validFrom?, validUntil?, maxUses?, length? }`
- `PUT    /api/pins/:id`
- `POST   /api/pins/:id/toggle`
- `DELETE /api/pins/:id`

`kind` is one of `resident`, `guest`, `vendor`, `staff`.
`status` (filter only) is `active`, `disabled`, `scheduled`, `expired`, or `used_up`.

### Access logs

- `GET /api/logs?result=&pinId=&limit=`
- `GET /api/logs/stats`

### Gate hardware

```
POST /api/gate/verify
Header: X-Gate-Token: <GATE_API_TOKEN>
Body:   { "code": "123456", "gate": "Main" }
```

Returns `200 { granted: true, label, kind }` when the PIN is valid, or
`403 { granted: false, reason }` otherwise. Every attempt is recorded in
`access_logs`, even if no matching PIN exists.

Possible denial reasons: `not_found`, `disabled`, `not_yet_valid`,
`expired`, `max_uses_reached`.

## Data model

Three tables, all managed by `src/lib/db.js`:

- `admins(id, username, password_hash, created_at)`
- `residents(id, name, unit, email, phone, notes, created_at)`
- `pins(id, code, label, resident_id, kind, enabled, valid_from, valid_until, max_uses, use_count, created_at)`
- `access_logs(id, pin_id, code_attempted, gate, result, reason, occurred_at)`

Deleting a resident nulls out `pins.resident_id` (historical PINs remain).
Deleting a PIN nulls out `access_logs.pin_id` (history is preserved).

## Security notes

- Run behind TLS in production and set `NODE_ENV=production` so session
  cookies get the `Secure` flag.
- Set a long `SESSION_SECRET` — otherwise a random one is generated at
  boot and all sessions are invalidated on restart.
- `GATE_API_TOKEN` should be a long random string shared with the gate
  controller. If unset, the verify endpoint is open — only do that on a
  trusted LAN.
- PIN codes are stored in clear so they can be displayed to admins; the
  gate-verify endpoint is the right boundary to protect.
