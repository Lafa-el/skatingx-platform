# M2 契约 — 旧训练站 profile/main → SkatingX

日期：2026-10-21
状态：待评审。开口项 a–d 标「待批」，未拍板前不写 M3 映射实现，不写迁移脚本，不写任何环境的数据。
本文件路径：`docs/migration/training-contract.md`。M1 盘点是 `docs/migration/training-inventory.md`（以 #73 合并后的修正为准）。

本步做了两件事：只读计数脚本 `scripts/migration/training-source-counts.mjs`，以及这份映射契约。源项目只用 `migration-reader@blaze-skate-training-platform` 读了一次。没有写 Firestore，没有改规则，没有改 legacy 仓库。

计数里的身份只留在本地 stdout。本文没有旧 uid、邮箱、成绩、PIN、头像或文档正文。新平台 Lindsay 的 uid `baWEw6SZKcQItvcDdpF64ZNe5W12` 是执行期校验锚点，仓库里已经公开使用。

## 0. 源与目标

| | 源 | 目标 |
|---|---|---|
| GCP 项目 | `blaze-skate-training-platform` | 执行期才分 staging `skatingx-platform` 与 prod `skatingx-prod`。本步都不写 |
| 路径前缀 | `artifacts/blaze-skate-production` | `artifacts/skatingx-production` |
| 用户数据 | `users/{旧uid}/profile/main` 单文档 | 按字段拆到 settings、运动员档、gamification、training state、taskHistory、records、rewards。见 §1 |
| 运动员 | 无子档 | 迁入时运动员 id 用现有 `lindsay`（`DEFAULT_ATHLETE_ID`） |

父文档 `users/{uid}` 本身可以不存在。应用只写 `profile/main`。计数结果与此一致，见附录。

执行期身份：用 Admin Auth 读旧 uid 的邮箱，再在新平台 Auth 里找同一邮箱。对上之后，新 uid 还必须等于锚点 `baWEw6SZKcQItvcDdpF64ZNe5W12`，否则停止。日志只记「匹配 / 不匹配」，不把邮箱写进仓库。本步没有读 Auth。

匿名或没有邮箱的旧 uid 默认不迁。开口项 a 若改成「全部真实数据」，没有邮箱的 uid 仍然不迁。

## 1. 逐字段映射

目标路径都在 `packages/schema/src/paths.ts`。任务与历史日的写出形状以 `serializeTrainingTask` / `serializeTaskHistoryDay`（`packages/firebase-client/src/firestore/sanitize.ts`）为准。成绩形状以 `TimeEntry` 与 `DistanceRecordsDocument`（`packages/schema/src/records.ts`）为准。平台的 `Timestamp` 类型就是 ISO 字符串（`packages/schema/src/common.ts`），不是 Firestore 的 Timestamp 对象。文档上的 `updatedAt` 沿用现有写入：`serverTimestamp()`。条目标的 `createdAt` 用 ISO 字符串。

未知顶层键：停止该用户，不跳过。允许出现的键 = 附录普查到的键，再加 M1 里只读、但普查为 0 份的 `raceDate`。

### 1.1 根字段

| 旧字段 | 决定 | 目标 / 理由 |
|---|---|---|
| `tasks` | 迁 | `athletes/lindsay/training/state` 的 `todayTasks`。形状见 §1.2。目标数组已有的 id 保留；只追加源里还没有的 id。源数组为空则不写这个字段 |
| `taskHistory` | 迁 | `athletes/lindsay/training/main/taskHistory/{dateId}`，一天一文档。见 §1.3 |
| `lastLoginDate` | 有条件 | 没有写入 `todayTasks` 时，不改目标的 `lastLoginDate`。写入了 `todayTasks` 时，把它设成执行当天的 `todayDateString()`。若抄一个更早的日期，`TrainingDayRollover` 会把刚写入的今日任务再归档一次 |
| `weeklyTemplate` | 迁 | 同在 `training/state`。键映射见 §1.4。目标某天已是非空字符串则保留，空字符串才用旧值补 |
| `points` | 待批 | 落点是 `athletes/lindsay/gamification/main.points`。怎么与已有值合并见开口项 b |
| `completedDays` | 迁 | 同一份 `gamification/main.completedDays`，按日期并集、去重、排序。`streakDays` 不抄旧值（源文档没有这个字段）；用 `calculateStreakDays` 按并集和执行日重算。普查里这个数组的最大长度是 0 |
| `pointsPerTask` / `dailyBonusPoints` | 待批 | 落点是 gamification 上的同名可选字段。见开口项 d。新平台缺省是 20 和 50（`defaults.ts`） |
| `records`、`records777`、`records1000`、`records1500`、`recordsStart`、`recordsLap`、`records_*` | 迁 | `athletes/lindsay/training/main/records/{distanceId}`。见 §1.5。目标已有的 entry id 保留，只追加 |
| `customRewards` | 不迁 | 112 份文档长度都是 4，等于源码 `defaultData` 的 4 条默认商品，没有增删。新平台有自己的默认目录（`defaults-rewards.ts`）。把旧默认盖进去会换掉正在用的商品。兑换历史全部为 0，没有要迁的兑换 |
| `rewardHistory` | 不迁 | 同上，112 份都是空数组 |
| `customDistances` | 不迁 | 距离由 `records*` 的键决定。普查没有 `records_*` 自定义键。没有成绩的距离名没有单独落点 |
| `competitionGoalsV1` | 待批 | 无产品落点。见开口项 c |
| `trainingPlansV1` / `activeTrainingPlanId` | 待批 | 无产品落点。见开口项 c。不写入 `planning/main/completedTasks`（那是 Junior D 打卡） |
| `races` / `raceDate` | 待批 | 无同形产品落点。见开口项 c。`raceDate` 在 112 份里出现 0 次，只作为允许键留着 |
| `language` / `theme` | 不迁 | 新平台以 `settings/main` 的现值为准。旧主题是配色名，新字段默认 `system` |
| `username` | 不迁 | 不写入 `displayName`。运动员档已有显示名，本 Phase 不覆盖 |
| `isPro` | 不迁 | 红线，见 §2 |
| `parentPin` | 不迁 | 红线，见 §2 |
| `avatar` | 不迁 | 红线，见 §2 |
| `ownerUid` / `sourceApp` / `schemaVersion` / `createdAt` / `updatedAt` | 不迁 | 不写进目标业务字段。24 份文档带这些键，值是字符串。执行日志只记计数 |

`customRewards` 若将来某份文档不是那 4 条默认值，停止并另批，不在本契约里临时发明覆盖规则。本次普查没有这种文档。

### 1.2 任务 id、形状、时间

旧任务没有 `createdAt`。`id` 在源码里是 `Date.now() + Math.random()`，类型是 number。确认档案的 `tasks` 长度为 0，所以这次没有活样本；id 规则以 M1 源码为准。比赛清单和商品的 `id` 在确认档案里是 number，同一套字符串规则备用。

稳定 id：

1. 空 id：`legacy-task-{index}`，`index` 是该数组里的 0 起点下标。
2. 其他：`legacy-task-` + `String(id)`。用读到的数字直接转字符串，同一文档重跑结果相同。
3. 同一个目标数组里字符串冲突：先出现的保持原样，后出现的再加 `-` 和下标。
4. 不同日期的历史文档各自算冲突，不要求全局唯一。新平台 `createTaskId` 的前缀是 `task_`，与 `legacy-task-` 不撞。

迁入后的任务必须能通过 `serializeTrainingTask`：

| 目标字段 | 规则 |
|---|---|
| `id` | 上面的字符串 |
| `text` | 旧 `text`。缺了或不是字符串则停止 |
| `target` | 非空字符串才写 |
| `description` | 来自旧 `desc`。非空才写。不写已废弃的 `desc` |
| `source` | 旧 `isTemplate === true` 时写 `academy`，否则 `manual`。不编 `academyItemId`（旧条目没有内容库 id） |
| `completed` | 布尔。缺省当 false |
| `createdAt` | 历史日里的任务用 `{dateId}T00:00:00.000Z`。今日任务用该文档的 `lastLoginDate` 加上同一时刻；`lastLoginDate` 不是 `YYYY-MM-DD` 则停止。这是日历日，不是当时的钟点 |
| `completedAt` | 仅 `completed === true` 时写，取值与 `createdAt` 相同 |
| `tags` | 不写 |

### 1.3 taskHistory

对齐 `serializeTaskHistoryDay` 与 `runDayRolloverIfNeeded` 已经在写的文档：

```text
athletes/{uid}/training/main/taskHistory/{dateId}
{
  dateId: "YYYY-MM-DD",
  tasks: TrainingTask[],
  archivedAt: "{dateId}T00:00:00.000Z"
}
```

旧值是 `profile/main.taskHistory` 这个 map，键是日期，值是任务数组，没有 `archivedAt`。`archivedAt` 用日期当天的 00:00:00.000Z，表示「由迁移补上」，不是当时的归档钟点。键不是 `YYYY-MM-DD` 则停止。目标文档已存在则按任务 id 追加，不整份覆盖，也不删除目标里多出来的任务。

确认档案的 `taskHistory` 是空对象。规则仍然按 M1 的跨天写入形状定，不因为这份档案为空而改掉。

### 1.4 weeklyTemplate

旧键是 JavaScript `Date.getDay()`：`"0"` 星期日 … `"6"` 星期六。`defaultData` 与确认档案都是这 7 个键，值是字符串。

| 旧键 | 目标键 |
|---|---|
| `"0"` | `sunday` |
| `"1"` | `monday` |
| `"2"` | `tuesday` |
| `"3"` | `wednesday` |
| `"4"` | `thursday` |
| `"5"` | `friday` |
| `"6"` | `saturday` |

缺键当空字符串。多出来的键停止。

### 1.5 成绩

旧元素只有 `{ date, time }`，`time` 是秒。目标 `TimeEntry`：

| 目标字段 | 规则 |
|---|---|
| `id` | `legacy-time-{distanceId}-{index}`。下标保证同一文档内唯一，不把成绩数字放进 id |
| `date` | 旧 `date`。不是 `YYYY-MM-DD` 则停止 |
| `timeSeconds` | 旧 `time`。不是有限数字则停止 |
| `source` | `manual` |
| `createdAt` | `{date}T00:00:00.000Z` |
| `note` | 不写。旧元素没有备注 |
| `updatedAt` | 条目上不写 |

文档：

```text
athletes/{uid}/training/main/records/{distanceId}
{
  distanceId,
  label,
  unit: "seconds",
  entries: TimeEntry[],
  updatedAt: serverTimestamp()
}
```

键名：

| 旧键 | `distanceId` | `label` |
|---|---|---|
| `records` | `500m` | `500m` |
| `records777` | `777m` | `777m` |
| `records1000` | `1000m` | `1000m` |
| `records1500` | `1500m` | `1500m` |
| `recordsStart` | `start` | `起跑` |
| `recordsLap` | `lap` | `单圈` |

`recordsStart` / `recordsLap` 不映射到新平台已有的 `start_half_lap`、`start_lap`、`fastest_lap`。那三项是另一组距离。

`records_{后缀}`：普查里出现 0 次，规则仍写死。后缀先按旧站 `normalizeRecordDistance` 的结果归并：`500m` / `777m` / `1000m` / `1500m` / `Start` / `Lap` 并入上表。其余后缀做成 `distanceId`：转小写、空白变 `_`、去掉 `[a-z0-9_]` 以外的字符。结果为空则停止。`label` 用原始后缀。两个旧键归到同一个 `distanceId` 时，按键名排序后拼接条目，id 仍带各自的下标。

## 2. 红线

不许讨论、不许绕开，也不许放进开口项 c 的备份文档。

1. `parentPin` 明文不进新平台任何字段。DR-011 将来只存哈希，而且要用户重设。迁移不把旧字符串当成哈希，不写入 `parentPinHash`，不写入 `parentPinEnabled`。
2. 旧 `isPro` 不抄到 `settings/main.isPro`。两边都是人工布尔、都没有到期日，但价格和权益不是同一个商品（旧站文案 `$14.99` / 年、微信人工开通；新平台是 `$19.99` / 月，已由人工标记）。新平台的值保持现状。
3. `avatar` 的 data URL 不写入 `avatarStoragePath`，也不另存成文件。该字段留在源项目里。

## 3. 待批开口项

每项都未定。推荐只供拍板。

### a. 迁移范围

普查：112 份 `profile/main`；非空 `username` 只有 1 份，本地 stdout 确认它匹配 Lindsay。按 §1 的「真实训练数据」口径（积分大于 0，或任务、历史日期、成绩、目标、计划、兑换、比赛清单、全勤里至少一项非空；默认商品不算）有 12 份。其余 11 份没有 username。档案上没有邮箱字段。本步没有读 Auth，不能判断那 11 份是匿名还是没填显示名的正式账号。

| 选项 | 含义 |
|---|---|
| 只迁确认的那一份 | 写入锚点 uid 下的 `athletes/lindsay`。另外 11 份不动 |
| 全部真实数据 | 执行期对 12 份做 Auth 邮箱核对。邮箱能在新平台对上的才迁。没有邮箱的不迁 |

推荐：只迁确认的那一份。依据：只有这一份能在不读 Auth 的情况下对上人；另外 11 份没有显示名，也没有档案内邮箱。全部迁移要等单独的 Auth 核对，不该在本契约里预先当成已经对上。

### b. 积分合并

落点 `gamification/main.points`。分析迁移没有把训练积分并进去（`mergedIntoTrainingPoints` 为 false）。两边是两本独立的账。

| 选项 | 含义 |
|---|---|
| 旧值覆盖 | 丢掉新平台已经积累的积分 |
| 新值保留 | 丢掉旧站积分 |
| 取大 | 保留较大的那个数 |
| 相加 | 两本账相加 |

推荐：取大。覆盖或保留都会丢掉一边；相加会在两边都给过同类打卡时把余额抬高。取大不双计，也不把较高的那本账抹掉。

### c. 没有产品落点的数据

涉及 `competitionGoalsV1`、`trainingPlansV1`、`activeTrainingPlanId`、`races`、`raceDate`。确认档案没有目标和计划这两个键，比赛清单长度是 6。`raceDate` 全库 0 次。

| 选项 | 含义 |
|---|---|
| 先迁为备份 | 只把这些键写到 `users/{新uid}/migrationBackups/training-unmapped`。应用不读它。文档里不得出现 `parentPin`、`avatar`、`isPro`，也不得是整份 profile |
| 本 Phase 不迁 | 这些键留在旧项目。确认档案上的 6 条比赛清单不会进新平台 |

推荐：先迁为备份。依据：比赛清单在确认档案上有 6 条，不迁就丢；目标和计划这次虽然不在这份档案上，但全库有 19 份文档带这两个键（最大 4 条目标和 3 条计划）。备份不假装新平台已经有目标页或计划页。

### d. 每任务分 / 全勤分

旧源码默认是 `pointsPerTask = 10`、`dailyBonusPoints = 20`。普查 112 份全部是这两个数，没有一份改过。

| 选项 | 含义 |
|---|---|
| 偏离默认才写入 | 等于 10 和 20 时不写，让新平台继续用 20 和 50。出现其他数字则把该数字写入 gamification 同名字段 |
| 一律不写 | 即使将来读到其他数字也不写 |
| 一律按旧值写 | 把 10 和 20 写进新平台，盖过 20 和 50 |

推荐：偏离默认才写入。依据：这次没有人改过；把 10 和 20 写进去会改变新平台的计分，又没有保住任何个人设置。执行时若读到不是 10 或 20 的值，按这个选项写入，不另做一次全库扫描。

## 4. 身份

| 情况 | 口径 |
|---|---|
| 确认的那一份 | 执行期用旧 uid 的 Auth 邮箱去新平台找用户。找到的 uid 必须是 `baWEw6SZKcQItvcDdpF64ZNe5W12`，运动员 id 用 `lindsay`。对不上就停止，不改用显示名硬迁 |
| 匿名、无邮箱 | 默认不迁 |
| 开口项 a 若选全部真实数据 | 仍然只迁邮箱能对上的 uid。对不上的列入跳过计数，不新建新平台用户 |
| 游客在绑定邮箱时换号留下的旧 uid | 与匿名相同：没有可用邮箱就不迁。不把两份旧文档合并 |

本步没有调用 Auth，所以上表的邮箱核对还没发生。

## 5. 后续步骤

| 步 | 做什么 | 停止点 |
|---|---|---|
| M3 | 把 §1 的规则写成纯函数，用固件测试锁住 id、日期、距离键、历史日形状、红线字段被丢弃 | 开口项 a–d 未批，或测试未绿，不进 M4 |
| M4 | 迁移脚本。默认 dry-run。写入必须显式参数，并区分 emulator / staging / prod | 未 dry-run、计数对不上、出现未知键、邮箱锚点对不上，都不写 |
| M5 | staging 演练。目标项目 `skatingx-platform` | 演练账目不齐不进生产 |
| M6 | 生产执行。目标项目 `skatingx-prod`。要单独授权 | 没有当次授权不写生产 |
| M7 | 旧站只读或归档 | 不在本契约里决定，另开任务 |

M4 及以后才允许写。M3 仍然不写数据库。

## 6. 未验证与风险

| 项 | 对执行的影响 | 缓解 |
|---|---|---|
| 旧项目 Security Rules 仍不在仓库里，也没有对照控制台 | 不知道客户端能不能读到别人的 `profile/main` | 执行走 Admin SDK，不走规则。不把规则放宽当成迁移手段。M5 之前不改规则 |
| 线上 bundle 与 legacy HEAD `5d17539` 没有逐字节比对 | 线上若比 HEAD 多一个字段，M1 源码表会漏 | 字段语义以 M1 源码和附录这次真实结构互相印证。执行时见到允许清单以外的键就停止 |
| 本步没有读 Auth | 不能把另外 11 份真实数据对上邮箱 | 身份规则放在执行期。本步不为此再扫一遍 Firestore |
| 确认档案没有任务和历史日样本 | id 与 `createdAt` 的活数据形态没在这份档案上出现 | 规则按 M1 源码写死；全库 `tasks` 最大长度 3、历史日期最大 1，说明别处有样本，但不把那些文档的内容抄进来 |
| 单文档里的头像字符串 | 确认档案序列化约 24303 字节，是全库最大。没有拆每个字段的字节 | 头像不迁，所以目标文档不会带上这段体积 |

## 附录 A. 只读计数（2026-10-21，只跑一次）

脚本：`scripts/migration/training-source-counts.mjs --live`。凭证经 `GOOGLE_APPLICATION_CREDENTIALS` 指向训练项目的只读账号。`FIRESTORE_EMULATOR_HOST` 与 `FIREBASE_AUTH_EMULATOR_HOST` 未设置。没有第二遍全量读取。

| 项 | 数 |
|---|---|
| `users` 路径（`listDocuments`，含只有子集合、自身不存在的父文档） | 112 |
| 父文档 `users/{uid}` 实际存在 | 0 |
| `profile/main` 存在 | 112 |
| 非空 `username` | 1 |
| 真实训练数据（§3.a 的口径） | 12 |
| `isPro === true` | 1 |
| `pointsPerTask` | 112 份都是 10 |
| `dailyBonusPoints` | 112 份都是 20 |
| 带 `createdAt` / `ownerUid` / `schemaVersion` / `sourceApp` / `updatedAt` | 各 24 |
| 带 `lastLoginDate` 或 `taskHistory` | 各 106 |
| 带 `competitionGoalsV1` / `trainingPlansV1` / `activeTrainingPlanId` | 各 19 |
| `raceDate`、任意 `records_*` | 0 |
| 序列化字节 | 最大 24303，中位 864 |

数组长度（有该键的文档；中位含 0）：

| 键 | 文档数 | 最大 | 中位 |
|---|---|---|---|
| `tasks` | 112 | 3 | 0 |
| `taskHistory` 的日期键 | 106 | 1 | 0 |
| `competitionGoalsV1` | 19 | 4 | 0 |
| `trainingPlansV1` | 19 | 3 | 0 |
| `records` | 112 | 4 | 0 |
| `records777` | 112 | 1 | 0 |
| `records1000` | 112 | 1 | 0 |
| `records1500` | 112 | 1 | 0 |
| `recordsStart` | 112 | 1 | 0 |
| `recordsLap` | 112 | 1 | 0 |
| `customRewards` | 112 | 4 | 4 |
| `rewardHistory` | 112 | 0 | 0 |
| `races` | 112 | 6 | 0 |
| `completedDays` | 112 | 0 | 0 |

顶层键出现次数见这次脚本的 AGGREGATE 输出，与上表一致。没有契约外的键。

确认的那一份（本地仅 1 个 username 匹配；uid 与 username 不写入本文件）：

| 项 | 结果 |
|---|---|
| 序列化近似字节 | 24303 |
| 顶层键 | `avatar`、`completedDays`、`createdAt`、`customDistances`、`customRewards`、`dailyBonusPoints`、`isPro`、`language`、`lastLoginDate`、`ownerUid`、`parentPin`、`points`、`pointsPerTask`、`races`、`records`、`records1000`、`records1500`、`records777`、`recordsLap`、`recordsStart`、`rewardHistory`、`schemaVersion`、`sourceApp`、`taskHistory`、`tasks`、`theme`、`updatedAt`、`username`、`weeklyTemplate` |
| 没有的键 | `competitionGoalsV1`、`trainingPlansV1`、`activeTrainingPlanId`、`raceDate`、任何 `records_*` |
| `tasks` | 0。没有任务叶子样本 |
| `taskHistory` | 空对象，日期键 0 |
| `completedDays` / `rewardHistory` | 0 |
| `customDistances` | 6 个字符串 |
| `customRewards` | 4 个对象，叶子是 `id` number、`name` string、`cost` number、`icon` string |
| `races` | 6 个对象，叶子是 `id` number、`name` string、`date` string |
| `records` | 3。元素叶子 `date` string、`time` number |
| `records777` / `records1000` / `records1500` / `recordsStart` / `recordsLap` | 各 1，叶子同为 `date` string、`time` number |
| `weeklyTemplate` | 键 `"0"` … `"6"`，值都是 string |
| 其余标量 | `avatar`、`createdAt`、`language`、`lastLoginDate`、`ownerUid`、`parentPin`、`schemaVersion`、`sourceApp`、`theme`、`updatedAt`、`username` 是 string；`dailyBonusPoints`、`points`、`pointsPerTask` 是 number；`isPro` 是 boolean |

这些类型与 M1 源码一致：成绩没有备注，商品 id 是数字，周模板是 0–6，元数据是字符串而不是 Firestore Timestamp。
