#!/usr/bin/env bash
# Creates all Shiftly review issues on GitHub.
# Usage: GITHUB_TOKEN=ghp_xxx bash create-github-issues.sh

REPO="pjrobinson85-create/shiftly"
API="https://api.github.com/repos/${REPO}/issues"
AUTH="Authorization: Bearer ${GITHUB_TOKEN}"

create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  curl -s -X POST "$API" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "{\"title\": $(echo "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'), \"body\": $(echo "$body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'), \"labels\": $labels}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f"  Created #{d[\"number\"]}: {d[\"title\"]}")'
}

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN is not set."
  echo "Create a token at https://github.com/settings/tokens (repo scope needed)"
  echo "Then run:  GITHUB_TOKEN=ghp_xxx bash create-github-issues.sh"
  exit 1
fi

echo "Creating Shiftly issues on ${REPO}..."

# ── BUG ──────────────────────────────────────────────────────────────────────

create_issue \
"[bug] Sunday recurring tasks generate for the whole week" \
'## Problem
In `server/src/routes/recurring-tasks.ts`, the generate endpoint checks:

```ts
if (!task.dayOfWeek || current.getDay() === task.dayOfWeek)
```

`!task.dayOfWeek` evaluates to `true` when `dayOfWeek` is `0` (Sunday), so any task scheduled for Sunday only gets treated as an "every day" task and generates instances for the entire date range.

## Fix
```ts
if (task.dayOfWeek === null || current.getDay() === task.dayOfWeek)
```

## Impact
Any recurring task set to "Sunday" will silently generate 7× the expected instances every time the generate button is clicked.' \
'["bug"]'

create_issue \
"[bug] Shopping DELETE /items/:itemId is matched by /:listId route" \
'## Problem
In `server/src/routes/shopping.ts`, Express routes are registered in this order:

1. `DELETE /api/shopping/:listId` — deletes a whole list
2. `DELETE /api/shopping/items/:itemId` — deletes a single item

Because `/:listId` is registered first, a request to `DELETE /api/shopping/items/abc` matches `/:listId` with `listId = "items"` and tries to delete a shopping list with id `"items"` rather than deleting the item.

## Fix
Move all `/items/:itemId` routes (PATCH and DELETE) **above** the `/:listId` routes, or restructure to `/api/shopping/lists/:listId` and `/api/shopping/items/:itemId`.

## Impact
Deleting shopping items via the API is completely broken — it silently attempts to delete the wrong record.' \
'["bug"]'

create_issue \
"[bug] Task priority sort is backwards — NORMAL tasks appear before URGENT" \
'## Problem
In `server/src/routes/tasks.ts`:

```ts
orderBy: [{ priority: '"'"'asc'"'"' }, { dueDate: '"'"'asc'"'"' }]
```

Prisma sorts enum string values alphabetically. `"NORMAL"` comes before `"URGENT"` alphabetically, so ascending order puts normal tasks first. The same issue exists in the shifts route.

## Fix
Change to `'"'"'desc'"'"'`:
```ts
orderBy: [{ priority: '"'"'desc'"'"' }, { dueDate: '"'"'asc'"'"' }]
```

## Impact
URGENT tasks always appear at the bottom of the list instead of the top, defeating the purpose of the priority system.' \
'["bug"]'

# ── STRUCTURAL ───────────────────────────────────────────────────────────────

create_issue \
"[refactor] Multiple PrismaClient instances cause connection pool exhaustion" \
'## Problem
Every route file creates its own `new PrismaClient()`:

```ts
// auth.ts
const prisma = new PrismaClient();

// tasks.ts
const prisma = new PrismaClient();

// shopping.ts
const prisma = new PrismaClient();
// ... etc
```

In development with hot-module reload, this creates a new connection pool on every file change. In production, each instance opens its own connections and you will hit database connection limits under any real load.

## Fix
Create a shared singleton at `server/src/lib/prisma.ts`:

```ts
import { PrismaClient } from '"'"'@prisma/client'"'"';

const prisma = new PrismaClient();
export default prisma;
```

Then replace all `new PrismaClient()` calls with `import prisma from '"'"'../lib/prisma'"'"'`.' \
'["refactor", "performance"]'

create_issue \
"[security] JWT_SECRET is duplicated and falls back to a hardcoded string" \
'## Problem
`JWT_SECRET` is defined independently in two files:

- `server/src/middleware/auth.ts`
- `server/src/routes/auth.ts`

Both fall back to `'"'"'shiftly-dev-secret'"'"'` if the env var is not set. If `JWT_SECRET` is not configured in production, tokens can be forged by anyone who knows the fallback string.

## Fix
Extract to a shared config and throw on startup if missing:

```ts
// server/src/lib/config.ts
if (!process.env.JWT_SECRET) {
  throw new Error('"'"'JWT_SECRET environment variable is required'"'"');
}
export const JWT_SECRET = process.env.JWT_SECRET;
```

Import `JWT_SECRET` from this file in both `auth.ts` and `middleware/auth.ts`.' \
'["security", "refactor"]'

create_issue \
"[refactor] No global error handler — unhandled async errors hang or crash requests" \
'## Problem
`server/src/index.ts` has no global error-handling middleware. If an unexpected error is thrown inside a route (or if a `try/catch` is missed), Express will either hang the request indefinitely or respond with an empty 500 with no body.

## Fix
Add a global error handler as the last middleware in `index.ts`:

```ts
import { Request, Response, NextFunction } from '"'"'express'"'"';

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('"'"'Unhandled error:'"'"', err);
  res.status(500).json({ error: '"'"'Internal server error'"'"' });
});
```' \
'["refactor", "reliability"]'

# ── SECURITY ─────────────────────────────────────────────────────────────────

create_issue \
"[security] No rate limiting on auth endpoints — vulnerable to brute-force" \
'## Problem
`POST /api/auth/login` and `POST /api/auth/register` have no rate limiting. An attacker can make unlimited login attempts to brute-force passwords.

## Fix
Install `express-rate-limit` and apply it to auth routes in `index.ts`:

```bash
npm install express-rate-limit
```

```ts
import rateLimit from '"'"'express-rate-limit'"'"';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: '"'"'Too many attempts, please try again later'"'"' },
});

app.use('"'"'/api/auth'"'"', authLimiter);
```' \
'["security"]'

create_issue \
"[ux] JWT tokens expire after 24h with no refresh — workers get logged out mid-shift" \
'## Problem
Tokens are signed with `{ expiresIn: '"'"'24h'"'"' }`. A support worker who logs in at the start of a shift and is still on shift 24 hours later will silently lose authentication. API calls will return 401 and the UI will show errors with no clear explanation.

## Fix (short-term)
Extend to 7 days for a shift app context:
```ts
{ expiresIn: '"'"'7d'"'"' }
```

## Fix (long-term)
Implement a refresh token endpoint (`POST /api/auth/refresh`) that issues a new short-lived access token when given a valid long-lived refresh token. Store refresh tokens in the DB with the ability to revoke them.' \
'["ux", "security"]'

# ── DATA / SCHEMA ─────────────────────────────────────────────────────────────

create_issue \
"[bug] ShoppingListItem.quantity is Int but UI sends free-text strings" \
'## Problem
The Prisma schema defines:
```prisma
quantity    Int      @default(1)
```

But the shopping list UI allows free-text quantity entry (e.g. "2 packets", "1 box", "handful"). Passing a non-numeric string to a Prisma `Int` field will throw a validation error and fail to create the item.

## Fix
Change the schema field to `String` to allow freeform quantities:
```prisma
quantity    String?
```

Run `prisma migrate dev` after the change.' \
'["bug", "schema"]'

create_issue \
"[performance] N+1 query in recurring task generate endpoint" \
'## Problem
In `server/src/routes/recurring-tasks.ts`, the generate endpoint loops over every recurring task and every day in the range, issuing a separate `prisma.taskInstance.count(...)` query for each combination to check for duplicates:

```ts
for (const task of recurringTasks) {       // N tasks
  while (current <= end) {                   // D days
    const existing = await prisma.taskInstance.count(...); // N×D queries
  }
}
```

For 10 recurring tasks over a 7-day week this is 70 individual DB queries.

## Fix
Use `prisma.taskInstance.createMany({ skipDuplicates: true })` after building the full list of instances in memory, or fetch all existing instances for the date range in a single query before the loop and check in memory.' \
'["performance"]'

create_issue \
"[chore] SQLite and PostgreSQL config are inconsistent between schema.prisma and .env.example" \
'## Problem
`server/prisma/schema.prisma` declares:
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

But `server/.env.example` shows:
```
DATABASE_URL="postgresql://user:password@localhost:5432/shiftly"
```

These are mismatched. Anyone following the README will set a PostgreSQL `DATABASE_URL` but the schema will use SQLite and ignore it.

## Fix
Decide on the intended setup and document it clearly:
- **Option A (recommended):** Use SQLite for local dev, switch `provider` to `"postgresql"` for production deployments, and note the switch in the README.
- **Option B:** Use PostgreSQL everywhere and update `schema.prisma` to match `.env.example`.

Add a note to `CONTRIBUTING.md` explaining how to switch.' \
'["chore", "documentation"]'

create_issue \
"[refactor] No input validation — malformed requests cause unhelpful Prisma errors" \
'## Problem
Route handlers cast request bodies with TypeScript `as { ... }` which is compile-time only. At runtime, malformed requests (missing required fields, wrong types, oversized strings) hit Prisma directly and produce cryptic database errors or silently store bad data.

Examples:
- `POST /api/tasks` with no `dueDate` will throw a Prisma error about an invalid DateTime
- `POST /api/recurring-tasks` with `dayOfWeek: "monday"` (string instead of int) will fail silently

## Fix
Add `zod` for runtime request validation:

```bash
npm install zod
```

Example for task creation:
```ts
import { z } from '"'"'zod'"'"';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['"'"'NORMAL'"'"', '"'"'URGENT'"'"']).default('"'"'NORMAL'"'"'),
  dueDate: z.string().datetime(),
});
```

Return a 400 with a clear message if validation fails.' \
'["refactor", "reliability"]'

echo ""
echo "Done! All issues created."
