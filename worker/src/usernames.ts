/**
 * Staff log in with a username; Firebase Auth needs an email. We map usernames to
 * fake addresses on the reserved `.invalid` TLD (RFC 2606), so no mail can ever be sent.
 */
export const INTERNAL_EMAIL_DOMAIN = 'users.negronibarlab.invalid';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function usernameToEmail(raw: string): string {
  const username = normalizeUsername(raw);
  if (!isValidUsername(username)) throw new Error(`Invalid username: ${raw}`);
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}
