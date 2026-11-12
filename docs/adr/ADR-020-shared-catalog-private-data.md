# ADR-020: 共享已审核 Catalog 与私人运动员数据分离

## 状态

提议（2026-11-12）

## 背景

Catalog 是共享内容，运动员数据是私人的；两者不能混在一个授权模型里。

## 决定

- Catalog 落在租户根下：`/artifacts/skatingx-production/trainingCatalogObjects/{objectId}`（另设版本子集合与知识、映射、发布、安全策略集合）；不得放在 `users/{uid}` 下。
- 规则：只有管理员/服务身份可写共享 Catalog；普通用户只读已发布内容，不能读未发布内容、不能改共享 Catalog；安全策略与审核数据不得无条件公开。
- 私人运动员数据（任务、日记、分析、档案）不进共享集合；Catalog 不存运动员 PII。
- 具体规则与索引由 P0-4 定，P2 在 emulator 里测。

## 回退

回退本提交。规则未改，不影响现有授权。
