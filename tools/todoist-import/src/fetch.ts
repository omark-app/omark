import type { TodoistTask } from './convert.ts';

const URL_BASE = 'https://api.todoist.com/api/v1/tasks';

export class TodoistError extends Error {}

/** Fetches every open task, following `next_cursor`. The token is only sent as a header and never put in errors. */
export async function fetchAllTasks(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TodoistTask[]> {
  const all: TodoistTask[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(URL_BASE);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      throw new TodoistError(`Could not reach Todoist: ${e instanceof Error ? e.message : 'network error'}`);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ' (check TODOIST_TOKEN)' : '';
      throw new TodoistError(`Todoist API returned ${res.status} ${res.statusText}${hint}`);
    }
    const body = (await res.json()) as { results?: TodoistTask[]; next_cursor?: string | null };
    if (!Array.isArray(body.results)) throw new TodoistError('Unexpected Todoist response: no "results" array');
    all.push(...body.results);
    cursor = body.next_cursor ?? null;
  } while (cursor);
  return all;
}
