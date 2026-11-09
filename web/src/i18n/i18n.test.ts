import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns English by default', () => expect(t('app.name', 'en')).toBe('Negroni Bar Lab'));
  it('falls back to English for untranslated Greek keys', () => expect(t('auth.signIn', 'el')).toBe('Sign in'));
});

import { dateLocale } from './index';

describe('dateLocale', () => {
  it('keeps day/month and 24h in both languages', () => {
    expect(dateLocale('en')).toBe('en-GB');
    expect(dateLocale('el')).toBe('el-GR');
  });
});
