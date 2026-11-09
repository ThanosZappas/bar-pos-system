import { describe, expect, it } from 'vitest';
import { chimeFor, fingerprint } from './attention';
import type { Round } from './rounds';

const base: Round = {
  id: 'r1', tableId: 't', tableName: '1', sessionId: 's', status: 'preparing', lines: [], note: '', createdAtMs: 0, createdByName: 'S',
  openedAtMs: null, servedAtMs: null, servedByName: null, cancelledByName: null, editCount: 0, editSeen: true, lastEditByName: null, lastEventId: 'e',
};
const seen = (...rs: Round[]) => new Map(rs.map((r) => [r.id, fingerprint(r)]));

describe('chimeFor', () => {
  it('stays silent on the first snapshot', () => expect(chimeFor(null, [base])).toBeNull());
  it('chimes "new" for a round that just appeared', () => expect(chimeFor(seen(), [base])).toBe('new'));
  it('stays silent when nothing changed', () => expect(chimeFor(seen(base), [base])).toBeNull());
  it('chimes "changed" for an edit or a cancel', () => {
    expect(chimeFor(seen(base), [{ ...base, editCount: 1, editSeen: false }])).toBe('changed');
    expect(chimeFor(seen(base), [{ ...base, status: 'cancelled', editSeen: false }])).toBe('changed');
  });
  it('stays silent when the barman opens a round', () => {
    expect(chimeFor(seen({ ...base, editSeen: false, editCount: 1 }), [{ ...base, editSeen: true, editCount: 1, openedAtMs: 5 }])).toBeNull();
  });
  it('"changed" wins over "new" in the same snapshot', () => {
    const other = { ...base, id: 'r2' };
    expect(chimeFor(seen(base), [other, { ...base, editCount: 1, editSeen: false }])).toBe('changed');
  });
});
