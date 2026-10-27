import { describe, expect, it } from 'vitest';
import { conflictNote } from './folder-note.ts';

describe('conflictNote', () => {
  it('says nothing without conflict copies', () => {
    expect(conflictNote([])).toBeNull();
  });

  it('names one copy and says it is not merged', () => {
    expect(conflictNote(['tasks (1).md'])).toBe(
      "tasks (1).md in the folder looks like a sync app's conflict copy. It isn't merged: open it, copy what you need, then delete it.",
    );
  });

  it('names several copies', () => {
    expect(conflictNote(['done-PC.md', 'tasks (1).md'])).toBe(
      "done-PC.md and tasks (1).md in the folder look like a sync app's conflict copies. They aren't merged: open them, copy what you need, then delete them.",
    );
    expect(conflictNote(['a (1).md', 'b (1).md', 'c (1).md'])).toContain('a (1).md, b (1).md and c (1).md in the folder look like');
  });
});
