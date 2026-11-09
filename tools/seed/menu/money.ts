/** Result of reading a menu price such as "10€", "8,5 €" or "8 – 12€". Money is integer cents. */
export interface ParsedPrice {
  cents: number;
  /** Set for ranges ("8 – 12€"): the original text, kept in the item description. */
  rangeText: string | null;
}

const AMOUNT = String.raw`(\d+(?:[.,]\d{1,2})?)`;
const SINGLE = new RegExp(String.raw`^${AMOUNT}\s*€$`);
const RANGE = new RegExp(String.raw`^${AMOUNT}\s*[-–—]\s*${AMOUNT}\s*€$`);

export function toCents(amount: string): number {
  const [euros, fraction = ''] = amount.replace(',', '.').split('.');
  return Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Returns null when the text is not a price we understand. Ranges store the lower price. */
export function parsePrice(raw: string): ParsedPrice | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  const single = SINGLE.exec(text);
  if (single) return { cents: toCents(single[1]), rangeText: null };
  const range = RANGE.exec(text);
  if (range) {
    const [low, high] = [toCents(range[1]), toCents(range[2])];
    return { cents: Math.min(low, high), rangeText: text };
  }
  return null;
}
