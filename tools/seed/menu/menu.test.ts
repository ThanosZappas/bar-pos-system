import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePrice } from './money';
import { parseMenuHtml } from './parse-menu';

describe('parsePrice', () => {
  it.each([
    ['10€', 1000],
    ['8,5 €', 850],
    ['3,50€', 350],
    ['12.5€', 1250],
    ['0,05 €', 5],
  ])('%s → %i cents', (text, cents) => expect(parsePrice(text)).toEqual({ cents, rangeText: null }));

  it('stores the lower price of a range and keeps its text', () => {
    expect(parsePrice('8 – 12€')).toEqual({ cents: 800, rangeText: '8 – 12€' });
    expect(parsePrice('90 - 100 €')).toEqual({ cents: 9000, rangeText: '90 - 100 €' });
  });

  it('rejects text that is not a price', () => {
    expect(parsePrice('Ask the bartender')).toBeNull();
    expect(parsePrice('10')).toBeNull();
  });
});

describe('parseMenuHtml on the barlab.gr snapshot', () => {
  const menu = parseMenuHtml(readFileSync(new URL('source-menu.html', import.meta.url), 'utf8'));
  const items = menu.sections.flatMap((s) => s.categories.flatMap((c) => c.items.map((i) => ({ ...i, section: s.name, category: c.name }))));
  const find = (name: string, category?: string) => items.find((i) => i.name === name && (!category || i.category === category))!;

  it('reads two levels: 6 tabs, 20 categories, 64 items', () => {
    expect(menu.sections.map((s) => s.name)).toEqual(['Negroni', 'Cocktails', 'Tropical', 'Spirits', 'Wine & Beers', 'Pizza']);
    expect(menu.sections.reduce((n, s) => n + s.categories.length, 0)).toBe(20);
    expect(items).toHaveLength(64);
  });

  it('parses prices to cents', () => {
    expect(find('Classic Negroni').priceCents).toBe(1000);
    expect(find('Coca Cola (330ml)').priceCents).toBe(350);
    expect(items.filter((i) => i.name === 'Gin').map((i) => i.priceCents)).toEqual([800, 850]);
  });

  it('stores ranges at the lower price with the text in the description', () => {
    expect(find('Tequila')).toMatchObject({ priceCents: 800, description: expect.stringContaining('Price 8 – 12€') });
    expect(find('Premium', 'Φιάλες 700ml')).toMatchObject({ priceCents: 9000, description: 'Price 90 – 100€' });
  });

  it('keeps badges as tags and "Ask the bartender" as a normal item', () => {
    expect(find('No-Groni').tags).toEqual(['Non Alcoholic']);
    expect(find('Zombie')).toMatchObject({ tags: ['Strong'], priceCents: 1200 });
    expect(find('Ask any Classic')).toMatchObject({ description: 'Ask the bartender', priceCents: 1000 });
  });

  it('keeps section notes and Greek text', () => {
    expect(menu.sections[0].note).toBe('Η τέχνη του Negroni σε 9 εκδοχές');
    expect(find('Holy Groni').description).toContain('Τσίπουρο Αγιονερίου');
  });

  it('reports what needs a human look', () => {
    const kinds = menu.report.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'priceRange')).toHaveLength(2);
    expect(kinds).toContain('priceInDescription');
    expect(kinds).toContain('duplicateName');
    expect(kinds).not.toContain('unparsedPrice');
    expect(find('Premium Gin').description).toMatch(/Monkey 47$/);
  });

  it('gives every item a stable unique id', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(64);
    expect(find('Classic Negroni').id).toBe('negroni-c01-i01');
  });
});
