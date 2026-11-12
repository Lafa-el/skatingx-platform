# ADR-021: 青少年安全评估强制、服务端执行、fail-closed

## 状态

提议（2026-11-12）

## 背景

青少年内容须有安全门；工作簿里只有 4 条 Conditional 标志与示例行安全策略，没有真实策略数据。

## 决定

- 安全评估是强制的、服务端执行的；结果为 `allow` / `allow_with_supervision` / `review_required` / `block`（加 `reasonCodes` 与 `policyVersion`）。
- 无策略或缺必填输入时返回 `review_required` 或 `block`，永不静默 `allow`。
- 输入：年龄段、训练年龄、已验证技能、近期负荷、恢复标志、监督条件、已授权限制；不用年龄段映射作成熟度代理。
- 4 条 Conditional 条目（EX-L039、EX-L078、EX-L079、EX-L080）默认 `review_required`，直到有真实策略数据。
- 安全策略与审核数据不得无条件公开。

## 回退

回退本提交。安全门未建，不影响现有计划生成（计划本身不做安全处方）。
