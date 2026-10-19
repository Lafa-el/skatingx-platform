# 分析模块 M6 切换

状态：脚本已写好。验证只在 emulator 上跑过。staging 还没有执行。生产（`skatingx-prod`）等 Buffalo 另行批准，本脚本会直接拒绝。

依据：DR-004（分析积分只进备份）、DR-007 选项 C（一次迁移，不双写）、ADR-005 的 10 段路径。源盘点见 `docs/migration/analysis-inventory.md`。

## 脚本

`scripts/migrate-analysis.mjs`

| 项 | 值 |
|---|---|
| 源项目 | `blaze-skate-analysis` |
| 源路径 | `artifacts/blaze-skate-academy/users/{uid}/` 下的 `equipmentRecords`、`completedTasks`、`profile/lindsay` |
| 只读账号 | `migration-reader@blaze-skate-analysis.iam.gserviceaccount.com` |
| 钥匙 | 只认环境变量 `GOOGLE_APPLICATION_CREDENTIALS`。约定放在 `~/.config/gcp/migration-reader.json`。脚本不会自己去读这个路径。钥匙不进仓库、不进代码、不进日志。 |
| 默认目标 | Firestore emulator，项目 `demo-skatingx-migration` |
| staging | `--write --target staging --project skatingx-platform --confirm-staging` |
| 生产 | `--target production` 或项目 `skatingx-prod` / `skatingx-production` 一律退出。 |

`firebase-admin` 是根目录 devDependency。用途是这一次读旧库、写 emulator 或 staging。许可证 Apache-2.0，由 Google 维护。体积大，因为带了 gRPC。替代方案是 Firestore REST，这次按任务用 Admin SDK。Admin 写入不经过 Security Rules。规则是否放行，由 `npm run test:migration` 用客户端 SDK 在 emulator 上重放同一批文档。

默认是 dry-run，不写。`--write` 才写。文档 ID 由源 ID 决定，重跑是覆盖同一条，不新增多余文档。未知症状、未知调整类型、对不上的积分、规范化后撞车的器材 ID，整批停住，不写。

## 字段

器材写入 `athletes/lindsay/equipment/main/records/{id}`，10 段。源自动 ID 转成小写后必须符合规则里的 id 形状。`bootout` 收成 `boot-out`。中文的调整类型和反馈收成规则里的代码。`createdAt` 收成毫秒 UTC。多出来的旧元数据不进这张文档，否则过不了精确字段规则。

打卡写入 `athletes/lindsay/planning/main/completedTasks/{taskId}`，10 段。`jd_tech_*` 是 lean，`jd_speed_*` 是 bounce，`jd_race_*` 是 endurance。积分用源文档上的数字。

`profile/lindsay` 写入 `migrationBackups/analysis-profile`。`points` 留在这份备份里，`mergedIntoTrainingPoints` 为 false。不写 `athletes/lindsay/gamification/main`。

## 顺序

1. 导出。对源项目 `blaze-skate-analysis` 和目标项目各做一次 Firestore export。导出保留至少 90 天。导出文件不进仓库。
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

4. staging 验证。先 dry-run，再写 `skatingx-platform`。写之前目标库已经有导出。

```bash
node scripts/migrate-analysis.mjs --dry-run
node scripts/migrate-analysis.mjs --write --target staging --project skatingx-platform --confirm-staging --pause-ms 200
```

写完再对一下条数：器材、打卡、备份各与 dry-run 相同。抽一张器材的症状代码，抽一条打卡的 taskId 和积分，确认训练积分文档没有被这次写入改过。

5. 生产。现在不做。Buffalo 批准之前，脚本拒绝 `skatingx-prod`。批准之后要另改脚本并另开一次评审，这次的拒绝不能靠加参数绕过。

6. 核对。源集合条数等于目标条数。备份里的分析积分不等于把它加进训练余额。抽查至少一条器材、一条打卡、一份 profile。

## 回滚

DR-007 选项 C：把 Firestore 导出恢复回去，并把用户暂时切回旧站。不做双写。旧站在切过之后保持只读 30 天。恢复之后再跑一次 dry-run，确认没有新的写入计划被自动执行。

## 停止

出现未知字段值、ID 撞车、条数对不上、权限被拒，立即停写。不要跳过错误把剩下的写完。
