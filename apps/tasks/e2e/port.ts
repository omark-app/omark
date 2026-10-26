// The preview port for `pnpm e2e`. Locally Playwright reuses a server already on the port, so each
// checkout (the main one and every worktree) gets its own port from its path; otherwise parallel
// sessions would test each other's builds. CI keeps 4173. TASKS_E2E_PORT overrides both.
export function e2ePort(dir: string, env: Record<string, string | undefined>): number {
  if (env.TASKS_E2E_PORT) return Number(env.TASKS_E2E_PORT);
  if (env.CI) return 4173;
  let hash = 0;
  for (const c of dir.replaceAll('\\', '/').toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return 4200 + (hash % 700);
}
