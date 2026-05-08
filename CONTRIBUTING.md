# Contributing to Shiftly

## Project Structure

```
shiftly/
├── server/                    # Express + TypeScript backend
│   ├── prisma/
│   │   └── schema.prisma      # Database schema (source of truth)
│   ├── src/
│   │   ├── index.ts           # Entry point (Express + Socket.io)
│   │   ├── middleware/         # Auth, validation middleware
│   │   │   └── auth.ts        # JWT verification, role checks
│   │   └── routes/            # API route handlers
│   │       └── auth.ts        # Login, register, /me
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── main.tsx           # Entry point
│   │   ├── App.tsx            # Router setup
│   │   └── components/        # UI components
│   └── index.html
├── server/package.json        # Backend dependencies
└── client/package.json        # Frontend dependencies
```

## Quick Start

### Prerequisites
- Node.js 20+ 
- PostgreSQL 15+ running locally (or Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=shiftly -d postgres:15`)

### Setup

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Set up database (from server/)
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run db:generate
npm run db:migrate

# 3. Run both servers (from project root, two terminals)
cd server && npm run dev    # Backend on :3000
cd client && npm run dev    # Frontend on :5173
```

## Database Schema

The Prisma schema (`server/prisma/schema.prisma`) is the single source of truth for data models. When adding new fields or models:

1. Edit `schema.prisma`
2. Run `npm run db:migrate` from `server/` — creates a migration file
3. Run `npm run db:generate` — regenerates Prisma client types

### Key Models

| Model | Purpose | Issue |
|-------|---------|-------|
| `User` | Family members and workers (role-based) | #5 |
| `RecurringTask` | Weekly/daily task definitions | #2 |
| `TaskInstance` | Individual tasks (generated or ad-hoc) | #1, #3 |
| `ShiftNote` | Handover notes between shifts | #7 |
| `ShoppingList` / `ShoppingListItem` | Shared shopping list | #6 |
| `CalendarEvent` | Synced from Google Calendar | #4 |
| `Incident` | Incident reports | #9 |

## API Conventions

### Authentication
- All protected routes require `Authorization: Bearer <token>` header
- Tokens expire after 24 hours
- Two roles: `FAMILY` (full access) and `WORKER` (view + complete tasks)

### Route Patterns
```
POST   /api/auth/register      — Register new user
POST   /api/auth/login         — Login, returns JWT
GET    /api/auth/me            — Get current user
POST   /api/tasks              — Create ad-hoc task (FAMILY only)
GET    /api/tasks/today        — Get today's tasks
PATCH  /api/tasks/:id/complete — Mark task complete
GET    /api/calendar           — Today's calendar events
POST   /api/shopping/list      — Add item to shopping list
PATCH  /api/shopping/:id       — Toggle item complete
```

### Socket.io Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `join-role` | Client → Server | Join role room for targeted broadcasts |
| `task:created` | Server → Client | New task added (real-time) |
| `task:completed` | Server → Client | Task marked complete (real-time) |
| `shopping:item-added` | Server → Client | New shopping item (real-time) |

## Feature Development Workflow

When implementing a new feature (e.g., issue #1 Shift task list):

1. **Design the API** — add route handlers in `server/src/routes/`
2. **Update Prisma schema** if new models are needed, run migration
3. **Build the UI** — add components in `client/src/components/`
4. **Wire up real-time** — emit Socket.io events from server routes
5. **Test end-to-end** — create a task as family, see it appear as worker
6. **Update this doc** — add API route and Socket event to the tables above

## Tech Decisions (Why We Chose What We Did)

- **Prisma over raw SQL** — type safety, migrations already working in MeetingBoard project
- **Socket.io for real-time** — already in stack, bidirectional updates without polling
- **bcrypt + JWT auth** — simple, no external auth provider needed for a single household
- **Vite proxy** — dev server proxies `/api` to backend, avoids CORS during development
