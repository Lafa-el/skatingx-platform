# ADR-012: 删除运动员与空的当前运动员

| 字段 | 值 |
|---|---|
| 状态 | 随 `feat/athlete-delete` 提交。本切片不发布规则。 |
| 日期 | 2026-11-04 |
| 分支 | `feat/athlete-delete` |
| 不做 | 不改 Firestore 规则、不删 Storage 头像文件、不动日志、账号和 PIN。 |

## 1. 决定

`UserSettings.activeAthleteId` 改为可选。缺这个字段表示当前没有运动员，不再回落 `DEFAULT_ATHLETE_ID`。

删除由客户端 `deleteAthlete` 按已知路径完成：先删训练、纪录、积分、装备、分析，以及比赛日里这个人的名单行和对应成绩、视频；档案文档最后删；成功后再切换或清除当前运动员。清除字段用 `settingsRef` 上的 `deleteField()`，不经过 `updateUserSettings`，因为 `toFirestoreData` 会把 `FieldValue` 变成空对象。

已有账号启动时只保证 settings 文档存在，不再补建默认运动员。否则下一次打开会把刚删掉的人建回来。新账号（settings 刚创建）仍按原样建默认档案。

## 2. 风险与回退

删除在浏览器里分批写。中途失败时档案还在，重跑从还在的数据继续；档案已删而当前运动员没切成时，重跑只做切换或清除。比赛日总结文档是快照，不删。

回退：还原这次提交。规则没有改动，不必重新发布。已经删掉的运动员数据不会因回退代码而恢复。
