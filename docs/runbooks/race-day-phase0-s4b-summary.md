# Race Day Phase 0 — S4b summary card and after-race note: behavior and manual acceptance

Scope: `/race-day/summary` (behind the S4a PRO gate). The page has two parts:

1. A **summary card**, computed live from the races and results already entered. It is never stored.
2. One optional **after-race note** ("赛后备注") per event, written by the user and stored in `raceDay/{eventId}/summaries/main`.

No ADR was needed: S4b changes no schema and no Security Rules. The `summaries` collection and its rules (`validSummary`, id `main` only) were published with S0. `firestore.rules`, `firestore.indexes.json` and `packages/schema` are unchanged and nothing has to be published.

## Behavior to know

| Topic | Behavior |
|---|---|
| PRO gate | Same as S4a: the flag is a client-side convenience, not an entitlement check and not enforced by Security Rules. The page content is not mounted behind the gate, so a free user creates no summary or results listener. |
| Who the card is about | The athlete marked "这是我自己的运动员". With none marked the card is replaced by a pointer to Setup (the note is still available). With several marked, the first by id is used and a message says which. Followed athletes are never included. |
| Pending count | The most prominent element when above zero: "N 项成绩仍待确认", with a line saying pending results may still change. |
| Fastest time | Counts **confirmed** finished results only. With none: "暂无已确认的完赛成绩". Pending times are listed per race but never become the headline number. |
| No PB comparison | `buildRaceSummary` is called without a personal best. Nothing is compared, ranked or suggested. |
| Wording | A footer says the card is a factual summary of entered data with no training, medical or technical advice, and shows the rule version (`race-summary/1`). |
| Note content | Plain text, up to 2000 characters. A note of only spaces or invisible characters is treated as empty. |
| Save | Create when no summary document exists, update when it does (chosen from the live document). Each save sets `generatedAt` and `updatedAt` from the server and records `summaryVersion`. Saving an empty note on an existing document keeps the document with no text. |
| Save disabled | While the text equals what is saved (ignoring surrounding spaces and invisible characters), and while a write is in progress. |
| Draft | Typing starts a draft that is kept if saving fails. After a successful save or delete the field follows the saved note again, so a change from another device shows up. Switching events starts from the new event's note. |
| Delete | "删除总结备注" removes the document after a second confirmation. The card is unaffected because it is computed from results. |
| Unreadable document | A summary document that fails validation is hidden: no editor, only delete is offered. |
| Cascade | Deleting an event deletes its `summaries/main` by direct reference (no query, since rules deny collection queries on summaries). Deleting a race or athlete leaves the note alone. |
| Time shown | "上次保存" is shown in the event's time zone with the zone label, falling back to UTC when the event has none. |
| Offline | Same as S2 and S3: saves are queued on the device and the page says so; a sync failure shows the shared alert. |
| Logging | Failures are logged with an operation name and error code only, never the note text. |
| Not in this slice | Sharing, export, PB comparison, the Today page, any video handling. |

## Manual acceptance (staging, `https://skatingx-platform-web.vercel.app`)

Use made-up names and note text only. Do this in Chinese and in English, on a phone-width window and on a desktop-width window.

**PRO off**

1. Open Summary: heading, "这一页需要 PRO", the "contact the administrator" line and the temporary-arrangement note, with no link. No card, no note box. Reload: "正在准备…" briefly, then the locked card, never a flash of content.

**PRO on, card**

2. **No event:** points to Setup. **Event but no own athlete:** message plus Setup link, and the note box is still shown.
3. Mark one athlete as yours, add two races, give the athlete a pending result in one and none in the other. The card shows the athlete's name, the pending banner with the count, "已录入成绩 1", and the race without a result as "还没有成绩".
4. **Fastest time.** With only pending results: "暂无已确认的完赛成绩". Mark one result confirmed on the Results tab: the fastest time shows that result only, even if a pending one is faster.
5. Add a second athlete as followed with a result: the card and counts do not change.
6. Mark a second athlete as yours: the card shows the first one and a message naming it.
7. The footer shows the disclaimer and `汇总规则版本:race-summary/1`. No advice, "AI" or "biomechanics" wording anywhere.

**PRO on, note**

8. Empty state: "还没有保存的备注。", Save disabled, no delete button.
9. Type a note, save. "上次保存" shows the time with a zone label (for Buffalo, an Eastern zone). Reload: the note is still there. Save is disabled until you change the text.
10. Edit and save again: the same single note is updated (check in the console: one `summaries/main` document, `createdAt` unchanged, `updatedAt` newer).
11. Type only spaces, or paste a zero-width space, into an empty box: Save stays disabled. Paste more than 2000 characters: "内容太长,请缩短" under the box and nothing saved.
12. Clear the text of a saved note and save: the note is empty, the document remains, and "删除总结备注" is still offered.
13. Delete asks for a second confirmation; Cancel deletes nothing. Confirm: the box empties and "还没有保存的备注。" returns.
14. With two events, type a draft in one, switch to the other: the box shows the other event's note, not the draft.
15. **Cascade.** In a throw-away event with a note, delete the event on Setup: the note document is gone from the console.
16. **Offline.** Network off, save a note: it says it is saved on this device. Network on: no sync-failed alert and the note survives a reload.
17. The page has no file chooser, no video player and no links other than Setup.
18. Other tabs behave as before.

Record the result of each step (pass / fail / note) in the PR before asking for review.

## Rollback

S4b adds code only. Reverting the merge commit restores the placeholder behind the gate. Notes already written stay in Firestore under `raceDay/{eventId}/summaries/main`, are harmless, and are ignored by the previous code (which also would no longer delete them when an event is deleted; delete them from the console if that matters).
