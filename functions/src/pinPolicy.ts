import { HttpsError } from 'firebase-functions/v2/https';
import type { Role } from './users.js';

/** PIN length rules, shared by pins.ts and users.ts. There are no rules on which digits a PIN uses. */
export const PIN_MAX_LENGTH = 8;
export const SERVER_PIN_MIN_LENGTH = 4;
/** Admin and barman run the bar, so their PIN is longer. */
export const LEAD_PIN_MIN_LENGTH = 6;

export function minPinLength(role: Role): number {
  return role === 'server' ? SERVER_PIN_MIN_LENGTH : LEAD_PIN_MIN_LENGTH;
}

export function checkPin(raw: unknown, role: Role): string {
  const min = minPinLength(role);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || raw.length < min || raw.length > PIN_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `The PIN must be ${min} to ${PIN_MAX_LENGTH} digits.`, { reason: 'pinFormat', min, max: PIN_MAX_LENGTH });
  }
  return raw;
}
