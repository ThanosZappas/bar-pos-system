import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { fill } from '../i18n/format';
import { approve, deny, usePendingRequests } from '../data/shifts';
import { denialsThisShift, MAX_DENIALS } from '../domain/shift';
import { chime } from '../lib/sound';
import type { StaffUser } from '../session';

/** On every page: a popup for each server asking to start, oldest first, with a chime. */
export function RequestPopup({ user }: { user: StaffUser }) {
  const pending = usePendingRequests();
  const announced = useRef(new Set<string>());
  useEffect(() => {
    if (pending.some((p) => !announced.current.has(p.uid))) chime.play('new');
    announced.current = new Set(pending.map((p) => p.uid));
  }, [pending]);

  const request = pending[0];
  if (!request) return null;
  return (
    <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="permission-title">
      <div class="card request-card">
        <h2 id="permission-title" class="title">{t('permission.title')}</h2>
        <p class="desc">{fill(t('permission.asks'), { name: request.displayName })}</p>
        {denialsThisShift(request, Date.now()) + 1 >= MAX_DENIALS && (
          <p class="error">{fill(t('permission.lastChance'), { name: request.displayName })}</p>
        )}
        <span class="buttons">
          <button class="primary" onClick={() => approve(request.uid, request.displayName, user)}>{t('permission.allow')}</button>
          <button class="link danger" onClick={() => deny(request, request.uid, request.displayName, user)}>{t('permission.deny')}</button>
        </span>
        {pending.length > 1 && <p class="field-hint">{fill(t('permission.more'), { n: String(pending.length - 1) })}</p>}
      </div>
    </div>
  );
}
