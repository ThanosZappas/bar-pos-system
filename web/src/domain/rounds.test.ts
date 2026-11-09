import { describe, expect, it } from 'vitest';
import { deriveTableState, elapsed, type OrderLine, type Round, type RoundStatus } from './rounds';

const two: OrderLine = { lineId: 'a', itemId: 'negroni', name: 'Classic Negroni', priceCents: 1000, qty: 2, note: '', cancelled: false };
const cancelled: OrderLine = { lineId: 'b', itemId: 'zombie', name: 'Zombie', priceCents: 1200, qty: 1, note: '', cancelled: true };

function round(status: RoundStatus, ...lines: OrderLine[]): Round {
  return {
    id: 'r', tableId: 't', tableName: '1', sessionId: 's', status, lines, note: '', createdAtMs: 0, createdByName: 'Server 1',
    openedAtMs: null, servedAtMs: null, servedByName: null, cancelledByName: null, editCount: 0, editSeen: true, lastEditByName: null, lastEventId: 'e',
  };
}

// Same cases as android TableStatusTest.
describe('deriveTableState', () => {
  it('is free without rounds', () => expect(deriveTableState([]).status).toBe('free'));
  it('ignores cancelled rounds and rounds whose lines are all cancelled', () => {
    const s = deriveTableState([round('cancelled', two), round('preparing', cancelled)]);
    expect(s).toMatchObject({ status: 'free', totalCents: 0 });
  });
  it('lets preparing win over served', () => {
    expect(deriveTableState([round('served', two), round('preparing', two)])).toMatchObject({ status: 'preparing', totalCents: 4000 });
  });
  it('moves through payment states', () => {
    const rounds = [round('served', two, cancelled)];
    expect(deriveTableState(rounds).status).toBe('served');
    expect(deriveTableState(rounds, 500)).toMatchObject({ status: 'partiallyPaid', dueCents: 1500 });
    expect(deriveTableState(rounds, 2000).status).toBe('paid');
  });
});

describe('elapsed', () => {
  it.each([
    [0, '0 s'],
    [45_000, '45 s'],
    [12 * 60_000 + 5_000, '12 min'],
    [65 * 60_000, '1 h 05'],
    [-5_000, '0 s'],
  ])('%i ms → %s', (diff, text) => expect(elapsed(0, diff)).toBe(text));
});
