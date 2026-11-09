import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { fill } from '../i18n/format';
import { chimeFor, fingerprint } from '../domain/attention';
import { elapsed, isChanged, isLate, isNew, type Round } from '../domain/rounds';
import { useCatalog, type Table } from '../data/catalog';
import { fetchEvent, openRound, serveRound, useBoardRounds, type RoundEvent } from '../data/rounds';
import { chime } from '../lib/sound';
import { useNow } from '../lib/useNow';
import type { StaffUser } from '../session';
import { RoundLines } from './RoundLines';

/** The barman's live to-do list, oldest first, readable from a distance. */
export function Board({ user }: { user: StaffUser }) {
  const rounds = useBoardRounds();
  const tables = useCatalog<Table>('tables');
  const currentSession = new Map((tables ?? []).map((x) => [x.id, x.currentSessionId]));
  const now = useNow(10_000);
  const [soundOn, setSoundOn] = useState(chime.enabled);
  const seen = useRef<Map<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rounds) return;
    const kind = chimeFor(seen.current, rounds);
    if (kind) chime.play(kind);
    seen.current = new Map(rounds.map((r) => [r.id, fingerprint(r)]));
  }, [rounds]);

  async function act(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section class="page board">
      <div class="board-head">
        <h1 class="section-label">{t('board.title')}{rounds && rounds.length > 0 && ` · ${fill(t('board.count'), { count: String(rounds.filter((r) => r.status === 'preparing').length) })}`}</h1>
        {soundOn ? (
          <span class="sound-on">♪ {t('board.soundOn')}</span>
        ) : (
          <button class="primary" title={t('board.soundHint')} onClick={async () => setSoundOn(await chime.unlock())}>♪ {t('board.enableSound')}</button>
        )}
      </div>
      {error && <p class="error">{error}</p>}
      {rounds === null && <p class="desc">{t('app.loading')}</p>}
      {rounds?.length === 0 && <p class="board-empty">{t('board.empty')}</p>}
      <div class="board-grid">
        {rounds?.map((r) => (
          <BoardCard
            key={r.id}
            round={r}
            now={now}
            late={tables !== null && isLate(r, currentSession)}
            onOpen={() => act(() => openRound(r))}
            onServe={() => act(() => serveRound(r, user.displayName))}
          />
        ))}
      </div>
    </section>
  );
}

function BoardCard({ round, now, late, onOpen, onServe }: { round: Round; now: number; late: boolean; onOpen: () => void; onServe: () => void }) {
  const fresh = isNew(round);
  const changed = isChanged(round);
  const cancelled = round.status === 'cancelled';
  const cls = ['board-card', fresh && 'is-new', changed && 'is-changed', cancelled && 'is-cancelled', late && 'is-late'].filter(Boolean).join(' ');
  return (
    <article class={cls}>
      <header class="board-card-head">
        <span class="board-table">{round.tableName}</span>
        <span class="board-flags">
          {fresh && <span class="flag flag-new">{t('board.new')}</span>}
          {changed && !cancelled && <span class="flag flag-changed">{t('board.edited')}</span>}
          {cancelled && <span class="flag flag-changed">{t('board.cancelled')}</span>}
          {late && <span class="flag flag-late">{t('late.flag')}</span>}
        </span>
        <span class="board-time">{fill(t('board.waiting'), { time: elapsed(round.createdAtMs, now) })}</span>
      </header>
      <p class="board-by">{fill(t('board.by'), { name: round.createdByName })}</p>
      {late && <p class="late-note">{fill(t('late.explainer'), { name: round.tableName })}</p>}
      <RoundLines round={round} />
      {changed && <ChangeSummary round={round} />}
      <footer class="board-actions">
        {(fresh || changed) && <button class="primary" onClick={onOpen}>{t('board.gotIt')}</button>}
        {round.status === 'preparing' && <button class="primary serve" onClick={onServe}>{t('board.served')}</button>}
      </footer>
    </article>
  );
}

/** Exactly what the last edit changed, read from the round's event log. */
function ChangeSummary({ round }: { round: Round }) {
  const [event, setEvent] = useState<RoundEvent | null>(null);
  useEffect(() => {
    let live = true;
    if (round.lastEventId) fetchEvent(round.id, round.lastEventId).then((e) => live && setEvent(e));
    return () => {
      live = false;
    };
  }, [round.id, round.lastEventId]);

  if (round.status === 'cancelled') {
    return <p class="change">{fill(t('board.cancelledBy'), { name: round.cancelledByName ?? '' })}</p>;
  }
  return (
    <div class="change">
      <p>{fill(t('board.editedBy'), { name: round.lastEditByName ?? '' })}</p>
      {event?.changes?.map((c) => (
        <p>
          {c.cancelled
            ? fill(t('board.change.cancelled'), { name: c.name })
            : c.qtyFrom !== c.qtyTo
              ? fill(t('board.change.qty'), { name: c.name, from: String(c.qtyFrom), to: String(c.qtyTo) })
              : fill(t('board.change.note'), { name: c.name, to: c.noteTo })}
        </p>
      ))}
    </div>
  );
}
