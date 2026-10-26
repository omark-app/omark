// Grouping categories that differ only in case.
import type { EventRow } from './rows.ts';

/**
 * Rows grouped by category, ignoring case. The key is lower case; the name is
 * the spelling used by most rows (ties: the smaller in code-point order).
 * `''` is the group of rows without a category.
 */
export function groupCategories(rows: EventRow[]): Map<string, { name: string; rows: EventRow[] }> {
  const groups = new Map<string, { rows: EventRow[]; spellings: Map<string, number> }>();
  for (const r of rows) {
    const key = r.category.toLowerCase();
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { rows: [], spellings: new Map() }));
    g.rows.push(r);
    g.spellings.set(r.category, (g.spellings.get(r.category) ?? 0) + 1);
  }
  const out = new Map<string, { name: string; rows: EventRow[] }>();
  for (const [key, g] of groups) {
    let name = '';
    let best = -1;
    for (const [spelling, n] of g.spellings) {
      if (n > best || (n === best && spelling < name)) {
        name = spelling;
        best = n;
      }
    }
    out.set(key, { name, rows: g.rows });
  }
  return out;
}
