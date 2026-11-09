import { isChanged, isNew, type Round } from './rounds';

/**
 * Decides when the board should chime: for rounds that appear (new) or change (edit/cancel)
 * after the first snapshot. `seen` holds a fingerprint per round from the previous snapshot.
 */
export function fingerprint(r: Round): string {
  return `${r.status}:${r.editCount}:${r.editSeen}`;
}

export function chimeFor(previous: Map<string, string> | null, rounds: Round[]): 'new' | 'changed' | null {
  if (previous === null) return null; // first load: no sound for what was already there
  let result: 'new' | 'changed' | null = null;
  for (const r of rounds) {
    const before = previous.get(r.id);
    if (before === fingerprint(r)) continue;
    if (isChanged(r)) return 'changed';
    if (before === undefined && isNew(r)) result = 'new';
  }
  return result;
}
