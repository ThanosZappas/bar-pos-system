import { useState } from 'preact/hooks';
import { t } from '../i18n';

interface FieldProps {
  label: string;
  value: string;
  onInput: (v: string) => void;
  type?: 'text' | 'password';
  hint?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}

export function Field({ label, value, onInput, type = 'text', hint, autoComplete, autoFocus }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  // Preact types tie some attributes to the input type, so the two variants are rendered separately.
  const inputProps = {
    value,
    onInput: (e: Event) => onInput((e.target as HTMLInputElement).value),
    autoComplete,
    autoCapitalize: 'off',
    spellcheck: false,
    autoFocus,
  } as const;
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <span class="field-row">
        {isPassword && !visible ? (
          <input type="password" {...inputProps} />
        ) : (
          <input type="text" {...inputProps} />
        )}
        {isPassword && (
          <button type="button" class="link" onClick={() => setVisible(!visible)}>
            {visible ? t('auth.hide') : t('auth.show')}
          </button>
        )}
      </span>
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorText({ text }: { text: string | null }) {
  return text ? <p class="error" role="alert">{text}</p> : null;
}
