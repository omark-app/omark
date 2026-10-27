import { describe, expect, it } from 'vitest';
import { allTasks, bucketOf, DEFAULT_CONFIG_YAML, habitProgress, parseConfig, parseDone, parseTasks, serializeTasks } from '@omark/tasks-core';
import { fakeSeed, sampleFiles } from './sample-files.ts';

const WEDNESDAY = '2026-10-21';

describe('fakeSeed', () => {
  it('a test seed is used as it is', () => {
    expect(fakeSeed({ 'tasks.md': '# Tasks\n' })).toEqual({ 'tasks.md': '# Tasks\n' });
  });
  // Previews are demo builds now, so a fake build is only for tests and never gets the samples.
  it('without one the drive starts empty', () => {
    expect(fakeSeed(undefined)).toEqual({});
  });
});

describe('sampleFiles', () => {
  const files = sampleFiles(WEDNESDAY);
  const doc = parseTasks(files['tasks.md']);
  const tasks = allTasks(doc);

  it('tasks.md round-trips without loss', () => {
    expect(serializeTasks(doc)).toBe(files['tasks.md']);
  });

  it('fills every bucket and Important, not urgent', () => {
    const ctx = { today: WEDNESDAY, weekStart: 0 };
    const buckets = new Set(tasks.map((t) => bucketOf(t, ctx)));
    expect([...buckets].sort()).toEqual(['important', 'later', 'next', 'someday', 'today', 'tomorrow', 'week']);
  });

  it('has a repeat and notes', () => {
    expect(tasks.some((t) => t.repeat !== null)).toBe(true);
    expect(tasks.some((t) => t.notes.length > 0)).toBe(true);
  });

  it('done.md has recent completions, so stats are not zero', () => {
    const entries = parseDone(files['done.md']).lines.filter((l) => l.entry !== null);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const l of entries) expect(l.entry!.doneOn! < WEDNESDAY).toBe(true);
  });

  it('has two habits under way, within the default limit', () => {
    const { habits } = parseConfig(files['config.yaml']).config;
    const done = parseDone(files['done.md']);
    const open = tasks.filter((t) => t.habit);
    expect(open.length).toBe(2);
    expect(open.length).toBeLessThanOrEqual(habits.maxInProgress);
    for (const t of open) {
      const p = habitProgress(t, done, WEDNESDAY, habits);
      expect(p.count, t.title).toBeGreaterThan(0);
      expect(p.formedOn, t.title).toBeNull();
    }
  });

  it('config.yaml is the defaults', () => {
    expect(files['config.yaml']).toBe(DEFAULT_CONFIG_YAML);
  });

  it('dates follow today, so a preview never looks stale', () => {
    expect(sampleFiles('2027-03-03')['tasks.md']).toContain('📅 2027-03-03');
  });
});
