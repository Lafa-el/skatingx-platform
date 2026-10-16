# Race Day Phase 0 — S4a PRO gate and video records: behavior and manual acceptance

Scope: `/race-day/videos` and the PRO gate on `/race-day/videos` and `/race-day/summary`. A video record only says **which race, which athlete, and where a clip is kept**. The app never uploads, stores, plays or analyses a video file.

No ADR was needed: S4a changes no schema and no Security Rules. The `videos` collection and its rules (`validVideo`) were published with S0. `firestore.rules`, `firestore.indexes.json` and `packages/schema` are unchanged and nothing has to be published.

The summary card and the coach note are **S4b**. In S4a the Summary tab is only gated; behind the gate it is still the "not available yet" placeholder.

## Behavior to know

| Topic | Behavior |
|---|---|
| PRO gate | `/race-day/videos` and `/race-day/summary` open only when `settings/main.isPro === true`. It uses the same flag as the Settings toggle (a development flag). It is **not** an entitlement check and is not enforced by Security Rules; the page copy says it is a temporary arrangement for the race-day trial. |
| Gate states | Loading: "正在准备…" (no locked card, no content). Free: locked card with a link to Settings. Read error: locked, with a notice that the plan could not be confirmed. PRO: the page. |
| No data while locked | The page content is not mounted behind the gate, so no video listener is created for a free user. |
| Record fields | Race and athlete (required), name (required, up to 120), link (optional, up to 2048), kept at (up to 200), note (up to 1000). |
| Links | Only plain `http://` or `https://`, no spaces, no user name or password. Checked on write and again on read: a stored record with another kind of link is hidden and counted in "有 N 条数据无法读取,已隐藏". Links open in a new tab with `rel="noopener noreferrer"` and the list shows only the host. |
| Several per race and athlete | Allowed (generated id), unlike results. |
| Edit | Name, link, kept at and note. Race and athlete cannot be changed; delete and add again. |
| Verification | Video records carry no "待确认" marker: the rules do not allow provenance keys on them. |
| Cascade deletes | Deleting a race, an athlete or an event deletes its video records. The confirmation text says only the records are deleted and the files are not affected. |
| Offline | Same as S2 and S3. |

### Delete-time read for free users

Deleting a race, an athlete or an event looks up the matching video records so they can be deleted in the same operation. That query runs for every user, free or PRO, because otherwise a free user who had earlier records (PRO turned off later) would leave orphans behind. It reads the records only to delete them; nothing is shown. Nothing else reads videos for a free user.

## Manual acceptance (staging, `https://skatingx-platform-web.vercel.app`)

Use made-up names, links and locations only. Do this in Chinese and in English (Settings, language), on a phone-width window and on a desktop-width window.

**PRO off (Settings: Free plan)**

1. Open Videos and Summary. Each shows its heading, "这一页需要 PRO", the temporary-arrangement note and a link to Settings. No form, no list.
2. Reload while on Videos. You see "正在准备…" briefly, then the locked card; the page never flashes content.
3. Today, Schedule, Results and Setup are unaffected.

**PRO on (Settings: toggle PRO)**

4. Reload on Videos: no locked card appears before the page.
5. **Empty states.** No event: points to Setup. Event but no races: points to Schedule. Races but no records: "还没有视频记录…".
6. **Add a record.** Choose a race, then an athlete, type a name, a link such as `https://example.com/clip/1`, a location and a note, save. The record appears under that race at once, and the list shows `example.com` as the link text. The athlete select is cleared and the race stays chosen.
7. **Link behavior.** Click the link: it opens in a new tab. In the browser tools the anchor has `rel="noopener noreferrer"`.
8. **Bad input.** Try an empty name, `example.com/v` (no scheme), `ftp://example.com/x`, `javascript:alert(1)`, `https://a:b@example.com/` and a name of 121 characters. Each shows a message under the field, focus moves to the first problem, and nothing is saved.
9. **Several records.** Add a second record for the same race and athlete: two rows, no overwrite.
10. **Edit.** Press Edit: the form opens with the stored values, focus is in it, and race and athlete are shown but cannot be changed. Save: one row, new values.
11. **Delete.** Delete asks for a second confirmation saying only the record is deleted; Cancel deletes nothing.
12. **Cascade.** On Schedule, start deleting a race that has a record; on Setup, start deleting an athlete and an event. Each confirmation mentions video records and says the files are not affected. Cancel each. With a throw-away race that has a record, confirm the delete and check the record is gone from Videos.
13. **No files.** The page has no file chooser and no video player.
14. **Offline.** Network off, add a record: it says "saved on this device" and the row appears. Network on: no sync-failed alert and the row survives a reload.
15. **Other tabs.** Training, Analysis and Settings behave as before.

Record the result of each step (pass / fail / note) in the PR before asking for review.

## Rollback

S4a adds code only. Reverting the merge commit removes the Videos page, the PRO gate and the video cascade. Video records already written stay in Firestore (under `raceDay/{eventId}/videos`) and are harmless; the previous code ignores them, but deleting a race, athlete or event would then no longer delete them. Delete them from the console if that matters.
