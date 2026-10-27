# Governance

Omark is small and wants to stay that way. This page says who decides what, and how.

## Roles

| Who | Does |
|---|---|
| **Maintainers** | Turn ideas into `ready` issues; set and change issue sizes; approve plans for large work; review and merge pull requests; deploy to production; handle steps that need access to the project's accounts (`needs-human`) |
| **Contributors** (and their AI agents) | Pick a `ready` issue and comment to claim it; work in a fork; post a plan for large work and wait for a maintainer's approval; follow the [definition of done](AGENTS.md#definition-of-done); never merge |
| **Community** | Post and vote on ideas in Discussions, report bugs, answer questions |

At launch there is one maintainer, the project's founder (AL). Maintainers are the accounts with the Maintain or Admin role on the repository. A plan approval counts only when a maintainer gives it: an "approved" comment from anyone else doesn't count.

## How ideas become issues

1. An idea starts in **GitHub Discussions**, in the Ideas category. It can be vague. Anyone can vote with 👍.
2. Maintainers look at the most-wanted ideas and weigh each against [PHILOSOPHY.md](PHILOSOPHY.md).
3. An idea that fits becomes an issue, clear enough to size, labelled `ready`. One that doesn't gets a friendly no with the reason, and the discussion stays open for others to read.

Issues are for accepted work and bugs. The line between an idea and an issue is whether a maintainer has said yes.

Votes show what people want. They are not a majority vote, and there is no fixed list of what will never be added. Maintainers have the final say on what keeps Omark simple.

## Who approves and merges

- **Small issues** (a bug fix or small tweak with clear behaviour) go straight to a pull request.
- **Large issues** (anything touching file formats, sync, sign-in, CI, dependencies or a new screen) need a plan approved by a maintainer before any code. [doc/factory.md](doc/factory.md) describes the flow.
- **Only maintainers merge**, and only when every check is green and the [definition of done](AGENTS.md#definition-of-done) is met.
- **Only maintainers deploy** to production.

## Becoming a maintainer

A contributor who has had several pull requests merged, reviewed others' work well, and shown good judgement about what fits Omark can be invited by the maintainers. A maintainer who has been inactive for a long time can step back to contributor. Both are decided by the existing maintainers.

## Changing this document

Changes to governance are proposed as an issue and decided by the maintainers.
