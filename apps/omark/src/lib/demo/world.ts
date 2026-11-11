import { worldCalendar } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import { addDays, dayOfWeek, DEFAULT_CONFIG_YAML } from '@omark/tasks-core';
import type { ISODate } from '@omark/tasks-core';
import { defaultTimeConfigText, eventsFileName, eventToRows, knownCodes, parseProjects, parseTimeConfig, serializeEventsFile, setTimeConfig } from '@omark/time-core';
import type { EventRow } from '@omark/time-core';
import { PARTS, withParts } from '../suite.ts';

/** The demo world's files by folder, the pictures in `goals/images/`, and the calendar Time reads. */
export interface DemoWorld {
  root: Record<string, string>;
  tasks: Record<string, string>;
  time: Record<string, string>;
  goals: Record<string, string>;
  /** The names of the pictures `goals.md` shows, in `goals/images/`; the app has their bytes. */
  pictures: string[];
  calendar: { calendars: CalendarInfo[]; events: CalendarEvent[] };
}

const PROJECTS_CSV = `code,description,client,rate,currency,archived
NOVA,Nova Bank app redesign,Nova Bank,85,EUR,
COURSE,My design course,,,,
RUN,Half marathon training,,,,
LEAD,Leadership program,,,,
`;

/**
 * Maya, a freelance product designer in Lisbon aiming at a product lead role (one app spec, section 9): her goals,
 * projects, tasks, habits and hours, dated around `today`, the calendar in `timeZone`. Head of Product is due at the
 * end of next year, with the leadership program behind it; Money has had nothing linked for months, so it shows
 * Needs update; the course goal is six months out but the hours go to the client. Pure: the same arguments give the
 * same world.
 */
export function demoWorld(today: ISODate, timeZone: string): DemoWorld {
  const d = (n: number) => addDays(today, n);
  // The Thursday dinner: today when it is Thursday, else the next one.
  const thursday = d((3 - dayOfWeek(today) + 7) % 7);
  // The Friday 1:1 notes: today when it is Friday, else the next one.
  const friday = d((4 - dayOfWeek(today) + 7) % 7);
  const endOfNextYear: ISODate = `${Number(today.slice(0, 4)) + 1}-12-31`;

  const goals = `# Vision

A career I'm proud of, with time left for family.

## Career #career

![Career](images/career.jpg)

Leading a product team, on work I'm proud of.

- [ ] Head of Product #LEAD 📅 ${endOfNextYear} ➕ ${d(-45)}
- [ ] Launch my design course #COURSE 📅 ${d(182)} ➕ ${d(-40)}
- [x] Ten paying clients 📅 ${d(-60)} ➕ ${d(-300)} ✅ ${d(-75)}

## Health #health

![Health](images/health.jpg)

Strong enough to run anywhere, rested enough to enjoy it.

- [ ] Run a half marathon #RUN 📅 ${d(150)} ➕ ${d(-60)}

## Family & friends #family-friends

![Family & friends](images/family.jpg)

The people I love, around my table.

- [ ] A dinner with friends every week 📅 ${d(90)} ➕ ${d(-120)}

## Money #money

![Money](images/money.jpg)

Enough set aside to choose my work freely.

- [ ] Six months of savings 📅 ${d(365)} ➕ ${d(-150)}

## Not now

- A second big client
- Learning the guitar
`;

  const tasks = `# Tasks
- [ ] Pick a platform for the course #COURSE ⏫
- [ ] Ask for a stretch project #LEAD 📅 ${d(3)}
- [ ] Dinner with friends #family-friends 🌱 🔁 every week on Thursday 📅 ${thursday}
- [ ] Weekly 1:1 notes #LEAD 🌱 🔁 every week on Friday 📅 ${friday}
- [ ] Send Nova the payments flow 📅 ${today}
    - the prototype link
    - the open questions on refunds
- [ ] Easy run, 5 km #RUN 📅 ${today}
- [ ] Outline lesson 2 #COURSE 📅 ${d(-3)}
- [ ] Send Nova the invoice 📅 ${d(-1)}
- [ ] Book a sports massage #RUN 📅 ${d(2)}
- [ ] Record the course intro again #COURSE 📅 ${d(5)}
- [ ] Renew the passport 📅 ${d(40)}
- [ ] Buy new running shoes #RUN
- [ ] Compare savings accounts #money
`;

  // Oldest first, as Tasks appends them: five Thursday dinners, four Friday 1:1 notes, and the rest. Two habits
  // in progress, under the default limit of three, so a visitor can start one.
  const done: [ISODate, string][] = [
    ...Array.from({ length: 5 }, (_, i): [ISODate, string] => [addDays(thursday, -7 * (5 - i)), 'Dinner with friends #family-friends 🌱 🔁 every week on Thursday']),
    ...Array.from({ length: 4 }, (_, i): [ISODate, string] => [addDays(friday, -7 * (4 - i)), 'Weekly 1:1 notes #LEAD 🌱 🔁 every week on Friday']),
    [d(-58), 'Sign up for the Lisbon half marathon #RUN'],
    [d(-44), 'Join the leadership program #LEAD'],
    [d(-27), "Send Nova last month's invoice"],
    [d(-12), 'Write the course outline #COURSE'],
    [d(-6), 'Fix the bike light'],
    [d(-4), 'Long run, 12 km #RUN'],
    [d(-2), 'Call Mum'],
  ];
  const doneText = done
    .map(([on, title], i) => ({ on, title, i }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.i - b.i))
    .map(({ on, title }) => `- [x] ${title} ✅ ${on}\n`)
    .join('');

  // Colouring on, so the Calendar view shows the colours; tracked from before the first event.
  const timeConfig = setTimeConfig(defaultTimeConfigText(today), { colourEvents: true, trackFrom: d(-30) }, today);
  const calendar = worldCalendar(today, timeZone);

  return {
    root: { 'config.yaml': withParts(null, PARTS), 'projects.csv': PROJECTS_CSV },
    tasks: { 'tasks.md': tasks, 'done.md': doneText, 'config.yaml': DEFAULT_CONFIG_YAML },
    time: { 'config.yaml': timeConfig, ...hourFiles(calendar.events, timeConfig, today, timeZone) },
    goals: { 'goals.md': goals },
    pictures: ['career.jpg', 'health.jpg', 'family.jpg', 'money.jpg'],
    calendar,
  };
}

/** Time's hour files as its first sync writes them from the calendar, one per year. */
function hourFiles(events: CalendarEvent[], configText: string, today: ISODate, timeZone: string): Record<string, string> {
  const { config } = parseTimeConfig(configText, today);
  const ctx = { knownCodes: knownCodes(parseProjects(PROJECTS_CSV).projects), timeZone, allDayHours: config.allDayHours, trackFrom: config.trackFrom, today };
  const byYear = new Map<string, EventRow[]>();
  for (const row of events.flatMap((e) => eventToRows(e, ctx))) {
    const year = row.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), row]);
  }
  return Object.fromEntries([...byYear].map(([year, rows]) => [eventsFileName(year), serializeEventsFile(rows)]));
}
