import { existsSync, writeFileSync } from 'node:fs';
import { buildTasksMd } from './convert.ts';
import { fetchAllTasks } from './fetch.ts';

function refuse(out: string): number {
  console.error(`Refusing to overwrite ${out}; pass --force to overwrite.`);
  return 2;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : undefined;
  if (!out || out.startsWith('--')) {
    console.error('Usage: todoist-import --out <path> [--force]   (token in TODOIST_TOKEN)');
    return 2;
  }
  const token = process.env.TODOIST_TOKEN;
  if (!token) {
    console.error('TODOIST_TOKEN is not set in the environment.');
    return 2;
  }
  if (existsSync(out) && !force) return refuse(out);
  const tasks = await fetchAllTasks(token);
  const { text, warnings } = buildTasksMd(tasks);
  try {
    // 'wx' fails if the file exists, so there is no check-then-write race.
    writeFileSync(out, text, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return refuse(out);
    throw e;
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Wrote ${tasks.length} tasks to ${out} (${warnings.length} warnings).`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : 'Import failed.');
    process.exit(1);
  },
);
