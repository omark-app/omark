# Philosophy

## Why Omark exists

I used Todoist for years, but only a few of its features: today and overdue together, a list for this week, a date when something has one, a someday list for the rest, repeating tasks, and a handful of reminders I wanted to see every time I opened it. I wanted that, on one page, opening in one click on my laptop and my iPhone.

I also wanted my tasks somewhere I could reach them with an AI agent. Claude Code can read and edit a Markdown file in my OneDrive. It can't easily do that with a task list locked in someone's database. So the first version of Omark Tasks kept everything in three plain files in my own OneDrive, editable in Obsidian and by Claude.

It was built in a few evenings by Claude, working through GitHub issues and pull requests in a small software factory that ships with this repo. I use it every day.

I thought about selling it as a paid app and decided against it. The people who would value it most are the ones who know what AI agents can do, and they can build their own. Open source suits it better: you can read the code and check that your data never reaches a server of mine, and you can change the app with the same factory I use.

Omark Time came from the same need. I plan my day in my calendar and do client work across several projects. I wanted the hours per project and category, and I wanted Claude to answer "how many hours on ACME last month?" from a file. The calendar already has the data, so Omark Time works on top of it.

Omark ("own" + "markdown") is the name for this family of small tools.

## Principles

These are what Omark believes. Each idea is weighed against them. There is no list of things that will never be added, because nobody knows what the future holds.

1. **Data sovereignty.** Your data lives in places you own and choose: your files, your cloud storage, your calendar. No Omark server ever stores it.
2. **Local or cloud-synced.** Keep the files in a folder on your computer or in your own cloud storage, and sync them with whatever you already use.
3. **Plain, open formats.** Markdown and CSV that any editor, spreadsheet, script or AI agent can read and write. To leave, you close the app; your files stay where they are.
4. **Built with AI, used with AI.** The repo carries its own software factory, so anyone can change the apps with an AI coding assistant, and every change goes through the same tests and review. The apps are made for people *and* their agents: the [formats](doc/format.md) and skills are documented so an agent can do the work with you.
5. **Simple over complete.** A clean, calm screen. A feature is added only when many people want it and it fits; most ideas get a friendly no. Omark should leave you with a lighter head. If using it starts to feel like maintaining a system, something went wrong.

### Each app adds one premise

- **Omark Tasks:** three Markdown files, one page with your main things, quick add. GTD without the overhead, compatible with the Obsidian Tasks emoji format.
- **Omark Time:** the calendar is where people already live with their schedules, so the tracker works on top of it and adds no second place to log time.

## How features get in

1. Anyone can post an idea in GitHub Discussions (the Ideas category) and vote for ideas with 👍.
2. Maintainers weigh the most-wanted ideas against the principles above. An idea that fits becomes a `ready` issue. One that doesn't gets a friendly no with the reason.
3. Votes show what people want; they are not a majority vote. Maintainers have the final say on what keeps Omark simple.

[GOVERNANCE.md](GOVERNANCE.md) has the details, and [CONTRIBUTING.md](CONTRIBUTING.md) how to build an accepted issue.

## Where Omark is going

Omark Tasks and Omark Time are the first two tools. Others, such as notes, may follow if they fit the same principles: plain files you own, a calm screen, and an agent that can work with you. Nothing is being built for them yet.
