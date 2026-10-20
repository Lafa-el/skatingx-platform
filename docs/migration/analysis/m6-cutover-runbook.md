# 分析模块 M6 切换

状态：staging 写入已在 2026-10-19 完成。生产开闸在本分支：允许 `--write --project skatingx-prod --confirm-production`，但还没有执行，合并和执行都等评审。2026-10-19 决定：托管 Firestore 导出因计费要求改为针对性备份。

依据：DR-004（分析积分只进备份）、DR-007 选项 C（一次迁移，不双写）、ADR-005 的 10 段路径。源盘点见 `docs/migration/analysis-inventory.md`。

## 脚本

`scripts/migrate-analysis.mjs`

| 项 | 值 |
|---|---|
| 源项目 | `blaze-skate-analysis` |
| 源路径 | `artifacts/blaze-skate-academy/users/{uid}/` 下的 `equipmentRecords`、`completedTasks`、`profile/lindsay` |
| 只读账号 | `migration-reader@blaze-skate-analysis.iam.gserviceaccount.com` |
| 源钥匙 | 只认 `GOOGLE_APPLICATION_CREDENTIALS`。约定放在 `~/.config/gcp/migration-reader.json`。脚本不会在变量未设置时自己去读这个路径。 |
| 目标钥匙 | 写入 emulator 以外的目标，以及 `--backup-target` 读取 staging 时，认 `TARGET_GOOGLE_APPLICATION_CREDENTIALS`。staging 约定放在 `~/.config/gcp/migration-writer.json`。生产跑时把同一个变量指到 `skatingx-prod` 的写 key。emulator 不需要。dry-run 不需要。只读 key 不能写目标库。两把钥匙都不进仓库、不进代码、不进日志。 |
| 目标备份 | `--backup-target <file>`。先做 plan，再只读 `skatingx-platform` 上这些路径的当前文档，存成 `{path, exists, data}` 的 JSON。不写。文件路径在仓库里就停。 |
| 默认目标 | Firestore emulator，项目 `demo-skatingx-migration` |
| staging | `--write --target staging --project skatingx-platform --confirm-staging` |
| 生产 | `--write --target production --project skatingx-prod --confirm-production`。缺一项就停。`--fixture` 不能用于生产写入。项目 `skatingx-production` 仍拒绝。 |

`firebase-admin` 是根目录 devDependency。用途是这一次读旧库、写 emulator 或 staging。许可证 Apache-2.0，由 Google 维护。体积大，因为带了 gRPC。替代方案是 Firestore REST，这次按任务用 Admin SDK。Admin 写入不经过 Security Rules。规则是否放行，由 `npm run test:migration` 用客户端 SDK 在 emulator 上重放同一批文档。

默认是 dry-run，不写。`--write` 才写。文档 ID 由源 ID 决定，重跑是覆盖同一条，不新增多余文档。未知症状、未知调整类型、对不上的积分、规范化后撞车的器材 ID，整批停住，不写。

## 字段

器材写入 `athletes/lindsay/equipment/main/records/{id}`，10 段。源自动 ID 转成小写后必须符合规则里的 id 形状。`bootout` 收成 `boot-out`。中文的调整类型和反馈收成规则里的代码。`createdAt` 收成毫秒 UTC。多出来的旧元数据不进这张文档，否则过不了精确字段规则。

打卡写入 `athletes/lindsay/planning/main/completedTasks/{taskId}`，10 段。`jd_tech_*` 是 lean，`jd_speed_*` 是 bounce，`jd_race_*` 是 endurance。积分用源文档上的数字。

`profile/lindsay` 写入 `migrationBackups/analysis-profile`。`points` 留在这份备份里，`mergedIntoTrainingPoints` 为 false。不写 `athletes/lindsay/gamification/main`。

## 顺序

1. 目标备份。2026-10-19 决定：托管 Firestore 导出因计费要求改为针对性备份，不再做全库托管导出。staging 写入前先跑 `--backup-target`。这一步只读，把 plan 里每条路径在 `skatingx-platform` 上的当前文档存到仓库外。把备份文件路径记在当次记录里。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-reader.json"
export TARGET_GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-writer.json"
node scripts/migrate-analysis.mjs --backup-target "$HOME/.config/gcp/m6-staging-backup.json"
```

2. dry-run。钥匙只通过环境变量给只读账号。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-reader.json"
node scripts/migrate-analysis.mjs --dry-run
```

看计数和抽查行。`gamification writes` 必须是 0。不满意就停。

3. emulator 验证。

```bash
npm run test:migration
```

这一步用合成数据，不连旧库，也不连 `skatingx-prod`。它核对源和目标条数、字段映射、重跑 ID，并把写出的文档交给正在使用的 `firestore.rules`。

4. staging 验证。先 dry-run，确认计数和抽查，再写 `skatingx-platform`。写入前必须已经跑过 `--backup-target`，并且把备份文件路径记下来。写入之前两个环境变量都要就位，路径都在仓库外。缺源钥匙、缺目标钥匙、路径在仓库里，或文件不是 service account key，整批停下，不写。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-reader.json"
export TARGET_GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-writer.json"
node scripts/migrate-analysis.mjs --dry-run
node scripts/migrate-analysis.mjs --write --target staging --project skatingx-platform --confirm-staging --pause-ms 200
```

写完再对一下条数：器材、打卡、备份各与 dry-run 相同。抽一张器材的症状代码，抽一条打卡的 taskId 和积分，确认训练积分文档没有被这次写入改过。

5. 生产。写入前必须先对 live 源做 dry-run，不要用 `--fixture`。两把钥匙都要就位：`GOOGLE_APPLICATION_CREDENTIALS` 仍是只读 key；`TARGET_GOOGLE_APPLICATION_CREDENTIALS` 沿用同一个变量，这一跑指向 `skatingx-prod` 的写 key。缺确认、缺项目、缺 `--write`、缺钥匙，整批停下，不写。`skatingx-production` 是路径前缀，不是项目 id，继续拒绝。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/migration-reader.json"
export TARGET_GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/the-prod-write-key.json"
node scripts/migrate-analysis.mjs --dry-run
node scripts/migrate-analysis.mjs --write --target production --project skatingx-prod --confirm-production --pause-ms 200
```

这一步还没有执行。合并和执行都等评审。写完再对一下条数，并确认训练积分文档没有被这次写入改过。

6. 核对。源集合条数等于目标条数。备份里的分析积分不等于把它加进训练余额。抽查至少一条器材、一条打卡、一份 profile。

## 回滚

回滚按 `--backup-target` 的 JSON 把那些路径恢复成备份时的内容。`exists` 为 false 的路径，删除本次写入的文档。2026-10-19 起不用托管 Firestore 导出。DR-007 选项 C 的其余部分不变：不做双写，需要时把用户暂时切回旧站。旧站在切过之后保持只读 30 天。恢复之后再跑一次 dry-run，确认没有新的写入计划被自动执行。

## 停止

出现未知字段值、ID 撞车、条数对不上、权限被拒，立即停写。不要跳过错误把剩下的写完。

## 现网数据迁移

脚本 `scripts/migrate-current-data.mjs`。源是 Firebase 项目 `skatingx-platform` 下的 `artifacts/skatingx-production/...`，同路径复制，不改字段。默认 dry-run，目标是 emulator `demo-skatingx-current`。

2026-10-20 live dry-run 重新数过：用户 211，文档 1391。`settings` 158，`raceDay` 9，`athletes/training` 909，另有 `athletes/trainingState` 1。没有读重试。dry-run 会按集合打出 `inventory`。和这次计数对不上就停下来人工看，不要直接写生产。

跳过分析迁移已经负责的三类路径，不复制：

- `equipment/main/records`
- `planning/main/completedTasks`
- `migrationBackups/analysis-profile`

跳过条数总会打出来。这三类里只要有数据，再打 `human-review` 路径，留给人工看。其余路径照常进入复制计划。

双 key：`GOOGLE_APPLICATION_CREDENTIALS` 只读源项目 `skatingx-platform`。`TARGET_GOOGLE_APPLICATION_CREDENTIALS` 只用于目标写入，以及 `--backup-target` 读取目标上的当前文档。emulator 和 dry-run 不要求目标 key。两把钥匙都要在仓库外。脚本不会自己去找钥匙文件。

生产写入必须同时带 `--write --target production --project skatingx-prod --confirm-production`。缺 `--confirm-production` 就停。`skatingx-production` 仍是路径前缀，不能当项目 id。`skatingx-platform` 不能当写入目标。写入前先做 live 源 dry-run，两把 key 都就位，并且先跑 `--backup-target` 把备份文件路径记下来。备份文件在仓库里就停。`--backup-target` 即使带了 `--write` 也不写文档。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/skatingx-platform-reader.json"
node scripts/migrate-current-data.mjs --dry-run
```

生产备份和写入另把 `TARGET_GOOGLE_APPLICATION_CREDENTIALS` 指到 `skatingx-prod` 的写 key，不要复用源 key。这一章还没有对生产执行。评审通过之前不合，也不写 `skatingx-prod`。

```bash
export TARGET_GOOGLE_APPLICATION_CREDENTIALS="/path/to/skatingx-prod-writer.json"
node scripts/migrate-current-data.mjs --backup-target "$HOME/.config/gcp/m6-current-backup.json" --target production --project skatingx-prod --confirm-production
node scripts/migrate-current-data.mjs --write --target production --project skatingx-prod --confirm-production --pause-ms 200
```

回滚按这份备份 JSON 恢复。`exists` 为 false 的路径，删除本次写入的文档。跳过的三类不在这份备份里，因为本脚本不写它们。
