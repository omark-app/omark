import { DEFAULT_CONFIG_YAML, mergeDoneText, mergeTasksText } from '@taskapp/core';
import type { FileName, StorageAdapter } from './adapter.ts';
import type { LocalCache } from './cache.ts';
import { FileSync } from './file-sync.ts';
import type { SyncStatus } from './file-sync.ts';

export interface Snapshot {
  tasks: string;
  done: string;
  config: string;
}

export interface Workspace {
  open(): Promise<Snapshot>;
  /** Re-reads all three files; `changed` is true when remote content altered any of them. */
  refresh(): Promise<Snapshot & { changed: boolean }>;
  /** Saves tasks.md first, then done.md; each only if given. `base` is the text the edit started from. */
  save(files: {
    tasks?: { text: string; base: string };
    done?: { text: string; base: string };
  }): Promise<void>;
  /** Worst of the three files: signin > offline > syncing > saved. */
  status(): SyncStatus;
  onStatus(cb: (s: SyncStatus) => void): () => void;
}

const RANK: Record<SyncStatus, number> = { saved: 0, syncing: 1, offline: 2, signin: 3 };

/** The app never writes config.yaml after creating it, so the remote text always wins. */
const mergeConfig = (_base: string, _local: string, remote: string): string => remote;

export function createWorkspace(adapter: StorageAdapter, cache: LocalCache): Workspace {
  const make = (name: FileName, merge: (b: string, l: string, r: string) => string, initial: string) =>
    new FileSync({ name, adapter, cache, merge, initial });
  const tasks = make('tasks.md', mergeTasksText, '# Always\n\n# Tasks\n');
  const done = make('done.md', mergeDoneText, '');
  const config = make('config.yaml', mergeConfig, DEFAULT_CONFIG_YAML);
  const all = [tasks, done, config];

  const status = (): SyncStatus =>
    all.reduce<SyncStatus>((w, f) => (RANK[f.status()] > RANK[w] ? f.status() : w), 'saved');

  const listeners = new Set<(s: SyncStatus) => void>();
  let last = status();
  const onChange = (): void => {
    const s = status();
    if (s === last) return;
    last = s;
    for (const cb of listeners) {
      try {
        cb(s);
      } catch (e) {
        console.error('Workspace status listener failed', e);
      }
    }
  };
  let wired = false;

  return {
    async open() {
      const [t, d, c] = await Promise.all([tasks.open(), done.open(), config.open()]);
      return { tasks: t, done: d, config: c };
    },
    async refresh() {
      const [t, d, c] = await Promise.all([tasks.pull(), done.pull(), config.pull()]);
      return {
        tasks: t.text,
        done: d.text,
        config: c.text,
        changed: t.changed || d.changed || c.changed,
      };
    },
    async save(files) {
      if (files.tasks) await tasks.save(files.tasks.text, files.tasks.base);
      if (files.done) await done.save(files.done.text, files.done.base);
    },
    status,
    onStatus(cb) {
      if (!wired) {
        wired = true;
        last = status();
        for (const f of all) f.onStatus(onChange);
      }
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
