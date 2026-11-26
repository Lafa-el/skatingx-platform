# ADR-021: 青少年安全评估强制、服务端执行、fail-closed

## 状态

提议（Proposed，2026-11-12）。2026-11-18 增补指针启停、回退、负责人、监控与 IAM 决定。状态仍为 Proposed，直至节点⑤复核通过。

## 背景

青少年内容须有安全门；工作簿里只有 4 条 Conditional 标志与示例行安全策略，没有真实策略数据。

## 决定

- 安全评估是强制的、服务端执行的；结果为 `allow` / `allow_with_supervision` / `review_required` / `block`（加 `reasonCodes` 与 `policyVersion`）。
- 无策略或缺必填输入时返回 `review_required` 或 `block`，永不静默 `allow`。
- 输入：年龄段、训练年龄、已验证技能、近期负荷、恢复标志、监督条件、已授权限制；不用年龄段映射作成熟度代理。
- 4 条 Conditional 条目（EX-L039、EX-L078、EX-L079、EX-L080）默认 `review_required`，直到有真实策略数据。
- 安全策略与审核数据不得无条件公开。
- 生效版本由独立指针决定。策略正文保持版本不可变，不在策略文档上切换启用标志。

## 启用 / 禁用

集合 `trainingCatalogSafetyPolicyPointers`，文档路径 `/artifacts/skatingx-production/trainingCatalogSafetyPolicyPointers/{policyId}`。文档 ID 等于 `policyId`。

| 字段 | 含义 |
|---|---|
| `policyId` | 字符串，必须等于文档 ID |
| `activePolicyVersion` | 当前生效版本；`null` 表示已禁用 |
| `previousPolicyVersion` | 上一次生效版本；首次启用为 `null` |
| `revision` | 整数。创建时为 1。成功的启用、禁用、回退加 1。重复启用当前版本和重复禁用不加 |
| `updatedBy` | 操作者，取自 operator 绑定（ADC 身份邮箱）。服务账号邮箱只标明执行身份 |
| `updatedAt` | ISO 时间戳 |
| `reason` | 非空理由 |

受控 CLI 命令，走生产门禁，写命令绑定 operator：

- `policy-enable --policyId --policyVersion --reason`
- `policy-disable --policyId --reason`
- `policy-rollback --policyId --expectedRevision --reason`
- `policy-status --policyId`：只读，打印指针 JSON，不写指针，不写审计

启用和回退在同一事务内共用一套目标校验：按 `{policyId}--v{policyVersion}` 读取策略，核对正文 `policyId`、`policyVersion` 均为字符串且与请求一致，`status` 为 `published`，`reviewStatus` 为 `approved`，并且 `parseSafetyPolicy` 成功。同一事务提交指针变更和 `ok` 审计。任一校验失败则事务回滚，指针保持原值，事务外另写 `rejected` 审计。

重复启用当前版本、重复禁用：返回成功，不修改指针，不增加 `revision`，保留 `previousPolicyVersion`。`ok` 审计的 `detail` 注明无状态变化，`changed` 为 `false`。真实启用、禁用、回退的 `ok` 审计 `changed` 为 `true`。`rejected` 审计不带 `changed`。回退必须带操作者刚读到的整数 `revision`；不一致时拒绝，错误写明期望值与实际值。指针已禁用时，恢复只能显式 `policy-enable` 指定版本，不能用回退，也不能自动切回 `previousPolicyVersion`。

Emulator 读取函数是 `assessPointerSafety`。生产评估消费端属于 P4，本 ADR 只定契约：

1. 指针不存在：`review_required` / `POLICY_MISSING`，`policyVersion: null`，`pointerState: "disabled"`，不触发 M-E1。
2. 指针存在但字段不合格：无论 `activePolicyVersion` 是 `null`、`""` 还是其他值，一律 `POLICY_MISSING`，`pointerState: "error"`，M-E1。不合格指 `policyId` 不是非空字符串或与文档 ID 不一致，`activePolicyVersion` 不是 `null`、`""` 或非空字符串，`previousPolicyVersion` 不是 `null` 或字符串，`revision` 不是整数，或 `updatedBy`、`updatedAt`、`reason` 任一不是非空字符串。
3. 字段合格且 `activePolicyVersion` 为 `null` 或 `""`：`POLICY_MISSING`，`pointerState: "disabled"`，不触发 M-E1。
4. 字段合格且 `activePolicyVersion` 为非空字符串：读取该版本。评估入口统一核对返回值：策略须是对象，且 `policyId`、`policyVersion` 均为字符串并与请求一致。注入的读函数也经过这一次核对。不一致、文档缺失、超时或抛错都是 `POLICY_MISSING` 与 M-E1，不得进入解析与评估。
5. 解析失败：`POLICY_INVALID`，M-E2。
6. 评估。若 EX-L039、EX-L078、EX-L079、EX-L080 之一得到 `allow` 或 `allow_with_supervision`，记 M-E3。告警不改写评估决定。

P4 消费端只使用当前指针对应的结果。禁用或读取失败后，禁止沿用旧缓存，禁止自动切到 `previousPolicyVersion`。缓存如有，以 `revision` 为键；修订号变化则失效；禁用时清空。

客户端 Rules 拒绝该集合的 get、list、create、update、delete，包括 `catalogAdmin`。指针读写只走服务端受控 CLI（Admin SDK）。

## 审核 / 发布

文章、链接和安全策略的审核必须带上审核人看到的内容摘要 `expectedContentSha256`。事务内用同一套 `contentHash` 计算当前正文。不一致则拒绝，不改文档，不写 `ok` 审计，另记 `rejected` 审计。一致时写入的 `reviewedContentSha256` 就是这份已核验摘要。

`article-review` 和 `link-review` 先读当前文档并计算摘要，再调用审核。`policy-review` 使用审核人传入的已确认摘要，见「审核摘要来源」。没有摘要不得调用审核。

策略审核和发布都核对正文 `policyId`、`policyVersion` 为字符串且与请求一致。不一致则拒绝。发布在此之后仍做 `parseSafetyPolicy`。

审核成功的审计同时记录具名审核人（`actor`）、操作员（`operator`，生产来自 ADC）和 `reviewedContentSha256`。`rejected` 审计不带摘要。

客户端不能创建或修改 `reviewedContentSha256`。KnowledgeArticles、EvidenceRecords、TeachingMedia、CorrectionRules、SafetyPolicies 的创建不得包含该字段，更新不得改动该字段。

## 回退

已发布策略的回退是移动指针，不删除、不修改任何策略版本。操作流程：

1. `policy-status` 读取当前 `revision`。
2. `policy-rollback --policyId <id> --expectedRevision <读到的修订号> --reason "…"`。
3. 读回指针。`activePolicyVersion` 变为回退前的 `previousPolicyVersion`，`previousPolicyVersion` 变为回退前的生效版本，`revision` 加 1。
4. 按回退后的版本抽查 EX-L039、EX-L078、EX-L079、EX-L080。

超时重试若仍携带旧修订号，会被拒绝，避免把刚回退的版本再切回去。没有 `previousPolicyVersion`，或该版本不存在、未发布、未审核、不可解析时，拒绝回退，指针保持原值。

禁用是另一条停用路径：`policy-disable` 后，评估返回 `review_required` / `POLICY_MISSING`，`pointerState` 为 `disabled`，不触发 M-E1。禁用后的恢复必须显式 `policy-enable` 指定版本。

本 ADR 仍为 Proposed。节点⑤若不接受本设计，回退本提交，并且不得在生产启用策略。

## 监控与负责人

策略负责人是 Lafa_el。负责人批准启停并响应告警。专业安全审核保留独立审核人，记录审核人姓名和所审核的确切版本。操作员是执行 CLI 的人；审计里的 operator 来自 ADC。服务账号邮箱只标明执行身份，不能代替具名人员。

告警渠道是邮件。M-E3 单次即发高优先级邮件。M-E5 只对 `changed: true` 的成功指针变更发通知。`changed: false` 的无状态变化审计不是 M-E5 事件。P4 接线时用测试事件验证送达，并记录由谁确认收到、由谁处置。

| 事件 | 判定 | 级别 |
|---|---|---|
| M-E1 | 读取超时、权限错误、指针损坏、指向版本缺失或身份不匹配。有意禁用不是 M-E1 | 高。单次即告警 |
| M-E2 | 已发布策略解析失败 | 高。单次即告警 |
| M-E3 | 四条 Conditional 对象被评估为 `allow` 或 `allow_with_supervision` | 最高。单次即告警 |
| M-E4 | 审核或发布被拒绝。内容在审核后被修改、策略无效，这两类拒绝是预期行为，不告警；其他原因告警 | 中 |
| M-E5 | `policy_enable` / `policy_disable` / `policy_rollback` 成功且 `changed: true`。`changed: false` 的重复启用或重复禁用不是 M-E5 | 中。每次真实变更通知负责人 |
| M-E6 | 10 分钟内零评估，或最近 10 分钟达到此前 1 小时折算成 10 分钟均值的 10 倍，且当前窗口至少 20 次。零量告警必须有上游请求或定时探针证明该窗口应该有评估。20 次是初始运营值，P4 接线后用真实流量校准 | 低 |

M-E1、M-E2、M-E3、M-E6 的生产接线属于 P4。M-E4 和 M-E5 的信号在 `trainingCatalogAuditLogs`。监控失败不得把评估改成放行，也不得挡住评估。

## 策略创建门禁

`policy-create` 是受生产门禁约束的创建命令。它只写入钉死的策略版本。当前只钉死 `youth-conditional-v1` 版本 `"1"`，文档 ID `youth-conditional-v1--v1`，内容摘要 `3a80313cd55a4a5e2f386077d00397cfbb89f65fa49dd68fd81e22c96097797f`。摘要是 `contentHash`：除 `status`、`reviewStatus`、`reviewer`、`reviewedAt`、`publishedAt`、`reviewedContentSha256` 之外的规范 JSON 的 SHA-256。

命令从 `scripts/catalog/policies/youth-conditional-v1--v1.json` 读取固定正文。正文的 `policyId`、`policyVersion` 必须与参数一致，`status` 必须是 `draft`，`reviewStatus` 必须是 `pending`，并且不得包含 `reviewer`、`reviewedAt`、`reviewedContentSha256`、`publishedAt`。摘要必须等于钉死值。未钉死的版本直接拒绝。创建是 create-only：文档已存在则拒绝，不覆盖。成功时同一事务写入文档和一条 `policy_create` 的 `ok` 审计。失败时文档不变，另记 `rejected` 审计。

## 审核摘要来源

`policy-review` 不再由 CLI 读取 live 文档后重算摘要。审核人必须传入已经确认的 `--expectedContentSha256`。缺失则拒绝，不会调用审核。事务内仍用 `contentHash` 比对当前正文；不一致则拒绝，文档不动，并记 `rejected` 审计。`article-review` 和 `link-review` 仍由 CLI 读取当前文档并计算摘要。

`policy-digest --file <本地 JSON>` 只在本地输出 `contentHash`。它不访问数据库，不走生产门禁。带 `--target production` 时拒绝。

## 生产门控

生产写入口不接受调用方自己提供的 operator 字符串，也不接受只模仿字段的普通对象。`openProductionFlowDb` 在执行目标、ADC 文件、ADC 身份、服务账号身份和项目 ID 确认都通过之后，才签发执行上下文。上下文带已核验的 operator（ADC 身份邮箱）。签发标记留在模块内部，调用方不能自己造一个有效上下文。

这 7 个写函数在 `target === "production"` 时要求该上下文：`reviewKnowledgeArticle`、`publishKnowledgeArticle`、`reviewSafetyPolicy`、`publishSafetyPolicy`、`enablePolicyPointer`、`disablePolicyPointer`、`rollbackPolicyPointer`。没有上下文，或上下文是伪造的，在任何 Firestore 读或写之前拒绝，不改文档，不记审计。生产审计里的 operator 和指针的 `updatedBy` 只取上下文里的 operator。调用方再传 `options.operator` 会被忽略，不能覆盖上下文。CLI 的 `main()` 把 `openProductionFlowDb` 返回的上下文传给 `dispatchFlow`。

仿真器调用不需要上下文。`showPolicyPointer`（`policy-status`）只读，不要求上下文；生产 CLI 仍用 `openProductionFlowDb` 打开数据库。

策略操作的标准输入确认只接受与 `skatingx-prod` 完全一致的项目 ID。不接受 `IMPORT`、空字符串、大小写不同的项目 ID，或其他字符串。`readLine` 得到非字符串（例如 EOF 的 `undefined`）也拒绝。确认被拒绝时不创建 Firestore 客户端，不建立生产连接。导入路径仍用 `confirmProjectOnStdin`，继续接受 `IMPORT`。

## IAM

两个身份与本变更并行创建，不在本变更内创建，也不在本变更内配置生产 IAM。

- 专用策略运维写入身份：短时 impersonation，只向授权操作者开放。权限按实际 CLI 调用验证，限于读取、创建、更新和事务。不要 Firebase Auth 权限、删除权限和长期密钥。不再用 `catalog-importer` 做策略写操作。两个 allowlist 按用途分开：策略写操作只接受 `catalog-policy-operator@skatingx-prod.iam.gserviceaccount.com`，由 `openProductionFlowDb` 把该名单传给 `assertServiceAccountIdentity`；导入写操作只接受 `catalog-importer@skatingx-prod.iam.gserviceaccount.com`，由 `grantProductionWrite` 和 `verifiedProductionIdentity` 强制。两边互相拒绝。仿真器测试验证了名单内容、策略入口接受 D-03 并拒绝 importer、以及确认失败时不打开数据库。
- 独立只读评估身份：首选自定义角色，限制在目标数据库，按文档 ID 点读。不把 `roles/datastore.viewer` 授给共享生产库。剩余风险：数据库级 IAM 条件不能把 `get` 限定到指针和策略两个集合；应用只读指定路径也不能缩小 IAM 本身的权限。若业务要求集合级隔离，再评估独立数据库或服务边界。

服务端 SDK 由 IAM 授权，客户端 Rules 不能限制这些服务账号。凭证只用 impersonation，不落地长期 JSON key。

生产 IAM 配置和策略启用由节点⑤单独验收。该验收通过之前，不得在生产启用任何策略。
