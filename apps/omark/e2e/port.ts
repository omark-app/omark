// The preview port for this app's e2e. As in apps/tasks: each checkout gets its own port from its path, so
// parallel checkouts never test each other's builds. CI keeps 4175. OMARK_E2E_PORT overrides both.
export function e2ePort(dir: string, env: Record<string, string | undefined>): number {
  if (env.OMARK_E2E_PORT) return Number(env.OMARK_E2E_PORT);
  if (env.CI) return 4175;
  let hash = 0;
  for (const c of dir.replaceAll('\\', '/').toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  // Above apps/tasks' range (4200–4899).
  return 5000 + (hash % 700);
}

/** The demo build's preview port (e2e/demo.spec.ts): after the fake build's and Tasks-in-the-shell's (+1). */
export function demoPort(dir: string, env: Record<string, string | undefined>): number {
  return e2ePort(dir, env) + 2;
}
