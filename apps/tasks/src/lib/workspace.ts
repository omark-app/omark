import { FileSync } from '@omark/storage';
import type { LocalCache, StorageAdapter, SyncStatus } from '@omark/storage';
import { mergeSettings } from '@omark/settings';
import type { Dropped } from '@omark/settings';
import { DEFAULT_CONFIG_YAML, mergeDoneText, mergeTasksText, TASKS_SCHEMA } from '@omark/tasks-core';

export type TaskFile = 'tasks.md' | 'done.md' | 'config.yaml';
export const TASK_FILES: readonly TaskFile[] = ['tasks.md', 'done.md', 'config.yaml'];

/** An edit to one file: its new text and `base`, the text the edit started from. */
export interface FileEdit {
  text: string;
  base: string;
}

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
   * Saves tasks.md, then done.md, then config.yaml; each only if given, and resolves when the upload
   * attempt is over. Kept for tests; the app uses `stage`.
   */
  save(files: { tasks?: FileEdit; done?: FileEdit; config?: FileEdit }): Promise<void>;
  /**
   * Like `save`, but resolves once the edits are in the cache, without waiting for the network (which
   * syncs in the background). Stages tasks.md, then done.md, then config.yaml, each even if an earlier
   * one failed; rethrows the first cache error afterwards.
   */
  stage(files: { tasks?: FileEdit; done?: FileEdit; config?: FileEdit }): Promise<void>;
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
  /**
   * Calls `cb` when merging config.yaml found settings changed differently here and on another device
   * (when a staged edit meets a newer file, on a pull or a save). `labels` are the settings' labels;
   * the change made here was kept. When `dropped` (it says why), the change could not go onto the other
   * device's file: that file was kept, and `labels` are the settings changed here.
   */
  onConfigConflict(cb: (labels: string[], dropped: Dropped) => void): () => void;
  /** Worst of the three files: signin > offline > syncing > saved. */
  status(): SyncStatus;
  /** A file's last save failed because the storage is full (#68); `onStatus` also fires when this changes. */
  full(): boolean;
  /** A file's last sync failed to reach the sign-in server, not the storage (#157); `onStatus` also fires when this changes. */
  signInUnreachable(): boolean;
  onStatus(cb: (s: SyncStatus) => void): () => void;
}

const RANK: Record<SyncStatus, number> = { saved: 0, syncing: 1, offline: 2, signin: 3 };

export function createWorkspace(adapter: StorageAdapter, cache: LocalCache): Workspace {
  const conflictListeners = new Set<(labels: string[], dropped: Dropped) => void>();
  /** config.yaml merges one setting at a time; where both sides changed one, the local value wins. */
  const mergeConfig = (base: string, local: string, remote: string): string => {
    const { text, conflicts, dropped } = mergeSettings(TASKS_SCHEMA, base, local, remote);
    if (conflicts.length > 0 || dropped) {
      const labels = conflicts.map((f) => f.label);
      for (const cb of conflictListeners) {
        try {
          cb(labels, dropped);
        } catch (e) {
          console.error('Workspace config-conflict listener failed', e);
        }
      }
    }
    return text;
  };
  const make = (name: TaskFile, merge: (b: string, l: string, r: string) => string, initial: string) =>
    new FileSync({ name, adapter, cache, merge, initial });
  const tasks = make('tasks.md', mergeTasksText, '# Tasks\n');
  const done = make('done.md', mergeDoneText, '');
  const config = make('config.yaml', mergeConfig, DEFAULT_CONFIG_YAML);
  const all = [tasks, done, config];

  const status = (): SyncStatus =>
    all.reduce<SyncStatus>((w, f) => (RANK[f.status()] > RANK[w] ? f.status() : w), 'saved');

  const full = (): boolean => all.some((f) => f.full());
  // Only the files in the status shown count: a file still retrying keeps the old cause while another fails anew.
  const signInUnreachable = (): boolean => {
    const s = status();
    return all.some((f) => f.status() === s && f.signInUnreachable());
  };

  const listeners = new Set<(s: SyncStatus) => void>();
  let last = status();
  let lastFull = full();
  let lastSignIn = signInUnreachable();
  const onChange = (): void => {
    const s = status();
    if (s === last && full() === lastFull && signInUnreachable() === lastSignIn) return;
    last = s;
    lastFull = full();
    lastSignIn = signInUnreachable();
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
      if (files.config) await config.save(files.config.text, files.config.base);
    },
    texts() {
      return { tasks: tasks.text(), done: done.text(), config: config.text() };
    },
    async stage(files) {
      const errors: unknown[] = [];
      for (const [sync, edit] of [[tasks, files.tasks], [done, files.done], [config, files.config]] as const) {
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
    full,
    signInUnreachable,
    onRemoteChange(cb) {
      const offs = all.map((f) => f.onRemoteChange(cb));
      return () => {
        for (const off of offs) off();
      };
    },
    onConfigConflict(cb) {
      conflictListeners.add(cb);
      return () => {
        conflictListeners.delete(cb);
      };
    },
    onStatus(cb) {
      if (!wired) {
        wired = true;
        last = status();
        lastFull = full();
        lastSignIn = signInUnreachable();
        for (const f of all) f.onStatus(onChange);
      }
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
