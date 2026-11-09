import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns English by default', () => expect(t('app.name', 'en')).toBe('Negroni Bar Lab'));
  it('falls back to English for untranslated Greek keys', () => expect(t('auth.signIn', 'el')).toBe('Sign in'));
});
