# TaskApp v1 acceptance checklist

> Historical, may be out of date. The checklist for the first v1 deploy; sign-in has changed since (the sign-in helper replaced MSAL).

Work through this after the first real deploy from `main`. Tick each box. If something does not match, note the number and what you saw.

Devices: Brave on Windows (app pinned to the taskbar) and the iPhone home-screen app.

## A. Before you start (PC)

1. [ ] Stop `pnpm dev` if it is running. Run `pnpm e2e:real:login` and sign in when the browser opens. Expect: it saves the sign-in and exits.
2. [ ] Run `pnpm e2e:real`. Expect: it passes. Write the date in the README.
3. [ ] Open the deployed address in Brave. Expect: the sign-in screen.
4. [ ] Press **Sign in with Microsoft**. Expect: you come back to the list and the status reads `saved`.
5. [ ] Install it as an app and pin it to the taskbar. Expect: it opens in its own window.

## B. Todoist import (PC)

6. [ ] Put the Todoist token in a file in `C:\Users\alipk\.secrets\`. Set it in the environment from that file. Never paste it in chat.
7. [ ] Run `pnpm --filter todoist-import start -- --out <path>`. Expect: a `tasks.md` at the path.
8. [ ] Read the warnings. Expect: you understand each one, or fix it.
9. [ ] Open the new file and look it over. Expect: tasks, dates and repeats look right.
10. [ ] Only then copy it into OneDrive `ALAI/TaskApp/tasks.md`. Expect: the app shows your tasks after a refocus.

## C. Brave on Windows (keyboard)

11. [ ] Press `/` or `n`. Expect: the add box is focused.
12. [ ] Type a task and press Enter. Expect: it lands in Today and the box stays focused.
13. [ ] Press `j`, `k`, and the arrow keys. Expect: the selection moves and the detail shows.
14. [ ] With a task selected, press `t`. Expect: Today.
15. [ ] Press `w`. Expect: This week (Today on a Sunday).
16. [ ] Press `e`. Expect: Next week.
17. [ ] Press `s`. Expect: Someday.
18. [ ] Press `d`. Expect: the date picker with Today, Tomorrow, This week, Next week, Someday and a calendar field.
19. [ ] Press `r`. Expect: the repeat picker.
20. [ ] Press Enter on a task, change the title, press Enter. Expect: saved. Shift+Enter in the title starts a note line. Esc leaves the field and saves.
21. [ ] Press `x` on a repeating task. Expect: it completes and the toast shows the next date.
22. [ ] Press Delete. Expect: it is deleted and the toast offers Undo.
23. [ ] Press `z` or Ctrl+Z. Expect: the last change is undone.
24. [ ] Press `v`. Expect: the view switches between list and Week board.
25. [ ] Drag a task between buckets and within one. Expect: it moves and a toast shows.
26. [ ] Click a task's date label. Expect: the date picker opens.
27. [ ] Press Esc with a task selected. Expect: it deselects.
28. [ ] Leave the app open over midnight. Expect: tomorrow's tasks move into Today by themselves.
29. [ ] Turn Wi-Fi off and on. Expect: status shows `offline`, then `saved` without a refocus.

## D. iPhone home-screen app

30. [ ] Open the installed app for the first time and sign in. Expect: you return to the list and the status reads `saved`.
31. [ ] Tap the + button. Expect: the add sheet with Today selected, and the keyboard opens.
32. [ ] Add a task with the Someday chip. Expect: a toast, and it is in Someday.
33. [ ] Tap a task. Expect: the edit sheet. Edit the title and add notes, then Save. Expect: the row shows `≡` for notes.
34. [ ] Tap the round check. Expect: it completes.
35. [ ] Swipe a row right. Expect: it completes.
36. [ ] Swipe a row left. Expect: the move sheet with 7 options. Pick one. Expect: it moves.
37. [ ] Swipe only a little. Expect: the row springs back and no sheet opens.
38. [ ] Tap a date label. Expect: the date picker opens, and the date wheel does not cover the Today and Tomorrow chips.
39. [ ] Hold a row for about half a second without moving. Expect: it dims and a copy follows your finger. No text selection, magnifier or system drag preview.
40. [ ] Drag the copy up and down. Expect: the page does not scroll and the bucket under your finger is highlighted.
41. [ ] Drag near the bottom edge, then the top. Expect: the page scrolls by itself, faster near the edge.
42. [ ] Drop on another bucket header, including a folded one. Expect: the task moves with a toast.
43. [ ] Drop between two rows of one bucket. Expect: it reorders.
44. [ ] Drop on Later. Expect: the date picker opens.
45. [ ] After any drop, check nothing else happened. Expect: no edit sheet opens and no bucket folds.
46. [ ] Lift a row and move it slowly down at once, across several buckets. Expect: the drag keeps going and the drop lands.
47. [ ] Flick-scroll a long list, starting on rows and between them. Expect: smooth, no lift.
48. [ ] Lift a row, then lock the phone or switch apps. Expect: on return, no stuck copy or dimmed row.
49. [ ] Scroll to the bottom. Expect: the last ALWAYS line sits above the + button.

## E. Offline and updates (both devices)

50. [ ] Airplane mode, then force-quit and reopen. Expect: tasks show, status `offline`, fonts look right.
51. [ ] Add a task offline, then go online and open the app. Expect: status `saved` and the task is in Obsidian.
52. [ ] Open on weak signal. Expect: cached list shows at once with `syncing`.
53. [ ] After a later deploy, open the app twice. Expect: the new version shows on the second open, with no reload mid-session.
54. [ ] Leave the app closed for more than 24 hours, then reopen, on both devices. Expect: at most a quick sign-in bounce, with no account picker, and your tasks are there.
55. [ ] Leave the iPhone app in the background for several hours, then edit. Expect: status reaches `saved` without a refocus.
56. [ ] In iPhone private browsing, add a task while the status reads `sign in needed` and tap it. Expect: a warning before it loses the edit.

## F. Files and other tools

57. [ ] In Obsidian, edit a task in `tasks.md` and switch back to the app. Expect: the edit shows on focus.
58. [ ] In Obsidian set `theme: dark` in `config.yaml`, then switch to the app. Expect: it goes dark. Add a typo. Expect: a banner names the line and the app keeps working.
59. [ ] Ask Claude Code to complete a task using the installed skill. Expect: the app shows it done after a refocus, and `done.md` has it.
60. [ ] Complete a task that has notes. Expect: its notes appear under its line in `done.md`.
