import { describe, expect, it } from 'vitest';
import { isValidUsername, usernameToEmail } from './usernames';

describe('usernameToEmail', () => {
  it('maps to the internal domain', () => expect(usernameToEmail('user1')).toBe('user1@users.negronibarlab.invalid'));
  it('is case and whitespace insensitive', () => expect(usernameToEmail('  Admin ')).toBe('admin@users.negronibarlab.invalid'));
  it('rejects invalid usernames', () => expect(() => usernameToEmail('a b')).toThrow());
});

describe('isValidUsername', () => {
  it('accepts the seed usernames', () => {
    for (const u of ['admin', 'user1', 'user5']) expect(isValidUsername(u)).toBe(true);
  });
  it('rejects too short names', () => expect(isValidUsername('ab')).toBe(false));
});
