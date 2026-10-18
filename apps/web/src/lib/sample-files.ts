import { addDays, dayOfWeek, DEFAULT_CONFIG_YAML, endOfWeek } from '@taskapp/core';
import type { ISODate } from '@taskapp/core';
import type { FileName } from '@taskapp/storage';

/**
 * Files a PR preview's fake drive starts with, so a preview is worth opening on the phone: every bucket,
 * a repeat, notes, ALWAYS lines and a few completions. Dates are relative to `today`.
 */
export function sampleFiles(today: ISODate): Record<FileName, string> {
  const ctx = { today, weekStart: 0 };
  const weekEnd = endOfWeek(ctx);
  const nextMonday = addDays(today, 7 - dayOfWeek(today));
  const d = (n: number) => addDays(today, n);
  const thisWeek = weekEnd > today ? `📅 ${weekEnd}` : `📅 ${today}`;
  const tasks = `# Always
- Walk before the first coffee
- One tab at a time

# Tasks
- [ ] Call the dentist about the crown 📅 ${today}
    - ask about zirconia
    - bring the old x-ray
- [ ] Send the invoice ${thisWeek}
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
