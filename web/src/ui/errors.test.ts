import { describe, expect, it } from 'vitest';
import { errorKey } from './errors';

describe('errorKey', () => {
  it('maps bad credentials', () => expect(errorKey({ code: 'auth/invalid-credential' })).toBe('error.wrongCredentials'));
  it('maps disabled accounts', () => expect(errorKey({ code: 'auth/user-disabled' })).toBe('error.deactivated'));
  it('keeps server messages for function errors', () => expect(errorKey({ code: 'functions/already-exists' })).toBeNull());
  it('falls back to unknown', () => expect(errorKey(new Error('x'))).toBe('error.unknown'));
});
