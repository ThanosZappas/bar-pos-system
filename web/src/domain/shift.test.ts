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
