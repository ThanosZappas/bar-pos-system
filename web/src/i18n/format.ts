/** Replaces {name} placeholders: fill('Remove table {name}?', { name: '7' }). */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
}
