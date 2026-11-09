import en from './en.json';
import el from './el.json';

export type Lang = 'en' | 'el';
export type Key = keyof typeof en;

// Greek is scaffolded: any key missing from el.json falls back to English.
const tables: Record<Lang, Partial<Record<Key, string>>> = { en, el };
const STORAGE_KEY = 'nbl.lang';

let current: Lang = readStoredLang();

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'el' ? 'el' : 'en';
  } catch {
    return 'en';
  }
}

export function getLang(): Lang {
  return current;
}

/** Locale for dates and times: day/month order and 24-hour clock in both languages. */
export function dateLocale(lang: Lang = current): string {
  return lang === 'el' ? 'el-GR' : 'en-GB';
}

export const LANGS: Lang[] = ['en', 'el'];

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable: language applies to this tab only
  }
}

export function t(key: Key, lang: Lang = current): string {
  return tables[lang][key] ?? en[key];
}
