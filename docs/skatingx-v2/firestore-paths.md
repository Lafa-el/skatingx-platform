# Catalog Firestore 路径、权限与索引方案

本文件是设计草案。它不改 `firestore.rules`，不改 `firestore.indexes.json`，不建集合，不碰生产数据。ADR-018 至 ADR-023 仍是「提议」。

独立架构复核（第一轮）的四项约束与 ChatGPT 独立复核（有条件通过）的六项补充都已写进 §2、§3、§5、§6：get 与 list 分开；版本撤回只动父对象的 `publishedVersion` 指针，并加父对象 status 检查与缺失字段处理；公开投影用严格字段白名单、指针与投影原子同步；versions 禁止 collection-group 查询；客户端管理员只写未发布草稿，不得直接改、撤、删已发布内容，正式发布走可信流程；普通用户只读 `trainingCatalogPublicLinks`，不读完整映射；测试场景 13 个加 8 个攻击性场景。已定的 10 个集合名与路径不改。ChatGPT 定稿审核（不通过）指出的两个安全缺口已在本轮修订：审核状态绕过（§3 三权限边界与受保护字段表）与发布字段保护不完整（§3 发布字段统一约束与发布校验）。测试场景现为 26 个。ChatGPT 定稿审核（第二次，不通过）指出的 3 处安全缺口已在本轮修订：Links 已发布映射的修改保护（§3）、审核与发布字段改用 diff().affectedKeys() 校验（§3）、草稿创建的 reviewStatus 初始化规则（§3）。测试场景现为 31 个。ChatGPT 定稿审核（第三次，不通过）指出的 2 处条件收紧已在本轮修订：Links 未审核判断补齐 reviewedAt（§3）、Versions 创建状态限制为 draft（§3）。测试场景现为 33 个。

## 1. 目标与约束

- 路径已定（ADR-020）：共享内容在租户根 `/artifacts/skatingx-production/` 下，不得放在 `users/{uid}` 下。
- 隔离要求：草案与已发布严格隔离；普通用户不能读未发布内容、不能改共享 Catalog；安全策略与审核数据不得无条件公开。
- 本步是设计文档：不改 `firestore.rules`、不建集合、不碰生产数据。规则的实际改动与测试实现是 P1/P2 的事。

## 2. 集合定义

全部在 `/artifacts/skatingx-production/` 下。段数按 `/` 切开、去掉空段计算（`artifacts` 与 `skatingx-production` 占前 2 段）：

| 形态 | 段数 | 奇偶 |
| --- | --- | --- |
| 集合路径 | 3 | 奇数 |
| 文档路径 | 4 | 偶数 |
| 版本子集合 | 5 | 奇数 |
| 版本文档 | 6 | 偶数 |

文档路径偶数、集合路径奇数。下面每条路径都按这个数过了一遍。

已定的 10 个集合：

| 集合 | 完整路径 | 段数 | 内容 |
| --- | --- | --- | --- |
| `trainingCatalogObjects` | `/artifacts/skatingx-production/trainingCatalogObjects/{objectId}` | 集合 3，文档 4 | CatalogObject。字段见 `data-dictionary.md`。`status` 与 `reviewStatus` 分离。`contentVersion` 标当前版本。另有 `publishedVersion` 指针，见 §3。 |
| `versions`（子集合，不算进这 10 个） | `/artifacts/skatingx-production/trainingCatalogObjects/{objectId}/versions/{contentVersion}` | 子集合 5，文档 6 | 已发布或历史版本的不可变快照。每个版本一份，含 `checksum`。 |
| `trainingCatalogKnowledgeArticles` | `/artifacts/skatingx-production/trainingCatalogKnowledgeArticles/{articleId}` | 集合 3，文档 4 | 知识文章。 |
| `trainingCatalogEvidenceRecords` | `/artifacts/skatingx-production/trainingCatalogEvidenceRecords/{recordId}` | 集合 3，文档 4 | 证据记录。 |
| `trainingCatalogTeachingMedia` | `/artifacts/skatingx-production/trainingCatalogTeachingMedia/{mediaId}` | 集合 3，文档 4 | 教学媒体。 |
| `trainingCatalogCorrectionRules` | `/artifacts/skatingx-production/trainingCatalogCorrectionRules/{ruleId}` | 集合 3，文档 4 | 纠错规则。 |
| `trainingCatalogSafetyPolicies` | `/artifacts/skatingx-production/trainingCatalogSafetyPolicies/{policyId}` | 集合 3，文档 4 | 安全策略（含 `policyVersion`）。 |
| `trainingCatalogLinks` | `/artifacts/skatingx-production/trainingCatalogLinks/{academyItemId}` | 集合 3，文档 4 | `ACADEMY_CATALOG_LINKS` 的条目。`academyItemId` → `CatalogRef` + `reviewer` + `reviewedAt`。文档 id 就是 `academyItemId`。 |
| `trainingCatalogReleases` | `/artifacts/skatingx-production/trainingCatalogReleases/{releaseId}` | 集合 3，文档 4 | 发布。`publishedVersion` 指针 + 发布说明。 |
| `trainingCatalogMigrations` | `/artifacts/skatingx-production/trainingCatalogMigrations/{migrationId}` | 集合 3，文档 4 | 导入/迁移运行记录。 |
| `trainingCatalogAuditLogs` | `/artifacts/skatingx-production/trainingCatalogAuditLogs/{logId}` | 集合 3，文档 4 | 审计日志（谁在何时改了什么）。 |

对象类集合的文档 id 即业务 id（`EX-` / `DR-` / `BL-` / `SESS-`、article id 等），不要用自动 id 做业务主键。`trainingCatalogLinks` 的文档 id 就是 `academyItemId`。`migrations` 与 `auditLogs` 用自动 id（P2 定）。

公开映射投影（新增的第 11 个集合，已定的 10 个不动）：

| 集合 | 完整路径 | 段数 | 内容 |
| --- | --- | --- | --- |
| `trainingCatalogPublicLinks` | `/artifacts/skatingx-production/trainingCatalogPublicLinks/{academyItemId}` | 集合 3，文档 4 | 每条只含 `catalogRef`（`{ kind, id, contentVersion }`），不含 `reviewer` / `reviewedAt` 等内部审核信息。文档 id 就是 `academyItemId`。这是普通用户读映射的唯一路径（见 §3）。字段白名单：只含 `catalogRef` 三字段（`kind`、`id`、`contentVersion`）；不含 `reviewer`、`reviewedAt` 及其他任何字段。发布流程写投影时按白名单写（见 §3）。 |

## 3. 规则设计

设计草案，不写进 `firestore.rules`。现有规则一字不动。

现状：`firestore.rules` 唯一顶层 match 是 `/artifacts/skatingx-production/users/{userId}`，同级另有一条 collection-group 列表规则 `/{path=**}/profile/{profileId}`（只 list、按 `userId`）。新规则以同级顶层 match 加入，不动现有两条。

管理员身份：写操作与未发布内容的读，要求 `request.auth.token.catalogAdmin == true`（custom claim，由 Firebase Admin SDK 在控制台外设置；生产上的 claim 设置流程是 P2/P5 的单独步骤，本步只定规则侧的判断条件）。不要用邮箱或写死 uid 判断管理员。

### 三权限边界（内容编辑 / 审核 / 发布）

规则把三件事分开管，谁也不能越界：

- 内容编辑：只由带 catalogAdmin claim 的客户端做，且只能改 status == "draft" 的文档的内容字段。客户端不得改 status，不得改 reviewStatus、reviewer、reviewedAt，不得改 publishedVersion 与其他受保护发布字段（见受保护字段表）。
- 审核：只由受控流程做。status 在 draft / in_review / approved 之间的迁移、reviewStatus / reviewer / reviewedAt 的写入与清除，都由受控 Admin SDK 流程做，客户端一律不得碰。
- 发布：只由受控流程做。status 写 published、publishedVersion 指针的移动、公开投影的写入、Release 记录的写入，都由受控 Admin SDK 流程做，客户端一律不得碰。

客户端写操作的规则条件（P2 直接照抄进 rules，字段名与比较式如下；不同集合用各自的受保护字段列表，见受保护字段表）：

- update（以 trainingCatalogObjects 为例，其他集合按受保护字段表类推）：`request.auth.token.catalogAdmin == true && resource.data.status == "draft" && request.resource.data.status == "draft" && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["status", "reviewStatus", "reviewer", "reviewedAt", "publishedVersion"])`。注意三点：第一，当前状态必须是 draft（显式白名单）；第二，受保护字段用 diff().affectedKeys() 校验——新增、修改、删除受保护字段一律拒绝，不依赖 null 比较（旧的 .get(field, null) 相等比较防不住字段删除：原字段缺失、新写 reviewer: null 时两边都得 null；删一个值为 null 的字段也能通过；本轮已全部改掉，全文档不得再出现以 .get(field, null) 相等比较保护审核/发布字段的写法）；第三，diff() 只验受保护字段，内容字段的修改不受影响。
- create（内容集合通用，Release 须逐字写全，见第 5 条）：`request.auth.token.catalogAdmin == true && request.resource.data.status == "draft" && (!("reviewStatus" in request.resource.data) || request.resource.data.reviewStatus == <P1 初始值>) && !("reviewer" in request.resource.data) && !("reviewedAt" in request.resource.data) && !("publishedVersion" in request.resource.data)`（其余受保护发布字段同理，新建时不得含有）。reviewStatus 初始化规则：客户端创建草稿时，reviewStatus 必须缺失，或严格等于 P1 Schema 指定的初始值；不允许客户端自行选择审核状态（in_review、rejected 等状态只能由受控审核流程写）。<P1 初始值> 由 P1 定 schema 时钉死（见 §6）；P1 定下后把公式里的 <P1 初始值> 换成字面量。
- delete（见删除权限表）：`request.auth.token.catalogAdmin == true && resource.data.status == "draft"`（只能删草稿；trainingCatalogObjects 与 versions 的 delete 仍一律拒绝，见下）。

审批撤销与重审：已审批（approved）内容如需修改，不得由客户端直接改；须由受控流程先撤销审批（status approved → draft，同时 reviewStatus 重置、reviewer 与 reviewedAt 清空），再由客户端编辑草稿，编辑完成后再由受控流程重新送审（draft → in_review → approved）。撤销审批的操作只由受控流程做，客户端不得自行把 approved 改回 draft（因为 status 字段客户端不可改）。Links 的撤销：已审核映射如需修改，先由受控流程撤销审核（清空该映射的 reviewer 与 reviewedAt）；若该映射已进公开投影，先由受控流程撤回投影（指针与投影原子同步，见上），再撤销审核。撤销完成前，客户端不得改该映射的 catalogRef。

### 受保护字段表

下表列出每个集合里客户端不得创建、修改或删除的字段。P2 写 rules 时按此表逐集合加条件；P1 定 schema 时字段名以此表为准（若 P1 改名，同步改表）。

| 集合 | 受保护字段（客户端不得创建/修改/删除） |
| --- | --- |
| `trainingCatalogObjects` | `status`、`reviewStatus`、`reviewer`、`reviewedAt`、`publishedVersion` |
| `versions`（子集合） | `status`、`contentVersion`、`checksum`（快照建后不可改；`create` 时 `status` 必须是 `draft`） |
| `trainingCatalogKnowledgeArticles` | `status`、`reviewStatus`、`reviewer`、`reviewedAt` |
| `trainingCatalogEvidenceRecords` | `status`、`reviewStatus`、`reviewer`、`reviewedAt` |
| `trainingCatalogTeachingMedia` | `status`、`reviewStatus`、`reviewer`、`reviewedAt` |
| `trainingCatalogCorrectionRules` | `status`、`reviewStatus`、`reviewer`、`reviewedAt` |
| `trainingCatalogSafetyPolicies` | `status`、`reviewStatus`、`reviewer`、`reviewedAt`（`policyVersion` 建新版本时可写为新版本的标识，已存在文档上不可改） |
| `trainingCatalogLinks` | `reviewer`、`reviewedAt`（映射内容 `catalogRef` 本身是草稿内容，客户端可改；`reviewer` / `reviewedAt` 是审批记录，只由受控流程写）。update 须同时满足：不在公开投影里（!exists 检查），且未审核（reviewer 与 reviewedAt 均为空）；已审核或已公开的映射客户端不得改。 |
| `trainingCatalogPublicLinks` | 全部字段（客户端不可写；只由受控发布流程写） |
| `trainingCatalogReleases` | `status`、`reviewStatus`、`reviewer`、`reviewedAt`、`publishedVersion`（发布指针）；历史发布记录（已发布的 Release）客户端不得修改，更正以新 Release 记录，不得改旧记录。create 须逐字满足第 2 条的初始化规则：reviewStatus 缺失或严格等于 <P1 初始值>，且不得含有 reviewer、reviewedAt、publishedVersion 及其他受保护发布字段。 |
| `trainingCatalogMigrations` | 全部字段（客户端不可写；只可信流程写） |
| `trainingCatalogAuditLogs` | 全部字段（客户端不可写；只可信流程写） |

`trainingCatalogReleases` 的补充：发布指针与状态只能由受控 Admin SDK 发布流程维护。客户端可以创建不含 `publishedVersion` 的 Release 草稿（`status` 为 `draft`，纯草稿内容），但不得创建或修改含有 `publishedVersion` 的 Release 草稿，不得把 Release 草稿的 `status` 改出 `draft`，不得修改历史发布元数据。创建草稿 Release 本身不构成发布；发布只由受控流程做。

### 删除权限表

删除权限按集合与当前状态定，删除不得破坏已审批或已发布内容：

| 集合 | 客户端 catalogAdmin 可删 | 说明 |
| --- | --- | --- |
| `trainingCatalogObjects` | 不可删 | 对象只 deprecate / archive，不删（ADR-019） |
| `versions`（子集合） | 不可删 | 快照不可变 |
| `trainingCatalogKnowledgeArticles`、`trainingCatalogEvidenceRecords`、`trainingCatalogTeachingMedia`、`trainingCatalogCorrectionRules`、`trainingCatalogSafetyPolicies` | 仅 `status == "draft"` 可删 | `in_review` / `approved` / `published` / `deprecated` / `archived` 一律不可删 |
| `trainingCatalogLinks` | 仅未进公开投影且 reviewer 与 reviewedAt 均为空的映射可删 | 已审核的先由受控流程撤销审核再删；已进公开投影的先撤回投影再删。这里的 reviewer 与 reviewedAt 为空判断是是否已审核的状态判断，不是字段保护比较。字段保护一律用 diff().affectedKeys()。 |
| `trainingCatalogPublicLinks` | 不可删 | 只由受控发布流程写/删 |
| `trainingCatalogReleases` | 仅 `status == "draft"` 且不含 `publishedVersion` 的草稿可删 | 已发布的 Release 不可删 |
| `trainingCatalogMigrations`、`trainingCatalogAuditLogs` | 不可删 | 只可信流程写 |

已审批或已发布内容的下线（deprecate / archive / 撤回）只由受控流程做，客户端不得以删除代替下线。

get 与 list 分开定义：每条规则写清 `allow get` 与 `allow list` 各自的条件，不要只写 `allow read`。集合查询必须满足规则：list 规则按 `resource.data.status` 等字段写，查询不带对应过滤条件时规则引擎直接拒绝（客户端代码不能代替规则做过滤）。

读的前提：`request.auth != null`。未登录一律拒绝。

### 读矩阵

| 路径 | 普通已登录用户 | `catalogAdmin` |
| --- | --- | --- |
| `trainingCatalogObjects` | `allow get`：`status == "published"` 可读；未发布（`draft` / `in_review` / `approved` / `deprecated` / `archived`）拒绝。`allow list`：查询必须带 `where("status", "==", "published")`（再加 `kind` 过滤时用 §4 的复合索引）。无 `status` 过滤的查询拒绝。`where("status", "==", "draft")` 拒绝。 | `allow get` 与 `allow list` 都允许，list 不要求 `status` 过滤。 |
| `versions` | 只有 `allow get`，没有 `allow list`。get 的条件（三条同时满足）：(a) 该版本 `status == "published"`；(b) 父对象文档存在且其 `status == "published"`；(c) 父对象的 `publishedVersion` 等于本版本的 `contentVersion`。规则用 `get()` 读父对象：`get(/databases/$(database)/documents/artifacts/skatingx-production/trainingCatalogObjects/$(objectId)).data.publishedVersion == contentVersion`。缺失处理：父对象文档不存在、或无 `publishedVersion` 字段、或无 `status` 字段时，一律拒绝（fail closed，不报错放行）。版本访问边界：普通用户能读的版本恰好只有一个——父对象 `publishedVersion` 指向的那一个已发布版本；其他版本（旧版、草案版、已撤回版）一律读不到。单次 get 只读一个父对象，不构成规则访问次数阻塞（复核确认）。 | `allow get` 允许（含旧版、草案版、已撤回版）。没有 `allow list`。 |
| `trainingCatalogKnowledgeArticles`、`trainingCatalogEvidenceRecords`、`trainingCatalogTeachingMedia`、`trainingCatalogCorrectionRules` | get 与 list 同 `trainingCatalogObjects`：已发布可读，未发布拒绝；list 必须带 `status == "published"` 过滤。 | get 与 list 都允许，list 不要求 `status` 过滤。 |
| `trainingCatalogSafetyPolicies` | get 与 list 都拒绝。安全策略不得无条件公开。P3 的安全评估读路径另定，见 §6。 | get 与 list 都允许。 |
| `trainingCatalogLinks` | get 与 list 都拒绝。完整映射含内部审核信息，不对普通用户开放。 | get 与 list 都允许。 |
| `trainingCatalogPublicLinks` | get 与 list 都允许。投影只含 `catalogRef`。目标对象自身的规则另行管住未发布内容。 | get 与 list 都允许。 |
| `trainingCatalogReleases` | `status == "published"` 的发布可读。get 要求该文档 `status == "published"`。list 必须带 `where("status", "==", "published")`。未发布拒绝。 | get 与 list 都允许。 |
| `trainingCatalogMigrations`、`trainingCatalogAuditLogs` | get 与 list 都拒绝。 | get 与 list 都允许。 |

### collection-group 查询禁令

`versions` 子集合禁止 collection-group 查询：任何身份（包括 `catalogAdmin`）不得对 `versions` 做 `collectionGroup` 查询（规则里不给它 `allow list`；应用代码也不得发这种查询）。理由：collection-group 查询横跨所有对象的版本，无法按单个父对象的 `publishedVersion` 指针逐条校验。版本只能按对象逐个读（先读父对象拿 `publishedVersion`，再 get 该版本）。现有的 profile collection-group 列表例外与此无关，不受影响。

### 版本撤回

不可变不代表永久公开。

- 撤回不改版本快照本身（快照不可变，`update` / `delete` 一律拒绝）。撤回的动作是管理员改父对象文档：把 `publishedVersion` 指针移走（指向新版本）或清空（整对象下线）。移指针本身不是客户端管理员能做的事，见下方写矩阵：指针只由可信发布流程改。
- 普通用户读某版本时，须同时满足读矩阵里的三条：该版本 `status == "published"`、父对象存在且 `status == "published"`、父对象的 `publishedVersion` 等于本版本的 `contentVersion`。父对象不存在、或缺少 `publishedVersion` / `status` 时拒绝。指针已移走的版本普通用户读不到（get 拒绝；`versions` 没有 `allow list`，所以也查不到）。
- 单次 get 只读一个父对象，不构成规则访问次数阻塞（复核确认）。不得把撤回做成「改快照 `status`」。

### 写矩阵

全部 11 个集合：普通用户一律不许写（`create` / `update` / `delete` 全拒）。`versions` 子集合同样拒绝普通用户的三种写。

管理员编辑与发布分离：`catalogAdmin` 只管草稿。发布字段统一约束如下，P2 照抄进 rules（与三权限边界的公式相同；其他集合按受保护字段表把对应字段加进比较式）：

- update：`request.auth.token.catalogAdmin == true && resource.data.status == "draft" && request.resource.data.status == "draft" && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["status", "reviewStatus", "reviewer", "reviewedAt", "publishedVersion"])`。当前状态必须是 `draft`。受保护字段用 `diff().affectedKeys()` 校验，不用 `.get(field, null)` 相等比较。
- create：`request.auth.token.catalogAdmin == true && request.resource.data.status == "draft" && (!("reviewStatus" in request.resource.data) || request.resource.data.reviewStatus == <P1 初始值>) && !("reviewer" in request.resource.data) && !("reviewedAt" in request.resource.data) && !("publishedVersion" in request.resource.data)`（其余受保护发布字段同理，新建时不得含有）。
- delete：`request.auth.token.catalogAdmin == true && resource.data.status == "draft"`（只能删草稿；`trainingCatalogObjects` 与 `versions` 的 delete 仍一律拒绝，见删除权限表）。

按受保护字段表类推（P2 不得把对象公式原样套到字段不同的集合；update 一律用 diff().affectedKeys()，不用 .get(field, null) 相等比较）：

- `trainingCatalogKnowledgeArticles`、`trainingCatalogEvidenceRecords`、`trainingCatalogTeachingMedia`、`trainingCatalogCorrectionRules` 的 update：`request.auth.token.catalogAdmin == true && resource.data.status == "draft" && request.resource.data.status == "draft" && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["status", "reviewStatus", "reviewer", "reviewedAt"])`。create：`request.auth.token.catalogAdmin == true && request.resource.data.status == "draft" && (!("reviewStatus" in request.resource.data) || request.resource.data.reviewStatus == <P1 初始值>) && !("reviewer" in request.resource.data) && !("reviewedAt" in request.resource.data)`。delete：`request.auth.token.catalogAdmin == true && resource.data.status == "draft"`。
- `trainingCatalogSafetyPolicies` 在上一条之外，update 的 hasAny 列表再加 `"policyVersion"`。create 可以写入新文档的 `policyVersion`；已存在文档上不得改。
- `trainingCatalogLinks` 的 update：`request.auth.token.catalogAdmin == true && !exists(/databases/$(database)/documents/artifacts/skatingx-production/trainingCatalogPublicLinks/$(academyItemId)) && resource.data.get("reviewer", null) == null && resource.data.get("reviewedAt", null) == null && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["reviewer", "reviewedAt"])`。`catalogRef` 可改（仅限未审核、未公开的映射）。已审核映射（reviewer 或 reviewedAt 任一有值）即使尚未公开，也不得直接修改；审核信息不完整（仅 reviewer 或仅 reviewedAt 有值）也按已审核处理，保守锁定。需要修改时先由受控流程撤销审核（见审批撤销与重审）。create：`request.auth.token.catalogAdmin == true && !("reviewer" in request.resource.data) && !("reviewedAt" in request.resource.data)`。delete：`request.auth.token.catalogAdmin == true && !exists(/databases/$(database)/documents/artifacts/skatingx-production/trainingCatalogPublicLinks/$(academyItemId)) && resource.data.get("reviewer", null) == null && resource.data.get("reviewedAt", null) == null`（仅未进公开投影且 reviewer 与 reviewedAt 均为空的映射可删）。
- `trainingCatalogReleases` 的 update：`request.auth.token.catalogAdmin == true && resource.data.status == "draft" && request.resource.data.status == "draft" && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["status", "reviewStatus", "reviewer", "reviewedAt", "publishedVersion"])`。create：`request.auth.token.catalogAdmin == true && request.resource.data.status == "draft" && (!("reviewStatus" in request.resource.data) || request.resource.data.reviewStatus == <P1 初始值>) && !("reviewer" in request.resource.data) && !("reviewedAt" in request.resource.data) && !("publishedVersion" in request.resource.data)`。delete：`request.auth.token.catalogAdmin == true && resource.data.status == "draft" && !("publishedVersion" in resource.data)`。
- `versions` 的 create：`request.auth.token.catalogAdmin == true && request.resource.data.status == "draft" && request.resource.data.contentVersion == contentVersion`。新建快照的状态必须是 draft（显式白名单）；approved、archived、deprecated 等状态的新快照一律拒绝。update 与 delete 仍为 `false`。P1/P2 须保证版本文档 ID、`contentVersion` 字段与内容校验值（checksum）之间的一致性（create 时 `contentVersion` 字段须等于文档 id；checksum 由发布流程在发布前核对，见发布校验清单）。版本快照一旦创建，客户端不得修改。
- `trainingCatalogObjects` 的 delete：`false`。`trainingCatalogPublicLinks`、`trainingCatalogMigrations`、`trainingCatalogAuditLogs` 的 create / update / delete：`false`。

`resource.data.get("reviewer", null) == null && resource.data.get("reviewedAt", null) == null` 只出现在 `trainingCatalogLinks` 的 update 与 delete。它判断该映射是否已审核（两字段都为空才算未审核；任一有值即按已审核锁定），不是用相等比较保护 reviewer / reviewedAt 字段。字段保护一律用 diff().affectedKeys()。

客户端不得直接修改已发布内容（改字段、改状态、改 `publishedVersion` 指针都算修改）、不得撤回已发布内容（移指针、清指针、把 `status` 改出 `published` 都算撤回）、不得删除已发布内容。所有发布状态迁移（发布、撤回、deprecate、archive）只由受控 Admin SDK 流程做。正式发布由可信服务端校验流程做：Admin SDK 脚本（绕过规则）在校验通过后才写 `published` 状态、移指针、写公开投影。客户端直接设 `status == "published"` 不算发布。发布用的 Admin SDK 凭据只放在受控环境（操作者的本机 `~/.config/gcp/`，chmod 600），不得进入前端代码与仓库。

发布与撤回的写操作是原子的：发布时，父对象 `publishedVersion` 指针的移动与公开投影条目的写入在同一个 Admin SDK batch/transaction 里完成；撤回时，指针的移走/清空与投影条目的删除在同一个 batch/transaction 里完成。不留指针已动、投影未动的中间态（也不留反向中间态）。

在上述前提下，`catalogAdmin` 可 `create` / `update`：`trainingCatalogObjects`（`status` 保持 `"draft"`）、`trainingCatalogKnowledgeArticles`、`trainingCatalogEvidenceRecords`、`trainingCatalogTeachingMedia`、`trainingCatalogCorrectionRules`、`trainingCatalogSafetyPolicies`、`trainingCatalogLinks`（未审核且未公开的映射）、`trainingCatalogReleases`（不含 `publishedVersion` 的草稿）。`trainingCatalogMigrations`、`trainingCatalogAuditLogs` 与 `trainingCatalogPublicLinks` 只可由可信流程写。客户端 `catalogAdmin` 不可写这三处。投影由发布流程同步。create / update 的前提是三权限边界与受保护字段表；`approved` / `deprecated` / `archived` 状态的文档客户端一律不可改（不在可编辑白名单里）。

`versions` 子集合：`catalogAdmin` 只可 `create`，且新快照 `status` 必须是 `draft`。`update` / `delete` 一律拒绝。已发布版本不可变，修正产生新版本（ADR-019）。Admin SDK 绕过规则，所以只有可信发布流程能把快照写成 `published`。

`trainingCatalogObjects` 文档：`catalogAdmin` 不可 `delete`。对象只 `deprecate` / `archive`，不删（ADR-019）。

发布流程的校验清单（Admin SDK 脚本在写 `published` 前逐项验，不过不发布；校验本身是发布脚本的代码，不是客户端提交的字段——脚本不得信任客户端传来的审核字段，必须自己读库核对）：

- `reviewStatus == "approved"`。
- `reviewer` 与最后编辑人不同。
- `checksum` 与版本内容一致。
- 无未清的安全标志（4 条 Conditional 仍为 `review_required` 时不发布）。
- `links` 的目标对象已发布；否则不写公开投影。
- 指针与投影的写在同一个 batch/transaction 里（原子性）。
- 投影文档按字段白名单写（只含 `catalogRef` 三字段）。
- 目标版本存在、已审核（`reviewStatus == "approved"` 且 `reviewer` 与最后编辑人不同）、`checksum` 与版本内容一致。
- 发布指针与 Release 记录一致：要写入的 `publishedVersion` 与 CatalogObject 的发布指针及 Release 记录指向同一版本；三者不一致时不发布。

规则不校验字段内容（字段校验是 P1 的 schema / validator 的事）。规则只管「谁能读谁能写」。发布校验是可信流程的事。

## 4. 索引

Firestore 单字段索引自动建。本节只列必须的复合索引：

1. `trainingCatalogObjects`：`(kind ASC, status ASC)`。按 `kind` 列已发布对象。
2. `trainingCatalogReleases`：`(status ASC, createdAt DESC)`。取最新已发布版本。

新查询需要复合索引时，与查询同 PR 加索引（`firestore.indexes.json`），并在 emulator 测试里证明查询能跑。不要提前猜一堆索引。本步不改 `firestore.indexes.json`。

## 5. Emulator 测试计划

测试文件 `tests/rules/catalog.rules.test.ts`，P2 实现。本步只写计划，照 `tests/rules/helpers.ts` 与现有 `*.rules.test.ts` 的搭法。

身份搭法：用 `@firebase/rules-unit-testing` 的 `initializeTestEnvironment`，三种上下文：

- 未登录：`unauthenticatedContext()`。
- 普通已登录用户：`authenticatedContext(uid)`，无 claim。
- 管理员：`authenticatedContext(uid, { catalogAdmin: true })`。

现有 `tests/rules/helpers.ts` 只导出 `readRules`、`createRulesEnv` 和 `USERS`。`createRulesEnv` 用项目 id `demo-skatingx-rules` 加载提交的规则。现有测试直接调用 `env.unauthenticatedContext()` 与 `env.authenticatedContext(uid)`，没有带 claim 的封装。P2 先补这个 helper，再写 Catalog 规则测试。

夹具搭法：已发布内容的测试夹具用 `testEnv.withSecurityRulesDisabled()`（即 Admin SDK 路径）建。客户端管理员也写不成 `published` 状态（§3），夹具不能走客户端上下文建。断言一律走三种客户端上下文。

测试跑在 emulator 里（`npm run test:rules`），不用真实项目。测试数据用合成 id，不用真实工作簿 id。

| # | 身份 | 操作 | 期望 |
| --- | --- | --- | --- |
| 1 | 未登录 | 读已发布对象 | 拒绝 |
| 2 | 普通用户 | 读已发布对象；读 `draft` 对象 | 允许；拒绝 |
| 3 | 普通用户 | 对任一 Catalog 集合 `create` / `update` / `delete` | 拒绝 |
| 4 | 管理员 | `create` / `update` 对象草案；`delete` 对象 | 允许；拒绝 |
| 5 | 管理员 | `create` 版本（`status` 为 `draft`）；`update` / `delete` 版本 | 允许；拒绝 |
| 6 | 普通用户；管理员 | 读 `safetyPolicy` | 拒绝；允许 |
| 7 | 普通用户；管理员 | 读 `auditLog` / `migration` | 拒绝；允许 |
| 8 | 普通用户 | 读完整 link；读公开投影；读已发布 release；读未发布 release | 拒绝；允许；允许；拒绝 |
| 9 | 现有身份 | `users/{userId}` 子树与 profile collection-group 列表例外 | 现有 rules 测试全绿即算通过 |
| 10 | 普通用户；管理员 | 查 objects：带 `where("status", "==", "published")`；不带 `status` 过滤；带 `where("status", "==", "draft")`。管理员不带过滤查，以及查 `draft` | 允许；拒绝；拒绝。管理员两种都允许 |
| 11 | 普通用户；管理员 | 夹具先建一个已发布版本，父对象 `publishedVersion` 指向它，普通用户 get 该版本。再由夹具把指针移走。普通用户再 get 同一版本；普通用户 list `versions`；管理员 get 撤回后的版本；管理员 list `versions` | 第一次 get 允许；指针移走后 get 拒绝；list 拒绝；管理员 get 允许；管理员 list 拒绝（`versions` 不给 `allow list`） |
| 12 | 普通用户 | get 公开投影；get 完整 link。目标撤回后，发布流程移除投影条目，再 get 该投影 | 允许；拒绝。条目移除后查无此文档（get 得到不存在，不是读到旧投影） |
| 13 | 管理员客户端 | `create` 时 `status` 写 `published`；`update` 把草案改成 `published`；改 `publishedVersion` 指针；`create` 草案（`status` 写 `draft`） | 拒绝；拒绝；拒绝；允许 |
| 14 | 普通用户；管理员 | 对 `versions` 做 `collectionGroup` 查询 | 拒绝；拒绝（任何身份都不许；规则不给 `allow list`） |
| 15 | 管理员客户端 | `update` 已发布对象文档（改字段，`status` 仍为 `published`） | 拒绝 |
| 16 | 管理员客户端 | 撤回已发布内容（把对象 `status` 从 `published` 改出，或改 `publishedVersion` 指针） | 拒绝 |
| 17 | 管理员客户端 | `delete` 已发布对象/知识文档 | 拒绝 |
| 18 | 普通用户 | 读一个版本：快照 `status` 为 `published`，但父对象 `status` 不是 `published` | 拒绝 |
| 19 | 普通用户 | 读一个版本：父对象文档不存在，或无 `publishedVersion` 字段 | 拒绝 |
| 20 | 发布流程（Admin SDK，emulator） | 跑发布流程：指针移动与投影写入原子完成；再跑一次校验失败的发布 | 成功时指针与投影同时更新；校验失败时两者都不变（无中间态） |
| 21 | 发布流程（Admin SDK，emulator）+ 普通用户 | 发布流程写出的投影文档字段检查；普通用户读该投影 | 投影文档的键集合恰好是 `{ catalogRef}`，`catalogRef` 恰好是 `{ kind, id, contentVersion}`，无其他字段；普通用户读到的是白名单后的投影 |
| 22 | 管理员客户端 | 直接修改 `approved` 内容（改字段，同时保留 `reviewStatus == "approved"`） | 拒绝 |
| 23 | 管理员客户端 | 创建或修改含有 `publishedVersion` 的 Release 草稿 | 拒绝 |
| 24 | 管理员客户端 | 新建或修改时伪造 `reviewStatus == "approved"`、`reviewer` 或 `reviewedAt` | 拒绝 |
| 25 | 普通用户 | 读版本快照：快照的文档 id 与父对象 `publishedVersion` 不一致 | 拒绝 |
| 26 | 普通用户 | 读缺少 `status` 字段的版本快照 | 拒绝 |
| 27 | 管理员客户端 | 修改已公开 Link 的 catalogRef（该映射在 trainingCatalogPublicLinks 里） | 拒绝 |
| 28 | 管理员客户端 | 修改已审核但未公开 Link 的 catalogRef（reviewer 已有值，投影里没有） | 拒绝 |
| 29 | 管理员客户端 | 新增一个值为 null 的受保护字段（如 reviewer: null）；删除一个值为 null 的受保护字段 | 拒绝；拒绝 |
| 30 | 管理员客户端 | 创建草稿时写 reviewStatus = "in_review" | 拒绝 |
| 31 | 管理员客户端 | 创建 Release 草稿并注入受保护发布字段（如 publishedVersion、reviewer） | 拒绝 |
| 32 | 管理员客户端 | 修改或删除 reviewer 缺失、但 reviewedAt 存在的 Link | 拒绝 |
| 33 | 管理员客户端 | 创建 status=approved 或 archived 的版本快照 | 拒绝 |

场景 1–31 已按修改后的权限矩阵复核：场景 4 的管理员 create/update 只允许 status 保持 draft 且不改受保护字段的内容编辑（update 的受保护字段校验用 diff().affectedKeys()）；场景 5 的管理员 create 版本只允许 status 为 draft 的快照（原“status 非 published”已收紧为显式白名单）；场景 13、15、16、17、22、23、24 的拒绝结论不变；场景 27、28 的拒绝结论不变（Links 未审核判断补齐 reviewedAt 后，审核信息不完整的映射同样拒绝）；场景 11、12、18、19、20、21、25、26（读、查询、撤回、投影）不受本次修改影响，结论不变。

## 6. 待定与后续

本步不决定下面几项。

- P3 安全评估的读路径：评估代码以什么身份读 `safetyPolicies`（候选：评估走管理员 claim 的可信路径；或评估结果由可信流程写回，客户端只读结果）。P3 定。约束是安全策略不得无条件公开。
- 生产上 `catalogAdmin` claim 的设置流程（Admin SDK 脚本，P2/P5 的单独步骤）。
- 发布流程的具体实现（Admin SDK 脚本放哪、校验清单如何落代码、发布失败如何回滚）是 P2/P5 的事。本方案只定规则侧的分离。含原子 batch/transaction 的写法与凭据管理（凭据只放受控环境，不进前端与仓库）。含三权限边界的规则条件与发布校验清单的落代码（P2 按 §3 的公式与字段表写 rules 与脚本，不得只按原则写）。
- P1 定 schema 时须定 reviewStatus 的枚举值与各集合发布字段的准确字段名；规则引用的字段名以 P1 的 schema 为准，若与本方案的字段表有出入，以 P1 为准并同步改表。并钉死 reviewStatus 的初始值（草案新建时的唯一合法值，缺失或该初始值二选一；规则里的 <P1 初始值> 以此为准）。
- 公开投影的同步机制（发布流程何时写/删投影条目、目标撤回时如何联动）是 P2/P4 的事。指针与投影在同一个 batch/transaction 里同步（见 §3）。
- P1/P2 的实现顺序：P1 先建 CatalogObject schema 与版本化逻辑（不写 Firestore），P2 再按本方案在 emulator 里 dry-run 导入并跑 §5 的测试。

## 7. 回退

回退本提交（设计文档撤下）。规则未改、集合未建，不影响现有授权与数据。
