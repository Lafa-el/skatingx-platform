# ADR-005: 分析模块 M2 契约

| 字段 | 值 |
|---|---|
| 状态 | **提议。等 owner 批准。批准前不写移植代码，不进 M3/M4。** |
| 日期 | 2026-10-19 |
| 分支 | `migration/analysis-contract` |
| 依据 | 执行计划 v1.0 的 §1、§2；M1 盘点 `docs/migration/analysis-inventory.md`（`main` `90de45d`）；DR-001 / DR-003 / DR-004 / DR-007 / DR-008 |
| 不做 | 不重做 M1。不建 `apps/web/src/modules/analysis/` 脚手架。不改 `paths.ts`、Security Rules、Race Day、legacy 仓库、生产数据。不碰 Pose Landmarker（draft PR #50）。 |

类型见 `docs/migration/analysis/contract-types.ts`。固件清单见 `docs/migration/analysis/fixtures.md`。中文文案见 `docs/migration/analysis/copy-zh.md`（英文列留空）。

---

## 1. 要拍板的路径分法

本 ADR **提议**下面的分法。它和「所有 legacy 文档都塞进一个 `analyses/{analysisId}`」不是同一件事。若要改，停在评审，不要在移植里静默改。

| 数据 | 提议路径 | 段数 | 理由 |
|---|---|---|---|
| 一次生物力学或配速分析 | `artifacts/skatingx-production/users/{uid}/analyses/{analysisId}` | 6 | 本次任务指定的 DR-001 路径。是文档，不是「一个文档装下全部用户数据」。 |
| 运动员身份 | `.../users/{uid}/athletes/lindsay/profile/main`，`settings/main.activeAthleteId = "lindsay"` | 8 / 6 | DR-003。`default` 归档、不在界面显示。分析文档上的 `athleteId` 写 `lindsay`，不把 uid 再当成运动员 id。 |
| 官方积分 | `.../athletes/lindsay/gamification/main` | 8 | DR-004。训练积分是官方余额。legacy `profile/lindsay.points` 只进迁移备份，不累加。 |
| 页签三打卡 | `.../athletes/lindsay/planning/main/completedTasks/{taskId}` | 10 | 见下面的段数冲突。新打卡只增加训练积分，不另建分析侧积分。 |
| 器材历史 | `.../athletes/lindsay/equipment/main/records/{recordId}` | 10 | 见下面的段数冲突。旧站的器材记录是用户级历史，不是某一次视频分析的子文档。 |

`paths.planningCompletedTask` 和 `paths.equipmentRecord` 现在各是 9 段。Firestore 文档路径必须是偶数段，9 段写不进去。本 ADR 提议在 `planning` 和 `equipment` 后加一层 `main`，与训练记录已经采用的 `training/main/records/{id}` 同一做法。**本次不改这两个函数。**

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

仓库里还没有 `/training/plan` 路由。实现细节（批准后才做）：

- 路由挂在训练模块，代码落在 `apps/web/src/modules/training/`，具体文件等脚手架分支。
- 三个侧重、七天微循环、打卡按钮的行为与文案按 `copy-zh.md` 的页签三，不在契约里改文案。
- 打卡写入 §1 的 `planning/main/completedTasks/{taskId}`。积分写入训练 `gamification/main`，不写入分析文档。
- 周计划正文仍是客户端模板。本契约不把 21 条日课存进 Firestore。

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

## 7. 明确不在本契约里改的行为

下列 quirks 保持原样，直到另一次评审决定保留或修复：

- 「删除记录」按钮在走查中点了没出现确认框。
- 数字框的 float32 显示伪影。
- Pose 实例没有 `close()`。

「正在预热模型...」停在 idle 已作废为缺陷，但那句文案仍是未开始分析时的默认字，列在文案清单里。

视频不上传。类型里不设上传通道。

---

## 8. 回滚

本 PR 只有文档和一个仅供 typecheck 的类型文件。Revert 即可。没有数据、没有规则、没有路由变化。
