# Race Day Phase 0 — offline rehearsal

Purpose: find out, before the Buffalo field test (2026-10-24/25), what the app really does when the network drops, using the phone that will be used at the rink. This is a **rehearsal on made-up data**; nothing here is run against the real Buffalo event.

## What the app does offline (and what it does not)

This is the behavior the rehearsal checks. It follows ADR-001 D7: Firestore keeps a local copy in the browser (IndexedDB), and there is **no Service Worker**.

| Situation | Behavior |
|---|---|
| A page that is **already open** loses the network | Keeps working. Everything already loaded stays on screen, and moving between the six tabs works, because the whole Race Day module is one chunk that was loaded when you first opened it. |
| A save while offline | After about 4 seconds the page says "已保存在本机,联网后会自动同步。" (English: "Saved on this device. It will sync when you are back online."). The row appears at once. The change is held on the device and sent when the network returns. |
| **Reload, or open the app, with no network** | **Fails** with the browser's own "no internet" page. The app shell is not cached. This is accepted for Phase 0 (ADR-001 D7). |
| First open of Race Day while offline | Fails: the Race Day module is downloaded the first time it is opened. Open it once while online. |
| A queued change the server later rejects | The page shows "有一项修改未能同步到服务器,已被撤销。请检查后重新录入。". This cannot be rehearsed offline; it is covered by automated tests. |
| A second tab or window of the app | Only one tab can hold the offline copy. A second tab works online only. Do not open a second tab at the venue. |
| Private / incognito browsing, or a browser without IndexedDB | No offline copy: a queued change is lost if the page is closed before it syncs. Do not use private browsing at the venue. |
| Clearing site data while changes are still queued | Loses the queued changes. Never do it. |

## Before you start

- Use the race-day phone and the normal browser (not private mode), signed in, with a throw-away event (for example "演练赛事") that has one athlete marked as yours, two races and one video record. Delete the event at the end (it deletes its results, videos and note too).
- Open **only one tab**.
- Open Race Day and visit every tab once while online (Today, Schedule, Results, Videos, Summary, Setup). Summary and Videos need PRO on.
- Have a second device (or the Firebase console) ready to look at the data from outside.

## Rehearsal steps

Record pass / fail / note for each step in the table at the end.

**A. Offline with the page open**

1. Turn on airplane mode (Wi-Fi and cellular both off). Do not reload.
2. Move through all six tabs. Expect: the data already loaded is still shown, no blank page, no crash.
3. Results: enter a result for your athlete. Within about 4 seconds expect "已保存在本机…"; the row appears with the 待确认 marker.
4. Edit that result, then mark it confirmed. Expect: the change shows on screen.
5. Schedule: add a race. Videos: add a record. Summary: save a note. Expect the same "saved on this device" message for each, and each appears on screen.
6. Today: the next race and the pending count follow the new results without a reload.

**B. Back online, same page**

7. Turn airplane mode off, without reloading. Wait up to a minute.
8. Expect: no sync-failed alert. On the second device or in the console, the result, race, video record and note from steps 3–5 are there, with the values you left (the result confirmed, as in step 4).

**C. The case that cannot be avoided: losing the page while offline** (rehearsal only; at the venue, do not do this on purpose)

9. Airplane mode on again. Enter one more result (wait for "saved on this device").
10. Reload the page. Expect: the browser's "no internet" page. This is the known limitation. Note how the phone's browser words it, so the people using it know what they are seeing.
11. Airplane mode off. Reload. Sign in again only if asked.
12. Expect: the result from step 9 is on the Results tab and on the second device, with no sync-failed alert. This proves that changes queued before a lost page are not lost.

**D. Other checks**

13. With the page open and online, check the page works when the phone is on a slow connection (for example, turn Wi-Fi off and use a weak cellular signal if you can find one): saving may show the "saved on this device" message and then sync. Note what you see.
14. Delete the throw-away event on Setup and confirm its data is gone from the console.

## Result table

| Step | Result (pass / fail / note) |
|---|---|
| 1–2 offline navigation | |
| 3 result saved offline | |
| 4 edit and confirm offline | |
| 5 race, video record, note offline | |
| 6 Today follows offline changes | |
| 7–8 sync after reconnect | |
| 9–10 reload offline (known failure) and wording | |
| 11–12 queued change survives the lost page | |
| 13 weak signal | |
| 14 cleanup | |

Device and browser (model, OS, browser name and version): ____________________

Anything other than the known limitation in step 10 is a finding. Send it before 2026-10-20 so it can be handled before the freeze on 2026-10-21.
