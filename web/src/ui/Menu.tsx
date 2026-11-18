import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { add, move, nextOrder, patch, useCatalog, type Category, type Item, type Section } from '../data/catalog';
import { centsToInput, formatCents, parsePriceInput } from '../lib/money';
import { ErrorText, Field } from './Fields';

type Row<T> = T & { id: string };

/** Admin menu editor: section tabs → categories → items. Every change is live on all devices. */
export function Menu() {
  const sections = useCatalog<Section>('menuSections');
  const categories = useCatalog<Category>('menuCategories');
  const items = useCatalog<Item>('menuItems');
  const [selected, setSelected] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);

  if (!sections || !categories || !items) return <section class="page"><p class="desc">{t('app.loading')}</p></section>;
  const section = sections.find((s) => s.id === selected) ?? sections[0];

  return (
    <section class="page">
      <h1 class="section-label">{t('menu.title')}</h1>
      <p class="desc">{t('menu.hiddenExplainer')}</p>
      <div class="tabs-wrap">
        {sections.map((s) => (
          <button class={`tab-btn${s.id === section?.id ? ' active' : ''}${s.hidden ? ' is-hidden' : ''}`} onClick={() => setSelected(s.id)}>
            {s.name}
          </button>
        ))}
        <button class="tab-btn" onClick={() => setAddingSection(true)}>+ {t('menu.addSection')}</button>
      </div>
      {addingSection && (
        <NameForm
          onSave={(name, note) => add('menuSections', { name, note, order: nextOrder(sections), hidden: false })}
          onClose={() => setAddingSection(false)}
          withNote
        />
      )}
      {section && (
        <SectionView
          section={section}
          sections={sections}
          categories={categories.filter((c) => c.sectionId === section.id)}
          items={items}
        />
      )}
    </section>
  );
}

function SectionView({ section, sections, categories, items }: { section: Row<Section>; sections: Row<Section>[]; categories: Row<Category>[]; items: Row<Item>[] }) {
  const [editing, setEditing] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  return (
    <div class="menu-content">
      <div class="row-head">
        <div>
          <h2 class="title">{section.name}{section.hidden && <span class="badge">{t('common.hidden')}</span>}</h2>
          {section.note && <p class="note">{section.note}</p>}
        </div>
        <RowActions
          hidden={section.hidden}
          onEdit={() => setEditing(!editing)}
          onToggleHidden={() => patch('menuSections', section.id, { hidden: !section.hidden })}
          onMove={(d) => move('menuSections', sections, section.id, d)}
          onDelete={() => confirm(t('menu.confirmDeleteSection')) && patch('menuSections', section.id, { archived: true })}
        />
      </div>
      {editing && (
        <NameForm
          initialName={section.name}
          initialNote={section.note}
          withNote
          onSave={(name, note) => patch('menuSections', section.id, { name, note })}
          onClose={() => setEditing(false)}
        />
      )}
      {categories.map((c) => (
        <CategoryView category={c} categories={categories} items={items.filter((i) => i.categoryId === c.id)} />
      ))}
      <button class="link add" onClick={() => setAddingCategory(true)}>+ {t('menu.addCategory')}</button>
      {addingCategory && (
        <NameForm
          onSave={(name) => add('menuCategories', { sectionId: section.id, name, order: nextOrder(categories), hidden: false })}
          onClose={() => setAddingCategory(false)}
        />
      )}
    </div>
  );
}

function CategoryView({ category, categories, items }: { category: Row<Category>; categories: Row<Category>[]; items: Row<Item>[] }) {
  const [editing, setEditing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  return (
    <div class={category.hidden ? 'is-hidden' : ''}>
      <div class="cat-line">
        <span />
        <p>{category.name}{category.hidden && <span class="badge">{t('common.hidden')}</span>}</p>
        <span />
        <RowActions
          hidden={category.hidden}
          onEdit={() => setEditing(!editing)}
          onToggleHidden={() => patch('menuCategories', category.id, { hidden: !category.hidden })}
          onMove={(d) => move('menuCategories', categories, category.id, d)}
          onDelete={() => confirm(t('menu.confirmDeleteCategory')) && patch('menuCategories', category.id, { archived: true })}
        />
      </div>
      {editing && <NameForm initialName={category.name} onSave={(name) => patch('menuCategories', category.id, { name })} onClose={() => setEditing(false)} />}
      {items.length === 0 && <p class="note">{t('menu.empty')}</p>}
      {items.map((i) => <ItemView item={i} items={items} />)}
      <button class="link add" onClick={() => setAddingItem(true)}>+ {t('menu.addItem')}</button>
      {addingItem && (
        <ItemForm
          onSave={(data) => add('menuItems', { ...data, categoryId: category.id, order: nextOrder(items), hidden: false })}
          onClose={() => setAddingItem(false)}
        />
      )}
    </div>
  );
}

function ItemView({ item, items }: { item: Row<Item>; items: Row<Item>[] }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div class={`item${item.hidden ? ' is-hidden' : ''}`}>
        <div>
          <div class="item-name">
            {item.name}
            {item.tags.map((tag) => <span class="badge">{tag}</span>)}
            {item.hidden && <span class="badge">{t('common.hidden')}</span>}
            {item.soldOut && <span class="badge sold-out">{t('menu.soldOut')}</span>}
          </div>
          {item.description && <div class="item-desc">{item.description}</div>}
        </div>
        <div class="item-side">
          <div class="item-price">{formatCents(item.priceCents)}</div>
          <button class="link" onClick={() => patch('menuItems', item.id, { soldOut: !item.soldOut })}>
            {item.soldOut ? t('menu.backIn') : t('menu.markSoldOut')}
          </button>
          <RowActions
            hidden={item.hidden}
            onEdit={() => setEditing(!editing)}
            onToggleHidden={() => patch('menuItems', item.id, { hidden: !item.hidden })}
            onMove={(d) => move('menuItems', items, item.id, d)}
            onDelete={() => confirm(t('menu.confirmDeleteItem')) && patch('menuItems', item.id, { archived: true })}
          />
        </div>
      </div>
      {editing && <ItemForm item={item} onSave={(data) => patch('menuItems', item.id, data)} onClose={() => setEditing(false)} />}
    </>
  );
}

function RowActions(props: { hidden: boolean; onEdit: () => void; onToggleHidden: () => void; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  return (
    <span class="row-actions">
      <button class="link" onClick={props.onEdit}>{t('common.edit')}</button>
      <button class="link" onClick={props.onToggleHidden}>{props.hidden ? t('common.show') : t('common.hide')}</button>
      <button class="link" title={t('common.moveUp')} aria-label={t('common.moveUp')} onClick={() => props.onMove(-1)}>↑</button>
      <button class="link" title={t('common.moveDown')} aria-label={t('common.moveDown')} onClick={() => props.onMove(1)}>↓</button>
      <button class="link danger" onClick={props.onDelete}>{t('common.delete')}</button>
    </span>
  );
}

/** Shared save/cancel/error handling for the small inline forms. */
function useSave(onSave: () => Promise<unknown> | undefined, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, submit };
}

function NameForm(props: { initialName?: string; initialNote?: string; withNote?: boolean; onSave: (name: string, note: string) => Promise<unknown>; onClose: () => void }) {
  const [name, setName] = useState(props.initialName ?? '');
  const [note, setNote] = useState(props.initialNote ?? '');
  const { busy, error, submit } = useSave(() => props.onSave(name.trim(), note.trim()), props.onClose);
  return (
    <form class="inline-form editor-box" onSubmit={submit}>
      <Field label={t('common.name')} value={name} onInput={setName} autoFocus />
      {props.withNote && <Field label={t('menu.sectionNote')} value={note} onInput={setNote} />}
      <ErrorText text={error} />
      <span class="buttons">
        <button class="primary" disabled={busy || !name.trim()}>{t('common.save')}</button>
        <button type="button" class="link" onClick={props.onClose}>{t('common.cancel')}</button>
      </span>
    </form>
  );
}

function ItemForm(props: { item?: Item; onSave: (data: Pick<Item, 'name' | 'description' | 'priceCents' | 'tags'>) => Promise<unknown>; onClose: () => void }) {
  const [name, setName] = useState(props.item?.name ?? '');
  const [description, setDescription] = useState(props.item?.description ?? '');
  const [price, setPrice] = useState(props.item ? centsToInput(props.item.priceCents) : '');
  const [tags, setTags] = useState(props.item?.tags.join(', ') ?? '');
  const { busy, error, setError, submit } = useSave(() => {
    const priceCents = parsePriceInput(price);
    if (priceCents === null) {
      setError(t('menu.priceInvalid'));
      return Promise.reject(new Error(t('menu.priceInvalid')));
    }
    const tagList = tags.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return props.onSave({ name: name.trim(), description: description.trim(), priceCents, tags: tagList });
  }, props.onClose);
  return (
    <form class="inline-form editor-box" onSubmit={submit}>
      <Field label={t('common.name')} value={name} onInput={setName} autoFocus />
      <Field label={t('menu.description')} value={description} onInput={setDescription} />
      <Field label={t('menu.price')} value={price} onInput={setPrice} hint={t('menu.priceHint')} />
      <Field label={t('menu.tags')} value={tags} onInput={setTags} hint={t('menu.tagsHint')} />
      <ErrorText text={error} />
      <span class="buttons">
        <button class="primary" disabled={busy || !name.trim() || !price.trim()}>{t('common.save')}</button>
        <button type="button" class="link" onClick={props.onClose}>{t('common.cancel')}</button>
      </span>
    </form>
  );
}
