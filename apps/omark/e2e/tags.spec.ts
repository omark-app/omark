import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Tag suggestions in Tasks' quick add (roadmap G.3, Goals spec 9): `#` offers the unarchived project codes from
// projects.csv and the area tags from goals.md.

const PROJECTS = 'code,description,client,rate,currency,archived\nCLIMB,Climbing,,,,\nOLD,Old,,,,2025-01-01\n';

async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-16T09:00:00'));
  await page.addInitScript((projects) => {
    (window as unknown as Record<string, unknown>).__OMARK_SEED__ = {
      root: { 'config.yaml': 'parts: [tasks, goals]\n', 'projects.csv': projects },
      goals: { 'goals.md': '## Climbing #climbing\n## Home #home\n' },
    };
  }, PROJECTS);
  await page.goto('/tasks');
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

/** The quick add field: the add input on desktop, the + sheet's field on a phone. */
async function field(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByTestId('fab').tap();
    return page.getByTestId('sheet').getByLabel('New task');
  }
  return page.getByTestId('add-input');
}

test('# offers project codes and area tags; choosing one fills it in, and the task keeps it', async ({ page, isMobile }) => {
  await open(page);
  const input = await field(page, isMobile);
  await input.pressSequentially('Book flights #cl');
  const list = page.getByTestId('tag-suggestions');
  await expect(list.getByRole('option')).toHaveText(['#CLIMB', '#climbing']);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('Book flights #climbing ');
  await expect(list).toHaveCount(0);
  if (isMobile) await page.getByTestId('sheet').getByRole('button', { name: 'Add', exact: true }).tap();
  else await input.press('Enter');
  await expect(page.getByTestId('task-row').filter({ hasText: 'Book flights #climbing' })).toHaveCount(1);
});

test('an archived code is not offered, and Escape closes the list without leaving the field', async ({ page, isMobile }) => {
  await open(page);
  const input = await field(page, isMobile);
  await input.pressSequentially('Tidy #');
  const list = page.getByTestId('tag-suggestions');
  await expect(list.getByRole('option')).toHaveText(['#CLIMB', '#climbing', '#home']);
  await input.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(input).toBeFocused();
  await input.pressSequentially('h');
  await expect(list.getByRole('option')).toHaveText(['#home']);
  await list.getByRole('option', { name: '#home' }).click();
  await expect(input).toHaveValue('Tidy #home ');
});

test('a tag typed in full shows no list, so Enter adds the task as typed', async ({ page, isMobile }) => {
  await open(page);
  const input = await field(page, isMobile);
  await input.pressSequentially('Book a wall #climb');
  await expect(page.getByTestId('tag-suggestions')).toHaveCount(0);
  if (isMobile) await page.getByTestId('sheet').getByRole('button', { name: 'Add', exact: true }).tap();
  else await input.press('Enter');
  await expect(page.getByTestId('task-row').filter({ hasText: 'Book a wall #climb' })).toHaveCount(1);
});
