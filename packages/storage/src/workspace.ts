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
  /**
   * The texts to start from. When all three files are cached it resolves with the cached texts at once,
   * without the network (`fromCache`, status `syncing`): call `refresh()` next to bring the remote in.
   * Otherwise it pulls first (creating missing files), so a first run never shows an empty list.
   */
  open(): Promise<Snapshot & { fromCache: boolean }>;
  /**
   * Re-reads all three files, merging remote changes into the working texts; `changed` is true when remote
   * content altered any of them. The app ignores the returned texts and reads `texts()` afterwards (on its
   * own chain), since edits staged while the reads were in flight are only there.
   */
  refresh(): Promise<Snapshot & { changed: boolean }>;
  /**
   * Saves tasks.md first, then done.md; each only if given, and resolves when the upload attempt is over.
   * `base` is the text the edit started from. Kept for tests; the app uses `stage`.
   */
  save(files: {
    tasks?: { text: string; base: string };
    done?: { text: string; base: string };
  }): Promise<void>;
  /**
   * Like `save`, but resolves once the edits are in the cache, without waiting for the network (which
   * syncs in the background). Stages tasks.md, then done.md even if tasks.md failed; rethrows the first
   * cache error afterwards.
   */
  stage(files: {
    tasks?: { text: string; base: string };
    done?: { text: string; base: string };
  }): Promise<void>;
  /**
   * Each file's working text right now: every staged edit plus whatever has been absorbed from the
   * remote. Merging the caller's unstaged edits onto this, against the text it last staged or adopted,
   * brings in only outside changes.
   */
  texts(): Snapshot;
  /**
   * Calls `cb` after a sync operation brought remote content into a working text: a `refresh`, and also a
   * save whose write met a newer file (another device's change) and merged it in. Read `texts()` then.
   */
  onRemoteChange(cb: () => void): () => void;
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
      const [ct, cd, cc] = await Promise.all([tasks.cached(), done.cached(), config.cached()]);
      if (ct !== null && cd !== null && cc !== null) return { tasks: ct, done: cd, config: cc, fromCache: true };
      const [t, d, c] = await Promise.all([tasks.open(), done.open(), config.open()]);
      return { tasks: t, done: d, config: c, fromCache: false };
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
    texts() {
      return { tasks: tasks.text(), done: done.text(), config: config.text() };
    },
    async stage(files) {
      const errors: unknown[] = [];
      for (const [sync, edit] of [[tasks, files.tasks], [done, files.done]] as const) {
        if (!edit) continue;
        try {
          await sync.stage(edit.text, edit.base);
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw errors[0];
    },
    status,
    onRemoteChange(cb) {
      const offs = all.map((f) => f.onRemoteChange(cb));
      return () => {
        for (const off of offs) off();
      };
    },
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
