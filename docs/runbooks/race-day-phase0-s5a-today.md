# Race Day Phase 0 — S5a Today (read-only): behavior and manual acceptance

Scope: `/race-day` (the Today tab). It replaces the "not available yet" placeholder with a **read-only** view of the selected event's current day. It writes nothing, has no PRO gate, and only arranges data entered on the Schedule, Results and Setup tabs.

No ADR was needed: S5a changes no schema, no Security Rules and no index. `firestore.rules`, `firestore.indexes.json` and `packages/schema` are unchanged and nothing has to be published. No new dependency.

## Behavior to know

| Topic | Behavior |
|---|---|
| What "today" means | The calendar day **in the event's time zone**, never the device's. Evening in New York is still "yesterday" when it is already the next day in UTC. The day rolls over at local midnight of the event's zone; an open page notices within a minute. |
| Event phases | **Race day** (today is one of the event's days): that day's races are listed. **Before**: "距离比赛还有 N 天" and the first event day is previewed. **Between** (a day inside the span that is not an event day): the next event day is previewed. **After**: points to Results and Summary and lists no races. |
| Undetermined | With no time zone, an unrecognised zone name, no event days, or an unreadable device clock, the page says it cannot tell which day is today and lists no races. It never falls back to the device's zone or to UTC. |
| Next race | The first race of the **own athlete** on the shown day that has **no result entered**. It is based on results, not on the clock: a race stays "next" until its result is entered, even after its scheduled time. A line on the page says so. |
| Own athlete | The athlete marked "这是我自己的运动员" (the first by id when several are marked, and the page names which). With none marked, every race counts, any result marks a race done, and the page says all athletes are shown. |
| Race rows | Number as on the Schedule tab, label, round and heat, the "待确认" marker, "我的比赛" for the own athlete's races, time in the event's zone or "时间待定", athlete names, and whether a result is entered. |
| Pending results | When above zero, a prominent notice "N 项成绩仍待确认" with a link to Results: the own athlete's results, or everyone's when none is marked. |
| Undated races | Races with no day are not placed on any day; a notice gives their number and points to Schedule. |
| Unreadable data | Counted in "有 N 条数据无法读取,已隐藏". |
| Read-only | No form field and no button on the page; only links and the event choice when there are several events. |
| Offline | Reads from the local cache like the other tabs; nothing is written. |
| Not in this slice | Any write, countdown to a race start, notifications, sharing, PB comparison. |

## Manual acceptance (staging, `https://skatingx-platform-web.vercel.app`)

Use made-up names only. Do this in Chinese and in English, on a phone-width window and on a desktop-width window. Steps 2–4 need an event whose days you can change; use a throw-away event for them, with the zone `America/New_York`.

1. **No event:** the page points to Setup.
2. **Before the event.** Event days in the future: "距离比赛还有 N 天", the first day's races, "下一场" shows the own athlete's first race.
3. **Race day.** Set an event day to today (in New York): "今天是比赛日。", the races of today in order, times with a zone label such as `GMT-4`, races without a time say "时间待定".
4. **After the event.** Event days in the past: "赛事已经结束", no race list, no "下一场" card.
5. **Zone check.** In a browser whose clock is not New York, confirm the day shown follows New York (late evening New York time is still the previous day).
6. **No zone.** Clear the event's time zone on Setup: the page says it cannot tell which day is today, shows "时区待确认", and lists no races.
7. **Next race.** Enter a result for the first race of the own athlete on the Results tab: the next race moves to the following one without a reload. Enter results for all of them: "这一天需要关注的比赛都已录入成绩。"
8. **Pending.** With a pending result the amber notice shows the count and links to Results; mark all confirmed: the notice disappears.
9. **No own athlete / several.** Unmark the own athlete: "…按所有运动员显示". Mark two: the page names the one shown.
10. **Undated race.** Add a race with no day: the notice appears and the race is not in the list.
11. **Pending marker.** The event and every race show "待确认" until marked confirmed; nothing is shown in a confirmed tone before that.
12. **Read-only.** There is no field or button anywhere on the page.
13. **Offline.** Network off, reload: the page still shows the cached data.
14. **Other tabs.** Schedule, Results, Videos, Summary and Setup behave as before.

Record the result of each step (pass / fail / note) in the PR before asking for review.

## Rollback

S5a adds code only and no data. Reverting the merge commit brings the placeholder back on Today; nothing in Firestore changes.
