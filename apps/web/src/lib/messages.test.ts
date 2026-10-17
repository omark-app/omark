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
});
