# Shiftly — Support Worker Shift App

Real-time shift task management for household support workers. Families add tasks, workers see them instantly and mark them complete.

## Core Features (MVP)

1. **Shift task list** — auto-generated from recurring + ad-hoc tasks ([#1](https://github.com/pjrobinson85-create/shiftly/issues/1))
2. **Recurring task scheduler** — daily/weekly tasks that appear automatically ([#2](https://github.com/pjrobinson85-create/shiftly/issues/2))
3. **Ad-hoc task entry** — family adds one-off tasks mid-shift, pushes instantly to worker ([#3](https://github.com/pjrobinson85-create/shiftly/issues/3))
4. **Calendar integration** — sync Google Calendar appointments so workers know the day's schedule ([#4](https://github.com/pjrobinson85-create/shiftly/issues/4))
5. **Task completion tracking + roles** — family (can add/edit) vs worker (can view/complete) ([#5](https://github.com/pjrobinson85-create/shiftly/issues/5))
6. **Shopping list** — shared list anyone can add to or check off ([#6](https://github.com/pjrobinson85-create/shiftly/issues/6))

## Post-MVP

7. Shift check-in/out + shift notes ([#7](https://github.com/pjrobinson85-create/shiftly/issues/7))
8. Care profile/reference page (allergies, wheelchair settings, emergency contacts) ([#8](https://github.com/pjrobinson85-create/shiftly/issues/8))
9. Incident logging ([#9](https://github.com/pjrobinson85-create/shiftly/issues/9))
10. Document storage ([#10](https://github.com/pjrobinson85-create/shiftly/issues/10))
11. Medication schedule display ([#11](https://github.com/pjrobinson85-create/shiftly/issues/11))

## Tech Stack

- **Backend:** Express + TypeScript + Prisma + Socket.io
- **Frontend:** React + Vite + TypeScript
- **Database:** SQLite in the current repo config (Prisma ORM)
- **Calendar:** Google Calendar API
- **Real-time:** Socket.io for live updates

## Quick Start

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Set up database
cp .env.example .env  # edit DATABASE_URL
npm run db:generate
npm run db:migrate

# Run (two terminals)
cd server && npm run dev    # Backend on :3000
cd client && npm run dev    # Frontend on :5173
```

## Deployment

Deployed on Ubuntu server behind nginx reverse proxy at `/shiftly` subpath (coexists with Vikunja task manager at `/`). See [CONTRIBUTING.md](CONTRIBUTING.md) → Deployment section for nginx config.

**Current instance:** https://192.168.1.238/shiftly

## Active Issues

- [#40](https://github.com/pjrobinson85-create/shiftly/issues/40) — Security: harden Google Calendar OAuth callback and token handling (live Google credential setup/manual verification deferred until later)
- [#9](https://github.com/pjrobinson85-create/shiftly/issues/9) — Incident logging with severity, photo links/paths, and family real-time notifications
- Stabilization work is being tracked in [`docs/plans/2026-05-20-stabilization-plan.md`](docs/plans/2026-05-20-stabilization-plan.md)

## Local Verification

Run the same checks expected in CI plus the shift-session, care-profile, and incident regression tests:

```bash
cd server && npm ci && npm run db:generate && npx tsx --test src/lib/shift-session.test.ts && npx tsx --test src/lib/care-profile.test.ts && npx tsx --test src/lib/incidents.test.ts && npm run typecheck && npm run build
cd ../client && npm ci && npm run typecheck && npm run build
```

### Incident logging manual verification

- Log in as `worker@shiftly.test` / `password123`
- Open **Incidents**, submit a report with title, description, severity, and optional photo links/paths
- Confirm the occurred-at timestamp defaults to the current time but can be adjusted before submit
- Log in as `family@shiftly.test` / `password123`
- Confirm the incident appears in the feed and family listeners receive the real-time update

Full setup guide → [CONTRIBUTING.md](CONTRIBUTING.md)
