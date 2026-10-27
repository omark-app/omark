import { describe, expect, it } from 'vitest';
import * as msg from './messages.ts';

const ctx = { today: '2026-10-16', weekStart: 0 };

describe('toast messages', () => {
  it('added', () => {
    expect(msg.added('Today')).toBe('Added to Today');
  });

  it('moved, with and without a label', () => {
    expect(msg.moved('Next week', 'Sun')).toBe('Moved to Next week · Sun');
    expect(msg.moved('Today', null)).toBe('Moved to Today');
    expect(msg.moved('Someday', null)).toBe('Moved to Someday');
  });

  it('doneRepeat names the next date', () => {
    expect(msg.doneRepeat('2026-10-19', ctx)).toBe('Done · next Mon 19 Oct');
    expect(msg.doneRepeat('2027-01-04', ctx)).toBe("Done · next Mon 4 Jan '27");
  });

  it('done and deleted name the task', () => {
    expect(msg.done('Send the invoice')).toBe('Done · Send the invoice');
    expect(msg.deleted('Send the invoice')).toBe('Deleted · Send the invoice');
  });

  it('reordered', () => {
    expect(msg.reordered(true)).toBe('Reordered');
    expect(msg.reordered(false)).toBe('Tasks sort by date first, so it stays among its own date');
    expect(msg.reordered(true, false)).toBe('Important tasks sort first, so it stays among its own kind');
    expect(msg.reordered(false, false)).toBe('Important tasks sort first, so it stays among its own kind');
  });

  it('repeats', () => {
    expect(msg.repeats({ type: 'weekly', days: [0, 3] })).toBe('Repeats every Mon, Thu');
    expect(msg.repeats({ type: 'daily' })).toBe('Repeats every day');
  });

  it('fixed messages', () => {
    expect(msg.saved()).toBe('Saved');
    expect(msg.repeatRemoved()).toBe('Repeat removed');
    expect(msg.undone()).toBe('Undone');
    expect(msg.nothingToUndo()).toBe('Nothing to undo');
  });

  it('habit messages (#44)', () => {
    // ctx.today is Friday 16 Oct: within 6 days a weekday, further out a date.
    expect(msg.habitTick('Read 20 pages', 31, 66, '2026-10-20', ctx)).toBe('Read 20 pages · 31/66 · next Tue');
    expect(msg.habitTick('Read 20 pages', 31, 66, '2026-10-23', ctx)).toBe('Read 20 pages · 31/66 · next 23 Oct');
    expect(msg.alreadyDone('today', '2026-10-20', ctx)).toBe('Already done today · next Tue');
    expect(msg.alreadyDone('this week', '2026-10-19', ctx)).toBe('Already done this week · next Mon');
    expect(msg.alreadyDone('this period', '2026-11-12', ctx)).toBe('Already done this period · next 12 Nov');
    expect(msg.habitFormed('Read 20 pages', 66, 71)).toBe('Habit formed: Read 20 pages · 66 in 71 days · moved to History');
    expect(msg.habitFormed('Water', 1, 1)).toBe('Habit formed: Water · 1 in 1 day · moved to History');
    expect(msg.habitLimit(3)).toBe('3 habits in progress already. Finish or drop one first, or raise the limit in Settings.');
    expect(msg.habitLimit(1)).toBe('1 habit in progress already. Finish or drop one first, or raise the limit in Settings.');
    expect(msg.addedNotHabit(3, 'Journal 5 lines')).toBe(
      '3 habits in progress already. Journal 5 lines added as a repeating task; make it a habit when one is formed or dropped.',
    );
    expect(msg.nowHabit()).toBe('Now a habit');
    expect(msg.notHabit()).toBe('No longer a habit');
    expect(msg.droppedHabit('Cold shower')).toBe('Dropped habit · Cold shower');
    expect(msg.keptAsTask()).toBe('Kept as a repeating task');
    expect(msg.renameHabit('Meditate')).toBe('Renaming restarts Meditate at 0. Rename?');
    expect(msg.habitGoal(30)).toBe('Goal 30');
  });
});
