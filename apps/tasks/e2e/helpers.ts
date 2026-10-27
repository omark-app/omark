import type { Locator, Page } from '@playwright/test';

export type FileName = 'tasks.md' | 'done.md' | 'config.yaml';

/** The tasks.md example from spec section 3.3. */
export const SPEC_TASKS = `# Tasks
- [ ] Walk before the first coffee ⏫
- [ ] One tab at a time ⏫
- [ ] Call the dentist about the crown 📅 2026-10-16
    - ask about zirconia
    - bring the old x-ray
- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19
- [ ] Send the invoice 📅 2026-10-19
- [ ] Learn Polish sign language
`;

/** A note line long enough to wrap many times in the notes box. */
export const LONG_NOTE = 'floats 2g x2 and 3g x2, 5g x1; line 22mm and 28mm; hooks 8 and 10; groundbait. '.repeat(4).trim();

/** True when a notes box shows all its text with no scrollbar of its own. */
export function fitsNotes(notes: Locator): Promise<boolean> {
  return notes.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
}

/**
 * Opens the app on a fake OneDrive seeded with `files`, with the browser clock fixed at `now`
 * (local time, default 2026-10-16 09:00). `fakeTimers` instead installs a fake clock that starts at
 * `now` and runs, so a test can `page.clock.fastForward` the app's timers. `auth` boots through sign-in
 * with that stubbed account (`google`: signed in with Google, on a fake Google Drive seeded with `files`);
 * `providers` are the sign-in providers the stubbed helper offers (default just Microsoft).
 */
export async function openApp(
  page: Page,
  opts: {
    files?: Partial<Record<FileName, string>>;
    now?: string;
    fakeTimers?: boolean;
    auth?: 'signed-out' | 'expired' | 'google' | 'google-expired';
    providers?: string[];
  } = {},
): Promise<void> {
  const files = opts.files ?? {};
  const now = new Date(opts.now ?? '2026-10-16T09:00:00');
  if (opts.fakeTimers) await page.clock.install({ time: now });
  else await page.clock.setFixedTime(now);
  await page.addInitScript(
    ([seed, auth, providers]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TASKAPP_SEED__ = seed;
      if (auth) w.__TASKAPP_AUTH_STUB__ = auth;
      if (providers) w.__TASKAPP_PROVIDERS__ = providers;
    },
    [files, opts.auth ?? null, opts.providers ?? null] as const,
  );
  await page.goto('/');
}

/** The current text of a file on the fake drive ('' if it does not exist). */
export async function driveFile(page: Page, name: FileName): Promise<string> {
  return page.evaluate((n) => {
    const f = (window as unknown as { __taskappFake: { peek(name: string): string | null } }).__taskappFake;
    return f.peek(n) ?? '';
  }, name);
}

/** Writes a file on the fake drive as another device would. */
export async function externalWrite(page: Page, name: FileName, text: string): Promise<void> {
  await page.evaluate(
    ([n, t]) => {
      const f = (window as unknown as { __taskappFake: { externalWrite(name: string, text: string): void } }).__taskappFake;
      f.externalWrite(n!, t!);
    },
    [name, text],
  );
}

/**
 * Stands in for the folder picker with a real directory handle from Chrome's origin-private file system
 * (`Tasks`), which IndexedDB can keep across reloads like a picked folder's. The permission prompt of a
 * later visit is simulated: while localStorage has `e2e-folder-permission`, the handle reports it, and
 * `requestPermission` grants access and clears it.
 */
export async function installFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
    const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => localStorage.getItem('e2e-folder-permission') ?? 'granted';
    proto.requestPermission = async () => {
      localStorage.removeItem('e2e-folder-permission');
      return 'granted';
    };
  });
}

/** The file's text in the picked folder, or null if it does not exist. */
export function folderFile(page: Page, name: FileName): Promise<string | null> {
  return page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
    try {
      return await (await (await dir.getFileHandle(n)).getFile()).text();
    } catch {
      return null;
    }
  }, name);
}

/** Writes a file in the picked folder as another program (an editor, a sync client) would. */
export async function folderWrite(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    async ([n, t]) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
      const stream = await (await dir.getFileHandle(n!, { create: true })).createWritable();
      await stream.write(t!);
      await stream.close();
    },
    [name, text],
  );
}
