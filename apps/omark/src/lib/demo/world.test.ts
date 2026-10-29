import { describe, expect, it } from 'vitest';
import { areaActivity, areas, parseGoals } from '@omark/goals-core';
import { addDays, allTasks, habitsInProgress, parseDone, parseTasks } from '@omark/tasks-core';
import { eventToRows, knownCodes, parseEventsFile, parseProjects, parseTimeConfig } from '@omark/time-core';
import type { CalendarEvent, EventRow, EventTime } from '@omark/time-core';
import { demoWorld } from './world.ts';

const TODAY = '2026-10-29';
const ZONE = 'Europe/Lisbon';
const world = demoWorld(TODAY, ZONE);

const projects = parseProjects(world.root['projects.csv']!).projects;
const codes = knownCodes(projects);
const config = parseTimeConfig(world.time['config.yaml']!, TODAY).config;
const rows: EventRow[] = world.calendar.events.flatMap((e) =>
  eventToRows(e, { knownCodes: codes, timeZone: ZONE, allDayHours: config.allDayHours, trackFrom: config.trackFrom, today: TODAY }),
);
const past = rows.filter((r) => r.date < TODAY);
const hoursOn = (code: string) => past.filter((r) => r.project === code).reduce((sum, r) => sum + r.hours, 0);
const tasks = allTasks(parseTasks(world.tasks['tasks.md']!));
const done = parseDone(world.tasks['done.md']!).lines.flatMap((l) => (l.entry ? [l.entry] : []));
const doc = parseGoals(world.goals['goals.md']!);
const timeOf = (t: EventTime | null): string => (t === null ? '' : 'dateTime' in t ? t.dateTime : t.date);
const startOf = (e: CalendarEvent) => timeOf(e.start);
const endOf = (e: CalendarEvent) => timeOf(e.end);

describe('the demo world (one app spec, section 9)', () => {
  it('opens all three parts', () => {
    expect(world.root['config.yaml']).toBe('parts: [tasks, time, goals]\n');
  });

  it('has the projects NOVA (a client with a rate), COURSE and RUN', () => {
    expect(projects.map((p) => p.code)).toEqual(['NOVA', 'COURSE', 'RUN']);
    expect(projects[0]!.client).not.toBe('');
    expect(projects[0]!.rate).not.toBeNull();
  });

  it('has the four areas, a picture for two of them, and the files for those pictures', () => {
    const list = areas(doc);
    expect(list.map((a) => a.name)).toEqual(['Health', 'Family & friends', 'Work', 'Home']);
    expect(list.map((a) => a.tag)).toEqual(['health', 'family-friends', 'work', 'home']);
    const pictures = list.flatMap((a) => (a.picture ? [a.picture.path] : []));
    expect(pictures).toHaveLength(2);
    expect(pictures.map((p) => p.replace('images/', '')).sort()).toEqual([...world.pictures].sort());
  });

  it('links the course goal to COURSE and the half marathon to RUN', () => {
    const goals = areas(doc).flatMap((a) => a.goals.map((g) => ({ area: a.tag, code: g.code })));
    expect(goals).toContainEqual({ area: 'work', code: 'COURSE' });
    expect(goals).toContainEqual({ area: 'health', code: 'RUN' });
  });

  it('shows Needs update on Home only, and every other area has activity in the period', () => {
    const activity = areaActivity(doc, { done, open: tasks, rows, projects: [...codes], today: TODAY, staleAfter: 3 });
    expect(activity.map((a) => [a.tag, a.needsUpdate])).toEqual([
      ['health', false],
      ['family-friends', false],
      ['work', false],
      ['home', true],
    ]);
    for (const a of activity) expect(a.linked).toBe(true);
  });

  it('dates the course goal about six months out, while most hours go to NOVA', () => {
    const course = areas(doc).flatMap((a) => a.goals).find((g) => g.code === 'COURSE')!;
    expect(course.due! >= addDays(TODAY, 150) && course.due! <= addDays(TODAY, 200)).toBe(true);
    expect(hoursOn('NOVA')).toBeGreaterThan(4 * hoursOn('COURSE'));
    expect(hoursOn('COURSE')).toBeGreaterThan(0);
    expect(hoursOn('RUN')).toBeGreaterThan(0);
  });

  it('covers about two weeks of events, with an unknown code and the Time demo cases', () => {
    const dates = world.calendar.events.map((e) => startOf(e).slice(0, 10)).sort();
    expect(dates[0]! <= addDays(TODAY, -9)).toBe(true);
    expect(dates.at(-1)! >= addDays(TODAY, 3)).toBe(true);
    const unknown = new Set(rows.filter((r) => !r.known).map((r) => r.project));
    expect([...unknown]).toEqual(['COURS']);
    expect(world.calendar.events.some((e) => e.start !== null && 'date' in e.start)).toBe(true);
    expect(world.calendar.events.some((e) => e.response === 'needsAction')).toBe(true);
    expect(world.calendar.events.some((e) => e.response === 'declined')).toBe(true);
    // An overlap: two timed events on one day where one starts before the other ends.
    const timed = world.calendar.events.filter((e) => e.start !== null && 'dateTime' in e.start);
    const overlap = timed.some((a) => timed.some((b) => a !== b && startOf(a).slice(0, 10) === startOf(b).slice(0, 10) && startOf(a) < startOf(b) && startOf(b) < endOf(a)));
    expect(overlap).toBe(true);
    // Untracked events too (no code).
    expect(world.calendar.events.some((e) => !e.title.includes(';'))).toBe(true);
  });

  it('has today and overdue tasks, some tagged #COURSE or #RUN, and two habits under way, one tagged #family-friends', () => {
    expect(tasks.some((t) => t.date === TODAY && !t.habit)).toBe(true);
    expect(tasks.some((t) => t.date !== null && t.date < TODAY)).toBe(true);
    expect(tasks.some((t) => t.title.includes('#COURSE'))).toBe(true);
    expect(tasks.some((t) => t.title.includes('#RUN'))).toBe(true);
    const habits = habitsInProgress(parseTasks(world.tasks['tasks.md']!));
    expect(habits).toHaveLength(2);
    expect(habits.filter((h) => h.title.includes('#family-friends'))).toHaveLength(1);
    expect(done.length).toBeGreaterThan(10);
    expect(done.every((d) => d.doneOn !== null && d.doneOn < TODAY)).toBe(true);
  });

  it("has Time's hour files already, as its first sync writes them, so Goals shows hours before Time opens", () => {
    const years = [...new Set(rows.map((r) => r.date.slice(0, 4)))];
    expect(Object.keys(world.time).sort()).toEqual(['config.yaml', ...years.map((y) => `events-${y}.csv`)].sort());
    const filed = years.flatMap((y) => parseEventsFile(world.time[`events-${y}.csv`]!).rows);
    expect(filed.map((r) => r.eventId).sort()).toEqual(rows.map((r) => r.eventId).sort());
  });

  it('turns colouring on and tracks from before the first event', () => {
    expect(config.colourEvents).toBe(true);
    expect(config.trackFrom <= addDays(TODAY, -10)).toBe(true);
  });

  it('is the same for the same day, and moves with it', () => {
    expect(demoWorld(TODAY, ZONE)).toEqual(world);
    const later = demoWorld(addDays(TODAY, 7), ZONE);
    expect(later.tasks['tasks.md']).not.toBe(world.tasks['tasks.md']);
  });
});
