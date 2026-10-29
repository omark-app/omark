import { setSetting } from '@omark/settings';
import type { Schema } from '@omark/settings';
import { parse } from 'yaml';

/** The parts of the one Omark app, in their default tab order. */
export const PARTS = ['tasks', 'time', 'goals'] as const;
export type Part = (typeof PARTS)[number];

export const PART_NAMES: Record<Part, string> = { tasks: 'Tasks', time: 'Time', goals: 'Goals' };

const DEFAULT_PARTS: Part[] = ['tasks'];

/**
 * The suite `config.yaml` at the top of the Omark folder (one app spec, section 4): which parts are on, in tab
 * order. It follows the user across devices; the storage choice stays per device.
 */
export const SUITE_SCHEMA: Schema = {
  app: 'Omark',
  file: 'config.yaml',
  sections: [
    {
      id: 'parts',
      title: 'Parts',
      fields: [
        {
          type: 'set',
          path: ['parts'],
          label: 'Parts',
          options: PARTS.map((p) => ({ value: p, label: PART_NAMES[p] })),
          default: DEFAULT_PARTS,
        },
      ],
    },
  ],
};

const isPart = (s: unknown): s is Part => typeof s === 'string' && (PARTS as readonly string[]).includes(s);

/**
 * The parts that are on, in the file's order. A missing or broken file, unknown names or an empty list read as
 * Tasks alone: some part is always on.
 */
export function partsOf(text: string | null): Part[] {
  let raw: unknown;
  try {
    raw = (parse(text ?? '') as { parts?: unknown } | null)?.parts;
  } catch {
    return [...DEFAULT_PARTS];
  }
  // Read directly rather than through the schema, which would drop the whole list for one unknown name.
  const parts = Array.isArray(raw) ? [...new Set(raw.filter(isPart))] : [];
  return parts.length > 0 ? parts : [...DEFAULT_PARTS];
}

/** The file with `parts` set; every other byte stays. */
export function withParts(text: string | null, parts: readonly Part[]): string {
  if (parts.length === 0) throw new Error('At least one part must be on');
  return setSetting(text ?? '', ['parts'], [...parts]);
}

/** What an address shows: a part that is on, an offer to turn one on, or another address to go to. */
export type Route = { open: Part } | { offer: Part } | { go: string };

/** `/` and unknown paths go to the first part on; `/time` opens Time, or offers it when it is off. */
export function route(pathname: string, on: readonly Part[]): Route {
  const name = pathname.replace(/^\/+|\/+$/g, '');
  if (isPart(name)) return on.includes(name) ? { open: name } : { offer: name };
  return { go: `/${on[0] ?? 'tasks'}` };
}

/** The part ticked on the first run: the one in the address the user came in by, else Tasks. */
export function entryPart(pathname: string): Part {
  const name = pathname.replace(/^\/+|\/+$/g, '');
  return isPart(name) ? name : 'tasks';
}
