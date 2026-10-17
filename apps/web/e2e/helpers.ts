import type { Locator, Page } from '@playwright/test';

export type FileName = 'tasks.md' | 'done.md' | 'config.yaml';

/** The tasks.md example from spec section 3.3. */
export const SPEC_TASKS = `# Always
- Walk before the first coffee
- One tab at a time

# Tasks
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
 * `now` and runs, so a test can `page.clock.fastForward` the app's timers.
 */
export async function openApp(
  page: Page,
  opts: { files?: Partial<Record<FileName, string>>; now?: string; fakeTimers?: boolean } = {},
): Promise<void> {
  const files = opts.files ?? {};
  const now = new Date(opts.now ?? '2026-10-16T09:00:00');
  if (opts.fakeTimers) await page.clock.install({ time: now });
  else await page.clock.setFixedTime(now);
  await page.addInitScript((seed) => {
    (window as unknown as { __TASKAPP_SEED__: unknown }).__TASKAPP_SEED__ = seed;
  }, files);
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

