# ADR-013: 运动员头像放在 Storage

| 字段 | 值 |
|---|---|
| 状态 | 随 `feat/athlete-avatar` 提交。规则合入 main 之后才由控制台发到 staging 和 prod。 |
| 日期 | 2026-11-04 |
| 分支 | `feat/athlete-avatar` |
| 不做 | 不改 Firestore 规则、不做公开读、不做缩略图、不把 download URL 写进档案。 |

## 1. 决定

头像文件只放在默认桶的 `avatars/{userId}/{athleteId}/avatar`。文件名固定，换头像覆盖同一对象。档案只存 `avatarStoragePath` 这条完整路径，显示时再取 download URL。

Storage 规则只放行这个前缀：本人可读、可写、可删。写入还要求小于 5MB 且 `contentType` 为 `image/*`。

删运动员时先删这个文件，成功后再走已有的 Firestore 级联。文件删失败则数据不动，重跑仍能从档案读到路径。

## 2. 风险与回退

规则发布前，客户端上传会被默认桶规则拒绝。回退：还原这次提交；若规则已发布，在控制台改回发布前的 Storage 规则。已经传上的文件不会因回退代码而消失。
