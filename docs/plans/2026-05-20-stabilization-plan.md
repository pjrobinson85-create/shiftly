# Shiftly Stabilization Plan

> Active implementation plan for the first stabilization pass.

## Goals

1. Restore green builds for both `server/` and `client/`.
2. Keep project documentation aligned with the real stack and active work.
3. Use this pass to unblock follow-up security and CI work.

## Current blockers

### Server
- `src/routes/shopping.ts` references Prisma fields that do not exist in `schema.prisma` (`ownerId`, `position`).
- `src/routes/calendar.test.ts` is being included in the production TypeScript build.

### Client
- `src/api/client.ts` has a broken queued refresh path (`.catch(reject)` with `reject` out of scope).
- `src/components/Dashboard.tsx` and `src/pages/TasksPage.tsx` define style maps with a function-only type even though the maps contain a mix of objects and functions.

## This pass

- [ ] Fix server shopping route / schema mismatch.
- [ ] Exclude test files from the production server build.
- [ ] Fix client refresh queue bug.
- [ ] Fix client style-map typing so `npm run build` passes.
- [ ] Update README / docs to reflect current stack and stabilization status.

## Next pass

- Harden Google Calendar OAuth callback/token handling.
- Add CI build/typecheck checks for both apps.
- Triage subpath routing regressions after the build baseline is green.

## GitHub tracking note

The currently configured GitHub token can read issues but returns `403 Resource not accessible by personal access token` for issue creation/editing. I’m proceeding with local branch work and in-repo documentation so the implementation remains tracked while GitHub write access is sorted out.
