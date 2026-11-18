/**
 * The bar's day changes at 18:00 in Piraeus (same rule as the apps' ShiftClock / shift.ts).
 * The server runs in UTC, so the time zone is explicit, including summer time.
 */
export const BAR_TIME_ZONE = 'Europe/Athens';
export const SHIFT_CHANGE_HOUR = 18;

/** Minutes the zone is ahead of UTC at that moment (120 in winter, 180 in summer for Athens). */
export function zoneOffsetMinutes(ms: number, timeZone = BAR_TIME_ZONE): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** The next 18:00 in Piraeus after `nowMs`: when today's sign-ins and permissions end. */
export function nextShiftChangeMs(nowMs: number, timeZone = BAR_TIME_ZONE, hour = SHIFT_CHANGE_HOUR): number {
  const offset = zoneOffsetMinutes(nowMs, timeZone);
  const local = new Date(nowMs + offset * 60_000);
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - offset * 60_000;
  if (target <= nowMs) target += 24 * 3_600_000;
  // Across a summer-time change the offset at 18:00 differs from now's.
  const atTarget = zoneOffsetMinutes(target, timeZone);
  return target + (offset - atTarget) * 60_000;
}
