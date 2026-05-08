# Contributing to Shiftly

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Google Calendar OAuth credentials (for calendar sync feature)

### Setup

```bash
git clone https://github.com/pjrobinson85-create/shiftly.git
cd shiftly

# Server
cd server
npm install
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET
npx prisma generate
npm run dev

# Client (new terminal)
cd client
npm install
npm run dev
```

### Database

Shiftly uses **SQLite for local development** (zero setup, just works). The Prisma schema is configured with `provider = "sqlite"` and `url = "file:./dev.db"`.

To use PostgreSQL (recommended for production):
1. Edit `server/prisma/schema.prisma` → change `provider = "postgresql"`
2. Set `DATABASE_URL` in `.env`
3. Run `npx prisma migrate dev`

### Project Structure

```
shiftly/
├── client/          # React + Vite + TypeScript frontend
│   └── src/
│       ├── pages/   # Feature pages (Tasks, Calendar, etc.)
│       └── components/
├── server/          # Express + TypeScript backend
│   ├── prisma/      # Database schema & migrations
│   ├── src/
│   │   ├── lib/     # Shared utilities (prisma.ts, config.ts)
│   │   ├── middleware/  # Auth middleware
│   │   └── routes/  # API route handlers
│   └── .env.example
└── README.md
```

### Conventions

- **Backend:** Express + TypeScript + Prisma + Socket.io
- **Frontend:** React + Vite + TypeScript
- **Auth:** JWT with role-based access (FAMILY / WORKER)
- **Database:** SQLite (dev), PostgreSQL (production)
- **Tests:** Vitest + Supertest

### Adding a New Feature

1. Create a branch: `git checkout -b feature/your-feature`
2. Update the Prisma schema if needed (`server/prisma/schema.prisma`)
3. Run `npx prisma migrate dev --name your-migration-name`
4. Add route handlers in `server/src/routes/`
5. Add frontend pages in `client/src/pages/`
6. Register routes in `server/src/index.ts` and pages in `client/src/App.tsx`
7. Test locally, then push and open a PR
