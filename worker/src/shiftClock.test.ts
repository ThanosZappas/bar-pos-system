import { describe, expect, it } from 'vitest';
import { nextShiftChangeMs, zoneOffsetMinutes } from './shiftClock';

const utc = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe('next 18:00 in Piraeus', () => {
  it('knows Athens is UTC+2 in winter and UTC+3 in summer', () => {
    expect(zoneOffsetMinutes(utc(2026, 11, 18, 10))).toBe(120);
    expect(zoneOffsetMinutes(utc(2026, 7, 1, 10))).toBe(180);
  });

  it('is later the same day before 18:00, and tomorrow after it', () => {
    expect(nextShiftChangeMs(utc(2026, 11, 18, 10))).toBe(utc(2026, 11, 18, 16)); // 12:00 → 18:00
    expect(nextShiftChangeMs(utc(2026, 11, 18, 17))).toBe(utc(2026, 11, 19, 16)); // 19:00 → tomorrow 18:00
    expect(nextShiftChangeMs(utc(2026, 11, 18, 16))).toBe(utc(2026, 11, 19, 16)); // exactly 18:00 → tomorrow
    expect(nextShiftChangeMs(utc(2026, 7, 1, 14))).toBe(utc(2026, 7, 1, 15)); // summer: 17:00 → 18:00
  });

  it('handles the nights the clocks change', () => {
    expect(nextShiftChangeMs(utc(2026, 3, 28, 17))).toBe(utc(2026, 3, 29, 15)); // into summer time
    expect(nextShiftChangeMs(utc(2026, 10, 24, 16))).toBe(utc(2026, 10, 25, 16)); // back to winter time
  });
});
