import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { fill } from '../i18n/format';
import { addTable, move, nextOrder, patch, removeTable, useCatalog, type Table } from '../data/catalog';
import { errorKey } from './errors';
import { ErrorText, Field } from './Fields';

/** Admin table management. Status colours arrive with orders (milestone 4) and payments (milestone 6). */
export function Tables() {
  const tables = useCatalog<Table>('tables');
  const [error, setError] = useState<string | null>(null);
  if (!tables) return <section class="page"><p class="desc">{t('app.loading')}</p></section>;

  const nameTaken = (name: string, exceptId?: string) => tables.some((x) => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase());
  const nextName = String(tables.reduce((max, x) => Math.max(max, Number(x.name) || 0), 0) + 1);

  async function guard(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorKey(err) ? t(errorKey(err)!) : (err as Error).message);
    }
  }

  return (
    <section class="page">
      <h1 class="section-label">{t('tables.title')}</h1>
      <p class="desc">{t('tables.explainer')}</p>
      <ErrorText text={error} />
      <div class="table-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            nameTaken={(n) => nameTaken(n, table.id)}
            onMove={(d) => guard(() => move('tables', tables, table.id, d))}
            onRemove={() => confirm(fill(t('tables.confirmRemove'), { name: table.name })) && guard(() => removeTable(table.id))}
          />
        ))}
      </div>
      <button class="primary spaced" onClick={() => guard(() => addTable(nextName, nextOrder(tables)))}>+ {t('tables.add')} {nextName}</button>
    </section>
  );
}

function TableCard(props: { table: Table & { id: string }; nameTaken: (n: string) => boolean; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.table.name);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    const trimmed = name.trim();
    if (props.nameTaken(trimmed)) return setError(t('tables.nameTaken'));
    try {
      await patch('tables', props.table.id, { name: trimmed });
      setEditing(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div class="table-card status-free">
      {editing ? (
        <form onSubmit={save} class="table-rename">
          <Field label={t('common.name')} value={name} onInput={setName} autoFocus />
          <ErrorText text={error} />
          <span class="buttons">
            <button class="primary" disabled={!name.trim() || name.trim().length > 20}>{t('common.save')}</button>
            <button type="button" class="link" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
          </span>
        </form>
      ) : (
        <>
          <div class="table-name">{props.table.name}</div>
          <span class="row-actions">
            <button class="link" onClick={() => setEditing(true)}>{t('tables.rename')}</button>
            <button class="link" aria-label={t('common.moveUp')} title={t('common.moveUp')} onClick={() => props.onMove(-1)}>←</button>
            <button class="link" aria-label={t('common.moveDown')} title={t('common.moveDown')} onClick={() => props.onMove(1)}>→</button>
            <button class="link danger" onClick={props.onRemove}>{t('tables.remove')}</button>
          </span>
        </>
      )}
    </div>
  );
}
