import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { fill } from '../i18n/format';
import { chimeFor, fingerprint } from '../domain/attention';
import { elapsed, isChanged, isLate, isNew, type Round } from '../domain/rounds';
import { useCatalog, type Table } from '../data/catalog';
import { cancelRound, fetchEvent, openRound, serveRound, unserveRound, useBoardRounds, UNDO_SERVED_SECONDS, type RoundEvent } from '../data/rounds';
import { useWakeLock } from '../lib/wakeLock';
import { chime } from '../lib/sound';
import { useNow } from '../lib/useNow';
import type { StaffUser } from '../session';
import { RoundLines } from './RoundLines';

/** The barman's live to-do list, oldest first, readable from a distance. */
export function Board({ user }: { user: StaffUser }) {
  const rounds = useBoardRounds();
  const tables = useCatalog<Table>('tables');
  const currentSession = new Map((tables ?? []).map((x) => [x.id, x.currentSessionId]));
  const [soundOn, setSoundOn] = useState(chime.enabled);
  const seen = useRef<Map<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentlyServed, setRecentlyServed] = useState<{ round: Round; at: number }[]>([]);
  const awake = useWakeLock();
  // One clock: every second while an undo is offered (countdown), otherwise every 10 s.
  const now = useNow(recentlyServed.length > 0 ? 1_000 : 10_000);
  const tick = now;
  const undoable = recentlyServed.filter((x) => tick - x.at < UNDO_SERVED_SECONDS * 1000);
  useEffect(() => {
    if (undoable.length !== recentlyServed.length) setRecentlyServed(undoable); // drop expired offers
  }, [tick]);

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
        {awake && <span class="sound-on">☀ {t('board.awake')}</span>}
        {soundOn ? (
          <span class="sound-on">♪ {t('board.soundOn')}</span>
        ) : (
          <button class="primary" title={t('board.soundHint')} onClick={async () => setSoundOn(await chime.unlock())}>♪ {t('board.enableSound')}</button>
        )}
      </div>
      {error && <p class="error">{error}</p>}
      {undoable.map(({ round: r, at }) => (
        <p class="undo-bar">
          {fill(t('board.servedUndo'), { name: r.tableName })}
          <button
            class="primary"
            onClick={() => {
              setRecentlyServed((list) => list.filter((x) => x.round.id !== r.id));
              act(() => unserveRound(r, user.displayName));
            }}
          >
            {fill(t('board.undo'), { seconds: String(Math.max(0, UNDO_SERVED_SECONDS - Math.floor((tick - at) / 1000))) })}
          </button>
        </p>
      ))}
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
            onServe={() => {
              setRecentlyServed((list) => [...list, { round: r, at: Date.now() }]);
              act(() => serveRound(r, user.displayName));
            }}
            onCancel={() => confirm(fill(t('board.confirmCancel'), { name: r.tableName })) && act(() => cancelRound(r, user.displayName))}
          />
        ))}
      </div>
    </section>
  );
}

function BoardCard(props: { round: Round; now: number; late: boolean; onOpen: () => void; onServe: () => void; onCancel: () => void }) {
  const { round, now, late, onOpen, onServe, onCancel } = props;
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
        {round.status === 'preparing' && <button class="link danger" onClick={onCancel}>{t('board.cancel')}</button>}
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
