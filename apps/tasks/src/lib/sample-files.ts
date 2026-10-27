import { addDays, dayOfWeek, DEFAULT_CONFIG_YAML, endOfWeek } from '@omark/tasks-core';
import type { ISODate } from '@omark/tasks-core';
import type { TaskFile } from './workspace.ts';

/**
 * What a fake build's drive starts with: the e2e test seed when one is set, else nothing. Fake builds are
 * only for tests; the demo and PR previews are demo builds, which start from `sampleFiles`.
 */
export function fakeSeed(testSeed: Partial<Record<TaskFile, string>> | undefined): Partial<Record<TaskFile, string>> {
  return testSeed ?? {};
}

/**
 * Files the demo drive starts with, so the demo (and a PR preview) is worth opening on the phone: every bucket,
 * Important, not urgent, a repeat, notes and a few completions. Dates are relative to `today`.
 */
export function sampleFiles(today: ISODate): Record<TaskFile, string> {
  const ctx = { today, weekStart: 0 };
  const weekEnd = endOfWeek(ctx);
  const nextMonday = addDays(today, 7 - dayOfWeek(today));
  const d = (n: number) => addDays(today, n);
  const thisWeek = weekEnd > today ? `📅 ${weekEnd}` : `📅 ${today}`;
  const tasks = `# Tasks
- [ ] Walk before the first coffee ⏫
- [ ] One tab at a time ⏫
- [ ] Notice when I interrupt people ⏫
- [ ] Call the dentist about the crown 📅 ${today}
    - ask about zirconia
    - bring the old x-ray
- [ ] Send the invoice ${thisWeek}
- [ ] Pick up the dry cleaning 📅 ${d(1)}
- [ ] Water the plants 🔁 every week on Monday 📅 ${nextMonday}
- [ ] Book the car service 📅 ${addDays(weekEnd, 3)}
- [ ] Renew the passport 📅 ${d(40)}
- [ ] Learn to bake sourdough
- [ ] Plan a climbing trip
`;
  const done = `- [x] Pay the electricity bill ✅ ${d(-1)}
- [x] Water the plants 🔁 every week on Monday ✅ ${d(-2)}
- [x] Reply to the school ✅ ${d(-2)}
- [x] Back up the photos ✅ ${d(-5)}
`;
  return { 'tasks.md': tasks, 'done.md': done, 'config.yaml': DEFAULT_CONFIG_YAML };
}
