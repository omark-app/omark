import { describe, expect, it } from 'vitest';
import { allTasks, bucketOf, DEFAULT_CONFIG_YAML, parseDone, parseTasks, serializeTasks } from '@omark/core';
import { fakeSeed, sampleFiles } from './sample-files.ts';

const WEDNESDAY = '2026-10-21';

describe('fakeSeed', () => {
  it('a preview with no test seed gets the sample files', () => {
    expect(fakeSeed('preview', undefined, WEDNESDAY)).toEqual(sampleFiles(WEDNESDAY));
  });
  it('a test seed always wins', () => {
    expect(fakeSeed('preview', { 'tasks.md': '# Tasks\n' }, WEDNESDAY)).toEqual({ 'tasks.md': '# Tasks\n' });
  });
  it('locally the drive starts empty', () => {
    expect(fakeSeed('local', undefined, WEDNESDAY)).toEqual({});
  });
});

describe('sampleFiles', () => {
  const files = sampleFiles(WEDNESDAY);
  const doc = parseTasks(files['tasks.md']);
  const tasks = allTasks(doc);

  it('tasks.md round-trips without loss', () => {
    expect(serializeTasks(doc)).toBe(files['tasks.md']);
  });

  it('fills every bucket', () => {
    const ctx = { today: WEDNESDAY, weekStart: 0 };
    const buckets = new Set(tasks.map((t) => bucketOf(t, ctx)));
    expect([...buckets].sort()).toEqual(['later', 'next', 'someday', 'today', 'tomorrow', 'week']);
  });

  it('has a repeat, notes and ALWAYS lines', () => {
    expect(tasks.some((t) => t.repeat !== null)).toBe(true);
    expect(tasks.some((t) => t.notes.length > 0)).toBe(true);
    expect(doc.always.length).toBeGreaterThanOrEqual(2);
  });

  it('done.md has recent completions, so stats are not zero', () => {
    const entries = parseDone(files['done.md']).lines.filter((l) => l.entry !== null);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const l of entries) expect(l.entry!.doneOn! < WEDNESDAY).toBe(true);
  });

  it('config.yaml is the defaults', () => {
    expect(files['config.yaml']).toBe(DEFAULT_CONFIG_YAML);
  });

  it('dates follow today, so a preview never looks stale', () => {
    expect(sampleFiles('2027-03-03')['tasks.md']).toContain('📅 2027-03-03');
  });
});
