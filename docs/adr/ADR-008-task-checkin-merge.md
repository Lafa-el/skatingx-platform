# ADR-008: 任务与打卡合并

| 字段 | 值 |
|---|---|
| 状态 | **已通过设计评审（2026-10-29），随步骤 ① 提交。** 步骤 ②、③ 各自另开 PR。 |
| 日期 | 2026-10-29 |
| 分支 | `migration/training-plan-task-generation`（步骤 ①） |
| 依据 | `docs/design/task-checkin-merge.md`（#100，已合并）及其 §8 七项决定；ADR-005 §1 / §3 |
| 不做 | 不改 `firestore.rules`、学院、商店、历史页、legacy 仓库；不扩展 Junior D 以外的年龄组；不接生成触发（留给步骤 ②）。 |

## 1. 冲突

ADR-005 §3 规定：打卡写入 `athletes/lindsay/planning/main/completedTasks/{taskId}`，积分「只增加训练 `gamification/main.points`」，「21 条日课是客户端模板，不存 Firestore」。ADR-005 §1 的「页签三打卡」一行同样规定了打卡路径。

本设计取代其中的**打卡与积分**部分：

- 计划页不再打卡；模板日生成当天的任务，勾选只发生在任务页。
- 计划完成度由任务数据推导，不再单独存 `completedTasks`。
- 积分只保留任务规则集（`pointsPerTask`、`dailyBonusPoints`），模板日积分退役。

ADR-005 其余内容不变：「21 条日课是客户端模板」仍成立（模板与条目仍在客户端，不存 Firestore）；`analyses/{analysisId}`、器材历史、路径分法不受影响。`planning/main/completedTasks` 的路径与规则在步骤 ③ 之前保持原样。

## 2. 决定

### 2.1 `athletes/{athleteId}/training/state` 新增三个可选字段

| 字段 | 类型 | 含义 |
|---|---|---|
| `planFocus` | `"lean" \| "bounce" \| "endurance"` | 当前选定的本周训练侧重 |
| `planFocusWeek` | `DateString` | 选定侧重那一周的周一，设备本地日期 |
| `planGeneratedDate` | `DateString` | 最近一次生成模板任务的日期，用作幂等标记 |

可选字段，旧文档没有，无需回填。现有写 `training/state` 的路径都按字段 `tx.update`，不会覆盖它们。规则不改：`/athletes/{athleteId}/{a}/{b}` 对属主开放读写，`training/state` 在这一层。

### 2.2 `TrainingTask` 新增来源与条目 id

- `TrainingTaskSource` 增加 `"plan"`（`"system"` 保持未使用）。
- `TrainingTask.planEntryId?: string`，形如 `jd_tech_mon.1`，与语言无关，定下后不复用；同时用于去重。
- `normalizeTrainingState`、`normalizeTask`、`serializeTrainingTask`、`archivedTask` 四处白名单同步，缺一处字段就会在写回或归档时丢失。

### 2.3 模板日条目

`apps/web/src/modules/training/plan/plan-day-entries.ts` 把 21 条现有正文重排为 3–5 条条目；周日休息类条目标 `generate: false`（只展示，不生成）。原始 `when / kind / intensity / body` 不动。

### 2.4 生成事务

`generatePlanTasksIfNeeded` 是独立的幂等事务，不放进 `runDayRolloverIfNeeded`。事务内按顺序校验，任何一条不满足就返回：

1. `lastLoginDate === 今天`（否则日切未完成；日切前生成会让新任务被归档到昨天）；
2. `planFocus` 存在，且 `planFocusWeek` 是本周周一；
3. `planGeneratedDate !== 今天`；
4. 调用方传入的侧重与状态内 `planFocus` 一致；
5. 按 `planEntryId` 过滤已存在条目后追加，并写 `planGeneratedDate = 今天`。

幂等标记是 `planGeneratedDate`，不是「列表里有没有 plan 任务」，所以删掉一条生成任务后不会被补回。

## 3. 步骤切分

| 步骤 | 内容 |
|---|---|
| ① 本 PR | 本 ADR；schema 与四处白名单；条目与文案；`setPlanFocus`、`generatePlanTasksIfNeeded`；`usePlanFocus` 读写 `training/state`；任务页 plan 徽标。**不接** `TrainingDayRollover` 的触发，不动计划页打卡。 |
| ② | 接上生成触发；计划页去掉打卡按钮，改为推导完成度（今天读 `todayTasks`，过去读 `taskHistory`）。触发接线与去掉打卡按钮在同一次发布，避免两套机制同日重复计分。 |
| ③ | 退役打卡入口与函数（清单见设计稿 §4.g）。前置：全库只读审计 `planning/main/completedTasks`，结果写进 PR。 |

仓库没有 feature flag 机制，所以用「步骤 ① 不接触发」代替开关：生成函数存在、有测试，但没有任何调用方。

## 4. 风险

| 风险 | 缓解 |
|---|---|
| 新字段在复制环节丢失 | 四处白名单同 PR 修改；往返测试：生成 → `toggleTrainingTask` → 归档 → `archivedDayFromDocument`，`source` 与 `planEntryId` 全程保留 |
| 日切前生成 | 事务内校验 `lastLoginDate === 今天` |
| 删除后被补回 | 用 `planGeneratedDate` 标记 |
| 单日得分上升 | 已评审接受；每天条目 3–5 条，用测试卡上限 |
| 过渡期两套机制同日计分 | 步骤 ① 不接触发 |
| 并发（多标签页、多设备） | Firestore 事务冲突重试，重试时读到 `planGeneratedDate === 今天` |

## 5. 回滚

| 步骤 | 回滚 | 数据残留 |
|---|---|---|
| ① | revert。生成函数、条目表、侧重读写移除，`usePlanFocus` 回到 `sessionStorage`。 | `training/state` 上已写入的 `planFocus` 等字段留在文档里，读取时被忽略，无害。本步没有生成触发，不会产生 `source: "plan"` 的任务。 |
| ② | revert。打卡按钮恢复，触发移除。 | 已生成的任务留在列表里，用户可删。 |
| ③ | revert。代码恢复。 | 无数据变更。 |

没有数据迁移，没有规则变更。
