# Training Catalog 数据字典

本文件是提议中的 Catalog 形状，对应 ADR-018 至 ADR-023。P0-1 的清单仍是解析器产物，不是这套字段的实现。`packages/training-catalog` 尚未建立。

## CatalogObject

一条已进入 Catalog 的对象。`kind` 只取工作簿四类。`sportId` 固定为 `short_track`。

| 字段 | 说明 |
| --- | --- |
| `id` | 工作簿原 ID（`EX-*`、`DR-*`、`BL-*`、`SESS-*`）。不是 `stb_*`。 |
| `kind` | `exercise` / `drill` / `block` / `session`。 |
| `sportId` | `short_track`。 |
| `disciplineId?` | 可选。工作簿没有这一列。 |
| `localeContent.zh` | 中文。`name` 必填，`description` 可选。 |
| `localeContent.en` | 英文。`name` 必填，`description` 可选。 |
| `schemaVersion` | 本字典的形状版本。 |
| `contentVersion` | 内容版本。已发布版本不可变；修正时递增（ADR-019）。 |
| `status` | 生命周期，见下方状态机。与 `reviewStatus` 分开。 |
| `reviewStatus` | 审核结果。与 `status` 分开。 |
| `reviewedBy?` | 审核人。发布时须与最后编辑人不同（可行时，ADR-019）。 |
| `reviewedAt?` | 审核时间。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 最近更新时间。 |
| `sourceLegacyId?` | 旧生产 id（如 `stb_*`）。只作溯源，不作主键。 |
| `supersedesVersion?` | 本版本取代的上一 `contentVersion`。 |
| `checksum` | 版本内容校验。发布时写入。 |
| `taxonomy.sectionId` | 来自 Section / Section ID / Primary Section。 |
| `taxonomy.objectiveIds` | 主目标与次目标。 |
| `taxonomy.energySystemId` | 仅 Drill 有工作簿列 `Energy`。 |
| `taxonomy.modality` | Exercise 与 Drill 有工作簿列。 |
| `refs[]` | `{ id, contentVersion }`。指向另一条 Catalog 对象的某个已发布版本。 |
| `legacyAttributes` | 工作簿里未升成一等字段的列，原表头作键。 |

`users/{uid}` 下不存放 CatalogObject（ADR-020）。

## 状态机

`draft` → `in_review` → `approved` → `published` → `deprecated` → `archived`。

`in_review` 被拒绝时回到 `draft`，并记下原因。已发布版本不改写；修正是新的 `contentVersion`（ADR-019）。普通用户不能读 `draft` 与 `in_review`。

## ACADEMY_CATALOG_LINKS

人工审核的桥，模式与 `ROUTINE_MODULE_LINKS` 相同。

| 字段 | 说明 |
| --- | --- |
| `academyItemId` | Academy 条目 id。键。 |
| `catalogRef` | `{ kind, id, contentVersion }`。 |
| `reviewer` | 审核人。 |
| `reviewedAt` | 审核时间。 |

表里没有的 Academy 条目就是没有链接。禁止用中文标签、英文标题或关键字去猜。

## TrainingTask.catalogRef

**P0-3 待加。本步不实现，类型里还没有这个字段。**

目标形状是可选的 `catalogRef: { kind, id, contentVersion }`。加上之后，`academyItemId`、`planEntryId`、`source` 仍保留。已有任务文档不批量改写。

## 工作簿列 → P0-1 清单字段

下列映射抄自 `scripts/catalog/parse-workbook.mjs` 的 `OBJECT_SPECS`。分号分隔的引用先切开再 trim。清单里的 `nameZh` / `nameEn` 对应将来 `localeContent` 的必填名称；描述列工作簿没有，Catalog 里保持可选。

空单元格仍保留键（标量写空字符串，列表写 `[]`），避免丢列。

### 06_Exercises（120）

| 工作簿列 | 清单字段 |
| --- | --- |
| Exercise ID | `id` |
| English Name | `nameEn` |
| 中文名称 | `nameZh` |
| Environment | `environment` |
| Section ID | `sectionId` |
| Primary Objective | `primaryObjectiveId` |
| Focus Tags | `focusTags` |
| Modality | `modality` |
| Equipment | `equipment` |
| Youth Default | `youthDefault` |
| Supervision | `supervision` |

本表没有额外列，`legacyAttributes` 为 `{}`。

### 07_Drills（68）

| 工作簿列 | 清单字段 |
| --- | --- |
| Drill ID | `id` |
| English Name | `nameEn` |
| 中文名称 | `nameZh` |
| Env | `environment` |
| Section | `sectionId` |
| Primary Obj | `primaryObjectiveId` |
| Secondary Obj | `secondaryObjectiveIds`（字符串数组） |
| Energy | `energySystemId` |
| Focus Tags | `focusTags` |
| Modality | `modality` |
| Default Sets | `defaultSets` |
| Default Reps | `defaultReps` |
| Distance | `distance` |
| Duration | `duration` |
| Target | `target` |
| Rest | `rest` |
| RPE | `rpe` |
| Load | `load` |
| Taper Compatible | `taperCompatible` |
| Supervision | `supervision` |

进 `legacyAttributes` 的列：`Quality Rule`、`Development`、`Notes`。`Development` 不是一等字段。

### 08_Blocks（51）

| 工作簿列 | 清单字段 |
| --- | --- |
| Block ID | `id` |
| English Name | `nameEn` |
| 中文名称 | `nameZh` |
| Env | `environment` |
| Primary Section | `sectionId` |
| Primary Obj | `primaryObjectiveId` |
| Secondary Obj | `secondaryObjectiveIds`（字符串数组） |
| Drill IDs | `drillRefs`（字符串数组，115 条引用） |
| Duration | `duration` |
| Load | `load` |
| Taper Compatible | `taperCompatible` |

进 `legacyAttributes` 的列：`Development`、`Source`、`Notes`。

`21_V1.2_ProdMapping` 的 `systemTemplateId` 也写入该 Block 的 `legacyAttributes`。有值则为 `stb_*`，无映射则为 `null`。BL-L031 与 BL-I017 是 `null`，其余 49 个 Block 有值。`stb_*` 不作主键。

### 09_Sessions（18）

| 工作簿列 | 清单字段 |
| --- | --- |
| Session ID | `id` |
| English Name | `nameEn` |
| 中文名称 | `nameZh` |
| Training Phase | `trainingPhase` |
| Env | `environment` |
| Block IDs | `blockRefs`（字符串数组，57 条引用） |
| Duration | `duration` |
| Load | `load` |
| Primary Goal | `primaryGoal` |
| Taper Compatible | `taperCompatible` |

进 `legacyAttributes` 的列：`Development`、`Notes`。

## 已知缺口

- Drill→Exercise 在工作簿里不存在。每条 Drill 的 `exerciseRefs` 为 `[]`，`exerciseRefsSource` 为 `source_not_provided`。禁止用名称或标签补边。Catalog 的 `refs[]` 在这条边上同样为空，直到有人工审核的链接。
- Youth Default 为 Conditional 的恰好 4 条：EX-L039、EX-L078、EX-L079、EX-L080。清单给它们 `safetyFlag: review_required`，并保留 `youthDefault` 与 `supervision` 原值。其余 116 条不加该标志。`safetyFlag` 只存在于清单，不是 CatalogObject 字段。按 ADR-021，这 4 条在真实安全策略到来之前保持 `review_required`。
