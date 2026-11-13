# Training Catalog 数据字典

本文件是提议中的 Catalog 形状，对应 ADR-018 至 ADR-023。P0-1 的清单仍是解析器产物，不是这套字段的实现。`packages/training-catalog` 里是草案 schema，尚未冻结。

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
| `contentVersion` | 内容版本。已发布版本不可变；修正时递增（ADR-019）。格式为 `v<n>`（`v1`、`v2`……）。 |
| `publishedVersion?` | 当前已发布的 `contentVersion`。缺失表示尚未发布。 |
| `status` | 生命周期，见下方状态机。与 `reviewStatus` 分开。 |
| `reviewStatus` | 审核结果。与 `status` 分开。创建时必须提交且为 `"pending"`（缺失拒绝）。 |
| `reviewer?` | 审核人。发布时须与最后编辑人不同（可行时，ADR-019）。 |
| `reviewedAt?` | 审核时间。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 最近更新时间。 |
| `sourceLegacyId?` | 旧生产 id（如 `stb_*`）。只作溯源，不作主键。 |
| `supersedesVersion?` | 本版本取代的上一 `contentVersion`。 |
| `checksum` | 版本内容校验。发布时写入。 |
| `taxonomy.sectionId` | 来自 Section / Section ID / Primary Section。Session 无此列时缺失。 |
| `taxonomy.objectiveIds` | 主目标与次目标。 |
| `taxonomy.energySystemId` | 仅 Drill 有工作簿列 `Energy`。 |
| `taxonomy.modality` | Exercise 与 Drill 有工作簿列。 |
| `refs[]` | `{ id, contentVersion }`。指向另一条 Catalog 对象的某个已发布版本。 |
| `legacyAttributes` | 工作簿里未升成一等字段的列，原表头作键。 |

图验证：允许的边是 Session→Block、Block→Drill、Drill→Exercise。引用须解析到已存在的 id 与已知版本。图中无环。`localeContent.zh.name` 与 `localeContent.en.name` 必填。未知列进 `legacyAttributes`，不得出现在顶层。

清单字段映射（内容字段，不含生命周期与审核）：

| kind | 一等字段 | 进 `legacyAttributes` 的非空字符串 |
| --- | --- | --- |
| exercise | `nameZh` / `nameEn` → `localeContent`；`sectionId`；`primaryObjectiveId` → `objectiveIds`；`modality`；`exerciseRefs` → `refs` | `environment`、`equipment`、`focusTags`、`youthDefault`、`supervision`、`safetyFlag` |
| drill | 名称、`sectionId`、`primaryObjectiveId` + `secondaryObjectiveIds` → `objectiveIds`、`modality`、`energySystemId`；`exerciseRefs` → `refs` | `environment`、`focusTags`、`defaultSets`、`defaultReps`、`distance`、`duration`、`target`、`rest`、`rpe`、`load`、`taperCompatible`、`supervision` |
| block | 名称、`sectionId`、目标、`drillRefs` → `refs` | `environment`、`duration`、`load`、`taperCompatible` |
| session | 名称、`blockRefs` → `refs`；无 `sectionId`、无目标列（`objectiveIds` 为空） | `environment`、`trainingPhase`、`duration`、`load`、`primaryGoal`、`taperCompatible` |

工作簿没有 description 列，`description` 省略。`refs` 每条是 `{ id, contentVersion: "v1" }`，提交的清单就是 v1 基线。空串 `""` 与空数组丢弃，不收进内容。记录自带的 `legacyAttributes` 原样合并，包括 `null`（如 `systemTemplateId: null`）；键冲突则失败，不静默覆盖。`source` 与 `exerciseRefsSource` 是来源性元数据，不进内容字段。EX-L039、EX-L078、EX-L079、EX-L080 的 `youthDefault: Conditional`、`supervision: Qualified adult/coach`、`safetyFlag: review_required` 保留在 `legacyAttributes`。`exerciseRefsSource` 保留 `source_not_provided` 与人工确认的区别；P2 导入审计须保留来源信息，始终区分“源数据没有提供 Drill→Exercise 引用”与“人工确认没有引用”。

`users/{uid}` 下不存放 CatalogObject（ADR-020）。

## 状态机

`draft` → `in_review` → `approved` → `published` → `deprecated` → `archived`。

`in_review` 被拒绝时回到 `draft`，并记下原因。已发布版本不改写；修正是新的 `contentVersion`（ADR-019）。普通用户不能读 `draft` 与 `in_review`。

`ReviewStatus` 取 `pending`、`in_review`、`approved`、`rejected`，初始值是 `pending`。`contentVersion` 格式为 `v<n>`，`n` 是从 1 起的正整数，递增用任意精度整数，不设上限。`checksum` 是手写 canonical JSON 的 SHA-256 十六进制：对象键按 UTF-16 代码单元排序，数组保持原顺序，不使用 `JSON.stringify` 的对象键顺序；`__proto__` 与 `constructor` 按普通键保留。覆盖且只覆盖 `localeContent`、`taxonomy`、`refs`、`legacyAttributes`、`schemaVersion`、`supersedesVersion`（后者缺失时不出现）。`contentVersion`、`status`、`checksum` 本身、审核字段和 `publishedVersion` 不参与。`schemaVersion` 为 `1`。拒绝原因不放在对象上，由受控流程写入审计日志。

## 联合状态不变量

父对象的内容字段始终等于当前已发布版本的内容。新版本草稿只保存在 `versions` 子集合里，父对象不作草稿暂存。发布事务须在一个原子操作里覆盖五处写入：父对象内容与 `publishedVersion` 指针、快照 `status`、Release 记录、公开投影（创建/更新/删除）。快照内容、`checksum`、审核记录在发布时绝不改动。`checkPublishedBinding` 返回空数组不是完整发布许可。P2 受控发布流程在写入前必须另做两项强制校验：(a) 用 `contentChecksumPayload` 与 `computeCatalogChecksum` 从快照的六个内容字段重算 checksum，与存储的 checksum 比对；(b) 审核人与最后编辑人不同（按 P0-4 发布校验清单，依据来自审计日志）。这两项是强制门，不是可选项。撤销审批只走受控流程：`revokeCatalogApproval` 只接受 `status == "approved"`，返回的拷贝把 `status` 改为 `draft`、`reviewStatus` 重置为 `pending`，并删除 `reviewer` 与 `reviewedAt`。这不是普通状态机转移。撤回最后一个已发布版本时，受控流程须同时把父对象 `status` 从 `published` 改为 `deprecated`，并清空 `publishedVersion`。只清指针、不改状态，不算撤回。

## CatalogVersion

`versions` 子集合的一条快照。版本文档 id 等于 `contentVersion`。新建时 `status` 必须是 `draft`，`reviewStatus` 必须提交且为 `"pending"`（缺失拒绝），不得带 `reviewer` / `reviewedAt`。

| 字段 | 说明 |
| --- | --- |
| `contentVersion` | 本快照版本号。等于文档 id。 |
| `status` | 生命周期。客户端创建后不可改。 |
| `reviewStatus` | 审核结果。新建时必须提交且为 `"pending"`（缺失拒绝）。 |
| `reviewer?` | 审核人。只由受控审核流程写。 |
| `reviewedAt?` | 审核时间。只由受控审核流程写。 |
| `checksum` | 内容校验。发布时不改。 |
| `localeContent` | 与 CatalogObject 相同。 |
| `taxonomy` | 与 CatalogObject 相同。 |
| `refs` | 与 CatalogObject 相同。 |
| `legacyAttributes` | 与 CatalogObject 相同。 |
| `schemaVersion` | `1`。 |
| `supersedesVersion?` | 本快照取代的上一 `contentVersion`。 |

发布例外：`publishCatalogVersion` 只接受 `status == "draft"` 且 `reviewStatus == "approved"` 且带 `reviewer` 与 `reviewedAt` 的快照，返回的拷贝只把 `status` 改为 `published`。内容、`checksum` 和审核记录不动。客户端 update 仍拒绝。绑定成立时：父对象 `status` 与快照 `status` 都是 `published`，父对象 `contentVersion` 与 `publishedVersion` 都等于快照 `contentVersion`，两边 `checksum` 相等，父对象与快照的 `reviewStatus` 都是 `approved`，两边的 `reviewer` 与 `reviewedAt` 一致，两边的六个 checksum payload 字段（`localeContent`、`taxonomy`、`refs`、`legacyAttributes`、`schemaVersion`、`supersedesVersion`）一致。

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

**已实现。P0-3 已加入 `packages/schema/src/catalog.ts`。**

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
