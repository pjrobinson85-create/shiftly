import { aestDate, sendBriefingForDate } from './briefing';

/**
 * Daily pre-shift briefing scheduler (no external cron dependency).
 * Fires at a fixed wall-clock time each AEST day (default 07:00).
 *   BRIEFING_HOUR  0-23   (default 7)
 *   BRIEFING_MIN   0-59   (default 0)
 * It computes the seconds until the next target and sets a timer; after
 * each run it reschedules for the following day. Disabled in test mode so
 * the suite never triggers a real send.
 */

const HOUR = clamp(Number(process.env.BRIEFING_HOUR ?? 7), 0, 23);
const MIN = clamp(Number(process.env.BRIEFING_MIN ?? 0), 0, 59);
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000; // AEST is fixed +10 (no DST in Queensland)

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

/** Next AEST wall-clock occurrence of HOUR:MIN, as an epoch ms. */
function nextTargetMs(now: Date): number {
  const a = now.getTime() + AEST_OFFSET_MS; // shift to AEST clock
  const d = new Date(a);
  d.setHours(HOUR, MIN, 0, 0);
  if (d.getTime() <= a) d.setDate(d.getDate() + 1); // already past today's slot
  return d.getTime() - AEST_OFFSET_MS;
}

let timer: NodeJS.Timeout | null = null;

function run() {
  const date = aestDate();
  console.log(`[briefing] sending pre-shift briefings for ${date}`);
  sendBriefingForDate(date)
    .then((r) =>
      console.log(
        `[briefing] done: sent=${r.sent} noEmail=${r.skippedNoEmail} alreadySent=${r.skippedAlreadySent}`
      )
    )
    .catch((err) => console.error('[briefing] run failed:', err));
}

export function startBriefingScheduler(): void {
  if (process.env.NODE_ENV === 'test') return; // no timers in tests
  const wait = Math.max(1000, nextTargetMs(new Date()) - Date.now());
  console.log(
    `[briefing] scheduler set for daily ${String(HOUR).padStart(2, '0')}:${String(
      MIN
    ).padStart(2, '0')} AEST (next in ${Math.round(wait / 60000)} min)`
  );
  const schedule = () => {
    // Recompute every time — the wait to the next slot shrinks as the day
    // progresses and must not be frozen at the value from server start.
    const nextWait = Math.max(1000, nextTargetMs(new Date()) - Date.now());
    timer = setTimeout(() => {
      run();
      schedule();
    }, nextWait);
  };
  schedule();
}

export function stopBriefingScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
