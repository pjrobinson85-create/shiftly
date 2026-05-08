# Shiftly — Support Worker Shift App

Real-time shift task management for household support workers. Families add tasks, workers see them instantly and mark them complete.

## Core Features (MVP)

1. **Shift task list** — auto-generated from recurring + ad-hoc tasks
2. **Recurring task scheduler** — daily/weekly tasks that appear automatically
3. **Ad-hoc task entry** — family adds one-off tasks mid-shift, pushes instantly to worker
4. **Calendar integration** — sync Google Calendar appointments so workers know the day's schedule
5. **Task completion tracking + roles** — family (can add/edit) vs worker (can view/complete)
6. **Shopping list** — shared list anyone can add to or check off

## Post-MVP

7. Shift check-in/out + shift notes
8. Care profile/reference page (allergies, wheelchair settings, emergency contacts)
9. Incident logging
10. Document storage
11. Medication schedule display

## Tech Stack

- **Backend:** Express + TypeScript + Prisma + Socket.io
- **Frontend:** React + Vite + TypeScript
- **Database:** PostgreSQL (Prisma ORM)
- **Calendar:** Google Calendar API
- **Real-time:** Socket.io for live updates

## Getting Started

```bash
npm install
# ... setup instructions will be added here
```
