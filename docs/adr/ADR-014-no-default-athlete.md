# ADR-014: 新账号不再预置默认运动员

| 字段 | 值 |
|---|---|
| 状态 | 随 `feat/no-default-athlete` 提交。不改规则，不发布规则。 |
| 日期 | 2026-11-04 |
| 分支 | `feat/no-default-athlete` |
| 依据 | DR-003 选项 C 曾约定界面默认 `lindsay`。该约定只适用于已经存在的 Lindsay 账号和迁移数据。 |
| 不做 | 不改匿名登录、不改已有 settings 和档案、不改 `createAthlete`、不改 Firestore 规则、不改训练和分析布局的空态门。 |

## 1. 决定

新账号（含新的匿名访客）启动时只创建 `settings/main`。不写 `activeAthleteId`，不建档案，不建陪伴文档。打开应用就是空态，用户自己添加运动员。

`DEFAULT_ATHLETE_ID`（`"lindsay"`）仍留在 schema 里，给迁移和既有规则用。业务代码不再用它当“没有当前运动员”的回落。没有当前运动员时不查询 `lindsay` 路径。

已有账号的 settings、档案和 `activeAthleteId` 原样留下。真实的 Lindsay 数据不动。ADR-012 里“新账号仍建默认档案”这一句到此作废；已有账号不补建运动员仍然成立。

## 2. 风险与回退

分析、配速和器材记录的写入仍把 `athleteId` 标成 `lindsay`，因为 `firestore.rules` 要求这个字面量。本步不改规则，所以那三处构建函数仍引用 `DEFAULT_ATHLETE_ID`。新运动员的分析保存仍受这条规则限制，另开切片再改。

回退：还原这次提交。没有规则变更，不必重新发布。已经打开过的新账号不会因此长出档案；它们本来就没有默认运动员。
