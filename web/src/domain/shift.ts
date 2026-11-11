/**
 * Shifts change at 18:00 local time. A login lasts until the next 18:00, and so does a server's
 * permission to work. Mirrors android/.../auth/ShiftClock.kt (same test cases).
 */
export const SHIFT_CHANGE_HOUR = 18;

/** "2026-11-11" for the shift that started at 18:00 on 11 November (18:00 → 17:59 next day). */
export function shiftKey(ms: number): string {
  const d = new Date(ms);
  if (d.getHours() < SHIFT_CHANGE_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The next 18:00 after `ms`: when the current shift ends. */
export function shiftEnd(ms: number): Date {
  const d = new Date(ms);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), SHIFT_CHANGE_HOUR);
  if (d.getTime() >= end.getTime()) end.setDate(end.getDate() + 1);
  return end;
}
