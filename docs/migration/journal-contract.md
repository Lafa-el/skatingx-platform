# M2 契约 — 旧日志站 Firestore → SkatingX

日期：2026-10-21
状态：待决项 a、b、c 已于 2026-10-21 评审拍板（结论见决策记录），本步可合并，M3 待启动。
本文件路径：`docs/migration/journal-contract.md`。M1 盘点是 `docs/migration/journal-inventory.md`。

本步做了两件事：只读普查脚本 `scripts/migration/journal-source-counts.mjs`，以及这份映射契约。源项目 `blaze-skate-journal` 只用 `migration-reader@blaze-skate-journal`（仅 `datastore.viewer`）读了一次全量。在此之前用 `--limit 2` 对过字段计数，那次数字不收入本文。没有写 Firestore，没有改规则，没有改 legacy 仓库。

钥匙只经环境变量 `GOOGLE_APPLICATION_CREDENTIALS` 传入。脚本不打开固定路径，仓库里没有钥匙。

普查 stdout 里的身份只留前 8 位。本文没有日记正文、标题、邮箱、完整旧 uid、完整 URL。新平台目标 uid `baWEw6SZKcQItvcDdpF64ZNe5W12` 是执行期校验锚点，仓库里已经公开使用。

## 0. 源与目标

| | 源 | 目标 |
|---|---|---|
| GCP 项目 | `blaze-skate-journal` | 执行期才分 staging `skatingx-platform` 与 prod `skatingx-prod`。本步都不写 |
| 数据库 | Firestore `(default)`，`nam5` | 同一形态的目标项目 |
| 路径 | 9 个顶层集合，文档带 `athleteId` | 按 §2 推荐，落在 `artifacts/skatingx-production/users/{新uid}/journal/...` |
| 身份 | `athleteId` 等于旧 Auth uid。邮箱 + 密码，无匿名 | 主锚点的数据写入已有 uid。账号迁不迁见 §4 |

日期与时间戳在源里是字符串，不是 Firestore Timestamp。平台 `Timestamp` 也是 ISO 字符串（`packages/schema/src/common.ts`）。`YYYY-MM-DD` 保持日历日，不改成带钟点的瞬间。`createdAt` / `updatedAt` 保持源字符串，不改成执行时的 `serverTimestamp()`。

线上日志库规则是全开式（任何登录账号可读写全库）。仓库里的 `firestore.rules` 从未发布。规则另案处理，本契约不修改、不发布、也不把全开式抄进新平台。

## 1. 字段映射

目标路径按 §2 的推荐案 (ii)。评审若改选 (i) 或 (iii)，下表的路径作废，字段取舍仍然有效。

文档 id：除 `athletes` 外，目标 id 用源文档 id，同一 id 重跑不得变成第二份。源 id 若等于该文档的 `athleteId`，停机，不把完整 uid 写进路径。`athletes` 的源 id 就是 uid，目标固定为 `journal/athlete/main`，不保留源 id。

归属字段 `athleteId` 不写入目标。归属由路径上的新 uid 表达。执行期只用它做 §5 的锚点校验。

缺字段不补 builder 默认值。例如 `energy` 的默认 3 只在写入时存在；实测有的日记没有这个键。补默认会编造当时没有的记录。

字符串日期必须匹配 `YYYY-MM-DD`，否则停机。`createdAt` / `updatedAt` 若存在，必须是含 `T` 的 ISO 字符串，且 `Date.parse` 能解析，否则停机。数值必须是有限数，并落在下表范围内，否则停机。数组字段的元素在普查里不是 object，所以附录没有元素类型；执行期元素必须是字符串，否则停机。

与 M1 builder 的出入（以本次实测为准）：

- 四份有文档的集合里，没有出现 builder 表以外的顶层键。M1 担心的展开表外字段，这次全量里没有。
- `journal_days.schemaVersion` 只在 2 条里的 1 条上。`athletes` 没有 `schemaVersion`，也没有 M1 列出的 `bio`、`level`。
- `energy`、`soreness`、`trainingFocus`、`coachFeedback` 不是每条日记都有。训练课的分项分钟、布尔标记、`lapTimesNote` 等也只出现在 3 条里的 1 条上。
- `coach_notes`、`performance_records`、`video_refs`、`weekly_reviews`、`milestones` 实测都是 0 条。这些集合的允许形状来自 builder，不是实测。多一个键，或类型对不上，停机。`milestones` 的 service 会展开任意对象，没有闭合字段表，因此执行期只要出现任意一条就停机上报，不自动迁。

### 1.1 共用元数据

有文档的集合里，这些键的实测类型都是 string。空集合若出现，也只允许这个类型。

| 源字段 | 决定 | 转换 |
|---|---|---|
| `athleteId` | 不迁 | 只用于锚点校验。不写入目标 |
| `sourceApp` | 迁 | 原样字符串。写入 `legacy.appId` 旁的同名字段。值不是 `blaze-skate-journal` 则停机 |
| `schemaVersion` | 迁 | 原样字符串。日记类必须是 `skatingx-journal-v1`，运动员档必须是 `skatingx-athlete-v1`。缺键允许（实测确实有缺）。其他值停机 |
| `createdAt` | 迁 | 原样 ISO 字符串 |
| `updatedAt` | 迁 | 原样 ISO 字符串 |

`legacy` 固定为 `{ appId: "blaze-skate-journal", collection: "<源集合名>" }`。除运动员档外再加 `documentId`（源 id）。运动员档不写 `documentId`，避免旧 uid 再存一遍。

### 1.2 athletes → `users/{uid}/journal/athlete/main`

实测 1 条。文档 id 等于 `athleteId`。没有 id 不一致的旧档。

| 源字段 | 类型 | 决定 | 目标 |
|---|---|---|---|
| `displayName` | string | 迁 | 同一文档的 `displayName`。不写入、不覆盖 `athletes/lindsay/profile/main` |
| `avatarUrl` | string | 迁 | 同一文档的 `avatarUrl`。不写入 `avatarStoragePath`。不在日志或仓库里打印这个字符串 |
| `birthday` | string | 迁 | 同一文档，原样字符串。普查没有把它当成 `date` 字段做格式统计，执行期不改写成 Timestamp |
| `skatingFrom` | string | 迁 | 同一文档，原样字符串。同上 |
| `bio` | 实测未出现 | 不迁 | M1 有这个键，全量没有。执行期若出现，停机 |
| `level` | 实测未出现 | 不迁 | 同上 |

### 1.3 journal_days → `users/{uid}/journal/days/{sourceId}`

实测 2 条。日期最小 `2026-06-08`，最大 `2026-07-01`，非法日期 0。

| 源字段 | 类型 | 出现条数 | 决定 | 转换 |
|---|---|---|---|---|
| `date` | string | 2 | 迁 | `YYYY-MM-DD` |
| `location` | string | 2 | 迁 | 原样 |
| `dayType` | string | 2 | 迁 | 原样。不按页面默认值改写 |
| `overallFeeling` | number | 2 | 迁 | 有限数，1–5 |
| `energy` | number | 1 | 迁 | 有限数，1–5。缺键保持缺键 |
| `soreness` | string | 1 | 迁 | 原样 |
| `trainingFocus` | string | 1 | 迁 | 原样 |
| `coachFeedback` | string | 1 | 迁 | 原样 |
| `parentNote` | string | 2 | 迁 | 原样 |
| `isCompleted` | boolean | 2 | 迁 | 必须是 boolean |
| `lindsayReflection` | object | 2 | 迁 | 只允许下面三个子键 |
| `lindsayReflection.bestThing` | string | 2 | 迁 | 原样 |
| `lindsayReflection.needsWork` | string | 2 | 迁 | 原样 |
| `lindsayReflection.tomorrowFocus` | string | 2 | 迁 | 原样 |

### 1.4 training_sessions → `users/{uid}/journal/sessions/{sourceId}`

实测 3 条。日期最小 `2026-06-08`，最大 `2026-07-01`，非法日期 0。这是日志站自己的训练课记录，不是 Phase 2 已迁的 `profile/main`，不并进 `training/state` 或 `training/main/records`。

| 源字段 | 类型 | 出现条数 | 决定 | 转换 |
|---|---|---|---|---|
| `date` | string | 3 | 迁 | `YYYY-MM-DD` |
| `sessionLabel` | string | 3 | 迁 | 原样 |
| `sessionType` | string | 3 | 迁 | 原样。builder 不规范化，但实测有，因此保留 |
| `location` | string | 1 | 迁 | 原样 |
| `coachName` | string | 3 | 迁 | 原样 |
| `notes` | string | 3 | 迁 | 原样 |
| `technicalFocus` | string | 1 | 迁 | 原样 |
| `mainSet` | string | 1 | 迁 | 原样 |
| `lapTimesNote` | string | 1 | 迁 | 原样 |
| `equipmentNote` | string | 1 | 迁 | 原样 |
| `recoveryNote` | string | 1 | 迁 | 原样 |
| `durationMinutes` | number | 3 | 迁 | 有限数，≥ 0 |
| `iceTimeMinutes` | number | 1 | 迁 | 有限数，≥ 0 |
| `drylandMinutes` | number | 1 | 迁 | 有限数，≥ 0 |
| `intensity` | number | 3 | 迁 | 有限数，1–5 |
| `focusTags` | array | 3 | 迁 | 元素必须是 string |
| `startsPractice` | boolean | 1 | 迁 | boolean |
| `cornerFocus` | boolean | 1 | 迁 | boolean |
| `straightawayFocus` | boolean | 1 | 迁 | boolean |
| `relayPractice` | boolean | 1 | 迁 | boolean |
| `raceSimulation` | boolean | 1 | 迁 | boolean |

### 1.5 body_status → `users/{uid}/journal/bodyStatus/{sourceId}`

实测 1 条。日期 `2026-06-10`。

| 源字段 | 类型 | 决定 | 转换 |
|---|---|---|---|
| `date` | string | 迁 | `YYYY-MM-DD` |
| `sleepHours` | number | 迁 | 有限数，≥ 0 |
| `fatigueLevel` | number | 迁 | 有限数，1–6 |
| `mood` | number | 迁 | 有限数，1–6 |
| `bodyWeightLb` | number | 迁 | 有限数，≥ 0 |
| `heightCm` | number | 迁 | 有限数，≥ 0 |
| `sorenessAreas` | array | 迁 | 元素必须是 string |
| `injuryNote` | string | 迁 | 原样 |

### 1.6 普查为 0 的集合

这些形状不是实测。执行期出现的文档只能带 §1.1 的元数据和本表的键，类型必须一致，否则停机。数值范围与上面相同：次数和分钟 ≥ 0，`timeSeconds` / `value` ≥ 0。`weekStart` 必须是 `YYYY-MM-DD`。

| 源集合 | 目标 | 允许的业务字段 |
|---|---|---|
| `coach_notes` | `journal/coachNotes/{sourceId}` | `date` string，`coachName` string，`note` string，`priority` string，`followUpTomorrow` boolean，`linkedSessionId` string，`technicalTags` string 数组 |
| `performance_records` | `journal/performance/{sourceId}` | `date` string，`event` string，`metric` string，`timeSeconds` number，`value` number，`isPB` boolean，`context` string，`notes` string |
| `video_refs` | `journal/videos/{sourceId}` | `title` string，`fileName` string，`externalUrl` string，`sessionId` string，`analysisStatus` string，`notes` string，`technicalTags` string 数组。只迁字符串，不拉取 URL，不写入 Storage |
| `weekly_reviews` | `journal/weeklyReviews/{sourceId}` | `weekStart` string，`iceSessions` number，`drylandSessions` number，`privateLessons` number，`totalTrainingMinutes` number，`bestMoment` string，`nextWeekFocus` string，`parentSummary` string，`weekSessions` array，`topTechnicalIssues` array，`topCoachNotes` array，`bestPerformances` array。四个数组的元素必须是 string |
| `milestones` | 不自动迁 | 普查为空。出现任意文档即停机上报 |

`video_refs.externalUrl` 本次没有样本，附录的域名列表为空。不按域名白名单过滤。

## 2. 落点方案（待决项 a）

已采纳 **(ii) 在 `users/{uid}` 下按集合分开镜像**。目标前缀是 `artifacts/skatingx-production/users/{uid}/journal/...`，具体集合见 §1。

现有规则：`firestore.rules` 在 `artifacts/skatingx-production/users/{userId}` 下，除 `raceDay`、`analyses`、`athletes` 三个名字外，`{collection}/{path=**}` 已是所有者可读写。名为 `journal` 的第一段不在排除名单里，更深的 `days/{id}` 由 `path=**` 盖住。按 (ii) 写入不需要新的所有者规则。字段校验若要加，是以后的规则切片，不是这次迁移的前提。

现有代码：`packages/schema/src/paths.ts` 没有日志路径。导航是总览、训练、分析、AI 教练、设置，没有日志页。训练备注、器材备注、赛日 `coachNote` 都不是这批文档的落点。

与 `AGENTS.md` 的差别：规范写的是单一集合 `users/{uid}/journalEntries/{entryId}`。案 (ii) 不用这个名字。M3 写任何代码之前先补一份 ADR（`docs/adr/` 下按仓库现有编号顺延），说明为何不用 AGENTS.md 的单一 journalEntries 集合、改用 `users/{uid}/journal/...` 按集合镜像，理由以 §2 对照表为准。本步不写这份 ADR，也不改代码。

| 方案 | 规则 | 代码 | 以后的界面 |
|---|---|---|---|
| (i) `journalEntries/{entryId}` 加类型字段 | 集合名不在排除名单里，现有所有者规则能盖住。一种文档里九套字段，规则若要校验就得写成大分支 | 与 `AGENTS.md` 的路径一致，不必为路径另写 ADR。转换器要先看类型再分支 | 每个页面都先按类型过滤。运动员档不是一条日记，塞进同一集合会和日记列表混在一起 |
| (ii) `users/{uid}/journal/<集合>/{id}` | 同样被现有所有者规则盖住，不必改规则才能做所有者读写 | 要新增路径。与单一 `journalEntries` 的写法不同，M3 写代码前补 ADR | 一个旧页面对应一个集合，空集合保持空集合。和旧站的分栏一致 |
| (iii) 顶层集合 + `athleteId` | 现有规则只匹配 `users/{userId}` 下面。顶层集合现在没有任何允许语句，必须新写规则。源库的全开式不能拿来用 | 应用的读写都在 uid 前缀下，没有顶层 `athleteId` 查询 | 要维持第二套授权（`athleteId == uid`）。这正是源库规则没收紧的形状 |

不选 (i)，是因为实测形状已经分成日记、训练课、身体、运动员档，后三类还有五个目前为空的集合。一个集合加类型字段，省下的路径名字换不回查询和校验的清楚。(iii) 把数据留在所有者规则外面，和新平台已经在用的边界相反。

## 3. 待决项 b：Phase 3 要不要做界面

已拍板：Phase 3 范围 = 数据迁移 + 旧站归档；日志界面另立项。

两案的数据契约相同，差在 Phase 3 的完成线。

| 选项 | 工期含义 |
|---|---|
| 数据迁移 + 旧站归档，日志界面另立项 | M3–M6 只做映射、脚本、staging 和生产数据。M7 只做旧站横幅和只读规则。新平台导航不加日志页。Phase 3 在数据可对账、旧站只读之后结束 |
| 含最小日志界面（至少可看） | 上面的数据步骤都要做。另外还要只读路由、按集合的列表、空态、加载和错误，以及中英文案。没有可看的页面，Phase 3 不算完成。归档仍然排在数据落定之后 |

## 4. 待决项 c：日志站账号

已拍板：账号不迁、只迁数据。

按普查给出推荐。

普查：每个有文档的集合，`distinct athleteId` 都是 1，缺失 0。`journal_days` 2 条全部属于主锚点，占比 100%。没有第二个人的数据。

| 选项 | 工期含义 |
|---|---|
| 带哈希导入 `skatingx-prod` | 要另备一把日志项目的 Auth Admin 钥匙。本步的 viewer 钥匙读不到哈希。Phase 1 的先例是 2026-10-20：`projects.getConfig` 的 `signIn.hashConfig` 给出 scrypt 参数，`listUsers` 给出每人的 `passwordHash` 和 `passwordSalt`；算法是 `SCRYPT` 且两者都在，才带哈希导入，原密码可以继续用；否则导入 uid 并标 `password-reset`。没有邮箱的密码账号整批停止。那次导入保留的是源 uid。日志站的 uid 不是 `baWEw6SZKcQItvcDdpF64ZNe5W12`。带哈希导入会在生产 Auth 里再有一个账号，不会自动把文档挂到已经在用的 uid 上。M6 之前多一轮 Auth 演练 |
| 只迁主账号一家 | 与本次数据范围一致：只有一个 `athleteId`。若这一家仍要旧密码在新平台可用，Auth 工作量与上一行相同，只是人数是 1。若不要旧密码，就收成下一行 |
| 不迁账号，只迁数据 | 不读 Auth，不建号。M4 起把主锚点的文档写到已有 uid。旧站密码只在旧站有效，直到归档。没有 Auth Admin 这一步 |

推荐 **不迁账号，只迁数据**。人只有一个，而且就是主锚点；目标账号已经在新平台上。带哈希导入保留的是另一套 uid，解决不了「文档要进哪个账号」。Phase 1 当时没有一个预先存在的目标 uid 要去对接，所以那次保留源 uid 是对的。这次前提不同。

## 5. 身份链

主锚点是 `journal_days` 条数最多的 `athleteId`。全文不进仓库。前 8 位是 `pH6yf0RX`。

执行期重算这个人。前 8 位不是 `pH6yf0RX`，或者 `journal_days` 上出现第二个 `athleteId`，立即停机，不写。条数允许比 2 多（源库在迁移前仍可能新增），新文档的字段必须仍被 §1 盖住，否则同样停机。

对上之后，数据只写入 `baWEw6SZKcQItvcDdpF64ZNe5W12`。目标 uid 不是这个值，停机。日志只记「匹配 / 不匹配」。

其余 `athleteId`：不迁，不删除，留在源库直到归档期满。本次人数是 0。`athletes` 里文档 id 与 `athleteId` 不一致的旧档本次是 0。执行期这个差数若不是 0，停机，不把旧档并进主档。

## 6. localStorage

三把键都不在 Firestore 里。迁移脚本读不到，也不要求把浏览器里的值贴进仓库。

| 键 | 处置 |
|---|---|
| `blaze_lang` | 不迁。新平台语言在 `settings/main`，以那里的现值为准，不覆盖 |
| `notification_preferences` | 不迁。只在这台浏览器。新平台没有对应的日记通知开关，不为此发明字段 |
| `summer_camp_dates` | 不迁。夏令营起止日只在本地。新平台没有这个设置。`milestones` 又是空的，没有另一份营期数据可迁 |

## 7. 红线

- 源库全程只读。脚本只使用 get / query / list。写入、改规则、改 legacy 仓库都不在本契约的执行范围内。
- 任何集合出现本契约没有列出的字段名，或列出的字段类型对不上，停机上报。不跳过该字段继续写。
- 不复制源库的全开式规则。
- `avatarUrl` 不进入 `avatarStoragePath`。
- 日记正文、标题、邮箱、完整旧 uid、完整 URL 不进仓库，不进执行日志。
- 旧站导出功能的集合是八个，不含 `athletes`。那份导出不是备份。完整备份以迁移脚本在写入前做的快照为准，快照必须含 `athletes`。快照放在仓库外。

## 8. 后续里程碑

- M3：映射纯函数。输入是契约里的字段，输出是目标文档。未知字段直接抛停。若 §2 采纳 (ii)，先补 ADR 再写路径。
- M4：迁移脚本 + emulator 演练。默认 dry-run。写入前在仓库外做含 `athletes` 的快照。锚点前 8 位或目标 uid 不符则停机。
- M5：staging `skatingx-platform` 演练。不对生产写。
- M6：生产 `skatingx-prod`，只写 `baWEw6SZKcQItvcDdpF64ZNe5W12` 名下的日志路径。源库仍只读。
- M7：旧日志站归档。横幅指向新平台，规则改为只读。数据保留到归档期满，不在本步删除。

## 附录：2026-10-21 全量普查

命令形态：`node scripts/migration/journal-source-counts.mjs --full`。模式行是 `mode=full`。项目 `blaze-skate-journal`。只跑了这一次全量。

文本字节是锚点全部文档里字符串的 UTF-8 长度合计，不是某一字段的正文。

### 集合计数

| 集合 | 文档数 | distinct athleteId | 缺失 athleteId | 日期 |
|---|---:|---:|---:|---|
| `athletes` | 1 | 1 | 0 | 无 `date` / `weekStart` |
| `journal_days` | 2 | 1 | 0 | `date` 2026-06-08 – 2026-07-01，非法 0 |
| `training_sessions` | 3 | 1 | 0 | `date` 2026-06-08 – 2026-07-01，非法 0 |
| `coach_notes` | 0 | 0 | 0 | 无 |
| `body_status` | 1 | 1 | 0 | `date` 2026-06-10 – 2026-06-10，非法 0 |
| `performance_records` | 0 | 0 | 0 | 无 |
| `video_refs` | 0 | 0 | 0 | 无 |
| `weekly_reviews` | 0 | 0 | 0 | 无 `weekStart` 样本 |
| `milestones` | 0 | 0 | 0 | 空集 |

`athletes`：文档 id 等于 `athleteId` 的 1 条，不相等的 0 条，缺 `athleteId` 的 0 条。

`video_refs`：域名 distinct 列表为空。非法 URL 0，空 `externalUrl` 0。

`milestones`：0 条，为空。

### 主锚点

前 8 位 `pH6yf0RX`。`journal_days` 2 条，日期 `2026-06-08` 至 `2026-07-01`，非法日期 0。名下文本合计 111827 字节（约 1.1×10^5）。

| 集合 | 该锚点文档数 |
|---|---:|
| `athletes` | 1 |
| `journal_days` | 2 |
| `training_sessions` | 3 |
| `coach_notes` | 0 |
| `body_status` | 1 |
| `performance_records` | 0 |
| `video_refs` | 0 |
| `weekly_reviews` | 0 |
| `milestones` | 0 |

没有并列第一，所以锚点不是平局。

### 字段普查

空集合没有字段行。出现条数是「至少含该字段的文档数」，同一文档只计一次。

`athletes`：

| 字段 | 文档数 | 类型 |
|---|---:|---|
| `athleteId` | 1 | string |
| `avatarUrl` | 1 | string |
| `birthday` | 1 | string |
| `createdAt` | 1 | string |
| `displayName` | 1 | string |
| `skatingFrom` | 1 | string |
| `sourceApp` | 1 | string |
| `updatedAt` | 1 | string |

`journal_days`：

| 字段 | 文档数 | 类型 |
|---|---:|---|
| `athleteId` | 2 | string |
| `coachFeedback` | 1 | string |
| `createdAt` | 2 | string |
| `date` | 2 | string |
| `dayType` | 2 | string |
| `energy` | 1 | number |
| `isCompleted` | 2 | boolean |
| `lindsayReflection` | 2 | object |
| `lindsayReflection.bestThing` | 2 | string |
| `lindsayReflection.needsWork` | 2 | string |
| `lindsayReflection.tomorrowFocus` | 2 | string |
| `location` | 2 | string |
| `overallFeeling` | 2 | number |
| `parentNote` | 2 | string |
| `schemaVersion` | 1 | string |
| `soreness` | 1 | string |
| `sourceApp` | 2 | string |
| `trainingFocus` | 1 | string |
| `updatedAt` | 2 | string |

`training_sessions`：

| 字段 | 文档数 | 类型 |
|---|---:|---|
| `athleteId` | 3 | string |
| `coachName` | 3 | string |
| `cornerFocus` | 1 | boolean |
| `createdAt` | 3 | string |
| `date` | 3 | string |
| `drylandMinutes` | 1 | number |
| `durationMinutes` | 3 | number |
| `equipmentNote` | 1 | string |
| `focusTags` | 3 | array |
| `iceTimeMinutes` | 1 | number |
| `intensity` | 3 | number |
| `lapTimesNote` | 1 | string |
| `location` | 1 | string |
| `mainSet` | 1 | string |
| `notes` | 3 | string |
| `raceSimulation` | 1 | boolean |
| `recoveryNote` | 1 | string |
| `relayPractice` | 1 | boolean |
| `schemaVersion` | 1 | string |
| `sessionLabel` | 3 | string |
| `sessionType` | 3 | string |
| `sourceApp` | 3 | string |
| `startsPractice` | 1 | boolean |
| `straightawayFocus` | 1 | boolean |
| `technicalFocus` | 1 | string |
| `updatedAt` | 3 | string |

`body_status`：

| 字段 | 文档数 | 类型 |
|---|---:|---|
| `athleteId` | 1 | string |
| `bodyWeightLb` | 1 | number |
| `createdAt` | 1 | string |
| `date` | 1 | string |
| `fatigueLevel` | 1 | number |
| `heightCm` | 1 | number |
| `injuryNote` | 1 | string |
| `mood` | 1 | number |
| `sleepHours` | 1 | number |
| `sorenessAreas` | 1 | array |
| `sourceApp` | 1 | string |
| `updatedAt` | 1 | string |

## 决策记录（2026-10-21）

- (a) 落点采纳案 (ii)：artifacts/skatingx-production/users/{uid}/journal/... 按源集合镜像；现有所有者规则直接覆盖，不为迁移改规则；ADR 在 M3 前补齐。
- (b) Phase 3 范围 = 数据迁移 + 旧站归档；日志界面另立项。Phase 3 完成线：数据迁入生产且可逐项对账、旧站只读归档。迁入的数据在新平台暂时没有界面展示，此为已接受的已知状态。
- (c) 账号不迁、只迁数据：不读日志站 Auth、不带哈希导入；主锚点 pH6yf0RX 的文档写入已有目标 uid baWEw6SZKcQItvcDdpF64ZNe5W12；旧站密码仅在旧站有效至归档。
