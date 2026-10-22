# ADR-006: 日志数据落点

| 字段 | 值 |
|---|---|
| 状态 | **已采纳（2026-10-21 决策记录）。** 本 ADR 只定路径。M3 同时交付映射纯函数，不写迁移脚本，不写任何环境。 |
| 日期 | 2026-10-21 |
| 分支 | `migration/journal-m3-mapping` |
| 依据 | `docs/migration/journal-contract.md` §2 与决策记录；`docs/migration/journal-inventory.md` |
| 不做 | 不改 `AGENTS.md`。不改 `firestore.rules`、`paths.ts`。不写迁移脚本。不连接数据库。不进 M4。 |

---

## 1. 决策

日志数据落在 `artifacts/skatingx-production/users/{uid}/journal/...`，按源集合镜像。不用 `AGENTS.md` 里的单一集合 `users/{uid}/journalEntries/{entryId}`。

子路径以契约 §1 为准：

| 源集合 | 目标 |
|---|---|
| `athletes` | `journal/athlete/main` |
| `journal_days` | `journal/days/{sourceId}` |
| `training_sessions` | `journal/sessions/{sourceId}` |
| `coach_notes` | `journal/coachNotes/{sourceId}` |
| `body_status` | `journal/bodyStatus/{sourceId}` |
| `performance_records` | `journal/performance/{sourceId}` |
| `video_refs` | `journal/videos/{sourceId}` |
| `weekly_reviews` | `journal/weeklyReviews/{sourceId}` |
| `milestones` | 不自动迁。出现文档即停机 |

## 2. 理由

以契约 §2 的对照表为准。

九种文档形状差得很远。放进一个集合再加类型字段，查询和字段校验都会缠在一起。运动员档也不是一条日记。

现有所有者规则已经盖住 `users/{uid}` 下面除 `raceDay`、`analyses`、`athletes` 以外的子树。第一段叫 `journal` 时不在排除名单里，这次迁移不必改规则。

顶层集合加 `athleteId` 落在 `users/{uid}` 外面，和新平台已经在用的授权边界相反。源库曾经的全开式规则不能搬过来。

## 3. 后果

`AGENTS.md` 仍写着 `journalEntries/{entryId}`。本步不改那份规范。两处描述不一致时，以本 ADR 为准。`AGENTS.md` 留到后续统一修订时再改。

运动员档不是日记条目。它单独落在 `journal/athlete/main`，不进 `journal/days`。

M4 及以后只写这些路径。不另开 `journalEntries`。

## 4. 回退

若案 (ii) 被撤回，这些路径和映射函数一起停用。在那之前不要把日志写入单一 `journalEntries` 集合。
