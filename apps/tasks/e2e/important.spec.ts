import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { driveFile, openApp, SPEC_TASKS } from './helpers';

/** Important, not urgent (#38): open tasks with ⏫ and no date, where ALWAYS used to be. */

const LEGACY = `# Always
- Walk before the first coffee
- One tab at a time

# Tasks
- [ ] Call the dentist 📅 2026-10-16
- [ ] Learn Polish sign language
`;

const group = (page: Page) => page.getByTestId('bucket-important');
const groupRows = (page: Page) => group(page).getByTestId('task-row');
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

async function start(page: Page, tasks = SPEC_TASKS) {
  await openApp(page, { files: { 'tasks.md': tasks } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test('old Always lines show as Important, not urgent and are saved as ⏫ tasks', async ({ page }) => {
  await start(page, LEGACY);
  await expect(page.getByTestId('bucket-head-important')).toContainText('Important, not urgent');
  await expect(groupRows(page)).toHaveText([/Walk before the first coffee/, /One tab at a time/]);
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe(
    '# Tasks\n- [ ] Walk before the first coffee ⏫\n- [ ] One tab at a time ⏫\n' +
      '- [ ] Call the dentist 📅 2026-10-16\n- [ ] Learn Polish sign language\n',
  );
});

test('the check completes a group task into done.md', async ({ page }) => {
  await start(page);
  await row(page, 'One tab at a time').getByTestId('task-check').click();
  await expect(page.getByTestId('toast')).toContainText('Done · One tab at a time');
  await expect(groupRows(page)).toHaveCount(1);
  await expect.poll(() => driveFile(page, 'done.md')).toBe('- [x] One tab at a time ⏫ ✅ 2026-10-16\n');
});

test('an empty group stays open with a short note', async ({ page }) => {
  await start(page, '# Tasks\n- [ ] Call the dentist 📅 2026-10-16\n');
  await expect(page.getByTestId('bucket-count-important')).toHaveText('0');
  await expect(group(page)).toContainText('Flag an undated task important');
});

test.describe('desktop drag', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse drag is a desktop feature');

  test('dropping on a row in the group reorders it, and the order is saved', async ({ page }) => {
    await start(page);
    await row(page, 'One tab at a time').dragTo(row(page, 'Walk before the first coffee'));
    await expect(groupRows(page)).toHaveText([/One tab at a time/, /Walk before the first coffee/]);
    await expect.poll(() => driveFile(page, 'tasks.md')).toMatch(/^# Tasks\n- \[ \] One tab at a time ⏫\n- \[ \] Walk before the first coffee ⏫\n/);
  });

  test('a Today task dropped on the group loses its date and gets ⏫', async ({ page }) => {
    await start(page);
    await row(page, 'Call the dentist').dragTo(page.getByTestId('bucket-head-important'));
    await expect(page.getByTestId('toast')).toContainText('Moved to Important, not urgent');
    await expect(groupRows(page)).toHaveCount(3);
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Call the dentist about the crown ⏫\n');
  });

  test('a group task dropped on Someday loses ⏫', async ({ page }) => {
    await start(page);
    await row(page, 'One tab at a time').dragTo(page.getByTestId('bucket-head-someday'));
    await expect(page.getByTestId('toast')).toContainText('Moved to Someday');
    await expect(groupRows(page)).toHaveCount(1);
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] One tab at a time\n');
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'long press and the edit sheet are the phone gestures');

  /** A synthetic touch pointer event at `at` (WebKit has no CDP touch input; see drag-phone.spec). */
  const pointer = (target: Locator, type: string, at: { x: number; y: number }) =>
    target.evaluate(
      (el, [type, at]) => {
        el.dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: at.x, clientY: at.y }),
        );
      },
      [type, at] as const,
    );

  test('holding a group row lifts it; dropping it on the row above reorders the group', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': SPEC_TASKS }, fakeTimers: true });
    const tab = row(page, 'One tab at a time');
    await expect(tab).toBeVisible();
    await tab.scrollIntoViewIfNeeded();
    await page.clock.pauseAt(new Date('2026-10-16T09:01:00'));
    const from = (await tab.boundingBox())!;
    const at = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    await pointer(tab, 'pointerdown', at);
    await page.clock.runFor(400);
    await expect(tab).toHaveClass(/\blifted\b/);
    const walk = (await row(page, 'Walk before the first coffee').boundingBox())!;
    const to = { x: walk.x + walk.width / 2, y: walk.y + 4 };
    for (let i = 1; i <= 5; i++) await pointer(tab, 'pointermove', { x: at.x, y: at.y + ((to.y - at.y) * i) / 5 });
    await pointer(tab, 'pointerup', to);
    await expect(groupRows(page)).toHaveText([/One tab at a time/, /Walk before the first coffee/]);
  });

  test('a tap opens the edit sheet of a group task', async ({ page }) => {
    await start(page);
    await row(page, 'Walk before the first coffee').tap();
    await expect(page.getByTestId('sheet').getByLabel('Task title')).toHaveValue('Walk before the first coffee');
  });
});
