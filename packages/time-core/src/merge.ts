// Three-way merges for the files two devices can write at once.
import { parseTimeConfig, setTimeConfig, type TimeConfig } from './config.ts';
import { parseEventsFile, serializeEventsFile } from './events-file.ts';
import { keyOf, type EventRow } from './rows.ts';

const rowKey = (r: EventRow) => `${keyOf(r.calendar, r.eventId)} ${r.date}`;

function keyed(text: string): Map<string, EventRow> {
  return new Map(parseEventsFile(text).rows.map((r) => [rowKey(r), r]));
}

/**
 * Three-way merge of a year file, row by row (a row is calendar + event id + date). Rows this device added,
 * changed or removed since `base` are applied to `remote`; when both changed a row, this device wins. The
 * next sync repairs a row either device got wrong, since the calendar is the source of truth.
 */
export function mergeEventsFile(base: string, local: string, remote: string): string {
  if (local === base) return remote;
  if (remote === base) return local;
  const b = keyed(base);
  const l = keyed(local);
  const out = keyed(remote);
  for (const key of new Set([...b.keys(), ...l.keys()])) {
    const before = b.get(key);
    const now = l.get(key);
    if (JSON.stringify(before) === JSON.stringify(now)) continue;
    if (now) out.set(key, now);
    else out.delete(key);
  }
  return serializeEventsFile([...out.values()]);
}

/**
 * Three-way merge of config.yaml: the keys this device changed since `base` are set on `remote`, so every
 * other line, comment and key there stays as it is. If `remote` can't take them (not valid YAML), this
 * device's text wins.
 */
export function mergeTimeConfig(base: string, local: string, remote: string, today: string): string {
  if (local === base) return remote;
  if (remote === base) return local;
  const b = parseTimeConfig(base, today).config;
  const l = parseTimeConfig(local, today).config;
  const changes: Partial<TimeConfig> = {};
  for (const key of Object.keys(l) as (keyof TimeConfig)[]) {
    if (JSON.stringify(l[key]) !== JSON.stringify(b[key])) Object.assign(changes, { [key]: l[key] });
  }
  try {
    return setTimeConfig(remote, changes, today);
  } catch {
    return local;
  }
}
