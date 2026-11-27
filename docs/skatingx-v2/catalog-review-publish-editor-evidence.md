# Catalog review / publish：最后编辑者证据

本文件冻结 review 与 publish 对「最后编辑者」的判定。实现在 `scripts/catalog/trusted-flow.mjs`。不得用集合查询枚举审计，不得扩大 D-03 的 `list` / `delete` / Auth 权限，不得伪造 `editor-{objectId}` 历史编辑事件。

## 导入审计（已存在，只读核验）

- 常量：`INITIAL_IMPORT_RUN_ID = "initial-20261115"`（唯一命名常量，禁止散落同义字符串）。
- 文档 ID：`imp-${INITIAL_IMPORT_RUN_ID}-{objectId}`，即 `importAuditId(objectId)`。
- 单文档 `get`。缺失或任一字段失败 → review / publish 拒绝，并写 `rejected` 审计。
- 必验：`action ∈ {create, edit, import}`；`actor`、`operator`、`at` 均为非空字符串；`target.collection === "trainingCatalogObjects"`；`target.id === objectId`；`target.contentVersion` 与待审/待发布版本一致；`checksum` 与快照 `recomputeChecksum` 一致；`runId === INITIAL_IMPORT_RUN_ID`。
- 原始证据留在该导入审计文档本身（`at` / `operator` / `runId` / `actor`），流程不另造编辑历史。

## 未来编辑记录（尚未由本模块写入）

导入之后的新编辑由**未来的 edit 命令**在与快照变更同一事务内写入，本模块只读：

| 项 | 规则 |
|---|---|
| 文档 ID | `edit-{objectId}--{contentVersion}`（`editRecordId`） |
| `action` | `"create"` 或 `"edit"`（不得为 `"import"`） |
| 必填 | 非空 `actor`、`operator`、`at`；`target` 同上；`checksum` 等于新快照重算值；`supersedesAuditId` 指向被取代的导入审计或上一版编辑审计 |
| 关系 | 不得复制或伪装导入审计；不得回填生产 `editor-{objectId}` |

## lastEditor 判定顺序

固定两次 `get`，顺序不可变：

1. 若 `edit-{objectId}--{contentVersion}` **存在**：以其为最后编辑者。记录无效则直接拒绝，**不回退**到导入审计。
2. 否则：以导入审计为最后编辑者，且仅当其 `contentVersion` 与 checksum 仍匹配当前快照。快照已变但无对应编辑记录 → 拒绝。

Reviewer / publisher 不得等于该最后编辑者。

## Review 事务

`reviewCatalogVersion` 在单个 Firestore 事务内：读版本快照 → 校验 draft + pending/rejected → 比对 `expectedContentSha256` → 解析最后编辑者 → 写审批字段与 `ok` 审计。任一步失败则事务不提交；事务外写 `rejected` 审计（带 `operator`）。

## Block 发布依赖

`publishCatalogVersionFlow` 对 Block 的每条 Drill 引用在事务内要求：`kind === "drill"`；id / contentVersion 一致；`status === "published"`；`reviewStatus === "approved"`；`publishedVersion` 存在且等于引用版本；checksum 绑定有效；无 `legacyAttributes.safetyFlag === "review_required"`。任一依赖不满足 → 整次发布拒绝，无部分写入。
