import type { Key } from '../i18n';
import type { PasswordProblem } from '../lib/passwords';

/** Maps Firebase Auth/Functions error codes to message keys; null means "show the server's text". */
export function errorKey(e: unknown): Key | null {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'error.wrongCredentials';
    case 'auth/user-disabled':
      return 'error.deactivated';
    case 'auth/network-request-failed':
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
      return 'error.network';
    case 'auth/too-many-requests':
      return 'error.tooManyAttempts';
  }
  return code.startsWith('functions/') ? null : 'error.unknown';
}

export const passwordProblemKey: Record<PasswordProblem, Key> = {
  tooShort: 'error.passwordTooShort',
  mismatch: 'error.passwordMismatch',
  sameAsCurrent: 'error.passwordSameAsCurrent',
  sameAsInitial: 'error.passwordSameAsInitial',
};
