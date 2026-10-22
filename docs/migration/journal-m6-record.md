# 日志模块 M6 生产执行记录

日期：2026-10-21 23:43 EDT（America/New_York）

代码：`main` `3069912`（#87 squash）。执行时工作树就是这一版，没有改脚本、规则或生产代码。源项目 `blaze-skate-journal` 只读。目标项目 `skatingx-prod`。锚点 `pH6yf0RX`。目标账号是脚本里钉死的 uid。没有写入 `skatingx-platform`（staging）。

四道生产检查点在写入前无声通过：源计数与 M2 普查逐项相等，目标 journal 子树为 0，计划 7 写 0 skip 且分集合为 athlete 1 / days 2 / sessions 3 / bodyStatus 1，`--snapshot-out` 已给出。

## 写前 dry-run

与 M5a 已审输出逐项一致。`target` 这一行是 `production`。

```text
source-counts athletes=1 journal_days=2 training_sessions=3 coach_notes=0 body_status=1 performance_records=0 video_refs=0 weekly_reviews=0 milestones=0
target-docs=0
plan-summary writes=7 skips=0
collection athlete writes=1 skips=0
collection days writes=2 skips=0
collection sessions writes=3 skips=0
collection coachNotes writes=0 skips=0
collection bodyStatus writes=1 skips=0
collection performance writes=0 skips=0
collection videos writes=0 skips=0
collection weeklyReviews writes=0 skips=0
write-path journal/athlete/main
write-path journal/days/1w0QnJn37pVxGyKB1jfw
write-path journal/days/hE2u7ET9uh4hW6bi6sL2
write-path journal/sessions/A4i4LCxgq8AATDlBmuie
write-path journal/sessions/hYGLH1lT49JOdsM208mU
write-path journal/sessions/mQDIUCDItj3sBerPF3WO
write-path journal/bodyStatus/VThDUQfWg0R5U61Gwm0j
dry-run: no documents written
```

## 写入

```text
source-counts athletes=1 journal_days=2 training_sessions=3 coach_notes=0 body_status=1 performance_records=0 video_refs=0 weekly_reviews=0 milestones=0
target-docs=0
plan-summary writes=7 skips=0
snapshot written: sourceDocs=7 targetDocs=0
wrote 7 documents
post-check writes=0 skips=7
```

写入路径与写前 dry-run 的 7 条 `write-path` 相同。

## 写后 dry-run

`source-counts` 与写前相同。`writes=0`、`skips=7`。7 条 `skip-path` 与写入路径相同。

```text
source-counts athletes=1 journal_days=2 training_sessions=3 coach_notes=0 body_status=1 performance_records=0 video_refs=0 weekly_reviews=0 milestones=0
target-docs=7
plan-summary writes=0 skips=7
collection athlete writes=0 skips=1
collection days writes=0 skips=2
collection sessions writes=0 skips=3
collection coachNotes writes=0 skips=0
collection bodyStatus writes=0 skips=1
collection performance writes=0 skips=0
collection videos writes=0 skips=0
collection weeklyReviews writes=0 skips=0
dry-run: no documents written
```

## 对账

写后目标文档数 7，等于写前 0 加本次写入 7。分集合为 athlete 1、days 2、sessions 3、bodyStatus 1，其余为 0。没有「目标已存在且不同」，也没有残留 writes。

## 快照与回滚

快照路径：`~/.config/gcp/journal-m6-prod-snapshot.json`（仓库外）。源端九个集合共 7 篇，目标端 0 篇。回滚没有执行。

本次是向空的 `journal/main` 子树新增 7 篇。需要回滚时，删除这 7 篇即可完全回到写入前：

- `journal/athlete/main`
- `journal/days/1w0QnJn37pVxGyKB1jfw`
- `journal/days/hE2u7ET9uh4hW6bi6sL2`
- `journal/sessions/A4i4LCxgq8AATDlBmuie`
- `journal/sessions/hYGLH1lT49JOdsM208mU`
- `journal/sessions/mQDIUCDItj3sBerPF3WO`
- `journal/bodyStatus/VThDUQfWg0R5U61Gwm0j`

不要改参数重跑迁移。如果再次出现写入报错或对账不符：停、不重试、不回滚，先报告。
