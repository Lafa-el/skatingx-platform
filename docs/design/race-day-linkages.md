# 比赛日联动 Phase 1 设计稿

| 字段 | 值 |
|---|---|
| 状态 | **提议，待评审。** 评审通过前不写实现代码。 |
| 日期 | 2026-10-30 |
| 分支 | `docs/race-day-linkages-design` |
| 性质 | 纯文档，无代码改动。 |
| 依据 | `main` `082759e`；ADR-001（比赛日 Phase 0）；ADR-005 §1；ADR-008；`docs/SKATINGX_OPEN_DECISIONS.md` · DR-012 |
| 不做 | 不改任何代码、Security Rules、schema、生产数据、legacy 仓库。本文不是 ADR；第 ① 和第 ④ 步开工前各需新建 ADR（见 §6）。 |

## 0. 读法

- 机制断言的出处写成「路径 · 符号」，路径相对仓库根。符号是函数、常量、类型或 i18n key，不写行号，免得改动后失效。
- 不是代码事实的内容单独标注：owner 的决定标「决定」，本文的建议标「推荐」，必须由 owner 核对的事实标「待确认」。
- 本文所有「现状」都来自当前 `main` 的代码；没有查生产数据。凡涉及生产里实际有什么，一律不下结论。

## 1. 现状与证据

### 1.1 比赛日的数据模型与路由

入口受构建期开关控制：`apps/web/src/app/features.ts` · `isRaceDayEnabled`（`VITE_FEATURE_RACE_DAY`，缺省关）。关闭时 `apps/web/src/app/RaceDayRoute.tsx` 把 `/race-day/*` 重定向到总览，模块代码不下载。模块路由在 `apps/web/src/modules/race-day/RaceDayModule.tsx`：

| 页签 | 路由 | 页面 | 读写的数据 | 门 |
|---|---|---|---|---|
| 今天 | `/race-day` | `pages/TodayPage.tsx` | 只读：事件、名单、赛程、成绩（`packages/skating-domain/src/race-day-today.ts` · `buildTodayView`） | 免费（页面注释：no PRO gate） |
| 赛程 | `/race-day/schedule` | `pages/SchedulePage.tsx` | `races/{raceId}` | 免费 |
| 成绩 | `/race-day/results` | `pages/ResultsPage.tsx` | `results/{raceId}_{rosterId}` | 免费 |
| 视频 | `/race-day/videos` | `pages/VideosPage.tsx` | `videos/{videoId}`，只存元数据 | PRO（`components/ProGate.tsx`） |
| 总结 | `/race-day/summary` | `pages/SummaryPage.tsx` | 只读成绩，加 `summaries/main` 一条备注 | PRO（`components/ProGate.tsx`） |
| 设置 | `/race-day/setup` | `pages/SetupPage.tsx` | `raceDay/{eventId}`、`roster/{rosterId}` | 免费 |

数据都在 `artifacts/skatingx-production/users/{uid}/raceDay/{eventId}` 之下（`packages/schema/src/paths.ts` · `raceDayEvent`、`raceDayRoster`、`raceDayRace`、`raceDayResult`、`raceDayVideo`、`raceDaySummary`）。类型在 `packages/schema/src/race-day.ts`：

- `RaceEvent`：`dates: DateString[]`、`timeZone: string | null`、`venue: string | null`。
- `RaceRosterEntry`：`isSelf`、`isFollowed`、`division`、`athleteRefId: string | null`。`athleteRefId` 的注释是「Links the user's own athlete; null for followed athletes」。本人行的 `athleteRefId` 由 `modules/race-day/setup/RosterForm.tsx` 写成 `useActiveAthlete()` 的 `athleteId`。
- `RaceEntry`：`distanceId`、`label`、`day: DateString | null`、`scheduledAt`、`rosterIds`。
- `RaceResult`：`status`（`finished` / `DNS` / `DNF` / `DQ`）、`timeSeconds`（秒，最多 3 位小数，只有 `finished` 才有）、`place`、`advanced`，id 是确定性的 `{raceId}_{rosterId}`（`packages/skating-domain/src/race-day.ts` · `createRaceResultId`）。
- `RaceVideoRef`：`label`、`externalUrl`、`storedWhere`、`note`，没有任何文件字段（`firestore.rules` · `validVideo` 用 `exactKeys` 把键写死）。

模块里选「当前赛事」靠的是名字和 localStorage，不看日期：`modules/race-day/hooks/useActiveEvent.ts` · `useSelectedEvent`（记住的选择，否则按名字排第一）。也就是说，今天系统里没有「下一场比赛」这个概念。

### 1.2 成绩的确认 discipline

- 每条比赛日文档都带 `RaceDayProvenance`：`verification: "pending" | "verified"`、`source: "manual"`、`sourceNote`、`verifiedAt`（`packages/schema/src/race-day.ts`；ADR-001 D5）。创建一律 pending：`packages/firebase-client/src/firestore/race-day-codec.ts` · `encodeRaceResultCreate` 经 `pendingFields`。
- **确认是手动动作，不是系统判断。** 成绩行上的按钮文案是 `raceDay.verification.markVerified`（「标记为已确认」），反向是 `raceDay.verification.markPending`（「退回待确认」），在 `modules/race-day/results/ResultList.tsx` 里调用 `onSetVerified`，落到 `packages/firebase-client/src/firestore/race-day.ts` · `setRaceResultVerified` → `race-day-codec.ts` · `encodeVerification`：确认写 `verification: "verified"` 加服务器时间的 `verifiedAt`，退回写 `"pending"` 加 `verifiedAt: null`。
- 「对照官方来源」只是提示文案，不是代码检查：`raceDay.summary.pendingHelp`、`raceDay.today.pendingHelp`（`modules/race-day/i18n/messages.ts`）写的是「请对照官方成绩确认后，再把它们当作最终结果」。代码不验证用户是否真的核对过。
- **编辑会让确认作废。** `race-day-codec.ts` · `editedFields` 的注释是「Editing resets verification」，`encodeRaceResultUpdate` 用它，所以 `updateRaceResult` 之后成绩回到 pending。领域层同义函数是 `race-day.ts` · `markPending`。
- 规则兜底：`firestore.rules` · `validProvenance`（pending 时 `verifiedAt == null`，verified 时必须是 timestamp）和 `validResult`（`finished` 必须有 `0 < timeSeconds <= 1800`；DNS / DNF / DQ 不能有时间和名次）。
- 展示：`modules/race-day/components/VerificationBadge.tsx`，任何不严格等于 `"verified"` 的值都显示「待确认」。
- 领域层判断「已确认」只有一个函数：`race-day.ts` · `isConfirmed`。

结论：联动里凡是需要「可信成绩」的地方，判定条件都是 `isConfirmed(result)`，即 `result.verification === "verified"`。

### 1.3 纪录页的数据模型与个人最好

- 一个距离一份文档：`athletes/{athleteId}/training/main/records/{distanceId}`（`packages/schema/src/paths.ts` · `trainingRecord`），内容是 `DistanceRecordsDocument`，其中 `entries: TimeEntry[]`（`packages/schema/src/records.ts`）。`TimeEntry` 字段：`id`、`date`（`YYYY-MM-DD`）、`timeSeconds`、`note?`、`source?: "manual" | "race" | "training"`、`createdAt`、`updatedAt?`。**`source` 已有 `"race"`**，纪录页的来源下拉也有（`apps/web/src/pages/training/TrainingRecordsPage.tsx` · `SOURCES`；`shared/i18n/records-messages.ts` · `records.source.race`）。
- 可记的距离固定为 8 个：`packages/schema/src/records.ts` · `DEFAULT_TRAINING_DISTANCES`（`333m`、`500m`、`777m`、`1000m`、`1500m`、`start_half_lap`、`start_lap`、`fastest_lap`）。纪录页的标签、`useTrainingRecords` 的 `distances` 和 `latestEntryOverall` 都只遍历这个常量（`apps/web/src/hooks/useTrainingRecords.ts`）。写进别的 `distanceId` 的文档，纪录页看不到。
- 个人最好是读取时算出来的，不存：`packages/skating-domain/src/records.ts` · `getBestTime`（`entries` 里 `timeSeconds` 最小的那条，并列保留先出现的）；最近一条是 `getLatestTime`（按 `date` 降序，同日按 `createdAt`）。总览的 500m 和最快单圈两张卡经 `useTrainingRecords` 的 `getBestForDistance` 读它（`apps/web/src/pages/DashboardPage.tsx` · `getBestForDistance("500m")`、`getBestForDistance("fastest_lap")`）。
- 读取时会静默丢掉不合格条目：`records.ts` · `normalizeDistanceRecordsDocument` 过滤掉没有 `id`、没有 `date` 或 `timeSeconds <= 0` 的条目。
- 写入是读改写整个数组，没有事务：`packages/firebase-client/src/firestore/training-records.ts` · `addTimeEntry`、`updateTimeEntry`、`deleteTimeEntry`（`getDoc` 后 `updateDoc`）。条目 id 是随机的：`records.ts` · `createTimeEntryId`（`time_{时间戳}_{随机}`）。迁移来的条目 id 以 `legacy-time-` 开头（`scripts/migration/training-map.mjs`）。
- 时间显示的位数不同：纪录页用 `records.ts` · `formatSecondsToTime`，固定 `toFixed(2)`；比赛日用 `race-day-input.ts` · `formatResultTime`，两位小数，第三位非零时显示三位。所以 `49.123` 在比赛日显示 `49.123`，在纪录页显示 `49.12`。比较大小用的是完整数值，不受影响。
- 规则：这条路径落在 `firestore.rules` 的 `match /athletes/{athleteId}/{a}/{b}/{c}/{d}`（`a=training`、`b=main`、`c=records`），只对属主放行，且只排除 `equipment/main/records`。**写纪录不需要改规则。**

### 1.4 总览页现有的卡

`apps/web/src/pages/DashboardPage.tsx` 有两组卡，不是一组：

- 状态网格 9 张：运动员、积分、连续天数、今日任务、500m 最好、最快单圈最好、方案、最近兑换、最近一条纪录（`dashboard.card.*`）。
- 快捷入口 4 张：训练、分析、运动员、AI 教练（`dashboardCards` 常量）。

任务描述里的「四张卡」按这 4 张快捷入口理解。**两组里都没有比赛日。** `apps/web/src/` 里除模块自身外，只有路由、导航、图标、i18n 注册引用 `race-day`（见 §1.7）。

### 1.5 建议卡机制

- 建议是**每次渲染时从已存的分析记录推导**的，不单独存：`packages/skating-domain/src/training/analysis-feedback.ts` · `deriveTrainingFeedback`。每种来源（配速、生物力学、器材）只取最新一条（`latestFeedbackSourceByKind`），发现码命中才出卡：配速 → 速度侧重 `bounce`，生物力学 → 技术侧重 `lean`，器材 → 去器材页复核。
- 卡的类型是 `TrainingFeedback`：`set-focus`（`focus` 只允许 `bounce | lean`）和 `review-equipment`。身份键是 `trainingFeedbackKey`，格式 `{type}:{sourceKind}:{analysisId}`。
- **采纳 = 写侧重。** `apps/web/src/modules/training/plan/PlanPage.tsx` 的「采纳」调用 `setFocus(item.focus)`，即 `plan-session.ts` · `usePlanFocus` → `packages/firebase-client/src/firestore/training-plan.ts` · `setPlanFocus`，写 `training/state` 的 `planFocus` 和 `planFocusWeek`（本周周一）。侧重只对写入当周有效，下周变成「过期侧重」要重新确认（`usePlanFocus` 的 `staleFocus`）。同一天再选不会改写今天已生成的任务，新侧重从次日起生效（`setPlanFocus` 的注释）。
- **忽略 = 本次会话内隐藏。** `plan-session.ts` · `writeHiddenFeedback` 把键写进 `sessionStorage`（`HIDDEN_FEEDBACK_KEY`），计划页和分析总览共用，关掉标签页后卡会再出现。
- 渲染点有两处：计划页（`PlanPage.tsx`，所有命中的卡）和分析总览（`apps/web/src/pages/analysis/AnalysisHubPage.tsx` · `SuggestionCard`，`hub-model.ts` · `suggestionOf` 只取第一条）。分析总览会在 `focus === item.focus` 时显示「已采纳」，计划页不显示。
- 三个侧重的标题在 `apps/web/src/shared/i18n/plan-messages.ts`：`lean` 技术基础，`bounce` 速度，**`endurance` 的标题是「比赛周与恢复管理」**（`plan.focus.endurance.title`），详情「赛前唤醒、轻量技术、赛后复盘恢复」。它的 7 张日卡里周六是「比赛日」，周日是「复盘恢复」（`plan.endurance.sat.kind`、`plan.endurance.sun.kind`）。现有建议卡从不推荐 `endurance`。

### 1.6 两条视频管线与 PRO 门

| | 比赛视频（比赛日） | 分析视频（分析模块） |
|---|---|---|
| 存什么 | 只存元数据：名称、外链、「存在哪」、备注。没有文件，没有对象 URL | 什么都不存。分析在浏览器里本地跑 |
| 怎么进来 | 用户手填（`modules/race-day/videos/` 的表单，`race-day-input.ts` · `prepareRaceVideoInput`、`checkExternalUrl`，外链必须是不带账号密码的 http(s)） | 用户在页面里选本地文件：`modules/analysis/biomechanics/BiomechanicsPage.tsx` 的 `<input type="file" accept="video/*">`，`URL.createObjectURL`，离开时 `revokeObjectURL` |
| 处理 | 不处理，不播放（ADR-001 D4「Video collection ≠ video analysis」） | 本地姿态识别：`pose-engine.ts`、`releasePoseEngine`；结果只存算法版本、模型版本和关键帧时间，不存画面（`saveBiomechAnalysisRecord`；`firestore.rules` · `validBiomechAnalysisRecord` 用 `exactKeys` 把键写死） |
| 路由 | `/race-day/videos` | `/analysis/biomechanics`（`apps/web/src/app/router.tsx`） |
| PRO 门 | 有：`ProGate`，读 `settings/main.isPro`（`hooks/useProAccess.ts` → `apps/web/src/hooks/useIsPro.ts`）。这是体验门，不是安全边界（ADR-001 D4；`useProAccess` 的注释） | **代码里没有。** `apps/web/src/modules/analysis/`、`apps/web/src/pages/analysis/` 里没有任何 `isPro` / `useIsPro` 引用 |

PRO 的产品口径在 DR-012（`docs/SKATINGX_OPEN_DECISIONS.md`，2026-10-20 关闭）：PRO 含「比赛日视频记录与总结卡」和「完整分析能力」（`apps/web/src/shared/i18n/settings-page-messages.ts` · `settings.plan.benefit.videos`、`settings.plan.benefit.analysis`）。**「分析完整功能 PRO」目前只是权益文案，没有门。** 除比赛日的视频和总结外，读取 `isPro` / `useIsPro` 的只有设置页、总览的方案卡、训练的首页、学院、商店、PRO 横幅（`components/ProPlanBanner.tsx`）和语言设置，没有一处在分析模块里。

ADR-001 D4 还明确写了：「If [video analysis] is ever offered on race videos it needs its own design, user opt-in, and ADR」。

### 1.7 四处互不相读（证据）

对 `apps/web/src` 搜 `race-day`，排除模块自身和测试：只有 `app/router.tsx`、`app/RaceDayRoute.tsx`、`app/navigation.ts`、`components/NavIcon.tsx`、`layouts/icePages.ts`、`hooks/usePrimaryNav.ts`、`shared/i18n/translator.ts`（导航和语言包的注册）。没有任何训练、分析、总览代码读比赛日数据，也没有比赛日代码写训练数据。

- 总结卡只算本赛事：`modules/race-day/pages/SummaryPage.tsx` 调 `buildRaceSummary({ self, races, results })`，**没有传** 可选参数 `personalBestSecondsByDistanceId`（`race-day.ts` · `RaceSummaryInput` 的注释是「Context only; never auto-written」），所以 `deltaToPersonalBestSeconds` 永远是 `null`。
- 比赛成绩不进训练纪录：ADR-001 D4 的非目标写着「automatic PB sync」，D5 写着「Results never auto-write to PB records in Phase 0. "Super 1500m" is not in `DEFAULT_TRAINING_DISTANCES`; mapping is deferred」。

### 1.8 与任务描述不完全一致的地方（先说清楚，评审时按这里的事实为准）

1. 总览有 9 张状态卡加 4 张快捷入口，不是只有四张（§1.4）。
2. 分析模块没有 PRO 门（§1.6）。所以联动 ④ 的「两侧 PRO 门叠加」，今天只有一侧（比赛视频页）是真实的门。
3. 联动 ① 与 ADR-001 D4 / D5 直接冲突（Phase 0 把自动同步 PB 列为非目标）。按 AGENTS.md，实现前必须新建 ADR（§6）。
4. 「当前赛事」今天按名字选，不按日期（§1.1），联动 ②③ 需要新的按日期取法。

## 2. 四条联动

四条的共同约束：

- 都只在 `isRaceDayEnabled()` 为真时生效。开关关闭时，总览、计划页、纪录页的行为和读取与今天完全一致。
- 读写都走 repository / service 层，不在组件里写 Firestore 查询（AGENTS.md「Architecture」）。跨模块只用 `packages/firebase-client` 已公开的函数和 `packages/skating-domain` 的纯函数，不 import 对方模块内部文件。
- 展示未经确认的数据一律带「待确认」（AGENTS.md「Privacy and video analysis」；ADR-001 D5）。

### 2.a 成绩 → 纪录（已拍板：自动同步）

#### 触发点：成绩「已确认」，不是「已录入」

**决定的定义**：一条成绩进入纪录，当且仅当

`isConfirmed(result)`（即 `result.verification === "verified"`）且 `result.status === "finished"` 且 `result.timeSeconds` 是数字。

- 录入（`createRaceResult`）和编辑（`updateRaceResult`）写出的都是 `pending`，不触发任何纪录写入。
- DNS / DNF / DQ 即使被标为已确认，也不同步（它们没有时间，`validResult` 也不允许有）。
- 退回待确认（`setRaceResultVerified(..., false)`）和编辑，都使这条成绩离开「应同步」集合，已同步的条目随之移除（见「删除与退回传导」）。

#### 同步的对象：只同步本运动员的成绩（推荐，并论证）

规则：只处理 `isSelf === true` 且 `athleteRefId !== null` 的名单行，多条本人行时取 `rosterId` 排第一的那条，与总结页和今天页的选法一致（`modules/race-day/lib/summary.ts` · `pickSelfAthlete`；设置表单不阻止勾选多条本人行，见该函数注释）。`athleteRefId` 不为空是同步额外加的条件，`pickSelfAthlete` 本身不检查它。成绩写进 `athleteRefId` 指向的那位运动员的纪录，不使用当前 `activeAthleteId`。

理由：

1. 纪录按 `athleteId` 分文档（`paths.trainingRecord`）。名单里被关注的运动员 `athleteRefId` 为 `null`（`RaceRosterEntry` 的注释），没有可写入的纪录文档，没有归属就不能写。
2. 名单上的其他人是别人的孩子。他们的成绩是为了在比赛现场看对手，写进本运动员的个人最好会直接污染 PB，也把第三方未成年人的数据带进了不属于他们的账户内的另一处。
3. 本人行的 `athleteRefId` 在创建时已经固定（`RosterForm.tsx`），比「当前激活的运动员」稳定；用户之后切换运动员不会让成绩落到别人名下。

备选：名单上所有人都同步，各建运动员纪录。代价是要给被关注者新建运动员实体和纪录文档，没有数据模型，违反上面 1、2。不采纳。

边界：本人行的 `athleteRefId` 为 `null`（旧数据）时，不同步，成绩行显示原因（见「可见状态」）。

#### 距离映射

映射依据是赛程行的 `distanceId`（`RaceEntry.distanceId`）。它由 `modules/race-day/schedule/RaceForm.tsx` 用 `records.ts` · `normalizeDistanceId(label)` 生成，模板里的值是写死的（`packages/skating-domain/src/race-day-templates.ts` · `BUFFALO_2026_TEMPLATE`：`500m`、`500m`、`1000m`、`super_1500m`）。映射表写死成一张纯函数查表，不做字符串猜测：

| 赛程 `distanceId` | 纪录 `distanceId` | 说明 |
|---|---|---|
| `500m` | `500m` | 直通 |
| `1000m` | `1000m` | 直通 |
| `1500m` | `1500m` | 直通 |
| `777m` | `777m` | **决定：直通。** `DEFAULT_TRAINING_DISTANCES` 已有 `777m`，纪录页有这一页，没有理由特殊处理 |
| `333m` | `333m` | 同上，已有纪录页。任务清单没提，这里一并写死，免得实现时临时决定 |
| `super_1500m` | `1500m` | **推荐：归入 `1500m`，条目的 `note` 保留 `Super 1500m` 字样。**见下 |
| 其他任何值 | 不同步 | 起跑、单圈、最快单圈不是比赛项目；自定义标签没有对应纪录。成绩行显示「项目无法对应纪录」 |

`Super 1500m` 的归属：

- 推荐归入 `1500m`。距离相同，纪录页的个人最好就是「这个距离跑过的最快时间」（`getBestTime`）；条目 `note` 写明赛事与项目名，纪录列表里看得出来。
- **待确认（owner）**：`Super 1500m` 是否就是普通的 1500m 距离、同赛道，成绩可以和 1500m 的 PB 直接比较。代码和文档里没有这个事实（ADR-001 只写了「deferred」）。若 owner 答「不可比」，映射表里这一行改成「不同步」，**不新建 `super_1500m` 纪录文档**。理由：纪录页只遍历 `DEFAULT_TRAINING_DISTANCES`，多出来的文档在纪录页和总览都不可见；把它加进常量会改纪录页的页签和 `ensureDefaultDistanceRecords` 的建档行为，超出本联动范围（§4）。
- 备选：新增 `super_1500m` 距离。代价如上，不采纳。

映射结果不在表里，或者 `distanceId` 因用户改标签而变了，下一次对账会把已同步的条目移除（见下）。

#### 时间与日期的换算

- **时间不需要换算格式，两边都是秒。** `RaceResult.timeSeconds` 和 `TimeEntry.timeSeconds` 同单位。比赛日的录入用严格解析（`race-day-input.ts` · `parseResultTime`，`m:ss.fff` 或秒，最多 3 位小数，换算成整数毫秒后再除，不产生 `49.12299999`），纪录页的宽松解析（`records.ts` · `parseTimeToSeconds`）也保留 3 位。同步直接取已存的数字，不重新解析。
- 范围一致：比赛日 `0 < t <= 1800`（`RACE_DAY_LIMITS.resultTimeMaxSeconds`、`validResult`），纪录页 `MAX_RECORD_SECONDS = 60 * 30`。任何不满足的值不同步，不修正。
- 显示位数的差别（`49.123` 与 `49.12`）见 §1.3。不改纪录页的显示，只在同步条目的 `note` 里不额外重复时间。
- **日期**：`TimeEntry.date` 必填。取 `race.day`；`race.day` 为 `null` 时，仅当事件只有一个日期（`event.dates.length === 1`）才取它；否则**不同步**并提示「缺少比赛日期」。不猜（ADR-001 D5「never guessed」）。`race.day` 本身是事件时区下的日历日，不再换算。

#### 条目 id 与幂等

- **条目 id = `race_{eventId}_{raceId}`。**`eventId`、`raceId` 都是 `isValidRaceDayId` 允许的小写字母、数字、连字符，不含 `_`，所以拼接可无歧义地拆回。它与随机的 `time_…` 和迁移的 `legacy-time-…` 不会相撞。
- 为什么不用结果文档 id `{raceId}_{rosterId}`：纪录是按运动员分的，同一场比赛对一位运动员只该有一条。名单行被删了再重建，`rosterId` 会变，结果 id 也变，用它会重复；用赛事加比赛就不会。
- 写入是 upsert：id 已存在则更新 `timeSeconds`、`date`、`note`、`updatedAt`，保留 `createdAt`；不存在则追加。重复确认、确认后再确认，都落到同一条。
- `source` 固定为 `"race"`（`TimeEntrySource` 已有）。`note` 写 `{event.name} · {race.label}`，纯数据，不拼语言相关的词。
- 同步只动 id 以 `race_` 开头的条目，不碰手填和训练来源的条目，也不碰迁移条目。

#### 怎么同步：对账，不是一次性事件钩子（推荐）

条目数组要读改写，而比赛日是为信号差的场地设计的（ADR-001 D7、`modules/race-day/lib/write.ts` · `settleWrite` 把写入排队），所以不把同步挂在「点确认」的瞬间。

推荐：一个**幂等的对账函数**，由确认状态决定「应有哪些条目」，再和纪录里 `race_` 开头的条目比对，差多少补多少：

1. 读所有事件，及每个事件的赛程、名单、成绩。
2. 算出应同步集合：每条满足触发条件的成绩，经映射表和日期规则，得到 `(athleteRefId, 纪录 distanceId, 条目)`。**纯函数，放 `packages/skating-domain`，单独测试。**
3. 对每个涉及的纪录文档，在一个事务里读出 `entries`，增、改、删 `race_` 条目，再写回。
4. 返回成功、跳过（附原因）、失败的计数。

触发时机（沿用步骤 ② 的「单一触发点」思路）：一个挂在 `RaceDayLayout` 的 hook，在模块进入时、浏览器恢复在线时、以及确认、退回、编辑、删除类写入落地（`WriteOutcome.kind === "saved"`）之后各跑一次，带在途标记防重入。

安全约束（遵循 AGENTS.md 迁移脚本的「停止条件」精神）：

- 任何一个事件的赛程、名单或成绩读失败或有无效文档，对这个事件**只增改、不删除**；事件列表本身读失败则整次不动。读不全不能当成「不存在」。
- 事务内重读，以事务内的数组为准，不覆盖用户手填的条目。
- 对账函数自己不写比赛日文档，只写纪录文档。

备选：

- **B. 确认时在同一个事务里同时写成绩和纪录。**原子，但事务离线不排队（`training-plan.ts` · `setPlanFocus` 的注释是「Not a transaction … a plain write is queued … when offline」），会让比赛现场确认成绩在断网时失败，与 ADR-001 D7 冲突；而且覆盖不了「删赛程、删名单、删赛事」引起的级联删除。
- **C. 云函数监听成绩文档。**仓库没有 Functions，也不在标准栈里（AGENTS.md「Required stack」），不引入。

代价（推荐方案）：同步是最终一致，不是瞬时。离线确认的成绩，要等应用在线且打开过比赛日才会进纪录。每次进入比赛日读一遍全部事件，数据量小（ADR-001 D6：每个赛事不到约 50 文档）。

#### 删除与退回传导：数据跟着来源走（决定的原则，下面是落地）

纪录里的 `race_` 条目是成绩的**派生数据**，来源不在了或不再可信，它就不该留着：

| 来源的变化 | 同步的纪录条目 |
|---|---|
| 成绩被删（`deleteRaceResult`） | 移除 |
| 成绩退回待确认，或被编辑（编辑必然回到待确认） | 移除；重新确认后按新值加回。净效果是**一条，不重复** |
| 赛程行被删（`deleteRace` 会连带删该场成绩和视频） | 移除 |
| 名单行被删（`deleteRosterEntry` 会连带删该人成绩） | 移除 |
| 赛事被删（`deleteRaceEvent` 递归删子集合） | 移除 |
| 赛程行的项目被改成映射表以外 | 移除 |
| 对账时来源读不全 | **不动**（见安全约束） |

推荐「移除」而不是「保留为独立纪录」的理由：成绩被改，说明原值可能是错的，留着会让一个错误的 PB 长期可见；而且删除赛事时应该清干净，不留下指向不存在来源的孤儿条目。

备选 1：成绩被编辑时保留旧的已确认值，直到重新确认才覆盖。代价：纪录里短暂留着用户自己刚改过、因此可疑的数字。备选 2：纪录一旦生成就归用户所有，不随来源删除。代价：来源不可追溯，错的 PB 无法自愈。均不采纳。

**纪录页的配合（唯一的纪录页改动，且不碰个人最好计算）**：`id` 以 `race_` 开头的条目，纪录页把「编辑」「删除」换成一行说明「来自比赛日成绩，请在比赛日里修改」。原因：对账会把手改的值改回、把手删的条目补回，让按钮可用只会让用户困惑。这只是列表行的按钮，不涉及 `getBestTime` 等计算。规则管不了（属主可写），所以这是体验层的约束，由对账兜底。

#### 个人最好：自然得出，同步不碰

个人最好仍由纪录页和总览现有的 `getBestTime` 在读取时对 `entries` 取最小值。同步只负责增、改、删条目。因此：

- 确认一条更快的成绩，PB 自动变快；退回或删除，PB 回到剩下条目的最小值。
- 总览的「最近一条纪录」（`latestEntryOverall`）会出现比赛条目，这是预期行为。
- 总结页的 `personalBestSecondsByDistanceId` 参数仍然不接（§4）。

#### 可见状态

成绩行（`results/ResultList.tsx`）对已确认的行加一行小字，只有四种：「已记入纪录（500m）」「未记入：项目无法对应纪录」「未记入：缺少比赛日期」「未记入：没有关联本人运动员」。同步失败时显示可重试的提示（`role="status"`），错误细节只进日志，不进界面。「标记为已确认」按钮旁加一句「确认后会记入纪录页」，让用户在点之前就知道它会改 PB。文案进统一 i18n，不硬编码。

#### 规则与数据

- 不改 `firestore.rules`：纪录路径本来就是属主可写的自由形状（§1.3）。
- 不新增字段、不新增集合：条目用现有 `TimeEntry` 字段。`schema` 里 `TimeEntrySource` 不变。
- 需要新的 Emulator 测试覆盖：对账的增、改、删、读不全不删、重复运行不变。

### 2.b 总览 → 下一场比赛卡

**推荐**：总览状态网格加一张只读卡，内含「下一场」和「上一场」两块。**不写任何数据。**

取法（以 `RaceEvent.dates` 为准，写死）：

- 对每个事件取 `first = min(dates)`，`last = max(dates)`。读入时 `race-day-codec.ts` 只检查 `dates` 是字符串数组（`isStringArray`），不检查日期格式，所以纯函数自己丢弃格式不合法的日期；没有任何合法日期的事件不参与「下一场、上一场」，也不触发 ③ 的建议卡（这类事件在比赛日设置页里仍可见和修改）。
- 「今天」：事件时区已知时用 `race-day-today.ts` · `eventPhase`（事件所在时区的日历日，不是设备时区，ADR-001）；时区为 `null`（模板创建的事件就是 `null`）时，卡上只显示日期，不显示倒计时，并标「时区待确认」。
- **下一场**：`last >= 今天` 的事件里 `first` 最小的一个；并列按 `eventId`。正在进行的事件（`first <= 今天 <= last`）算下一场，标「进行中」。
- **上一场**：`last < 今天` 的事件里 `last` 最大的一个；并列按 `eventId`。
- 没有任何事件时显示空状态，并链到 `/race-day/setup`。

卡片内容：

- 下一场：事件名、日期区间（`shared/i18n/format.ts` · `formatCalendarDate`）、场馆（`venue` 为 `null` 则不显示）、本人的组别（本人行的 `division`）、倒计时（仅时区已知）、事件的「待确认」标记（`VerificationBadge` 对应的 `verification`）。
- 上一场：事件名、日期，以及本人最近的至多 3 条成绩（项目名、时间、名次，每条带已确认或待确认标记）。**不用总结卡的内容**（`buildRaceSummary` 的对比和差值），因为总结卡属于 PRO；成绩页是免费的，所以这里只展示成绩页本来就免费展示的内容。
- 点击进 `/race-day`（下一场）或 `/race-day/results`（上一场）。

实现要点：

- 读取用 `packages/firebase-client` 已公开的订阅函数（`subscribeToRaceEvents`，以及对涉及的事件用 `subscribeToRoster`、`subscribeToRaces`、`subscribeToRaceResults`），写在 `apps/web/src/hooks/` 的一个 hook 里，不 import `modules/race-day/` 内部文件；取法本身是 `packages/skating-domain` 里的纯函数（输入事件列表和「今天」，输出下一场、上一场），单独测试。
- 开关关闭时不订阅；事件列表就绪前显示加载，读失败显示错误，空显示空状态（AGENTS.md：每个功能切片至少覆盖正常、空、错误、权限拒绝）。
- 订阅在卡卸载时释放。文案进 `dashboard-messages.ts`，比赛日的文案包不进主包。

备选：只在比赛日「今天」页里显示（那页已经有 `eventPhase`）。代价：用户不进比赛日就看不到，联动的意义没了。另一备选：做两张卡。代价：占位翻倍，上一场只是附加信息。

代价：总览多至多 5 个监听（事件列表 1 个，下一场的名单 1 个，上一场的名单、赛程、成绩 3 个）。数量上限固定，且在开关关闭时为 0。

**步骤 ② 的实现口径（已按评审定的取法实现，以代码为准）**：

- 纯函数在 `packages/skating-domain/src/race-day-overview.ts`：`pickNextAndPreviousEvents`（下一场、上一场）、`recentOwnResults`（上一场里本人最近至多 3 条成绩）、`ownRosterEntry`（本人行：`isSelf`，多行取 `rosterId` 最小的）。
- 时区为 `null`、或时区名不是真实时区、或时钟不可读的事件：「今天」用设备日历日比较，不显示倒计时，卡上标「时区待确认」。上一场也同样标，因为它「已结束」是按设备日判断的。
- 成绩按比赛日倒序，无比赛日的排最后，同日按 `raceId` 升序（代码单元序，各设备一致）。DNS / DNF / DQ 也算成绩，显示状态而不是时间。
- 卡片是独立的懒加载块（`React.lazy`），只在开关打开时才请求。原因：订阅函数所在的 `firebase-client` 比赛日代码、校验和解析器共约 33 kB，直接静态引用会进主包。这些代码与比赛日模块共用同一个共享块，所以开关打开时总览多下载约 33 kB（gzip 约 10.6 kB），比赛日模块本身的总下载量基本不变。
- 读失败（含权限拒绝）显示错误，不显示成「没有比赛」；无法通过校验的赛事文档只计数，在卡底提示「有 N 条无法读取」。

### 2.c 日程 → 侧重建议

**推荐**：临近比赛时在计划页自动推一张建议卡，建议把本周侧重设为「比赛周与恢复管理」（`endurance`）。沿用现有建议卡的采纳与忽略语义，不改它们。

**建议的侧重**：`endurance`。模板里周六是比赛日、周日是复盘恢复（§1.5），与「赛前一周」天然对应。

**触发阈值（决定的定义）**：以设备本地日期为准（计划周本来就按设备本地算：`usePlanFocus` 用 `mondayOfWeek(todayDateString())`），满足下面全部条件时出卡：

1. 存在事件，`first = min(dates)`。
2. `mondayOfWeek(first) === mondayOfWeek(今天)`，即比赛和今天在**同一个计划周**。
3. `今天 <= last`。
4. 本周侧重不是 `endurance`（已经采纳就不再推）。

等价于：比赛那一周的周一起出卡，一直到最后一个比赛日。取「同一周」而不是「赛前 N 天」，因为侧重只对写入当周有效（`planFocusWeek`），在上一周的周日设了，到周一就过期，反而要重确认。若第一个比赛日落在周一或周二，卡仍会出，但模板前几天的内容已经过去；这是模板按周一到周日排的固有限制，不在本联动处理。

**比赛结束后建议是否自动消失：会，不需要额外代码。**建议是每次渲染时推导的，不存储（与 `deriveTrainingFeedback` 同一机制）：`今天 > last`，或进入下一个计划周，条件 2 或 3 就不成立，卡随之消失。

**采纳与忽略**：

- 采纳：`setFocus("endurance")`，即 `usePlanFocus` → `setPlanFocus`，和现有卡完全一样；之后由步骤 ② 的生成触发按 `endurance` 模板生成任务。
- 忽略：写入 `sessionStorage`（`HIDDEN_FEEDBACK_KEY`），仅当次会话有效。身份键沿用 `trainingFeedbackKey` 的格式，用 `set-focus:race:{eventId}`。

**未确认数据的标注**：卡上显示事件名和日期；事件 `verification === "pending"` 时加「赛事日期待确认」，因为这个建议是按日期触发的。

**实现要点**：

- 纯函数 `deriveRaceWeekFeedback(events, today, currentFocus)` 放 `packages/skating-domain/src/training/`，返回至多一张卡；`TrainingFeedback` 增加一个 `sourceKind: "race"` 的 `set-focus` 变体，`focus` 允许 `endurance`，用 `eventId` 标识来源（现有变体用 `analysisId`，不能硬塞）。
- 计划页订阅事件列表，用 `subscribeToRaceEvents`，读失败时和现有建议一样显示「读不到」，不当作没有比赛。
- **只在计划页出卡**，分析总览的 `suggestionOf` 不改（它只取第一条分析建议，卡位有限；比赛周建议属于训练安排，不属于分析）。

备选：赛前固定天数（例如 7 天内）出卡。代价：跨周时会推一个下一天就过期的侧重。另一备选：比赛当周自动把侧重设成 `endurance`，不征求同意。代价：用户的周计划被系统静默改写，违背现有「采纳才生效」的语义。均不采纳。

代价：计划页多一个事件列表监听，开关关闭时为 0。

**步骤 ③ 的实现口径（已按评审定的取法实现，以代码为准）**：

- 纯函数 `deriveRaceWeekFeedback(events, today, currentFocus)` 在 `packages/skating-domain/src/training/race-week-feedback.ts`，返回至多一张卡（数组）。多个事件同时满足条件时取 `first` 最小的一个，并列按 `eventId` 升序（代码单元序）。卡的数据是 `RaceWeekFeedback`：`sourceKind: "race"`、`eventId`、事件名、`firstDay`、`lastDay`、`datesPending`。`deriveTrainingFeedback`（分析建议）的返回类型收窄为 `AnalysisTrainingFeedback`，行为不变；分析总览只改了这一个类型名。
- 触发条件以 `first` 所在的计划周为准：开始于上一周、跨入本周的事件（例如周六开始、下周一结束）在下周一不出卡。这是设计稿条件 2 的字面结果。
- 卡在三种情况下不出：本周侧重还没读到（训练状态加载中）、训练状态读失败（侧重未知）、本周侧重已是 `endurance`。前两种是为了不在「其实已经是 `endurance`」的周里闪出一张卡。
- 事件读取在 `apps/web/src/hooks/useRaceWeekEvents.ts`：只有一个监听，`isRaceDayEnabled()` 为假时不订阅，卸载时释放；订阅函数放在单独的 `raceWeekSubscribe.ts`，用 `import()` 加载，开关关闭时这部分代码不会进入计划页的构建产物，也不会被下载（开关关闭的构建里该块被整体去掉）。
- 比赛周建议是计划页上独立的一节，放在「来自分析的建议」之前，标题为「比赛周建议」，而不是并入「来自分析的建议」，因为后者的标题对一张来自比赛日的卡不成立。读失败时这一节只显示「比赛周建议暂时读不出来」，分析建议照常显示。
- `isRealDateString` 从 `race-day-input.ts` 原样移到 `calendar-date.ts`，并从原处重新导出，所有已有 import 不变。目的：计划页只需要这一个检查，留在 `race-day-input.ts` 里会把比赛日表单校验整个拉进计划页。

### 2.d 视频 → 分析

**推荐：深链加上下文横幅，不复制、不上传、不建草稿。**视频页每条记录加一个「去分析」入口，跳到 `/analysis/biomechanics`；用户在分析页自己选本地文件。

**为什么只能是这种形态**（以现有存储形态和管线为准）：

- 比赛视频记录里**没有视频**，只有名称、外链和一段「存在哪」的文字（§1.1 的 `RaceVideoRef`，`validVideo`）。分析需要浏览器里有视频的字节来取帧（`BiomechanicsPage.tsx` 的 `<video>` 加 `createObjectURL`）。外链是别人的网站，浏览器读不到它的画面，也不应该去读。
- 「建分析草稿」不成立：分析没有草稿概念，分析记录只在做完后一次性保存（`saveBiomechAnalysisRecord`），且规则把记录的键写死（`validBiomechAnalysisRecord` 的 `exactKeys`），没有地方存比赛关联。要存就得改 schema 和规则，需要另外的 ADR。
- 「复制元数据」同理：复制到哪里没有落点。

**流程**：

1. 视频页（PRO 页）每条记录一个「去分析」链接，`/analysis/biomechanics?raceVideo={eventId}.{videoId}`。URL 里只带两个 id，不带外链、不带名字、不带运动员信息。
2. 分析页读到该参数，先用 `isValidRaceDayId` 校验，再通过 repository 读这条视频记录，显示一条只读横幅：比赛、项目、视频名称、「存在哪」、以及外链（走 `externalUrlHost` 的同一条校验，只有普通 http(s) 才变成链接）。读不到或校验失败，不显示横幅，页面照常可用。
3. 用户自己下载或找到文件，用页面现有的文件选择框选择，之后与普通分析完全一样，本地处理，不上传（AGENTS.md「Privacy and video analysis」；ADR-001 D4）。
4. 保存分析记录时**不带**比赛关联。

**这满足 ADR-001 D4 对「用户明确选择」的要求**：入口是用户主动点击，文件是用户自己选的，没有任何自动读取。

**PRO 门如何叠加**：

- 入口在 `/race-day/videos`，已经在 `ProGate` 后面（比赛视频 PRO）。非 PRO 用户看不到入口，也不会挂载任何视频监听（`ProGate` 的注释）。
- 目标页 `/analysis/biomechanics` 今天**没有门**（§1.6）。深链不需要自己的判断：它落在同一个页面上，将来分析页加了「完整功能」的门，深链自动继承，两处不会各写一份。
- 非 PRO 用户手动输入这个深链地址：横幅需要读 `videos` 子集合，那份读取只在 PRO 页里挂载；分析页的横幅读取同样要先过 `useIsPro`，不是 PRO 时不读、不显示横幅，页面照常（体验门，不声称是安全边界，沿用 ADR-001 D4）。
- 不新增任何 `isPro` 的写入。

备选：在分析页里直接播放外链视频。代价：跨域取不到像素，无法分析；还会把用户的外部链接当成可信来源去加载。备选：把比赛视频字节上传到存储再分析。代价：违反「视频不上传」的隐私默认，需要独立的数据处理设计。均不采纳。

代价：用户要自己再选一次文件（一步额外操作）。这是不上传视频的直接后果，推荐接受。

## 3. 实施分步

按价值排序。每一步独立成 PR、独立可回滚；①④ 开工前先有 ADR（§6）。

| 步 | 内容 | 验收要点 | 独立回滚 |
|---|---|---|---|
| ① 成绩 → 纪录 | ADR；`skating-domain` 的映射与对账纯函数；`firebase-client` 的对账 service；`RaceDayLayout` 的触发 hook；成绩行状态文案；纪录页 `race_` 条目的按钮替换 | 录入成绩不写纪录；确认后出现且只出现一条 `race_{eventId}_{raceId}`，`source` 为 `race`；重复确认、重复运行不增加条目；编辑回到待确认后条目移除，重新确认后是新值、仍只一条；删成绩、删赛程、删名单、删赛事后条目消失；读不全时不删；被关注者的成绩不进纪录；`Super 1500m` 按 owner 的结论映射；缺日期、缺关联、未映射都有可见原因；个人最好随之变化且 `getBestTime` 未改；Emulator 测试覆盖允许与拒绝；开关关闭时纪录页行为不变 | revert 该 PR 即可。**已写入的 `race_` 条目是惰性数据**：留在纪录里不影响 PB 计算，需要时可用一次只读审计加一次受控脚本清理（另立任务，默认 dry-run） |
| ② 总览卡 | 纯函数「下一场、上一场」；`apps/web/src/hooks/` 的只读 hook；总览一张卡；`dashboard-messages.ts` 文案 | 零写入；下一场与上一场取法符合 §2.b；时区为空时不显示倒计时；待确认标记；加载、空、错误三种状态；监听卸载时释放；开关关闭时总览与今天一致；主包体积变化已记录；中英、手机与桌面截图 | revert 即可，无数据变更 |
| ③ 日程 → 侧重建议 | 纯函数 `deriveRaceWeekFeedback`；`TrainingFeedback` 新变体；计划页订阅事件并渲染；文案 | 阈值与消失条件符合 §2.c（含周一、比赛日当天、比赛后一天的用例）；采纳设侧重 `endurance`；忽略仅当次会话；已是 `endurance` 时不出卡；事件读失败不当成无比赛；分析总览的建议不变；开关关闭时计划页与今天一致 | revert 即可，无数据变更 |
| ④ 视频 → 分析 | ADR；视频页入口；分析页横幅；两处的 `isPro` 与参数校验 | 入口只对 PRO 可见；深链只带两个 id；非法或读不到时无横幅且分析页正常；分析流程与保存不变（不带比赛关联）；视频不上传、不持久化对象 URL；横幅的外链只在普通 http(s) 时成链接 | revert 即可，无数据变更 |

①②③④ 之间没有代码依赖：② 和 ③ 都只读事件，① 写纪录，④ 只加入口。顺序只按价值排。

## 4. 不做事项

- 不改比赛日录入流程本身：成绩、赛程、名单、视频的表单、校验、确认按钮的语义都不变；只在成绩行加状态文字和一句提示。
- 不改纪录页的个人最好计算（`getBestTime`、`getLatestTime`、`useTrainingRecords` 的取值逻辑）。唯一的纪录页改动是 `race_` 条目的按钮替换，且只在步骤 ① 内。
- 不改规则文件。四条联动都不需要新的写入形状：纪录路径本来属主可写，②③ 只读，④ 不持久化。若评审要求「保存分析记录时带上比赛关联」，那需要改 `validBiomechAnalysisRecord`，属于另一份设计。
- 不动视频存储方式：不上传，不新增文件字段，`RaceVideoRef` 不变。
- 不碰日志 UI（尚不存在）。
- 不把总结卡接入个人最好（`personalBestSecondsByDistanceId` 继续不传）。总结卡是 PRO，纪录是免费，混用会让两边的门不一致，需要另议。
- 不新增云函数、不新增依赖。
- 不引入「被关注运动员」的纪录。
- 不处理 `athleteRefId` 变更后旧运动员名下的 `race_` 条目（见 §5）。

## 5. 风险与待确认

| 项 | 说明 | 处理 |
|---|---|---|
| **待确认（owner）** `Super 1500m` | 是否与 1500m 同距离、可比 | 在评审时给结论；默认归入 `1500m`，答「否」则该项不同步 |
| 编辑即移除 | 编辑已确认成绩会让纪录里该条暂时消失，PB 可能回退到更慢的值，直到重新确认 | 已在 §2.a 论证并列了备选；成绩行提示「确认后会记入纪录页」让用户知情 |
| 最终一致 | 离线确认的成绩，要等在线且进过比赛日才进纪录 | 可见状态里区分「已记入」和「等待同步」 |
| 确认是手动的 | 代码不核对官方来源（§1.2），所以「已确认」只代表用户点了按钮 | 联动只用这个字段，不声称核对过；文案用「已确认」，不用「官方」 |
| 事件日期是待确认的 | 模板创建的事件日期是公开信息，仍是 pending（`race-day-templates.ts`），时区为 `null` | ②③ 在卡上标注，时区未知不显示倒计时 |
| 旧的本人行 | 旧数据的 `athleteRefId` 可能为 `null` | 不同步，给出可见原因，让用户在设置页重新标记 |
| `athleteRefId` 变更 | 本人行改指向另一位运动员后，旧运动员的 `race_` 条目不会被自动迁走 | 记为已知边界，条目是惰性数据，不影响其他条目 |
| 数组读改写并发 | 纪录文档是一个数组，手动添加和对账同时发生可能互相覆盖 | 对账用事务，且只动 `race_` 条目；纪录页的手填路径今天是非事务读改写（`addTimeEntry`），不在本设计内改，作为已知债务记录 |
| 主包体积 | ②③ 在主包里新增代码 | 订阅用已有的 `firebase-client`，文案放各自的 i18n 文件；PR 报告构建产物变化（AGENTS.md） |

## 6. ADR 与文档

- **步骤 ① 开工前新建 ADR**：说明与 ADR-001 D4（非目标：automatic PB sync）和 D5（`Super 1500m` mapping deferred）的冲突，选择对账式同步，影响（纪录文档新增 `race_` 条目、纪录页按钮变化）和回退（revert，条目惰性保留）。
- **步骤 ④ 开工前新建 ADR**：ADR-001 D4 要求在比赛视频上提供分析前必须有独立设计、用户明确选择和 ADR。本文 §2.d 是设计，ADR 要补隐私边界的确认。
- 涉及 Firestore 数据写入的步骤 ①，开工前按 AGENTS.md 先列风险与回滚，并补 `docs/runbooks/` 里的一份运行手册（包括「清理 `race_` 条目」的受控脚本约定）。
- 生产数据不在本文范围：①上线前，若要核对生产里已有的纪录条目 id 是否有以 `race_` 开头的，必须先做只读审计。

## 7. 评审清单

- [ ] §1 的事实与代码一致，特别是 §1.8 的四条差异
- [ ] 第 1 条的触发点（`isConfirmed` 且 `finished`）、映射表、条目 id、删除与退回传导四点
- [ ] `Super 1500m` 的结论
- [ ] 只同步本运动员的论证
- [ ] 对账式同步 vs 确认时事务（§2.a 备选 B）
- [ ] 总览卡的「下一场、上一场」取法与时区处理
- [ ] 侧重建议的阈值（同一计划周）与消失条件
- [ ] 视频联动的深链形态，以及「分析没有门」时 PRO 门如何叠加
- [ ] 四步顺序与各自的回滚
- [ ] reviewer 已确认；不以 AI 自检代替人工批准（AGENTS.md）
