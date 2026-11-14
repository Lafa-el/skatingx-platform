# 生产导入执行前检查清单

本清单是操作规范。它不授权部署 Firestore Rules 或 Indexes，也不授权向生产 Firestore 写入。第 3 步工程完成后，真实 initial 导入仍须另行授权。

工具：

- 线上 Rules 只读核对：`scripts/catalog/verify-live-rules.mjs`。默认拒绝访问生产。受控环境设置 `SKATINGX_RULES_READ=allow` 后才读取。`--postdeploy` 只用于部署之后的独立核对。
- 业务数据只读备份：`scripts/catalog/backup-prod.mjs`。生产读取需要 `SKATINGX_BACKUP_READ=allow`。`--skip-storage` 不能用于生产成功报告。备份必须加密保存，且不得写入 Git 工作区。
- 导入验收：`scripts/catalog/verify-import.mjs` 只读，不启动导入。幂等由 `scripts/catalog/check-idempotency.mjs` 在 demo- 模拟器上单独验证。生产验收设置 `SKATINGX_IMPORT_VERIFY=allow` 后只读，不启动导入程序。
- `scripts/catalog/run-import.mjs` 的生产连接保持关闭。

## 执行顺序

1. 确认 P1/P2 冻结契约、最终 main SHA 与该 SHA 上的 CI 全部通过。
2. 确认生产连接与凭据身份。项目必须是 `skatingx-prod`，数据库必须是 `(default)`。身份不匹配时立即停止。
3. 读取线上当前 Ruleset，确认它与仓库中 PR #181 的 `firestore.rules` 基线一致。候选规则只能是该基线加上已批准的 Catalog 增量。
4. 对现有用户资料、比赛成绩、视频元数据做只读备份。核对 manifest 的文档数量、路径摘要和文件校验。备份报告必须标明 `videoBinaryBackedUp: false`。视频元数据完整不等于视频文件可恢复。
5. 选择低使用量窗口。停止并行的 Catalog 编辑、审核和发布。
6. 在单独授权之后，才部署已批准的 Rules 与 Indexes。
7. 等待规则生效，重新读取线上 Ruleset，确认内容与已批准的候选源码一致。Rules API 一致不能代替客户端权限抽查。
8. 完成生产客户端权限抽查，并回归原有业务功能。
9. 重新执行无写入预检。核对项目、数据库、runId、工作簿摘要，以及本轮待写预算。原始总预算 772 与本轮待写预算分开记录。
10. 执行前独立复核通过之后，才能另行授权真实 initial 导入。
11. 导入后运行扩展验收。保存机器可读报告和审计证据。报告不得包含生产文档正文。
12. 全部检查通过后关闭本次导入运行，保留恢复与回滚资料。

## 失败处置

- 原业务权限异常：停止导入，优先核查并回退 Rules。
- 身份或项目不匹配：立即拒绝操作。
- 业务数据或 Catalog 内容与计划不一致：禁止自动覆盖。
- 部分导入失败：保留 Migration 与审计，按 runId 做受控 resume 或回滚。
- 备份无法验证：不得进入生产写入。
- 验收未全部通过：不得把本次导入标记为正式成功。
- 回滚只删除该 runId 实际创建的 Catalog 内容。不删除原业务数据。审计证据保留。
