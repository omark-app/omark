i use todoist, but i only use these functions:
- today+overdue (one bundle)
- Later (within week)
- some specific date
- no date-> bucket called someday/maybe
- recurring tasks 
- ALWAYS (some kind of top 1-3 notes that I try to remind myself of whenever I open (something like the rules below from the inspiration))

What I use: web interface in brave browser on windows 11 laptop + iphone mobile app.

Inspiration: https://x.com/p_fabrikantov/status/2109933037261595086 screens:
![[Pasted image 20261016082007.png]]

![[Pasted image 20261016082038.png]]

![[Pasted image 20261016082127.png]]

What I'd like to build:
A super simple task app that would meet my usage criteria currently from todoist, including:
1. i can quickly fire up the app (or web app?) with 1-click and see on one page my main things.
2. I can quickly add a new task and move it to one of the buckets. 
3. each bucket has a small counter how many there are.
4. small gamification: showing counter of completed tasks: today (avg in parenthesis), last 7d (avg in parethesis),last 30d (avg in parethesis), alltime.
5. I need a very slick, lightweight, modern design that is easy to read and not claude-like;)
6. allow to interact with it using Claude Code (read/write/change tasks)

Once i test it out myself i may consider releasing it as open source or paid mobile app. so it needs to be ready for other users too and handle scale. but if the storage would be local (like markdown file in users personal cloud storage) then it might be easier. but technical architecture is TBD.

Tech requirements:
1. TDD approach
2. full automated tests: unit, integration and e2e (maybe using https://tester.army/e2e? TBD)
3. Data easily exportable 
4. Solution architecture extensible to other platforms in future: linux, omarchy, Mac, android.