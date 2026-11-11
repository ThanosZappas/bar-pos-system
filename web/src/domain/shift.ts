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

/** Two denials in a row block a server from asking again until the shift ends (18:00). */
export const MAX_DENIALS = 2;

export interface DenialState {
  denials: number;
  lastDeniedAtMs: number | null;
  blockedUntilMs: number | null;
}

/**
 * What a denial at `nowMs` writes. Denials count only within the same shift (by the time of the
 * last denial, which the server clock stamps, so a server cannot reset it); the second one blocks
 * until the next 18:00.
 */
export function afterDenial(prev: DenialState | undefined, nowMs: number): { denials: number; blockedUntil: Date | null } {
  const sameShift = prev?.lastDeniedAtMs != null && shiftKey(prev.lastDeniedAtMs) === shiftKey(nowMs);
  const denials = (sameShift ? prev!.denials : 0) + 1;
  return { denials, blockedUntil: denials >= MAX_DENIALS ? shiftEnd(nowMs) : null };
}

export const isBlocked = (s: Pick<DenialState, 'blockedUntilMs'> | undefined, nowMs: number) => (s?.blockedUntilMs ?? 0) > nowMs;

/** Denials so far in this shift (0 after an approval, an unblock, or a new shift). */
export const denialsThisShift = (s: DenialState | undefined, nowMs: number) =>
  s?.lastDeniedAtMs != null && shiftKey(s.lastDeniedAtMs) === shiftKey(nowMs) ? s.denials : 0;
