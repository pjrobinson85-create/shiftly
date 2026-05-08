# Shiftly — Frontend Implementation Plan

## What Exists (Backend)

### API Endpoints (base: `/api`)

**Auth** (no auth required)
- `POST /auth/register` — `{ email, password, name, role: "FAMILY"|"WORKER", phone? }` → 201 user
- `POST /auth/login` — `{ email, password }` → `{ token, user }`
- `GET /auth/me` — Bearer token → user

**Recurring Tasks** (auth required)
- `GET /recurring-tasks` → task[]
- `POST /recurring-tasks` (FAMILY only) — `{ title, description?, dayOfWeek?: number|null, time?: "HH:MM", priority?: "NORMAL"|"URGENT" }` → 201 task
- `PUT /recurring-tasks/:id` (FAMILY only) — any of the above fields → updated task
- `DELETE /recurring-tasks/:id` (FAMILY only) → 204
- `POST /recurring-tasks/generate` (FAMILY only) — `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }` → `{ count, tasks[] }`

**Task Instances** (auth required)
- `GET /tasks?date=YYYY-MM-DD` (default today) → task[]
- `POST /tasks` — `{ title, description?, priority?: "NORMAL"|"URGENT", dueDate: ISO date }` → 201 task
- `PATCH /tasks/:id/complete` → updated task (marks completed=true, sets completedBy)
- `DELETE /tasks/:id` (FAMILY only) → 204

**Shifts** (auth required)
- `GET /shifts/:date` — `{ date, tasks: { total, completed, pending, list[] }, calendarEvents[], shiftNotes[] }`
- `POST /shifts/:date/notes` — `{ content }` → 201 note

### Models (Prisma)

```
User: id, email, name, role (FAMILY|WORKER), phone
RecurringTask: id, title, description?, dayOfWeek? (null=daily), time?, priority
TaskInstance: id, title, description?, priority, completed, completedAt?, dueDate, isRecurring, recurringTaskId?, createdById?, completedById?
ShiftNote: id, content, photos (Json array), shiftDate, userId
CalendarEvent: id, googleId, title, startTime, endTime?, description?, location?
ShoppingList: id, name, category?, isRecurring
ShoppingListItem: id, name, quantity, completed, listId, addedById?
Incident: id, title, description, severity, photos (Json), occurredAt, userId
```

### Socket.io Events
- Client → `join-role(role)` — join role room
- Server → `task:created(task)` — broadcast to WORKER room
- Server → `task:completed(task)` — broadcast to all
- Server → `note:created(note)` — broadcast to all

---

## What Exists (Frontend)

**Stack:** React + Vite + TypeScript. No UI library yet (inline styles).

**Files:**
- `client/src/api/client.ts` — axios instance with JWT interceptor (baseURL `/api`)
- `client/src/context/AuthContext.tsx` — AuthProvider with login/register/logout, localStorage token persistence
- `client/src/components/Login.tsx` — login page (email/password → dashboard)
- `client/src/components/Dashboard.tsx` — sidebar nav + protected routes + header with user info
- `client/src/App.tsx` — router setup with placeholder pages

**Routes configured (all placeholders):**
- `/tasks` — task list for today
- `/shopping` — shopping list
- `/recurring` — recurring task management (FAMILY only)
- `/calendar` — calendar integration (FAMILY only)

---

## Frontend Pages to Build

### 1. Tasks Page (`/tasks`)
**Both roles see this.**
- Date picker at top (default today)
- Task list fetched from `GET /tasks?date=...`
- Each task: title, description, priority badge (URGENT highlighted), due time
- Workers can click ✓ to complete (PATCH /tasks/:id/complete)
- Completed tasks visually dimmed/strikethrough
- Socket.io listener for real-time task create/complete updates
- URGENT tasks sorted to top

### 2. Recurring Tasks Page (`/recurring`) — FAMILY only
- List of all recurring task definitions
- "Add new" button → form: title, description, day-of-week selector (or "every day"), time picker, priority toggle
- Edit/delete buttons on each task
- "Generate for this week" button → calls POST /recurring-tasks/generate with current week dates

### 3. Shopping List Page (`/shopping`)
- List of shopping lists (default one called "Shopping List")
- Items in each list: name, quantity, checkbox to mark done
- Add new item form
- (Backend routes for this still needed — see below)

### 4. Calendar Page (`/calendar`) — FAMILY only
- Display calendar events synced from Google Calendar
- Show upcoming events on a timeline or calendar view
- (Backend Google Calendar sync still needed — see below)

### 5. Shift Summary (Dashboard Home)
- On dashboard home page, show today's shift summary (`GET /shifts/:today`)
- Task completion progress bar (completed/total)
- Upcoming calendar events for the day
- Recent shift notes

---

## Backend Still Needed

### Shopping List Routes (`/api/shopping`)
- `GET /shopping` — list all shopping lists + items
- `POST /shopping` (FAMILY only) — create list `{ name, category?, isRecurring? }`
- `GET /shopping/:listId/items` — items for a list
- `POST /shopping/:listId/items` — add item `{ name, quantity? }`
- `PATCH /shopping/items/:itemId` — update (e.g., mark completed)
- `DELETE /shopping/items/:itemId` (FAMILY only)

### Incident Routes (`api/incidents`)
- `GET /incidents` — list incidents
- `POST /incidents` — report `{ title, description, severity: "low"|"medium"|"high", occurredAt, photos?: string[] }`
- `GET /incidents/:id` — details

### Google Calendar Sync (FAMILY only)
- `POST /calendar/connect` — OAuth flow to connect Google Calendar
- `POST /calendar/sync` — pull events from Google into local CalendarEvent table
- Needs: Google OAuth credentials, store refresh token in DB or env

---

## UX Notes

- **Mobile-first** — support workers will use phones on shift
- Keep it simple and scannable — large tap targets, clear visual hierarchy
- Task completion should be one tap (big checkmark button)
- Color code: URGENT = red/orange, completed = grey/dimmed
- Dark sidebar is already in place, keep light content area for readability
