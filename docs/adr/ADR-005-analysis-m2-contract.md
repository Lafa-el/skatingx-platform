# ADR-005: 分析模块 M2 契约

| 字段 | 值 |
|---|---|
| 状态 | **路径分法已于 2026-10-19 通过。** 契约其余部分仍为提议。整份契约批准前不写移植代码，不进 M3/M4。 |
| 日期 | 2026-10-19 |
| 分支 | `migration/analysis-contract` |
| 依据 | 执行计划 v1.0 的 §1、§2；M1 盘点 `docs/migration/analysis-inventory.md`（`main` `90de45d`）；DR-001 / DR-003 / DR-004 / DR-007 / DR-008 |
| 不做 | 不重做 M1。不建 `apps/web/src/modules/analysis/` 脚手架。不改 `paths.ts`、Security Rules、Race Day、legacy 仓库、生产数据。不碰 Pose Landmarker（draft PR #50）。 |

类型见 `docs/migration/analysis/contract-types.ts`。固件清单见 `docs/migration/analysis/fixtures.md`。中文文案见 `docs/migration/analysis/copy-zh.md`（英文列留空）。

---

## 1. 路径分法（2026-10-19 通过）

Owner 通过下面的分法。`analyses/{analysisId}` 放在用户级，6 段。DR-003 的意图用字段保留：分析文档的 `athleteId` 写 `lindsay`，数据归 lindsay，不归 `default`。器材和打卡不写入这份分析文档。`AnalysisRecord.createdAt` 用 ISO 字符串，不用 `serverTimestamp`。

| 数据 | 路径 | 段数 | 理由 |
|---|---|---|---|
| 一次生物力学或配速分析 | `artifacts/skatingx-production/users/{uid}/analyses/{analysisId}` | 6 | 用户级文档。`athleteId` 字段写 `lindsay`。不是「一个文档装下全部用户数据」。 |
| 运动员身份 | `.../users/{uid}/athletes/lindsay/profile/main`，`settings/main.activeAthleteId = "lindsay"` | 8 / 6 | DR-003。`default` 归档、不在界面显示。不把 uid 再当成运动员 id。 |
| 官方积分 | `.../athletes/lindsay/gamification/main` | 8 | DR-004。训练积分是官方余额。legacy `profile/lindsay.points` 只进迁移备份，不累加。 |
| 页签三打卡 | `.../athletes/lindsay/planning/main/completedTasks/{taskId}` | 10 | 与训练侧 `training/main/records/{id}` 同构。新打卡只增加训练积分，不另建分析侧积分。 |
| 器材历史 | `.../athletes/lindsay/equipment/main/records/{recordId}` | 10 | 与训练侧同构。旧站的器材记录是用户级历史，不是某一次视频分析的子文档。 |

`paths.planningCompletedTask` 和 `paths.equipmentRecord` 各是 9 段。Firestore 文档路径必须是偶数段，9 段写不进去。已通过的写法是在 `planning` 和 `equipment` 后加一层 `main`。**这两个 9 段函数保持不动，禁止沿用。** 器材历史用 `paths.equipmentHistoryRecord`。页签三打卡用 `paths.planningCheckIn`（10 段）。

`paths.analysisSession` 指向另一条路径：`.../athletes/{athleteId}/analysis/sessions/{sessionId}/summary`（10 段，偶数）。仓库里没有调用方。**本次也不改这个函数。** 批准本 ADR 之后的脚手架 PR 再改路径函数。在那之前，移植不得沿用未使用的 `analysisSession`，也不得沿用现在这两条 9 段路径。

AGENTS.md 写的根是 `users/{uid}`。ADR-001 D1 和 DR-001 已经保留前缀 `artifacts/skatingx-production`。本 ADR 沿用该前缀，不重开这个冲突。

---

## 2. 搁置 `/analysis` 的 TypeScript 表面

移植基准是 `https://analysis.blazeskate.com/` 的四个 vanilla 页签。

`/analysis` 那套 Analysis V1 搁置，不并进这次模型。理由：生物力学页是手动 finding 表单，不跑 Pose；Videos 和 Settings 是空页；它不是用户走查的产品。它的六个集合（`analysisSessions`、`analysisVideos`、`biomechanicsFindings`、`paceSessions`、`equipmentSnapshots`、`analysisReports`）不作为新平台的现行 schema。若生产里已有文档，只进迁移备份，不在界面里打开。

PWA `start_url` 现为 `/analysis`。那是旧站的启动路径，不是新平台的路由。新平台不复制这个 start_url。

---

## 3. 页签三：只落实 `/training/plan`

位置已经由 DR-008 定为 `/training/plan`。不设 `/analysis/planning`，不重开「放训练还是放分析」。

路由挂在训练模块，页面在 `apps/web/src/modules/training/plan/`。三个侧重、七天微循环、打卡按钮的文案按 `copy-zh.md` 的页签三。打卡写入 §1 的 `planning/main/completedTasks/{taskId}`，路径函数是 `paths.planningCheckIn`。积分只增加训练 `gamification/main.points`，不另建分析积分，也不改连续天数。21 条日课是客户端模板，不存 Firestore。

规则不新增形状校验。这条路径是运动员下的四段（`planning/main/completedTasks/{taskId}`），已经落在现有的固定层数属主规则里。那条规则只把 `equipment/main/records` 排除出去做形状校验，打卡文档不在排除之列。字段展开会再碰到规则引擎 1000 表达式上限，而这张文档的安全边界就是属主本人。

---

## 4. 监听必须退订

旧站在 `/` 上对这三处 `onSnapshot`，且没有 unsubscribe：

- `profile/lindsay`
- `completedTasks`（整集合）
- `equipmentRecords`（整集合，`orderBy createdAt desc`）

移植时如果仍用实时监听，必须在离开页面或卸载时调用返回的 unsubscribe。不允许再留一个没有退订的模块级监听。本 ADR 不实现监听。

---

## 5. 算法版本

每份分析输出带 `AnalysisProvenance`（见类型文件）：

| 字段 | 当前基线 |
|---|---|
| 模型 | `mediapipe-pose@0.5.1675469404` |
| 变体 | `pose_landmark_full`（`modelComplexity: 1`） |
| 参数 | `smoothLandmarks: true`，分割关，检测/跟踪置信度 0.5，帧间隔 180 ms，分析边长上限 640 |
| 算法版本 | 移植时填写端口版本字符串，不把 MediaPipe 版本当成算法版本 |

不升级到 Pose Landmarker。升级等固件就绪后的独立 spike。

---

## 6. finding 编码

类型文件里的 `AnalysisFindingCode` 是分析输出可以携带的编码。Phase 1.5 可以据此做规则建议。本契约不实现推荐，不改训练计划，不调用 LLM。

编码只覆盖旧站已经算出来或已经让用户选择的事实（后段衰减、相对标杆的总时间、膝角/倾角/骨盆偏高、不可判读帧、六种器材症状）。不新增医学或诊断口径。

---

## 7. 2026-10-19 评审决定

- 「删除记录」在 2026-10-19 评审中改为点击后确认。文案是「确定删除这条器材历史记录吗？删除后无法在本页面恢复。」取消则不删除。
- 数字框的 float32 显示伪影在 2026-10-19 评审中改为修。显示层统一格式化，不展示 `7.050000190734863` 这类原始值。
- Pose 实例在 2026-10-19 评审中改为关闭。组件卸载和「替换或重置测试视频」时调用 `close()`。M5 固件对照确认其余指标无回归后，这项再定稿。

「正在预热模型...」留下。它是未开始分析时的 idle 文案，语义准确，不是缺陷。

视频不上传。类型里不设上传通道。

---

## 8. 回滚

本 PR 只有文档和一个仅供 typecheck 的类型文件。Revert 即可。没有数据、没有规则、没有路由变化。

## 9. 器材历史规则（M4 第 2 片，2026-10-19）

Owner 要求给 `athletes/lindsay/equipment/main/records/{recordId}` 加形状校验，做法与配速 `analyses/{id}` 相同。宽规则会和更严的 `allow` 做 OR，所以 `athletes` 从宽规则里分开：除这条记录文档外，运动员子树仍是属主可读写。记录文档只接受契约字段（`athleteId` 为 `lindsay`，`createdAt` / `updatedAt` 为带毫秒的 ISO 字符串，`algorithmVersion` 为 `legacy-equipment-port-1`，Pose 参数块与契约一致）。左右脚读数和规则提示只限制列表长度（21 和 96）：逐项展开会超过规则引擎单次 1000 个表达式的上限。其他运动员 id 下的同形路径没有放开的写规则。运动员子树按固定层数放开，不用递归通配，因为路径值没有 `matches()`。

风险：宽规则拆分如果写错，会拒绝 profile、积分或训练记录。访问测试仍钉住这些路径。云端写失败时，页面把同一条记录放进本机 `localStorage` 并写明「本机浏览器档案」；那不是安全边界。

回滚：恢复宽规则对 `athletes` 的覆盖，并删掉器材 `match`。已发布的控制台规则要等本片合并后再走备份、发布、与 main 的 `firestore.rules` 做 diff。合入前不发布。

## 10. 生物力学分析规则（M4 第 3 片，2026-10-19）

`analyses/{analysisId}` 现在接受两种文档，键集合互斥：配速文档带 `pace`，生物力学文档带 `poseFrames`。生物力学的 `algorithmVersion` 必须是 `legacy-biomech-port-1`。`poseFrames` 最多 10 条，等于页面采样上限。每一条只检查 `timeSeconds` 和 `readable`。不对 33 个关键点逐项展开，原因与器材表盘点相同：规则引擎单次最多计算 1000 个表达式。

回滚：把 `validAnalysisRecord` 收回只接受配速键集合。器材路径规则已在 2026-10-19 03:05（EDT）发布，ruleset `a1a0ce47-d467-42bb-a431-d3b5497ff880`，与当时 main 的 `firestore.rules` 一致。本次 `poseFrames` 校验等本片合并后再走备份、发布、diff。合入前不发布。

## 11. 配速记录存距离与分段（2026-10-31）

配速记录以前只存结果（评级、稳定指数、后程衰减），没存是哪个距离、每段多少秒。总览页因此无法把 500m 和 1000m 的衰减分开比，混在一起的趋势没有意义。本片让记录存下它们。

新字段：文档顶层 `distance`（`'500'`、`'777'`、`'1000'`），`pace.splits` 与 `pace.benchmark`（数字列表，各自长度等于该距离的分段数：5、7、9）。分段数的唯一来源是 `pacingDistanceConfigs` 的 `labels`；规则里的 5/7/9 是它的镜像，改距离表时必须同步改规则。落库的是拷贝，不是页面 state 数组的别名。

规则：`validPaceAnalysisRecord` 与 `validPaceOutput` 的 `exactKeys` 都加了新键，所以不带新字段的写入会被拒。新字段做成必填：保存只走 `setDoc` + 新 id，没有重写旧记录的路径，旧记录不会被规则复核。列表按 `validPoseFrames` 的方式按下标展开（先判长度再取元素），不用循环，不碰 1000 个表达式的上限。读侧容忍缺字段：旧记录的 `distance` 读成 `null`，行不丢、不抛错。

趋势：总览页的配速卡标题行仍取最新一条、不分距离。趋势按距离分线，每个距离各算各的 latest / delta / sparkline；`distance` 为 `null` 的旧记录不进任何一组。

风险：规则先于应用发布，新规则对旧应用不友好。旧应用写的配速记录缺 `distance` 与分段，会被新规则拒绝。窗口只在「规则已发布」与「新应用已上线」之间，这段时间不要在应用里保存配速。已存在的记录不受影响，仍可读。

不回填：旧记录无法可靠推断距离。它们留在历史里，只在趋势里排除；以后想标，人工逐条定。

回滚：先回滚应用，再把两处 `exactKeys` 与列表校验删回去；顺序反过来的话，新应用写的记录带新键，会被旧规则拒绝。已写入的新记录读取不受影响。应用回滚后，趋势回到不分距离的单线。已发布的规则要等本片合并前走备份、发布、与 main 的 `firestore.rules` 做 diff，先发 skatingx-prod 与 staging，再合并。本 PR 不发布规则。
