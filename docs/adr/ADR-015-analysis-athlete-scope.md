# ADR-015: 分析记录按当前运动员写入

| 字段 | 值 |
|---|---|
| 状态 | 随 `feat/analysis-athlete-scope` 提交。规则随代码入库，发布由控制台另行完成。 |
| 日期 | 2026-11-04 |
| 分支 | `feat/analysis-athlete-scope` |
| 依据 | ADR-014 留下的待办：新运动员已经能创建，但配速、体能、器材的写入仍被规则钉在 `lindsay`。 |
| 不做 | 不改删除级联、不改匿名登录、不订正已经写错的记录、不改通用运动员子树规则的排除条件。 |

## 1. 决定

配速和体能记录仍写在用户级 `analyses/{analysisId}`。规则里的 `athleteId` 从字面量 `lindsay` 改为 `validId`：不超过 64 字符，小写字母、数字和连字符。所有权由 `isOwner()` 和 `ownerUserId == userId` 保证。`athleteId` 只做格式校验。写错运动员 id 只会污染写作者自己的数据，不能写到别人的账号。`update` 时 `athleteId` 和 `ownerUserId` 仍然不可变。

器材记录的路径改为 `athletes/{athleteId}/equipment/main/records/{recordId}`。字段里的 `athleteId` 必须等于路径参数。读和删跟着这条路径放开：运动员自己名下的器材记录可以读、可以删。四段深度的通用规则本来就排除 `equipment/main/records`，参数化之后这条排除覆盖所有运动员，通用段本身不改。

三个构建函数接受调用方传入的 `athleteId`，不再写 `DEFAULT_ATHLETE_ID`。页面在没有当前运动员时不保存。器材写入路径用记录上的 `athleteId`，因此跟着当前运动员走。

配速和体能的列表仍是用户级集合，按 `createdAt` 排序。监听在客户端只留下 `athleteId` 等于当前运动员的文档，其它运动员的文档不计入“无法读取”。加上 `where(athleteId)` 会需要一条新的复合索引，本步不加。

`validFindings` 的列表上限从 8 收到 4。配速最多写 2 条，体能最多写 4 条（膝、倾、髋、读不出帧），构建函数写不出第 5 条。两条发现列表各走一遍，再加上 `validId(athleteId)`，配速更新会超过规则引擎一次 1000 个表达式的上限。收掉用不到的 4 个下标之后，更新仍放得下。发现项本身的字段校验没变。

`lindsay` 仍是合法的 `validId`，已有 Lindsay 记录继续合法。`DEFAULT_ATHLETE_ID` 的定义留在 schema。

## 2. 窗口期

ADR-014 合入之后、本步发布之前，新运动员如果已经保存过配速或体能，那些文档的 `athleteId` 仍是 `lindsay`。删除该运动员时，级联按 `athleteId` 查询，查不到这些文档。本步不做数据订正。

## 3. 风险与回退

先把规则发到 staging，再发 production，发完重读并核对 SHA 与 main 上的 `firestore.rules` 一致。规则未发布时用新运动员点保存，会被旧规则拒绝。

回退：还原这次提交。如果新规则已经发布，把上一版规则重新发到同一环境。已经按新规则写成当前运动员 id 的记录保持原样，回退后那些非 `lindsay` 的写入会再次被旧规则拒绝。
