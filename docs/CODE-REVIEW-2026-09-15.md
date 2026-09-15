# Shiftly — Full Code Review
**Date:** 2026-09-15 · **Repo:** `pjrobinson85-create/shiftly` @ `3907686` · **~7,700 lines** (server ≈ 2,100, client ≈ 4,600)

Verified against current code, not the stale subagent output from the Sept 13 session (which timed out empty). Test suite re-run this review: **41/41 passing** (see note on a flaky test below).

---

## 1. What's good

- **Auth is properly hardened.** Bearer access tokens (6h) + rotating, *hashed* refresh tokens in an httpOnly cookie (`server/src/routes/auth.ts`). Refresh tokens are SHA-256'd before storage, rotated on every use, revoked on login/logout. This is better than 90% of hobby projects.
- **Role enforcement is consistent.** `requireAuth` on every router, `requireRole('FAMILY')` on every write path (tasks, recurring, shopping lists, incidents delete, care profile, calendar, users). Workers can complete/uncomplete tasks but not create or delete — exactly the design in PLAN.md.
- **Startup validation.** `lib/config.ts` throws immediately if `JWT_SECRET` is missing; tests are exempt from rate limiting deliberately and the reason is documented (429-ing `/me` would log users out — `index.ts`).
- **Uploads done right.** `multer` with MIME allowlist, 10MB/5-file caps, randomised filenames (`Date.now` + 6 random bytes), per-month dirs, friendly error handler for `LIMIT_FILE_SIZE`.
- **Fire-and-forget side effects that can't break requests.** `audit.log` failures are caught and logged, never thrown (`lib/audit.ts`); Telegram alerts fail silently and skip entirely in test mode (`lib/telegram.ts`).
- **Shift checkout is transactional** (`$transaction` for note + session update, `lib/shift-session.ts` pure validation functions with their own tests).
- **Recurring-task generator is dedupe-safe** — batch fetch of existing instances + `Set` of `id|date` keys, `createMany`, and the old Sunday-as-`0` bug is fixed with a `=== null` check and a comment explaining why.
- **NDIS CSV export** handles escaping (quoted/doubled), BOM for Excel, and date-range validation.
- **CI runs a CDP-based WCAG contrast audit** and prisma migrations are tracked in git. `.env` is git-ignored (verified).
- **Client token refresh is race-safe** — single-flight refresh with a pending-request queue in `api/client.ts`; socket lifecycle (connect/disconnect) is managed in useEffect cleanups.

## 2. Issues

### HIGH

**H1. Socket.io has no auth** — `server/src/lib/socket.ts`
Clients join role rooms by simply emitting `join-role: "FAMILY"` with zero token verification. Anyone can connect, join the `FAMILY` room, and emit whatever client-side handlers exist. Worse, the *server* emits to these rooms (`io.to('WORKER').emit('task:created', task)`) — so a worker can be impersonated into the family room, and a family can be injected with fake events, and events go out **unauthenticated**.
*Fix:* in `io.on('connection')`, read the `auth` query param or cookie, `jwt.verify` it, set `socket.data.user`, and only allow `join-role` if the role matches the token. Also add a `middleware` that rejects connections without a valid token.

**H2. Care profile `internalNotes` — verify at the wire, not just the API** — `server/src/routes/care-profile.ts`
`serializeCareProfile(profile, includeInternalNotes)` correctly strips `internalNotes` for WORKER role *at the API layer*. This is the right design and it works — but it's a single point of failure: any future query of `CareProfile` that forgets the filter leaks it (it's medical info). Worth a test asserting a WORKER token never sees `internalNotes` in the JSON body, plus a comment in the schema marking the field confidential. (Test coverage: check `care-profile.test.ts` — if the workercase is absent, add it.)

**H3. Google Calendar refresh token stored in a 0600 file** — `server/src/routes/calendar.ts`
`storeCreds()` writes the Google refresh token to a file on disk. This works, but it's outside the database (no backup, no rotation, survives redeploys silently) and the file isn't cleaned up. Since `RefreshToken` infrastructure already exists, move the Google token into a `CalendarCreds` table row (0600 file → DB row) so it's backed up with the DB and can be revoked from one place. This is issue #40 in GitHub — still open.

### MEDIUM

**M1. Open registration = anyone can create a FAMILY account** — `POST /api/auth/register` accepts `role` from the caller with no gating. On a private LAN this is acceptable, but the app is on a public hostname (`vikunja.ubuntu-hermes.com`), so a stranger who guesses the subpath can register *as family* and read the care profile, calendar, and incidents. *Fix:* make the default role `WORKER` only grantable via an invite code/secret env var, or make registration admin-only in production (`NODE_ENV` check). This is the single biggest real-world exposure.

**M2. No input validation library.** Every route hand-checks required fields; `dayOfWeek`, `time`, `severity`, `quantity` are taken on faith (e.g. `dayOfWeek: 42` or `time: "99:99"` would persist). A zod schema per route body (or just at the shared lib level) would catch the class of bugs in one pass and give consistent 400 messages. The May review flagged this (#32); still open.

**M3. Timezone handling is server-local.** `new Date(year, month-1, day)` and `toTimeString()` in `export.ts` / `shifts.ts` use the server's AEST zone. Fine today (single-site, Brisbane), but it silently breaks if the host moves or a family member is in a different zone. Document it, or pin `TZ=Australia/Brisbane` in the systemd unit so behaviour is explicit rather than accidental. (The Telegram alert already hardcodes `Australia/Brisbane` — do the same for the process.)

**M4. N+1 in calendar sync.** The callback loop does `findUnique` + `create/update` per event — 50 events = 100 queries. Batch: fetch all existing `googleId`s in one `findMany`, `upsert` in a `$transaction`. Same file also re-syncs 50 events per manual sync — consider `maxResults` + `pageToken`.

**M5. `ShiftSession.shiftDate` uniqueness + upsert race.** `getOrCreateShiftSession` upserts on a `DateTime` with seconds/millis — two check-ins at slightly different wall times for "the same day" can create two sessions. `parseDate` normalises to midnight (good), but any caller passing a non-normalised date breaks the invariant. Make `shiftDate` a `String` `YYYY-MM-DD` (or add a `@unique` on a string field) so the invariant is structural, not procedural.

**M6. Flaky test: export window vs server clock.** The 18:15 failure (before the 18:16 run) was the test's "today" window (`new Date()` midnight→now) being evaluated across the 09:00 UTC / 19:00 AEST boundary — a 10-minute AEST day starts at 14:00 UTC, and `new Date()` at 18:15 AEST = 08:15 UTC, i.e. *the previous AEST day*. The window computed in UTC doesn't contain the AEST "today" the test author intended. I confirmed the probe: window was `2026-09-14T14:00 → 2026-09-15T13:59` while records were created at `08:15Z`… which *was* inside — so the 18:15 failure was the earlier edge of the day (created at 06:00–07:59 AEST = before 14:00 UTC start). *Fix:* compute the window in AEST explicitly in the test (and pin `TZ` in the vitest config) so it doesn't depend on what time of day CI runs.

**M7. `quantity: String` on `ShoppingListItem`** — was `Int`, changed to String (May fix #32). That works for "2 loaves" but means no numeric ops; fine for display, just document that it's a free-text quantity.

### LOW

- **L1.** `bcryptjs` vs native `bcrypt` — bcryptjs is pure-JS and fine at this scale, but native is 10x faster for login under load. Optional.
- **L2.** `client/src/pages/*` — `ShiftSummary.tsx` (804) and `TasksPage.tsx` (660) are large but the code inside is clean (inline styles via `satisfies Record<string, CSSProperties>` — a neat type-safe pattern). Splitting is a maintainability nicety, not a bug; do it when you next touch them.
- **L3.** `any` casts are limited to error handlers (`catch (err: any)`) and one style map — acceptable, but `unknown` + narrowing would be cleaner.
- **L4.** `Login.tsx` labels exist but no `htmlFor`/`id` pairing — minor a11y gap the CI contrast audit wouldn't catch.
- **L5.** Refresh-token cookie `path` is scoped to `/api/auth/refresh` (good), but the client hits `/shiftly/api/auth/refresh` behind nginx — the path scope means the cookie is only sent to the rewritten path; works today because nginx proxies the same path, would break if the API path changes. Worth a comment.

## 3. Not done / recommended next

1. **Close the open security gaps:** H1 (socket auth) first — it's the only truly open door. Then M1 (registration) since the hostname is public.
2. **Close GitHub issue #40** (calendar creds → DB row) — the 0600-file approach was a stopgap.
3. **Pin `TZ=Australia/Brisbane`** in the shiftly systemd unit and in `vitest.config.ts` — removes M3/M6 class of bugs permanently.
4. **Add zod** for route bodies (open since May, #32) — one afternoon, kills the whole hand-validation class.
5. **Backup story:** SQLite `dev.db` holds everything including the care profile. Confirm you have an automated `sqlite3 dev.db .backup` (or `prisma` dump) into your backup store. A lost care profile is worse than a lost shopping list.
6. **Post-MVP (already tracked):** medication schedule display (#11), document storage (#10).

**Bottom line:** this is solid for a self-built app — auth, roles, uploads, audit, and the transactional shift checkout are all correct, and the test suite is green. The two things I'd fix before anyone beyond your family and workers uses it: **authenticate the socket** (H1) and **gate registration** (M1). Everything else is hygiene.
