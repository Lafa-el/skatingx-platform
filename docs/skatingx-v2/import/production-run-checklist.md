# 生产导入执行前检查清单

本清单是操作规范。它不授权部署 Firestore Rules 或 Indexes，也不授权向生产 Firestore 写入。第 3 步工程完成后，真实 initial 导入仍须另行授权。

工具：

- 线上 Rules 只读核对：`scripts/catalog/verify-live-rules.mjs`。默认拒绝访问生产。受控环境设置 `SKATINGX_RULES_READ=allow` 后才读取。`--postdeploy` 只用于部署之后的独立核对。
- 业务数据只读备份：`scripts/catalog/backup-prod.mjs`。生产读取需要 `SKATINGX_BACKUP_READ=allow`。`--skip-storage` 不能用于生产成功报告。生产备份必须加密保存，且不得写入 Git 工作区。口令由操作员从受控环境提供，与备份分开保管，不得提交仓库。
- 导入验收：`scripts/catalog/verify-import.mjs` 只读，不启动导入。生产幂等是同一 runId 的只读对象分类，不包含恢复写入。生产验收设置 `SKATINGX_IMPORT_VERIFY=allow` 后只读。16 项机器检查之外，客户端权限三项仍是待补证据，验收字段为 `pending-evidence`，进程以退出码 1 结束。缺报告、读取异常、任一失败或额外跳过都视为失败。

本次线上 Rules API 返回内容与仓库 #181 基线只有末尾 LF 差异。比较工具只去掉结尾 LF，再计算 SHA-256。正文、空格、注释、缩进或其他位置的换行不一致时，核对失败。本地磁盘文件仍按原始 SHA 与批准常量严格比较。

| 内容 | SHA-256 |
|---|---|
| #181 原始文件 | `68b6a84684fe1753c454b000dacc18933e25f50b7a065d03597d1453ecc149e8` |
| #181 去掉结尾 LF | `3851e82d571651914f6c26560b66077f168c15b3e56d6dfc579356c1fa83db15` |

Ruleset 的 `createTime` 是该 Ruleset 的创建时间。Release 的 `updateTime` 是当前 Release 的更新时间。两个时间不能互相代替。

## 执行顺序

1. 确认 P1/P2 冻结契约、最终 main SHA 与该 SHA 上的 CI 全部通过。
2. 确认生产连接与凭据身份。项目必须是 `skatingx-prod`，数据库必须是 `(default)`。身份不匹配时立即停止。
3. Gate A 已关闭后的核对。线上 Ruleset 应为候选（ruleset `67f3fdc0…`，归一化 SHA `0336282d…`）。不再要求线上 Ruleset 等于 PR #181。
4. 对现有用户资料、比赛成绩、视频元数据做只读备份。生产备份从 `SKATINGX_BACKUP_PASSPHRASE` 读取口令；没有口令时拒绝写入。口令与备份分开保管，不得写入仓库。正式执行前必须先验证备份，并在 demo- 模拟器上完成恢复演练。核对 manifest 的文档数量、路径摘要、落盘文件校验和逐文档校验。备份报告必须标明 `videoBinaryBackedUp: false`。视频元数据与 Storage 对象元数据核对通过，不等于视频二进制已备份，也不证明下载 token 仍然有效。操作员须单独确认这一剩余风险。
5. 执行窗口基线。执行前重新拍摄加密业务快照并验证；核对基线身份、项目 `skatingx-prod` 和数据库 `(default)`；在低用量窗口冻结 Catalog 编辑、审核和发布；记录当时剩余的读、写、删除额度。
6. Rules 部署已在 Gate A 完成，不再作为导入执行步骤。Indexes 不属于这一执行步骤。
7. 等待规则生效，重新读取线上 Ruleset，确认内容与已批准的候选源码一致。Rules API 一致不能代替客户端权限抽查。Indexes 不在本次部署范围内。
8. 完成生产客户端权限抽查，并回归原有业务功能。
9. 重新执行无写入预检。核对项目、数据库、runId、工作簿摘要，以及本次操作的真实待写计数。原始总预算 778 与本次待写分开记录。778 覆盖 771 个内容与审计写入、1 次 Migration 创建、1 次锁创建、1 次锁释放，以及每个内容批内各 1 次账本更新和 1 次锁 fencing 写入。
10. 执行前独立复核通过之后，才能另行授权真实 initial 导入。
11. 导入后运行扩展验收。保存机器可读报告和审计证据。报告不得包含生产文档正文。
12. 全部检查通过后关闭本次导入运行，保留恢复与回滚资料。

## 备份范围

| 资源 | 本阶段备份情况 |
|---|---|
| Firestore 用户、比赛成绩、视频元数据 | 备份 |
| Firebase Authentication 账户 | 不导出 |
| Cloud Storage 视频二进制 | 不备份，仅核对元数据 |
| 整个 Firebase 项目灾难恢复 | 不在本次范围 |

视频字段由下列源码确认：`packages/schema/src/paths.ts` 的 `users/{uid}/videos/{videoId}` 与 `users/{uid}/raceDay/{eventId}/videos/{videoId}`；`packages/firebase-client/src/firestore/videos.ts` 的 `title`、`fileName`、`externalUrl`、`technicalTags`、`notes`；`packages/schema/src/race-day.ts` 与 `packages/firebase-client/src/firestore/race-day-codec.ts` 的 `externalUrl`、`storedWhere`、`label`、`note`。这些结构没有 Storage object path 字段。`fileName` 是本地文件名，`storedWhere` 是存放说明。

## 失败处置

- 原业务权限异常：停止导入，优先核查并回退 Rules。
- 身份或项目不匹配：立即拒绝操作。
- 业务数据或 Catalog 内容与计划不一致：禁止自动覆盖。
- 部分导入失败：保留 Migration 与审计，按 runId 做受控 resume 或回滚。活动锁仍被原执行者持有时，第二个进程不能继续写。确认原执行者已经失效后，才允许人工接管；不得靠超时自动接管。
- 释放锁之后，Catalog 仍非空时，新的 initial 继续被全空预检拒绝。
- 备份无法验证：不得进入生产写入。
- 验收未全部通过：不得把本次导入标记为正式成功。
- 回滚只删除该 runId 实际创建的 Catalog 内容。不删除原业务数据。审计证据保留。
