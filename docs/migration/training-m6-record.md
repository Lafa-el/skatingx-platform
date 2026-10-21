# 训练模块 M6 生产执行记录

日期：2026-10-21（America/New_York）

代码：`main` `95ddd48`（#79 squash）。执行时工作树就是这一版，没有改脚本、规则或生产代码。源项目 `blaze-skate-training-platform` 只读。目标项目 `skatingx-prod`。目标账号 `baWEw6SZKcQItvcDdpF64ZNe5W12`，运动员 `lindsay`。没有写入 `skatingx-platform`（staging）。

源身份用的是 M2 普查确认值，只出现在当次命令行，不写入本记录。

## 源 / 目标计数

源档案：legacy points 0。本次追加成绩 8 条，落在 6 个距离文档。任务追加 0，历史追加 0。备份键只有 `races`。

目标写入前：points 55，`weeklyTemplate` 为空。已有距离文档 `1000m`、`1500m`、`333m`、`500m`、`777m`、`fastest_lap`、`start_half_lap`、`start_lap`。其中 `500m`、`777m`、`1000m`、`1500m` 当时 entries 为 0。`start`、`lap` 和 `migrationBackups/training-unmapped` 不存在。

目标写入后：points 仍是 55。`weeklyTemplate` 已填充（正文不抄）。距离列表多了 `lap` 与 `start`。`333m`、`fastest_lap`、`start_half_lap`、`start_lap` 不在本次写入里。

## plan 摘要

写前 dry-run：

```text
plan-summary kinds=state:1,gamification:0,recordsDoc:6,taskHistoryDay:0,backupDoc:1 tasksAdded=0 historyTasksAdded=0 recordsAdded=8 backupKeys=races skips=avatar:red-line,createdAt:not-migrated,customDistances:not-migrated,customRewards:not-migrated,dailyBonusPoints:old-default,isPro:red-line,language:not-migrated,ownerUid:not-migrated,parentPin:red-line,points:points-not-greater,pointsPerTask:old-default,rewardHistory:not-migrated,schemaVersion:not-migrated,sourceApp:not-migrated,theme:not-migrated,updatedAt:not-migrated,username:not-migrated
target-state legacyPoints=0 points=55 records=1000m,1500m,333m,500m,777m,fastest_lap,start_half_lap,start_lap weeklyTemplate=empty
dry-run: no documents written
```

写入（检查点通过，参数没有改）：

```text
plan-summary kinds=state:1,gamification:0,recordsDoc:6,taskHistoryDay:0,backupDoc:1 tasksAdded=0 historyTasksAdded=0 recordsAdded=8 backupKeys=races skips=avatar:red-line,createdAt:not-migrated,customDistances:not-migrated,customRewards:not-migrated,dailyBonusPoints:old-default,isPro:red-line,language:not-migrated,ownerUid:not-migrated,parentPin:red-line,points:points-not-greater,pointsPerTask:old-default,rewardHistory:not-migrated,schemaVersion:not-migrated,sourceApp:not-migrated,theme:not-migrated,updatedAt:not-migrated,username:not-migrated
target-state legacyPoints=0 points=55 records=1000m,1500m,333m,500m,777m,fastest_lap,start_half_lap,start_lap weeklyTemplate=empty
snapshot written: 8 target documents
wrote 8 documents
```

写后 dry-run：

```text
plan-summary kinds=state:0,gamification:0,recordsDoc:0,taskHistoryDay:0,backupDoc:1 tasksAdded=0 historyTasksAdded=0 recordsAdded=0 backupKeys=races skips=avatar:red-line,createdAt:not-migrated,customDistances:not-migrated,customRewards:not-migrated,dailyBonusPoints:old-default,isPro:red-line,language:not-migrated,ownerUid:not-migrated,parentPin:red-line,points:points-not-greater,pointsPerTask:old-default,rewardHistory:not-migrated,schemaVersion:not-migrated,sourceApp:not-migrated,theme:not-migrated,updatedAt:not-migrated,username:not-migrated
target-state legacyPoints=0 points=55 records=1000m,1500m,333m,500m,777m,fastest_lap,lap,start,start_half_lap,start_lap weeklyTemplate=filled
dry-run: no documents written
```

`recordsAdded=0`、`recordsDoc=0`、`backupDoc=1` 与预期一致。`gamification` 没有写入，所以 points 保持 55。

## 逐距离对账

写后条数 = 快照里的写前条数 + 本次追加。对账是快照对照写后的只读读取。

| 距离 | 写前 | 写入前文档存在 | 追加 | 写后 | 相符 |
|---|---:|---|---:|---:|---|
| 500m | 0 | 是 | 3 | 3 | 是 |
| 777m | 0 | 是 | 1 | 1 | 是 |
| 1000m | 0 | 是 | 1 | 1 | 是 |
| 1500m | 0 | 是 | 1 | 1 | 是 |
| start | 0 | 否 | 1 | 1 | 是 |
| lap | 0 | 否 | 1 | 1 | 是 |

`state` 写入前已存在，写入后仍在。备份文档写入前不存在，写入后存在。

## 快照与回滚

快照路径：`~/.config/gcp/training-m6-prod-snapshot.json`（8 份目标文档，在仓库外）。回滚没有执行。

需要回滚时，按快照逐条恢复，不要改参数重跑迁移：

- `exists: true`：把快照里的 `data` 写回原路径。`{type: "timestamp", iso}` 要先转回 Firestore Timestamp，不能把这个对象原样存回去。这次包括 `state`，以及 `500m`、`777m`、`1000m`、`1500m`。
- `exists: false`：删除该路径。这次是 `start`、`lap` 和 `users/{uid}/migrationBackups/training-unmapped`。

如果再次出现写入报错或对账不符：停、不重试、不回滚，先报告。
