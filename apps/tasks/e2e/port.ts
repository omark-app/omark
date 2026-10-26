// The preview port for `pnpm e2e`. Locally Playwright reuses a server already on the port, so each
// checkout (the main one and every worktree) gets its own port from its path; otherwise parallel
// sessions would test each other's builds. CI keeps 4173. TASKS_E2E_PORT overrides both.
export function e2ePort(dir: string, env: Record<string, string | undefined>): number {
  if (env.TASKS_E2E_PORT) return Number(env.TASKS_E2E_PORT);
  if (env.CI) return 4173;
  let hash = 0;
  for (const c of dir.replaceAll('\\', '/').toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  // Even ports only: the demo build takes the odd one after (demoPort), so checkouts never share one.
  return 4200 + 2 * (hash % 350);
}

/** The demo build's preview port (e2e/demo.spec.ts): the one after the e2e port. */
export function demoPort(dir: string, env: Record<string, string | undefined>): number {
  return e2ePort(dir, env) + 1;
}
