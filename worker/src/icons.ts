import { HttpsError } from './http/errors.js';
import type { Role } from './users.js';

/**
 * Profile icons. The drawings live in design/icons/icons.json (one source for Android and the
 * dashboard); this list must name the same ids.
 */
export const ICONS = [
  'person', 'barman', 'admin',
  'martini', 'rocks', 'wine', 'beer', 'shaker', 'bottle', 'lemon', 'cherry', 'mint', 'anchor', 'star', 'moon', 'music',
] as const;
export type Icon = (typeof ICONS)[number];

export function defaultIcon(role: Role): Icon {
  return role === 'admin' ? 'admin' : role === 'barman' ? 'barman' : 'person';
}

/** The icon a profile shows: its own choice, or its role's default. */
export function iconOf(user: { icon?: string; role: Role }): Icon {
  return (ICONS as readonly string[]).includes(user.icon ?? '') ? (user.icon as Icon) : defaultIcon(user.role);
}

export function parseIcon(raw: unknown): Icon {
  if (typeof raw !== 'string' || !(ICONS as readonly string[]).includes(raw)) throw new HttpsError('invalid-argument', 'Unknown icon.');
  return raw as Icon;
}
