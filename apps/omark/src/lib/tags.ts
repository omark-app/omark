import { areas, parseGoals } from '@omark/goals-core';
import type { StorageAdapter } from '@omark/storage';
import { activeProjects, parseProjects } from '@omark/time-core';

/**
 * What Tasks' quick add offers as `#` is typed (Goals spec 9): the unarchived project codes in `projects.csv`,
 * then the area tags in `goals.md`. A file that is missing or can't be read offers none.
 */
export async function suggestionTags(top: StorageAdapter, goals: StorageAdapter): Promise<string[]> {
  const read = async (folder: StorageAdapter, name: string) => (await folder.read(name).catch(() => null))?.text ?? null;
  const [projects, goalsText] = await Promise.all([read(top, 'projects.csv'), read(goals, 'goals.md')]);
  const codes = projects === null ? [] : activeProjects(parseProjects(projects).projects).map((p) => p.code);
  const tags = goalsText === null ? [] : areas(parseGoals(goalsText)).flatMap((a) => (a.tag ? [a.tag] : []));
  return [...codes, ...tags];
}
