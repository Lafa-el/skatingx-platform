# 任务与打卡合并设计稿

| 字段 | 值 |
|---|---|
| 状态 | **提议，待评审。** 评审通过前不写实现代码。 |
| 日期 | 2026-10-29 |
| 分支 | `docs/task-checkin-merge-design` |
| 性质 | 纯文档，无代码改动。 |
| 依据 | `main` `36f7fbf`；ADR-005 §1 / §3；`docs/migration/training-inventory.md`；`docs/migration/analysis-inventory.md`；`docs/migration/analysis/m6-cutover-runbook.md` |
| 不做 | 不改任何代码、Security Rules、schema、生产数据、legacy 仓库。本文不是 ADR；评审通过后，步骤 ① 开工前另建 ADR（见 §6）。 |

## 0. 读法

- 机制断言的出处写成「路径 · 符号」，路径相对仓库根。符号是函数、常量、类型或 i18n key，不写行号，免得改动后失效。
- 不是代码事实的内容单独标注：owner 的决定（标「决定」）、生产数据（标「数据事实」，实现前必须只读复核）、本文的推荐（标「推荐」）。
- 例子里的练习名只用来说明字段形状，不是新增内容。真实内容在步骤 ① 里按现有 `plan-messages.ts` 的 21 条正文重排，不新增动作，评审后才接入生成。

## 1. 现状与问题

### 1.1 两套机制各从哪来

| | 今日任务 | 计划打卡 |
|---|---|---|
| 旧站来源 | 旧训练站。任务是 `profile/main` 这一整份文档里的 `tasks[]`，历史是 `taskHistory{}`，积分在客户端算术（`docs/merge-readiness-audit.md` · 「Data model contrast」表的 Daily tasks、Points 两行；`docs/migration/training-inventory.md` · 「勾选 / 取消」行，`toggleTask` 全部完成时加 `dailyBonusPoints`） | 旧分析站第三页签。`completedTasks/{taskId}` 事务写入，同时对 `profile/lindsay.points` 做 `increment`（`docs/migration/analysis-inventory.md` · 「Vanilla 读写与实时监听」表的 `completedTasks/{taskId}` 行） |
| 旧站的积分 | `profile/main.points` | `profile/lindsay.points`。审计结论是两处是重复计数器（`docs/merge-readiness-audit.md` · 「Feasibility matrix」的 Same points balance 行） |
| 新平台实现 | `packages/firebase-client/src/firestore/training-tasks.ts` · `toggleTrainingTask`、`deleteTrainingTask`；纯逻辑 `packages/skating-domain/src/tasks.ts` · `applyTaskToggle` | `packages/firebase-client/src/firestore/planning-check-in.ts` · `completePlanningCheckIn`、`cancelPlanningCheckIn`、`subscribeToPlanningCheckIns`；页面 `apps/web/src/modules/training/plan/PlanPage.tsx` |
| 内容来源 | 用户手输（`addTrainingTask`，`source: "manual"`），或学院导入（`importAcademyTasks`，`source: "academy"`） | 21 条日课模板，在客户端，不存 Firestore（`packages/skating-domain/src/training/plan-template.ts` · `PLAN_DAYS`；ADR-005 §3「21 条日课是客户端模板，不存 Firestore」） |

迁移时两个旧计数器被并成一个账户：ADR-005 §1「官方积分」行和「页签三打卡」行写明「新打卡只增加训练积分，不另建分析侧积分」。代码上，两条路径都经 `packages/firebase-client/src/firestore/points-ledger.ts` · `recordPointsChange`，写同一份 `athletes/{athleteId}/gamification/main` 的 `points`。这就是「重复感」的结构来源：两个入口、两套规则、一个余额。

### 1.2 积分规则对照

| 维度 | 今日任务 | 计划打卡 |
|---|---|---|
| 粒度 | 每条任务一次 | 每个模板日（一张日卡）一次 |
| 单次加分 | `state.pointsPerTask`，缺省 `DEFAULT_POINTS_PER_TASK = 20`（`packages/schema/src/defaults.ts`；`packages/skating-domain/src/tasks.ts` · `normalizeTrainingState`） | `PlanDayTemplate.points`，10–35 不等（下表） |
| 全勤奖 | 当天列表由「未全部完成」变「全部完成」时加 `dailyBonusPoints`，缺省 `DEFAULT_DAILY_BONUS_POINTS = 50`；反向扣回（`applyTaskToggle`；`deleteTrainingTask` 里列表变空时 `daily-bonus-remove`） | 无 |
| 连续天数 | 全勤日写进 `completedDays`，`calculateStreakDays` 重算 | 不改。`plan-template.ts` · `applyPlanCheckIn` 的注释「Streak and completed days are left to the training tasks」；ADR-005 §3「也不改连续天数」 |
| 撤销 | 取消勾选 `task-uncomplete`，删除已完成任务 `task-delete`（`toggleTrainingTask`、`deleteTrainingTask`） | `cancelPlanningCheckIn` 扣回存档里的 `points`，原因 `plan-uncheckin` |
| 日期维度 | 有。`runDayRolloverIfNeeded` 把前一天归档进 `taskHistory/{dateId}`，再清空 `todayTasks` | **无。** 文档 id 就是模板日 id（`planningCheckIn` 路径的 `taskId`），`completePlanningCheckIn` 在文档已存在时直接返回 `"already"`。文件里只有 complete / cancel / subscribe 三个导出，没有按日期或按周清除的路径，`PLAN_WEEK_NUMBER` 是常量 1（`plan-template.ts`）。打过一次的日卡，不取消就一直是已打卡 |
| 运动员 | `settings.activeAthleteId ?? "lindsay"`（`apps/web/src/hooks/useTrainingActions.ts`） | `DEFAULT_ATHLETE_ID`（`PlanPage.tsx` 里 `subscribeToPlanningCheckIns`、`completePlanningCheckIn`、`cancelPlanningCheckIn` 的参数；常量见 `packages/schema/src/constants.ts`）。目前两者都是 `lindsay`，不是同一个来源 |
| 账本原因 | `task-complete`、`task-uncomplete`、`task-delete`、`daily-bonus-add`、`daily-bonus-remove` | `plan-checkin`、`plan-uncheckin`（`packages/schema/src/points-ledger.ts` · `POINTS_LEDGER_REASONS`） |
| PRO | 不设门槛 | 不设门槛（`apps/web/src/app/router.tsx` 的 `plan` 路由没有门槛；`modules/training/plan/` 下没有 `isPro` / `useIsPro`） |

模板日积分（`plan-template.ts` · `PLAN_DAYS`），周一到周日：

| 侧重 | 周一 | 周二 | 周三 | 周四 | 周五 | 周六 | 周日 | 一周合计 |
|---|---|---|---|---|---|---|---|---|
| `lean`（`jd_tech_*`） | 30 | 20 | 30 | 15 | 30 | 30 | 10 | 165 |
| `bounce`（`jd_speed_*`） | 35 | 20 | 35 | 15 | 30 | 35 | 10 | 180 |
| `endurance`（`jd_race_*`） | 25 | 15 | 25 | 10 | 20 | 25 | 10 | 130 |

### 1.3 具体问题

1. **同一件事有两个入口。** 用户做完一次训练，要在计划页点「打卡同步」，又要在任务页逐条勾选。两页都显示同一个余额（`PlanPage.tsx` 的 `plan.balance`；`TrainingTasksPage.tsx` 的 `trainingTasks.rules.balance`）。
2. **规则不同、数字不可比。** 一张日卡 10–35 分，一条任务 20 分加全勤 50 分。同样是「周一技术冰」，两边给的分数没有任何关系。
3. **打卡没有日期。** 见 §1.2「日期维度」一行。下一周同一天的日卡仍是已打卡，用户只能先取消再重打。
4. **计划页和任务页互不知情。** 计划页的日卡正文是一段文字（`plan.lean.mon.body` 等），任务页是另一份用户自己维护的清单。计划不会变成今天要做的事。
5. **本周侧重不持久。** 侧重存在 `sessionStorage`（`apps/web/src/modules/training/plan/plan-session.ts` · `PLAN_FOCUS_KEY = "skatingx.plan.focus"`、`readPlanFocus`、`usePlanFocus`），关掉浏览器就丢。要让「今天的任务由模板生成」成立，这是前提。
6. **日卡和学院的动作粒度不同。** 学院日计划已经是逐动作的列表（`packages/content/src/academy-types.ts` · `AcademyDayPlan.taskLabelsZh` / `taskLabelsEn`），导入时一个动作一条任务（`apps/web/src/hooks/useAcademyImport.ts` · `importDayPlan`）。模板日卡是一段自由文本。

## 2. 目标原则

决定（owner）。四条，后面每个设计点都按它们收敛：

1. **计划页只做排期，不打卡。** 计划页显示一周的骨架和每天的完成情况，不再有「打卡同步」「取消打卡」。
2. **模板日内容生成当天的任务。** 模板日按动作拆成多条任务，进入今日任务列表，勾选只在任务页发生。
3. **计划完成度由任务数据推导，不另存状态。** 不再有 `planning/main/completedTasks` 这类单独的完成记录。
4. **积分只保留任务规则集。** 每条任务 `pointsPerTask`，全勤 `dailyBonusPoints`。模板日积分退役。

粒度已定（决定）：模板日导入今天时，**按动作拆成多条任务**，与学院现有日计划导入一致。

## 3. 分层定性

决定（2026-10-27 讨论结论，非代码事实）：

- **计划模板 = 周骨架。** 回答「这周往哪个方向练、每天强度多大」。代码里体现为三种侧重和每日强度：`plan-messages.ts` · `plan.focus.*.title` / `plan.focus.*.summary`，`apps/web/src/modules/training/plan/plan-day-copy.ts` · `PLAN_DAY_COPY` 的 `intensity`。每个侧重的周结构是同一个形状：周一、周三、周五、周六上冰（`plan.<focus>.<mon|wed|fri|sat>.when` 都含「冰前30min + 上冰」），周二陆地专项，周四恢复，周日可选或休息。
- **学院 = 动作库。** 回答「具体练什么」。`packages/content/src/academy-types.ts` · `AcademyModule.items`（`AcademyItem`，带分类、目标、标签）是动作库本体。它附带的参考周安排（`WeeklyRoutine.days`、`WeeklyRoutine.dayPlans`）定位为**动作组合建议**，不是第二套周计划。现行界面文案「参考周计划」（`apps/web/src/shared/i18n/academy-messages.ts` · `academy.routine.intro`）与这个定位基本一致，改不改词留给后续，本步不动学院。
- **话题重叠、数据不共享。** 模板在 `packages/skating-domain/src/training/plan-template.ts` 和 `apps/web/src/shared/i18n/plan-messages.ts`。学院在 `packages/content/src/academy-stages.generated.ts`，该文件由 `packages/content/scripts/generate-academy.mjs` 从旧站提取物生成，测试要求重新生成的结果与已提交文件逐字一致（`packages/content/src/academy-content.test.ts` · 「regenerating from the committed legacy extract gives the committed file」）。所以模板的逐动作内容**不能**写进学院的生成文件，只能放在模板自己这一侧（§4.b）。

两者共用的接口是今日任务：学院按 `source: "academy"` 写入，模板按下面 §4.d 的 `source: "plan"` 写入。两边互不读对方的内部数据。

## 4. 七个设计点

### a. 本周侧重持久化

**现状。** `plan-session.ts` · `usePlanFocus` 把侧重存进 `sessionStorage`，计划页（`PlanPage.tsx`）和分析中心（`apps/web/src/pages/analysis/AnalysisHubPage.tsx` 的「采纳」按钮）共用同一个 hook。文件注释写明「is not a Firestore write」。

**推荐：存进 `athletes/{athleteId}/training/state`，新增三个可选字段。**

| 字段 | 含义 |
|---|---|
| `planFocus` | `"lean" \| "bounce" \| "endurance"` |
| `planFocusWeek` | 选定侧重那一周的周一，`DateString`，设备本地日期（`packages/schema/src/defaults.ts` · `todayDateString` 用本地时间） |
| `planGeneratedDate` | 最近一次生成任务的日期，用于 §4.c 的幂等 |

理由：

1. **与任务同一份文档，生成和标记能在一个事务里完成。** 现有所有写 `training/state` 的路径都是 `tx.update(stateRef, {...})` 按字段更新（`addTrainingTask`、`importAcademyTasks`、`deleteTrainingTask`、`toggleTrainingTask`、`runDayRolloverIfNeeded`），新增字段不会被它们覆盖；`bootstrap.ts` · `ensureDocument` 只在文档不存在时才 `setDoc` 默认值，`deleteTaskHistoryDay` 只读这份文档。
2. **不新增监听。** `training/state` 已由 `apps/web/src/app/providers/FirestoreProvider.tsx` 全局订阅（`trainingState`、`useTrainingState`）。
3. **跟着当前运动员走。** `trainingStateRef` 的 `athleteId` 来自 `settings.activeAthleteId`，而计划页的打卡路径写死 `DEFAULT_ATHLETE_ID`（见 §1.2）。
4. **规则不用改。** `firestore.rules` 的 `match /athletes/{athleteId}/{a}/{b}` 对属主开放读写，`training/state` 就是这一层。
5. **`planning/main` 之后没有用途。** §4.g 退役后它只剩侧重一个字段，不值得保留一条独立路径。

代价：

- `packages/schema/src/training.ts` · `TrainingState` 加三个可选字段。
- `packages/skating-domain/src/tasks.ts` · `normalizeTrainingState` 是显式字段清单，必须同步加上，否则读出来的状态里没有这三个字段。
- `usePlanFocus` 从同步读 `sessionStorage` 变成读 `useTrainingState()` 加一个写入函数。加载中没有值，计划页要处理「还没读到」和「确实没选」两种状态，不能把加载中显示成「请选择侧重」。
- 需要 ADR（§6）。

**没选侧重时的默认行为（推荐）：** 不生成任何任务，任务页保持现状；计划页沿用现有空状态（`plan.week.choose`、`plan.empty`）。不替用户猜侧重。

**侧重按周有效（推荐）。** 生成只在 `planFocusWeek` 等于本周周一时进行。进入新一周后，计划页提示「上周选的是 X，沿用请确认」，一次点击续期，不确认就不生成。理由：三个侧重里有「比赛周与恢复管理」（`plan.focus.endurance.title`），它的内容是赛前唤醒和赛后复盘，不能无声地一直重复。

**同一天内改侧重（推荐）：** 已生成的今天任务不重写，新侧重从明天起生效。它们是普通任务，用户可以自己删。理由：改写已勾选的任务会牵动账本（`deleteTrainingTask` 要扣分），复杂度远大于收益。

备选：

| 备选 | 代价 |
|---|---|
| `planning/main` 文档 | 生成要跨两份文档的事务；多一条订阅和一个路径函数；`planning` 这个命名空间要继续保留 |
| `settings/main`（用户级） | 侧重是运动员级的训练选择，不是用户设置；设置页另有用途 |
| `localStorage` | 只在一台设备上有效，不跟运动员走 |
| 沿用 `sessionStorage` | 不解决问题 |
| 复用已有的 `weeklyTemplate` 字段 | 它是 `monday`…`sunday` 的字符串表（`packages/schema/src/training.ts` · `WeeklyTemplateByDay`），旧站里「只见默认值和读取，不见编辑器」（`docs/migration/training-inventory.md` 第 12 条），语义不同，混用会让两种含义缠在一起 |

不变：`HIDDEN_FEEDBACK_KEY`（忽略分析建议）继续在 `sessionStorage`，不在本设计范围内。

### b. 模板日 → 任务的映射

**现状。** `plan-day-copy.ts` · `PLAN_DAY_COPY` 给每个模板日四个 key：`when`、`kind`、`intensity`、`body`。`body` 是一整段自由文本，例如 `plan.lean.mon.body`：

> 冰前：动态热身、髋踝激活、干地滑行姿势 6组20秒。冰上：低姿势滑行、外刃压刃、弯道入口路线；6-8组轻中速交叉步，组间充分恢复。

要按动作拆成任务，必须先把它变成结构化条目。

**推荐：新增逐日条目表，一条条目生成一条任务。**

位置：`apps/web/src/modules/training/plan/plan-day-entries.ts`，与 `plan-day-copy.ts` 同层。原因是条目要引用 i18n key（类型 `PlanMessageKey` 在 `apps/web`），`packages/skating-domain` 不能依赖它。与 `plan-day-copy.ts` 一样，skating-domain 一侧只放不带文案的纯函数。

字段（示意）：

```ts
type PlanDayEntry = {
  readonly id: string;           // "jd_tech_mon.1"：与语言无关，定了就不复用
  readonly surface: "off-ice" | "on-ice" | "land" | "recovery";
  readonly nameKey: PlanMessageKey;
  readonly targetKey?: PlanMessageKey;
  readonly generate: boolean;    // false：只在计划页展示，不生成任务
};
```

生成出来的任务字段，与学院导入的任务对齐（`packages/skating-domain/src/academy.ts` · `buildTaskFromAcademyCandidate` 写 `text`、`target`、`description`）：

| 任务字段 | 来源 |
|---|---|
| `text` | `nameKey` 按生成时的语言取值 |
| `target` | `targetKey`，例如「6组20秒」 |
| `description` | 场景短标签（冰前 / 冰上 / 陆地 / 恢复），不放整段 `body` |
| `source` | `"plan"`（§4.d） |
| `planEntryId` | 条目 `id`（§4.d） |

示例（只演示形状，措辞待内容评审）。`jd_tech_mon` 的现有正文可以重排为：

| id | surface | name | target |
|---|---|---|---|
| `jd_tech_mon.1` | off-ice | 动态热身 + 髋踝激活 | |
| `jd_tech_mon.2` | off-ice | 干地滑行姿势 | 6组20秒 |
| `jd_tech_mon.3` | on-ice | 低姿势滑行 + 外刃压刃 | |
| `jd_tech_mon.4` | on-ice | 弯道入口路线 | |
| `jd_tech_mon.5` | on-ice | 轻中速交叉步 | 6-8组 |

**原始正文留着。** `when` / `kind` / `intensity` / `body` 继续用于计划页的日卡展示，不复制进每条任务的 `description`。理由：一段 100 字的正文复制到每条任务，同一天写进 Firestore 多份，任务页也变得很挤。条目是「可执行的拆分」，正文是「这天的整体说明」。

**21 天内容迁移步骤：**

1. 按现有 21 条 `plan.<focus>.<weekday>.body`（zh、en 各一份）重排为条目，只重排，不新增动作，不改强度。
2. 每个条目的中英文文案进统一 i18n 资源，key 沿用现有形状 `plan.<focus>.<weekday>.<field>`，例如 `plan.lean.mon.t1.name`、`plan.lean.mon.t1.target`（key 必须匹配 `apps/web/src/shared/i18n/messages-consistency.test.ts` 里的正则 `^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$`，`jd_tech_mon` 含下划线，不能直接当 key）。
3. 英文文案沿用现有状态：`plan-messages.ts` 文件头写明英文是草稿、待评审。
4. 每天 3–5 条为宜（原因见 §4.f 的积分影响）。分组由内容作者决定，评审时逐天看。
5. 周二（陆地）、周四（恢复）按正文拆成动作；周日「优先休息，可选」的条目标 `generate: false`（只展示，不生成），休息不是计分任务。**这一条是待评审决定，见 §8。**
6. 测试（与实现同 PR）：21 天每天至少有一条条目；条目 id 全局唯一；每天生成条数不超过上限；zh/en key 集合一致（现有 i18n 门禁已覆盖）。
7. 内容由 owner 逐天确认后才接入生成。免责声明保留（`plan.week.disclaimer`「模板用于训练记录与教练沟通，不替代现场教练安排」、`plan.basis`）。

**不推荐的过渡做法：按「冰前：」「冰上：」切段。** 脆弱，原因：

- 中文正文只有上冰日有「冰前：」「冰上：」标记，陆地和恢复日没有（`plan.lean.tue.body`、`plan.lean.thu.body`、`plan.endurance.tue.body` 都是顿号分隔的动作列表），一个正则覆盖不了。
- 英文是另写的，标记是「Land:」「Ice:」，句子结构也不同（`plan.lean.mon.body` 的 zh 与 en 对比），两种语言切出来的条数不一定一样。
- 部分正文夹着非动作信息，例如 `plan.endurance.tue.body` 的「补水和睡眠记录」、`plan.endurance.mon.body` 的「确认刀、鞋、弯道路线」，切段会把它们变成任务。
- 条目 id 依赖文案。文案改一个字，id 就变，§4.c 的去重失效。学院导入已经为此专门处理过：`useAcademyImport.ts` · `fallbackCandidate` 的注释写明 id「always come from the Chinese label」，这样切换语言后「今天已添加」仍然成立。
- 切分规则一旦进了代码，就成了又一个要维护的「内容解析器」。

备选：沿用学院的单字符串约定，每个条目一个「名称 目标」字符串，按最后一个空格拆（`packages/content/src/academy-content.test.ts` · 「a plan label keeps the space before its amount, which is how the app splits name from target」）。好处是复用已测试的拆分逻辑；代价是约定本身脆弱（目标里带空格就拆错），而且英文要另有一套规则。本设计用显式的 `nameKey` / `targetKey`，不沿用。

### c. 生成时机与幂等

**现状。** `apps/web/src/components/TrainingDayRollover.tsx` 在 `apps/web/src/app/App.tsx` 里全局挂载，每次 `training/state` 变化时检查：`lastLoginDate` 早于今天就调用 `runDayRolloverIfNeeded`，后者在一个事务里把前一天的 `todayTasks` 写进 `taskHistory/{dateId}`（仅当列表非空）、清空列表、把 `lastLoginDate` 改成今天。组件里用 `lastRunKey` 防重复，失败时只记日志、不标记完成，下次状态变化再试。

**推荐：独立的幂等事务 `generatePlanTasksIfNeeded`，由同一个 `TrainingDayRollover` 组件在「日切完成后」触发。**

事务内的判断顺序：

1. 读 `training/state`。
2. `lastLoginDate !== 今天`：日切还没做完，直接返回，不生成。**这条是硬约束。** 如果在日切前生成，新任务会被当成昨天的列表归档掉。
3. `planFocus` 缺失，或 `planFocusWeek` 不是本周周一：返回，不生成。
4. `planGeneratedDate === 今天`：返回，不重复生成。
5. 追加今天的条目（按条目 `id` 再过滤一遍已存在的 `planEntryId`，模式与 `packages/skating-domain/src/academy.ts` · `filterNewAcademyCandidates` 相同），写入 `planGeneratedDate = 今天`。

候选条目由调用方（web 层）把 i18n key 解析成字符串后传入，事务再校验传入的侧重与状态里的 `planFocus` 一致，不一致就放弃。形状与 `importAcademyTasks(ctx, candidates)` 一致。

幂等性的来源：

- **重复打开不重复生成。** 标记是 `planGeneratedDate`，不是「列表里有没有 plan 任务」。这样用户**删掉**某条生成的任务后，再次打开也不会补回来。只靠「有没有 `source: "plan"` 的任务」做判断会在删除后重新生成，这是要避开的坑。
- **不影响用户自己加的任务。** 生成只追加，不读也不改已有条目（`manual`、`academy` 都不动）。
- **多标签页、多设备并发安全。** Firestore 事务遇到冲突会重试，重试时读到的已是 `planGeneratedDate === 今天`。
- **选侧重当天立即生成。** 第一次选侧重时，设置侧重和生成今天任务应在一次调用里完成，前提仍是第 2 条（已日切）。

备选：

| 备选 | 为什么不选 |
|---|---|
| 放进 `runDayRolloverIfNeeded` 的同一个事务 | 它在不需要日切时直接返回，首次选侧重、同一天补选的场景还得另写一条路径，等于两处生成逻辑。归档逻辑也不该和生成耦合（迁移期间保持归档行为不变） |
| 首次渲染任务页时懒生成 | 不打开任务页就不生成，而 `DashboardPage.tsx` 和 `TrainingHomePage.tsx` 都读 `todayTasks` 显示数量，会显示不一致；还要在渲染里发起写入 |

时区：日期用设备本地时间（`todayDateString`），与现有归档、账本 `dateId` 一致。换时区的设备会得到与设备一致的「今天」，这是现有行为，本设计不改。

语言：任务文字按生成时的语言写入，之后切换语言不会翻译已有任务。这与学院导入相同（`buildAcademyImportCandidate(item, language)`）。

### d. 来源标记

**现状。** `packages/schema/src/training.ts` · `TrainingTaskSource = "manual" | "academy" | "system"`。代码里写入 `"manual"`（`addTrainingTask`）和 `"academy"`（`buildTaskFromAcademyCandidate`）；`"system"` 只在类型里，没有任何产生它的代码（全仓搜索 `source: "system"` 无结果）。任务页只认 `source === "academy"`，显示一个徽标（`TrainingTasksPage.tsx`）。

**推荐：新增 `"plan"`，再加一个可选字段 `planEntryId`。**

- `source: "plan"`：这条任务是模板生成的。
- `planEntryId`：条目 id，例如 `jd_tech_mon.1`。作用与学院的 `academyItemId` 相同（`hasAcademyItemImportedToday` 用它去重）；同时从 id 前缀可以反推是哪一天的日卡。

选 `"plan"` 而不是复用 `"system"`：`"system"` 语义太宽（以后任何系统生成的任务都可能用），计划完成度要按来源过滤，需要一个不会被别的生成器共用的值。`"system"` 保持未使用。

三种来源必须可区分：`manual`（用户手输）、`academy`（学院导入）、`plan`（模板生成）。任务页给 `plan` 加一个与学院同款的徽标（i18n 新 key，例如 `trainingTasks.list.planBadge`）。

**schema 变更影响：**

| 位置 | 需要的改动 | 不改的后果 |
|---|---|---|
| `packages/schema/src/training.ts` · `TrainingTaskSource`、`TrainingTask` | 加 `"plan"`、`planEntryId?: string` | 类型不通过 |
| `packages/skating-domain/src/tasks.ts` · `normalizeTask` | **必须**把 `planEntryId` 写进显式字段清单（它逐字段复制，未列出的字段会被丢掉） | 第一次勾选就丢字段：`toggleTrainingTask` 用 `normalizeTrainingState` 读出的任务再写回 |
| `packages/firebase-client/src/firestore/sanitize.ts` · `serializeTrainingTask` | **必须**同样加上 | 写回 Firestore 时丢字段，包括日切归档 |
| `packages/firebase-client/src/firestore/task-history.ts` · `archivedTask` | 读取时带上 `source`、`planEntryId`（现在只返回 `id`、`text`、`completed`） | 过去的日子推导不出 plan 完成度（§4.e） |
| `firestore.rules` | 不改。训练状态文档是属主读写，没有字段校验 | — |
| 数据迁移 | 不需要。新字段可选，旧文档没有它，读取时按 `source ?? "manual"` 处理（`normalizeTask`） | — |

第 2、3 行是这个设计里最容易漏的地方：任务的字段是白名单式复制，漏掉任何一处都不会报错，只是字段悄悄消失。实现必须带一个往返测试：生成 → 勾选 → 归档 → 读取，`source` 和 `planEntryId` 全程保留。

旧客户端兼容：旧版本读到 `source: "plan"` 时，`normalizeTask` 原样透传，任务页不认识就不显示徽标，功能不受影响。

### e. 计划完成度的推导

原则：不存状态，从任务数据算。

| 日期 | 数据来源 | 推导 |
|---|---|---|
| 今天 | `training/state` · `todayTasks`（`useTrainingState`，已订阅） | 取 `source === "plan"` 的任务。无任务且 `planGeneratedDate === 今天`：「已生成，已被清空」；无任务且未生成：「未生成」；有任务：已完成数 / 总数，全部完成算「完成」 |
| 过去 | `training/main/taskHistory/{dateId}`（`subscribeToTaskHistoryMonth` 按文档 id 范围读） | 同上，取归档里 `source === "plan"` 的任务。范围参数可以传整周的起止日，函数只校验两个日期有效且起不晚于止，不要求是整月 |
| 未来 | 无（任务当天才生成） | 只显示排期，不显示完成度 |

要点：

- **过去的日子要在读取侧补字段。** 归档写入时用 `serializeTaskHistoryDay` → `serializeTrainingTasks`，`source` 已随任务写进去；但读取函数 `archivedTask` 只回传 `id`、`text`、`completed`，要扩展（§4.d）。
- **没有归档文档的日子显示「无记录」，不显示「未完成」。** `runDayRolloverIfNeeded` 只在前一天列表非空时才写归档；用户没打开应用的日子也没有归档。把「没有数据」当成「没做」会冤枉用户。
- **旧归档没有 plan 任务。** 上线之前的归档里没有 `source: "plan"`，推导为「无记录」。生产上目前没有打卡数据（§5），所以不会丢信息。
- **推导函数是纯函数。** 放进 `packages/skating-domain/src/training/`，输入是任务列表和「是否已生成」，输出状态加计数，单测覆盖空、部分、全部、被删光四种。
- **`deleteTaskHistoryDay` 的影响。** 用户从历史页删掉某天归档后，那天变成「无记录」。它按归档里已完成任务的条数乘当前 `pointsPerTask`、再加全勤奖来扣回积分（`task-history.ts` · `deleteTaskHistoryDay`），不区分来源，所以 plan 任务自然按任务规则扣回，不需额外处理。

**与全勤奖的关系：** 全勤奖仍然按当天**整个列表**计算（`packages/skating-domain/src/tasks.ts` · `allTasksCompleted`、`applyTaskToggle`），不按来源拆。理由：规则集只有一套，拆开就又变成两套。结果是两个独立的派生量：

- 「今天的计划是否完成」只看 `source: "plan"` 的任务；
- 「今天是否拿全勤奖」看所有任务，包括用户自己加的、学院导入的。

计划页文案要把这点说清，避免用户以为做完计划就一定有全勤奖。

### f. 积分收敛与 PRO 界线

**模板积分退役。** `PlanDayTemplate.points`、`weeklyCheckedPoints`、`applyPlanCheckIn`（均在 `plan-template.ts`）不再有读者。计划页去掉「本周已打卡积分」「+N」徽标（`plan.week.points`、`plan.pointsBadge`）。

**账本里的历史原因保留。** `plan-checkin`、`plan-uncheckin` 继续留在 `POINTS_LEDGER_REASONS`，不再产生新事件。理由：

- 账本是追加式的，已有事件要继续能显示。生产账本里已有 `plan-uncheckin` 事件（§5）。
- 历史页的明细视图按这两个原因渲染（`apps/web/src/modules/training/history/PointsLedgerPanel.tsx` 的原因标签表，`ledger-model.ts` · `planLedgerNote`）。`planLedgerNote` 用 `planDayById` 把 `refId` 还原成「某侧重的周几」，所以 **`PLAN_DAYS` 的 id 和侧重、`planDayById` 在退役后必须保留**。

**现有打卡数据怎么处理（推荐）：** 不迁移、不清理，让它们成为无人读取的惰性数据。已经入账的积分是用户赚到的，保留。前提见 §5：实现前先做一次只读核对。

**对任务积分的影响（需要评审时明确接受）：** 拆成逐动作任务后，一天的得分上限显著高于旧日卡。按 `pointsPerTask = 20`、`dailyBonusPoints = 50`，一天 5 条任务全做完是 \(5 \times 20 + 50 = 150\) 分，旧的 `jd_tech_mon` 日卡是 30 分。一周总量取决于每天的条数，所以条目数量实际上成了积分经济的控制旋钮（§4.b 第 4 条限制每天 3–5 条）。学院日计划导入已经是同样的效果：`age7_10-wp-0` 一天有 5 条（`packages/content/src/academy-stages.generated.ts`）。不调整 `pointsPerTask`，那是「任务页积分规则」，属于不做事项（§7）。

**PRO 界线：**

- 现状：学院按周、按日计划批量导入要 PRO（`useAcademyImport.ts` · `importDayPlan`、`importWeekdayRoutine` 的 `requirePro` 默认 `true`，页面里 `TrainingAcademyPage.tsx` · `handleImportDayPlan`、`handleImportWeekday` 也先判断 `isPro`）；学院单个动作导入不看 PRO（`importItem` 没有 `requirePro`；`docs/migration/training-inventory.md` §3.2「学院单条导入在新平台不看 PRO」）；计划页本身不设门槛（§1.2）。
- **推荐：模板生成的每日任务骨架免费。** 计划页现在免费可用，生成只是把它已经展示的内容变成任务，收费会让现有功能倒退。
- 生成走独立函数，不经过 `useAcademyImport`，也不读 `isPro`；学院批量导入保持 PRO。两者不混用：来源不同（`plan` 对 `academy`），门槛不同，去重键也不同。
- 已知取舍：同一个动作可能既来自模板、又被用户从学院导入，任务列表里出现两条（一条 `plan`，一条 `academy`）。不做跨来源去重——要做就得为 21 天条目逐个映射学院动作 id，是另一项内容工作。

### g. 退役清单

下表是步骤 ③ 的范围。「删」表示整体移除，「改」表示保留文件、移除部分内容，「留」表示明确不动。

| 位置 | 处理 | 说明 |
|---|---|---|
| `apps/web/src/modules/training/plan/PlanPage.tsx` | 改（步骤 ②） | 去掉打卡、取消打卡按钮及 `checkIn` / `cancelCheckIn` 处理、`subscribeToPlanningCheckIns` 订阅、`pendingId` / `failedId` / `status` 状态、周积分与余额显示 |
| `packages/firebase-client/src/firestore/planning-check-in.ts` | 删 | `completePlanningCheckIn`、`cancelPlanningCheckIn`、`subscribeToPlanningCheckIns`、`PlanningCheckIn` |
| `packages/firebase-client/src/firestore/refs.ts` | 改 | 删 `planningCheckInRef`、`planningCheckInsCollectionRef` |
| `packages/firebase-client/src/index.ts` | 改 | 去掉上面几个导出 |
| `packages/schema/src/paths.ts` | 改 | 删 `planningCheckIn`、`planningCheckInsCollection`，以及已被 ADR-005 §1 标为「禁止沿用」的 9 段 `planningCompletedTask`；同步删 `paths.planning.test.ts` 里对应用例 |
| `packages/skating-domain/src/training/plan-template.ts` | 改 | 删 `points`、`weeklyCheckedPoints`、`applyPlanCheckIn`；**保留** `PLAN_FOCUSES`、`PLAN_DAYS`（id 和 focus）、`planDays`、`planDayById` |
| `packages/skating-domain/src/analysis/m5-parity.ts` 及其测试 | 改 | `planRows` 用的就是上面三个被删的符号（`applyPlanCheckIn`、`planDayById`、`PLAN_DAYS`、`weeklyCheckedPoints`）；这是 M5 的一次性对照行，随之删除对应行，并在 `docs/migration/analysis/m5-parity-report.md` 标注该行已随退役移除 |
| `apps/web/src/shared/i18n/plan-messages.ts` | 改 | 删 `plan.check.*`、`plan.week.points`、`plan.balance`、`plan.pointsBadge`；保留 `plan.intensity.*` 与全部日卡正文 |
| 相关测试 | 改 | `PlanPage.test.tsx`、`plan-template.test.ts`、`firebase-client/.../points-ledger.test.ts` 里的打卡用例 |
| `firestore.rules`、`tests/rules/access.rules.test.ts` | **留** | 不改规则。路径 `planning/main/completedTasks/...` 在规则测试里仍是属主可写，这是规则的现状，退役不收紧 |
| `POINTS_LEDGER_REASONS` 里的 `plan-checkin`、`plan-uncheckin` | **留** | 见 §4.f |
| `planDayById`、`PLAN_DAYS` 的 id 与 focus | **留** | 历史页明细要用 |
| `scripts/migrate-analysis.mjs`、`scripts/verify-prod-migration.mjs`、`scripts/migrate-current-data.mjs` 及其测试 | **留** | 已执行的一次性迁移工具，引用的是迁移目标路径，不是应用运行时代码 |

**是否需要兼容期（推荐：不需要，直接退役。）** 理由：

1. 这些函数只由 `apps/web` 引用（`@skatingx/firebase-client` 的导出没有其它消费者）。
2. 现在只有一位真实用户（owner 陈述，数据事实），他自己的打卡数据已在 2026-10-23 清零（§5）。
3. 惰性数据没有读者，不会产生新积分。

残留风险：一个在退役发布前就打开着的旧标签页，仍能调用旧的 `completePlanningCheckIn` 写入。规则允许这条路径，写入会照常记账（`plan-checkin` 事件），账本仍然自洽，只是会多出一条旧原因的事件。对单用户场景可以接受，不为此保留代码。

## 5. 数据影响评估

**数据事实（非代码，实现前必须只读复核）：**

- 生产项目 `skatingx-prod`，Lindsay 账号 `baWEw6SZKcQItvcDdpF64ZNe5W12`。2026-10-23 的清理任务把两条测试打卡删除并把积分清零，自检回读：`planning/main/completedTasks` 0 条，`gamification/main.points` 为 0，`completedDays` 为空、`streakDays` 为 0，`pointsLedger` 3 条（`opening` +55，`cleanout-jd_speed_tue` −20，`cleanout-jd_speed_wed` −35，合计 0），兑换记录 0 条。备份文件在本机，不在仓库里。
- **其它账号还没核对。** `docs/migration/analysis/m6-cutover-runbook.md` 的执行结果记录迁移时写入了「1 条打卡」，抽查说明里指定 `lefwGmZ9KyW3d4NswdwF4T2VvEH3` 要核对「分析备份和打卡这两份文档」。这条打卡现在是否还在、属于谁、`points` 多少，本文没有证据。owner 的说法是只有一位真实用户，但这是陈述，不是核对。
- 因此步骤 ③ 的前置条件是一次**只读**审计：列出全库所有 `planning/main/completedTasks` 文档（路径、`taskId`、`points`），结果写进该 PR。有残留则按 §4.f 处理（保留惰性数据，不扣分，不删除）；没有则确认下面的结论。

**退役后需要的数据迁移：无。**

| 项 | 处理 |
|---|---|
| `planning/main/completedTasks` 文档 | 无读者，惰性保留，不删 |
| 已入账积分与账本事件 | 不动，`plan-*` 原因保留并仍可显示 |
| `training/state` 新字段（`planFocus` 等） | 可选字段，旧文档没有，无需回填 |
| 任务的 `source: "plan"` / `planEntryId` | 新字段，只出现在新生成的任务上，无需回填 |
| 已有归档 | 不改写。没有 plan 任务的归档按「无记录」推导 |
| Security Rules | 不改 |
| 索引 | 不新增。过去日子的读取沿用 `taskHistory` 按文档 id 范围查询，不需要复合索引 |

## 6. 实施分步

AGENTS.md 要求涉及 Firestore schema 的变更先建 ADR。本设计会给 `training/state` 和 `TrainingTask` 加字段，并取代 ADR-005 §3 里「打卡写入 `planning/main/completedTasks`、积分只增加训练积分」的部分，所以步骤 ① 开工前先建 `ADR-008`，写清冲突、选择、影响与回退。每一步独立成 PR，各自可回滚。

### 步骤 ①　侧重持久化 + 模板日 → 任务生成

范围：

- ADR-008。
- schema：`TrainingState` 三个可选字段、`TrainingTaskSource` 加 `"plan"`、`TrainingTask.planEntryId`；`normalizeTrainingState`、`normalizeTask`、`serializeTrainingTask`、`archivedTask` 同步。
- `plan-day-entries.ts` 与 21 天条目的中英文文案（§4.b）。
- `setPlanFocus` 与 `generatePlanTasksIfNeeded`（firebase-client），`usePlanFocus` 改为读写 `training/state`，分析中心的「采纳」随之生效。
- 任务页给 `plan` 来源加徽标。

**切分微调建议（待评审，见 §8）：** 本步合入时**不接** `TrainingDayRollover` 的触发，只提供函数与测试；触发接线放在步骤 ② 的第一个提交，与计划页去掉打卡按钮同一个发布。原因：没有 feature flag 机制（全仓搜索无 `featureFlag` 或 `VITE_*FLAG`），如果 ① 先上线生成、打卡按钮还在，同一天的同一份训练会被计两次分。

验收：

- 同一天重复触发生成，任务只增加一次。
- 删掉一条生成的任务后再次触发，不补回。
- 用户自己加的任务、学院导入的任务不被改动。
- `lastLoginDate` 早于今天时不生成。
- 侧重 `planFocusWeek` 不是本周时不生成。
- 传入的侧重与状态里的不一致时放弃。
- 往返测试：生成 → `toggleTrainingTask` → 归档 → `archivedDayFromDocument`，`source` 与 `planEntryId` 保留。
- 每个模板日有条目或明确标记为不生成；条目 id 唯一；每天条数不超过上限。
- 生成路径不读 `isPro`。
- 标准门禁：`npm ci`、`npm run lint`、`npm run typecheck`、`npm run test -- --run`、`npm run build`；涉及 Firebase 追加 `npm run test:rules`、`npm run test:migration`。
- 手动：中英文各走一遍，手机和桌面两种宽度。

### 步骤 ②　计划页改为推导完成度

范围：

- 接上 `TrainingDayRollover` 的生成触发。
- `PlanPage.tsx`：去掉打卡与取消打卡，周视图按 §4.e 显示完成度（今天、过去、未来三种状态，另有「未生成」「无记录」）。
- 推导纯函数及单测；计划页读取本周归档（范围查询，页面卸载时退订，ADR-005 §4）。
- 计划页文案说明：全勤奖按当天全部任务计算。

验收：

- 今天：勾选任务后计划页完成数同步变化。
- 过去：归档里有 plan 任务的日子显示完成度，没有的显示「无记录」，不显示「未完成」。
- 未来：只显示排期。
- 计划页不再出现任何积分写入入口。
- 加载中、读取失败、空状态都有可见状态；表单与按钮可键盘操作。
- 中英文与手机、桌面截图写进 PR。
- 标准门禁同 ①。

### 步骤 ③　退役打卡入口与函数

范围：§4.g 清单。前置：§5 的只读审计结果写入 PR。

验收：

- 全仓搜索 `completePlanningCheckIn`、`cancelPlanningCheckIn`、`subscribeToPlanningCheckIns`、`planningCheckIn`、`weeklyCheckedPoints`、`applyPlanCheckIn` 无残留引用。
- 历史页积分明细仍能显示 `plan-checkin` / `plan-uncheckin` 事件，并带出侧重与周几（测试覆盖）。
- 规则、规则测试、迁移脚本及其测试保持不变且通过（`npm run test:rules`、`npm run test:migration`）。
- 没有数据写入。
- 标准门禁同 ①。

回滚：

| 步骤 | 回滚方式 | 数据残留 |
|---|---|---|
| ① | revert。生成函数与条目表移除 | `training/state` 上的新字段与已生成的 `source: "plan"` 任务留在文档里，无害（读取按普通任务处理） |
| ② | revert。打卡按钮恢复 | 因为 ③ 还没做，函数仍在；已生成的任务留在列表里，用户可删 |
| ③ | revert。代码恢复 | 无数据变更 |

## 7. 不做事项

- 不改任务页的积分规则（`pointsPerTask`、`dailyBonusPoints` 的取值与结算逻辑）。
- 不改历史页（日历与积分明细）。
- 不改商店。
- 不改学院（内容、PRO 门槛、导入逻辑、文案）。
- 不改 `firestore.rules`。
- 不改账本 schema（`POINTS_LEDGER_REASONS` 保留全部历史原因），除非 §4.d 之外的某个具体问题证明必须改。
- 不把模板扩展到 Junior D 以外的年龄组。**缺口记录：** 模板标题就是「Junior D 阶段训练模板」（`plan-messages.ts` · `plan.title`），计划页没有任何运动员年龄或组别判断（`modules/training/plan/` 下没有出生日期、组别相关引用），所有人看到的是同一套。本设计不解决，只记录。
- 不修改 legacy 仓库，不动生产数据。
- 不在本 PR 里写任何实现代码。

## 8. 待评审决定

| # | 问题 | 本文推荐 |
|---|---|---|
| 1 | 周日「可选/休息」的条目是否生成任务？ | 不生成（`generate: false`），只在计划页展示。休息不应是计分任务 |
| 2 | 侧重是否按周失效？ | 按周有效，新一周需一键确认；不无声重复 |
| 3 | 同一天改侧重，是否重写今天已生成的任务？ | 不重写，次日起生效 |
| 4 | 每天条目数上限 | 3–5 条，用测试卡住上限；是否接受由此带来的单日得分上升（§4.f） |
| 5 | 步骤 ① 是否先不接生成触发，留到 ② | 是，避免两套机制同时计分 |
| 6 | 本模板生成的任务与学院导入是否做跨来源去重 | 不做；留作后续内容工作 |
| 7 | 是否接受不设兼容期直接退役 | 接受，以步骤 ③ 前的只读审计为条件 |

## 9. 风险汇总

| 风险 | 来源 | 缓解 |
|---|---|---|
| 新字段在复制环节悄悄丢失 | `normalizeTask`、`serializeTrainingTask`、`archivedTask` 都是白名单式复制（§4.d） | 往返测试；三处同 PR 修改 |
| 日切前生成，新任务被归档到昨天 | 生成与日切是两个独立事务 | 事务内校验 `lastLoginDate === 今天`（§4.c） |
| 删除后被补回 | 若用「有无 plan 任务」判断 | 用 `planGeneratedDate` 标记（§4.c） |
| 单日积分显著上升 | 逐动作任务（§4.f） | 条数上限；评审时明确接受或调整 |
| 过渡期同日重复计分 | ① 与 ② 之间两套机制并存 | ① 不接触发，②一并去掉打卡按钮（§6） |
| 内容拆分偏离原意 | 21 天文案重排 | 只重排不新增；owner 逐天确认；免责声明保留；英文草稿保持「待评审」 |
| 数据事实过时 | §5 的生产数据是 2026-10-23 的回读，且只覆盖 Lindsay 账号 | 步骤 ③ 前全库只读审计 |
| 旧标签页写入旧打卡 | 规则仍允许该路径（§4.g） | 接受；账本仍自洽 |
