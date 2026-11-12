# 仓库基线（P0-1 合入后）

核对日期：2026-11-12。基线提交：`main` `4d74c9d`（`chore: inventory the V2.0 training workbook`，PR #193）。

规范快照（2026-11-11，`skatingx-platform-main.zip`，见 `docs/skatingx-v2/source/SkatingX_V2.0_Preservation_Manifest.json`）早于 PR #188–#193。本文件是对照当前 `main` 重新核对后的基线，不沿用那份快照里的旧计数。

## 已验证的集成点

- `TrainingTask`（`packages/schema/src/training.ts`）有 `academyItemId?`、`planEntryId?`、`source?`。没有 `catalogRef`。`catalogRef` 是 P0-3 待加项，见 `data-dictionary.md`。
- `AcademyItem`（`packages/content/src/academy-types.ts`）12 个字段：`id`、`titleZh`、`titleEn`、`descriptionZh`、`descriptionEn`、`category`、`targetZh`、`targetEn`、`tagsZh`、`tagsEn`、`suggestedDurationMinutes?`、`difficultyLevel?`。没有 `contentVersion`、`status`、`reviewStatus` 或 checksum。
- `AiCoachPage`（`apps/web/src/pages/AiCoachPage.tsx`）是 14 行占位，只渲染 `PagePlaceholder`，没有推荐服务。
- `firestore.rules`：`/databases/{database}/documents` 下，产品数据树是 `/artifacts/skatingx-production/users/{userId}`。同级另有一条 collection-group 列表规则 `/{path=**}/profile/{profileId}`，只允许已登录用户按 `userId` 列出自己的 profile，不授予写入。没有 Catalog 集合，规则本步不改。
- 根 `package.json` 的 workspaces 是 `apps/*` 与 `packages/*`。包有 5 个：`content`、`firebase-client`、`schema`、`skating-domain`、`ui`。没有 `packages/training-catalog`。

PR #188 之后、相对规范快照新增、且本基线仍在用的三处：

| 文件 | 作用 |
| --- | --- |
| `apps/web/src/modules/training/plan/plan-shape.ts` | 3×7 形状表（lean / bounce / endurance × 周一至周日）。 |
| `packages/skating-domain/src/training/plan-stage.ts` | 真实年龄（整岁）到阶段 id。4–18 岁之外或没有年龄则没有阶段。 |
| `packages/skating-domain/src/routine-module-links.ts` | `ROUTINE_MODULE_LINKS`，96 条已复核的 routine → academy 链接。 |

## 计数

工作簿（P0-1 清单，SHA-256 `15e36d07501eaa514fc74a069060a56e1b387df8825f3369f1966112c93b180b`）：

| 对象 | 数量 |
| --- | --- |
| Exercise | 120 |
| Drill | 68 |
| Block | 51 |
| Session | 18 |
| 合计 | 257 |

Academy（`ACADEMY_STAGES` 与 `ACADEMY_SHARED`，生成文件未改）：

| 项 | 数量 |
| --- | --- |
| 条目 | 99（阶段内 81 + 共享 18） |
| routine 标签 | 96 |
| `ROUTINE_MODULE_LINKS` | 96 |
| dayPlan | 22 |

Drill→Exercise 仍为空（`source_not_provided`）。BL-L031 与 BL-I017 没有 `systemTemplateId`。
