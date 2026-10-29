import { areas, parseGoals } from '@omark/goals-core';
import type { StorageAdapter } from '@omark/storage';
import { activeProjects, isValidCode, parseProjects } from '@omark/time-core';

/**
 * What Tasks' quick add offers as `#` is typed (Goals spec 9): the unarchived project codes in `projects.csv`,
 * then the area tags in `goals.md`, each once ignoring case. A missing file offers none; null when a file couldn't
 * be read, so the caller keeps what it offered before.
 */
export async function suggestionTags(top: StorageAdapter, goals: StorageAdapter): Promise<string[] | null> {
  let projects: string | null;
  let goalsText: string | null;
  try {
    [projects, goalsText] = await Promise.all([
      top.read('projects.csv').then((f) => f?.text ?? null),
      goals.read('goals.md').then((f) => f?.text ?? null),
    ]);
  } catch {
    return null;
  }
  const codes = projects === null ? [] : activeProjects(parseProjects(projects).projects).map((p) => p.code).filter(isValidCode);
  const tags = goalsText === null ? [] : areas(parseGoals(goalsText)).flatMap((a) => (a.tag ? [a.tag] : []));
  const seen = new Set<string>();
  return [...codes, ...tags].filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
