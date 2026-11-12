# ADR-018: 保留 Academy；新增版本化 Catalog 作独立有界上下文

## 状态

提议（2026-11-12）

## 背景

Academy 是计划的内容源（ADR-017）。V2.0 工作簿是 257 个对象的典籍库（Exercise 120、Drill 68、Block 51、Session 18），两者粒度与 ID 不同，不能合并，也不能长期双重维护。Drill→Exercise 边在源数据中不存在（source_not_provided，P0-1 已验）。

## 决定

- Academy 原样保留：99 条、routine 96 条、链接 96 条、dayPlan 22 个、生成器与原始文件不动；计划继续读 Academy routine（ADR-017）。
- Training Catalog 是独立、版本化的有界上下文（新包 `packages/training-catalog`，P1 建）；内容来自工作簿原 ID，版本化、审核制。
- 两者以人工审核的 `ACADEMY_CATALOG_LINKS` 映射表桥接（与 `ROUTINE_MODULE_LINKS` 同模式）；无映射即无链接，禁止从中文标签推断。
- P0–P3 不改变 Academy 行为（生成器、计划生成、导入、任务、积分均不动）。
- P4 起逐步建立 Catalog 统一管理新内容的机制：新内容只进 Catalog（走审核与版本化），Academy 新增条目时先在 Catalog 立项、再由映射表引用；避免长期双重维护（具体流程由 P4 的 ADR 定）。
- `TrainingTask` 加可选 `catalogRef`（P0-3），旧字段不动，旧文档不批量改写。

## 回退

回退本提交（ADR 草案撤下）。Catalog 未建，不影响 Academy 与计划。
