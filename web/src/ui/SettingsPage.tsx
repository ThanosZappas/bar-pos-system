import { useEffect, useState } from 'preact/hooks';
import { getLang, LANGS, setLang, t, type Key, type Lang } from '../i18n';
import { saveSettings, useSettings, type Settings } from '../data/payments';
import { ErrorText, Field } from './Fields';

/** Admin settings: language of this dashboard (stored in this browser) and the summary header. */
export function SettingsPage() {
  const current = useSettings();
  const [form, setForm] = useState<Settings>(current);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(current), [current]);
  const set = (k: keyof Settings) => (v: string) => setForm({ ...form, [k]: v });

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    try {
      await saveSettings({ barName: form.barName.trim(), address: form.address.trim(), phone: form.phone.trim(), receiptFooter: form.receiptFooter.trim() });
      setNotice(t('settings.saved'));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section class="page">
      <h1 class="section-label">{t('settings.title')}</h1>
      <div class="card form wide">
        <h2 class="section-label">{t('settings.language')}</h2>
        <div class="method-toggle" role="radiogroup" aria-label={t('settings.language')}>
          {LANGS.map((lang: Lang) => (
            <button
              type="button"
              role="radio"
              aria-checked={getLang() === lang}
              class={`tab-btn${getLang() === lang ? ' active' : ''}`}
              onClick={() => {
                setLang(lang);
                location.reload();
              }}
            >
              {t(`language.${lang}` as Key)}
            </button>
          ))}
        </div>
        <p class="field-hint">{t('settings.languageNote')}</p>
      </div>
      <form class="card form wide" onSubmit={submit}>
        <h2 class="section-label">{t('settings.receipt')}</h2>
        <Field label={t('settings.barName')} value={form.barName} onInput={set('barName')} />
        <Field label={t('settings.address')} value={form.address} onInput={set('address')} />
        <Field label={t('settings.phone')} value={form.phone} onInput={set('phone')} />
        <Field label={t('settings.footer')} value={form.receiptFooter} onInput={set('receiptFooter')} />
        <ErrorText text={error} />
        {notice && <p class="notice">{notice}</p>}
        <button class="primary" disabled={!form.barName.trim()}>{t('common.save')}</button>
      </form>
    </section>
  );
}
