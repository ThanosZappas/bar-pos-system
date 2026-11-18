/**
 * Errors a call returns to the app, with the codes of Firebase's callable functions protocol
 * (the same class name and shape as firebase-functions' HttpsError, so handlers are unchanged).
 */
export type FunctionsErrorCode =
  | 'ok' | 'cancelled' | 'unknown' | 'invalid-argument' | 'deadline-exceeded' | 'not-found' | 'already-exists'
  | 'permission-denied' | 'resource-exhausted' | 'failed-precondition' | 'aborted' | 'out-of-range'
  | 'unimplemented' | 'internal' | 'unavailable' | 'data-loss' | 'unauthenticated';

const HTTP_STATUS: Record<FunctionsErrorCode, number> = {
  ok: 200, cancelled: 499, unknown: 500, 'invalid-argument': 400, 'deadline-exceeded': 504, 'not-found': 404,
  'already-exists': 409, 'permission-denied': 403, 'resource-exhausted': 429, 'failed-precondition': 400,
  aborted: 409, 'out-of-range': 400, unimplemented: 501, internal: 500, unavailable: 503, 'data-loss': 500,
  unauthenticated: 401,
};

export class HttpsError extends Error {
  constructor(readonly code: FunctionsErrorCode, message: string, readonly details?: unknown) {
    super(message);
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  /** The body the Firebase SDKs read: { error: { status: "PERMISSION_DENIED", message, details } }. */
  toJSON() {
    return {
      error: {
        status: this.code.toUpperCase().replace(/-/g, '_'),
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}
