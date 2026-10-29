import { parse } from 'yaml';
import type { Schema } from '@omark/settings';
import { merge3 } from '@omark/tasks-core';

/** Goals' own `config.yaml` (Goals spec 7.2), read by the one Settings page too. */
export const GOALS_SCHEMA: Schema = {
  app: 'Omark Goals',
  file: 'config.yaml',
  sections: [
    {
      id: 'goals',
      title: 'Goals',
      fields: [
        {
          type: 'number',
          path: ['stale_after'],
          label: 'Needs update after',
          hint: 'months without anything linked',
          default: 3,
          min: 1,
          max: 24,
          integer: true,
        },
      ],
    },
  ],
};

export const DEFAULT_GOALS_CONFIG = '# Omark Goals settings. Only the ones you change need to be here.\n';

/**
 * The stale period in months; a file or value that doesn't read gives the default and says why. Read on its own,
 * not with the settings reader, as the file may hold other keys (Goals spec 7.2: unknown keys are kept).
 */
export function goalsConfig(text: string): { staleAfter: number; error: string | null } {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    return { staleAfter: 3, error: e instanceof Error ? e.message : String(e) };
  }
  const value = typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>)['stale_after'] : undefined;
  if (value === undefined) return { staleAfter: 3, error: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 24) {
    return { staleAfter: 3, error: 'stale_after must be a whole number of months from 1 to 24' };
  }
  return { staleAfter: value, error: null };
}

/**
 * Three versions of `goals.md` merged line by line (tasks-core's `merge3`): a change on one side wins; where
 * both changed the same lines, both sides' lines are kept, so no goal is lost. LF, one final newline.
 */
export function mergeGoalsText(base: string, local: string, remote: string): string {
  const lines = (t: string) => {
    const s = t.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const out = s === '' ? [] : s.split('\n');
    if (out.at(-1) === '') out.pop();
    return out;
  };
  const merged = merge3(lines(base), lines(local), lines(remote));
  return merged.length === 0 ? '' : `${merged.join('\n')}\n`;
}
