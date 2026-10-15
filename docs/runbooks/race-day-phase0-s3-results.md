# Race Day Phase 0 — S3 results entry: behavior and manual acceptance

Scope: `/race-day/results`. Results are typed in by hand, one per race and athlete, and shown in an in-app feed that updates as soon as a result is saved. Nothing is parsed, computed or pushed. Every result starts as **待确认 / Pending**.

No ADR was needed: S3 changes no schema and no Security Rules. `firestore.rules` is unchanged and nothing has to be published.

## Behavior to know

| Topic | Behavior |
|---|---|
| Result id | `{raceId}_{rosterId}`. One result per race and athlete. |
| Create vs update | Chosen from the live list. Choosing a race and athlete that already have a result opens it for editing; saving updates it. |
| Statuses | Finished, DNS, DNF, DQ. Only a finished result has a time, place and "advanced". The form hides those fields for the other statuses. |
| Time format | `49.8`, `0:49.80`, `1:44.23`, `1:44.231`. Seconds after a minute must be below 60. At most 3 decimals. 30 minutes at most. Comma decimals, `1:30:00` and 4+ decimals are rejected with a message. |
| Time display | Two decimals (`49.80`); a third only when it is not zero (`49.123`). Typing the displayed value back gives the same time. |
| Verification | New and edited results are Pending. "标记为已确认" verifies; editing returns a verified result to Pending. |
| Athlete taken off a race | The result is kept and shown with "该运动员已不在这场比赛名单中". It is never hidden or deleted by editing a race. |
| Cascade deletes | Deleting a race deletes its results. Deleting an athlete deletes their results and removes them from every race. Deleting an event deletes all of its results. The confirmation text says so. None of it can be recovered. |
| Offline | Same as S2: a write that cannot reach the server is shown as "saved on this device" and syncs when online. A write the server later rejects shows the sync-failed alert. |

### Decimals are enforced by the app, not by the rules

Security Rules cannot check decimal places reliably, so they accept any number above 0 and up to 1800. The 3-decimal limit is enforced when writing (domain validation) and again when reading: a stored result with more than 3 decimals is hidden and counted in "有 N 条数据无法读取,已隐藏". The emulator tests document this (`tests/rules/race-day-results.rules.test.ts`).

Tightening the rules to refuse a 4th decimal would be a rules change (ADR or runbook update, owner publishes manually). It is **not** part of S3.

## Manual acceptance (staging, `https://skatingx-platform-web.vercel.app`)

Use made-up names and times only. Do this in Chinese and in English (Settings, language), on a phone-width window and on a desktop-width window.

1. **Empty states.** With no event: the page says to create one on Setup. With an event but no races: it says results cannot be entered and links to Schedule. With races but no results: the feed says there are no results yet.
2. **Enter a finished result.** Choose a race, then an athlete, type `0:49.123`, place `2`, advanced "晋级", save. The feed shows the result at the top immediately, as `49.123`, with 待确认. The athlete select is cleared and the race stays chosen.
3. **Phone keyboard.** Tap the time field on a phone: a normal text keyboard appears and `:` can be typed.
4. **Bad input.** Try `1:75.00`, `49.1234`, `30:00.001`, an empty time on a finished result, and place `0`. Each shows a message under the field, focus moves to the first problem, and nothing is saved.
5. **DNS / DNF / DQ.** Choose each status: the time, place and advanced fields disappear. Save: the feed shows the status text instead of a time.
6. **Update the same result.** Choose the same race and athlete again. The form opens with the stored values and says saving updates it and returns it to 待确认. Change the time, save: still one row, new time.
7. **Verify and un-verify.** Mark a result 已确认, then edit it: it returns to 待确认.
8. **Delete a result.** Delete asks for a second confirmation with a "cannot be undone" warning; Cancel deletes nothing.
9. **Athlete taken off a race.** On Schedule, edit a race that has a result and untick that athlete. Back on Results the result is still there with the "no longer on this race's list" note, and Edit still works.
10. **Cascade warnings.** On Schedule, start deleting a race; on Setup, start deleting an athlete and an event. Each confirmation says the related results are deleted and cannot be recovered. Cancel each. Then, with a throw-away race that has a result, confirm the delete and check its result is gone from the feed.
11. **Offline.** Turn the network off, enter a result: the page says it is saved on this device and the row appears. Turn the network on: no sync-failed alert, and the row is still there after a reload.
12. **Two devices.** With the page open on two devices, enter a result on one: it appears on the other without a reload.
13. **Other tabs.** Schedule, Setup, Training, Analysis and Settings behave as before.

Record the result of each step (pass / fail / note) in the PR before asking for review.

## Rollback

S3 adds code only. Reverting the merge commit removes the Results page and the cascade behavior. Result documents already written stay in Firestore (under `raceDay/{eventId}/results`) and are harmless; the previous code ignores them, but deleting a race, athlete or event would then no longer delete them. Delete them from the console if that matters.
