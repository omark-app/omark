# Plan for #155: Maya's goals follow the career example

## What changes for users

Only the demo (`demo.omark.app` and PR previews) changes; the real app doesn't.

- **Vision**: "A career I'm proud of, with time left for family."
- **Areas**, each with a photo: *Career*, *Health*, *Family & friends*, *Money*. *Work* becomes *Career*; *Home* becomes *Money*.
- **Career**: "Head of Product" dated 31 December of next year (relative to today, like every demo date) and linked to a new project `LEAD` ("Leadership program"). The course goal (`COURSE`, about six months out) and the achieved "Ten paying clients" move here from Work, so the drift story stays: the hours still go to the client.
- **Tasks**: "Ask for a stretch project #LEAD", and a weekly habit "Weekly 1:1 notes #LEAD" with a few weeks of done history. "Ask Rita about flats in Ericeira #home" becomes "Compare savings accounts #money".
- **Time**: a few `LEAD` events in the two weeks of calendar (a leadership module, a 1:1 with a mentor), about 6 hours in all. NOVA still has most hours; nothing else in the Time demo changes.
- **Money**: "Six months of savings", set months ago with nothing linked since, so it shows **Needs update**, in place of Home.
- **Pictures**: four photos from StockSnap under CC0 1.0, re-encoded to 960x640 JPEG. They replace the two drawn pictures (`health.jpg` is replaced, `home.jpg` removed). The demo README lists each one's source page and photographer.

## Acceptance criteria

- [ ] The demo's Goals tab shows Career, Health, Family & friends and Money, in that order, and every card's photo loads.
- [ ] Career shows "Head of Product" linked to `LEAD`, with hours, its open tasks (the task and the habit both count) and the weekly habit.
- [ ] Two habits in progress, under the limit of three, so a visitor can still start one (the 1:1 notes replace the morning stretch).
- [ ] Money shows Needs update; no other area does.
- [ ] `projects.csv` has NOVA (client with a rate), COURSE, RUN and LEAD.
- [ ] Tasks and Time demos behave as before: today and overdue tasks, the unknown code COURS, all-day, overlap, invite, declined.
- [ ] One app spec section 9, the demo README, `doc/smoke-test.md` (if it names areas) describe the new world.

## Tests I'll write first

- `apps/omark/src/lib/demo/world.test.ts`: the four areas and tags, a picture for each and a file for each; LEAD in the projects; the Head of Product goal in Career linked to LEAD and dated the end of next year; Needs update on Money only; hours on LEAD above zero and below NOVA's; three habits under way, one tagged `#LEAD`.
- `apps/omark/e2e/demo.spec.ts`: the four areas, four loaded pictures, Money needing an update.
- `packages/calendar` world test (if there is one for counts): the LEAD events are there.

## Risks

- Someone who opened the demo before keeps the old world in their browser until they press Reset demo, because the demo only seeds when empty. That's how every demo change has worked so far.
- More hours in the calendar could move a Time demo check (overlaps, totals). I'll put the LEAD events where they don't overlap NOVA ones, and run the Time e2e.
- Photo licence: CC0 1.0 per StockSnap and Openverse; no attribution needed, but the README credits them anyway.

## Out of scope

- A new demo person, or changes to Tasks' and Time's own demo stories.
- Any change to the real app, the file formats or the Goals card.
- The marketing diagram itself (it lives in the private marketing repo); it will use a screenshot of this demo's Career card.
