import { HttpsError } from './http/errors.js';
import type { Role } from './users.js';

/** Every PIN is exactly 4 digits, for every role (the owner's choice), and any digits are allowed. */
export const PIN_LENGTH = 4;

/** Kept for callers that ask per role: the same for everyone. */
export function minPinLength(_role?: Role): number {
  return PIN_LENGTH;
}

export function checkPin(raw: unknown, _role?: Role): string {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || raw.length !== PIN_LENGTH) {
    throw new HttpsError('invalid-argument', `The PIN must be ${PIN_LENGTH} digits.`, { reason: 'pinFormat', min: PIN_LENGTH, max: PIN_LENGTH });
  }
  return raw;
}
