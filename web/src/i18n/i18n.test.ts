import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns English by default', () => expect(t('app.name', 'en')).toBe('Negroni Bar Lab'));
  it('falls back to English for keys kept untranslated', () => expect(t('app.name', 'el')).toBe('Negroni Bar Lab'));
  it('uses Greek when translated', () => expect(t('auth.signIn', 'el')).toBe('Σύνδεση'));
});

import { dateLocale } from './index';

describe('dateLocale', () => {
  it('keeps day/month and 24h in both languages', () => {
    expect(dateLocale('en')).toBe('en-GB');
    expect(dateLocale('el')).toBe('el-GR');
  });
});

import en from './en.json';
import el from './el.json';

describe('Greek translation', () => {
  // Brand names, language names and developer-only setup messages stay as they are.
  const untranslated = new Set(['app.name', 'app.subtitle', 'language.en', 'language.el', 'auth.notConfiguredTitle', 'auth.notConfiguredBody']);
  it('covers every other key', () => {
    expect(Object.keys(en).filter((k) => !untranslated.has(k) && !(k in el))).toEqual([]);
  });
  it('keeps the same {placeholders}', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(el)) expect(vars(v), k).toEqual(vars((en as Record<string, string>)[k]));
  });
});
