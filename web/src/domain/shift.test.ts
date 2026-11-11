import { describe, expect, it } from 'vitest';
import { shiftEnd, shiftKey } from './shift';

// Same cases as android ShiftClockTest.
describe('shift clock (changes at 18:00)', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  it('an evening and the night after belong to the same shift', () => {
    expect(shiftKey(at(11, 18))).toBe('2026-11-11');
    expect(shiftKey(at(12, 2))).toBe('2026-11-11');
    expect(shiftKey(at(12, 17, 59))).toBe('2026-11-11');
    expect(shiftKey(at(12, 18))).toBe('2026-11-12');
  });
  it('ends at the next 18:00', () => {
    expect(shiftEnd(at(11, 20))).toEqual(new Date(2026, 10, 12, 18));
    expect(shiftEnd(at(12, 3))).toEqual(new Date(2026, 10, 12, 18));
    expect(shiftEnd(at(12, 18))).toEqual(new Date(2026, 10, 13, 18));
  });
  it('crosses month ends', () => expect(shiftKey(new Date(2026, 11, 1, 1).getTime())).toBe('2026-11-30'));
});

import { afterDenial, denialsThisShift, isBlocked } from './shift';

// Same cases as android ShiftClockTest denial tests.
describe('denials', () => {
  const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
  it('the first denial counts one and does not block', () => {
    expect(afterDenial(undefined, at(11, 20))).toEqual({ denials: 1, blockedUntil: null });
  });
  it('the second in the same shift blocks until 18:00', () => {
    expect(afterDenial({ denials: 1, lastDeniedAtMs: at(11, 20), blockedUntilMs: null }, at(12, 1))).toEqual({ denials: 2, blockedUntil: new Date(2026, 10, 12, 18) });
  });
  it('a denial from an earlier shift does not count', () => {
    expect(afterDenial({ denials: 1, lastDeniedAtMs: at(10, 23), blockedUntilMs: null }, at(11, 20))).toEqual({ denials: 1, blockedUntil: null });
    expect(denialsThisShift({ denials: 1, lastDeniedAtMs: at(10, 23), blockedUntilMs: null }, at(11, 20))).toBe(0);
  });
  it('a block runs out at 18:00', () => {
    expect(isBlocked({ blockedUntilMs: at(12, 18) }, at(12, 17))).toBe(true);
    expect(isBlocked({ blockedUntilMs: at(12, 18) }, at(12, 18))).toBe(false);
  });
});
