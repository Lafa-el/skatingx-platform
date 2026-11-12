# Catalog Firestore 路径、权限与索引方案

本文件是设计草案。它不改 `firestore.rules`，不改 `firestore.indexes.json`，不建集合，不碰生产数据。ADR-018 至 ADR-023 仍是「提议」。

独立架构复核（第一轮）的四项约束与 ChatGPT 独立复核（有条件通过）的六项补充都已写进 §2、§3、§5、§6：get 与 list 分开；版本撤回只动父对象的 `publishedVersion` 指针，并加父对象 status 检查与缺失字段处理；公开投影用严格字段白名单、指针与投影原子同步；versions 禁止 collection-group 查询；客户端管理员只写未发布草稿，不得直接改、撤、删已发布内容，正式发布走可信流程；普通用户只读 `trainingCatalogPublicLinks`，不读完整映射；测试场景 13 个加 8 个攻击性场景。已定的 10 个集合名与路径不改。

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

管理员编辑与发布分离：`catalogAdmin` 只管草稿。客户端写（即使带 `catalogAdmin` claim）只许动未发布草稿：`update` 要求当前文档 `status!= "published"` 且新文档 `status!= "published"`（`resource.data.status!= "published" && request.resource.data.status!= "published"`）；`delete` 要求当前文档 `status!= "published"`（草稿可删，已发布不可删；`trainingCatalogObjects` 的 `delete` 仍一律拒绝，见下）。客户端不得直接修改已发布内容（改字段、改状态、改 `publishedVersion` 指针都算修改）、不得撤回已发布内容（移指针、清指针、把 `status` 改出 `published` 都算撤回）、不得删除已发布内容。所有发布状态迁移（发布、撤回、deprecate、archive）只由受控 Admin SDK 流程做。`update` 时 `request.resource.data.publishedVersion == resource.data.publishedVersion`；`create` 时不得写入 `publishedVersion`。正式发布由可信服务端校验流程做：Admin SDK 脚本（绕过规则）在校验通过后才写 `published` 状态、移指针、写公开投影。客户端直接设 `status == "published"` 不算发布。发布用的 Admin SDK 凭据只放在受控环境（操作者的本机 `~/.config/gcp/`，chmod 600），不得进入前端代码与仓库。

发布与撤回的写操作是原子的：发布时，父对象 `publishedVersion` 指针的移动与公开投影条目的写入在同一个 Admin SDK batch/transaction 里完成；撤回时，指针的移走/清空与投影条目的删除在同一个 batch/transaction 里完成。不留指针已动、投影未动的中间态（也不留反向中间态）。

在上述前提下，`catalogAdmin` 可 `create` / `update`：`trainingCatalogObjects`（草案状态）、`trainingCatalogKnowledgeArticles`、`trainingCatalogEvidenceRecords`、`trainingCatalogTeachingMedia`、`trainingCatalogCorrectionRules`、`trainingCatalogSafetyPolicies`、`trainingCatalogLinks`、`trainingCatalogReleases`、`trainingCatalogMigrations`。`trainingCatalogAuditLogs` 与 `trainingCatalogPublicLinks` 只可由可信流程写。客户端 `catalogAdmin` 不可写这两处。投影由发布流程同步。

`versions` 子集合：`catalogAdmin` 只可 `create`，且新快照 `status` 不得为 `published`。`update` / `delete` 一律拒绝。已发布版本不可变，修正产生新版本（ADR-019）。Admin SDK 绕过规则，所以只有可信发布流程能把快照写成 `published`。

`trainingCatalogObjects` 文档：`catalogAdmin` 不可 `delete`。对象只 `deprecate` / `archive`，不删（ADR-019）。

发布流程的校验清单（Admin SDK 脚本在写 `published` 前逐项验，不过不发布）：

- `reviewStatus == "approved"`。
- `reviewer` 与最后编辑人不同。
- `checksum` 与版本内容一致。
- 无未清的安全标志（4 条 Conditional 仍为 `review_required` 时不发布）。
- `links` 的目标对象已发布；否则不写公开投影。
- 指针与投影的写在同一个 batch/transaction 里（原子性）。
- 投影文档按字段白名单写（只含 `catalogRef` 三字段）。

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
| 5 | 管理员 | `create` 版本（非 `published`）；`update` / `delete` 版本 | 允许；拒绝 |
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

## 6. 待定与后续

本步不决定下面几项。

- P3 安全评估的读路径：评估代码以什么身份读 `safetyPolicies`（候选：评估走管理员 claim 的可信路径；或评估结果由可信流程写回，客户端只读结果）。P3 定。约束是安全策略不得无条件公开。
- 生产上 `catalogAdmin` claim 的设置流程（Admin SDK 脚本，P2/P5 的单独步骤）。
- 发布流程的具体实现（Admin SDK 脚本放哪、校验清单如何落代码、发布失败如何回滚）是 P2/P5 的事。本方案只定规则侧的分离。含原子 batch/transaction 的写法与凭据管理（凭据只放受控环境，不进前端与仓库）。
- 公开投影的同步机制（发布流程何时写/删投影条目、目标撤回时如何联动）是 P2/P4 的事。指针与投影在同一个 batch/transaction 里同步（见 §3）。
- P1/P2 的实现顺序：P1 先建 CatalogObject schema 与版本化逻辑（不写 Firestore），P2 再按本方案在 emulator 里 dry-run 导入并跑 §5 的测试。

## 7. 回退

回退本提交（设计文档撤下）。规则未改、集合未建，不影响现有授权与数据。
