# ADR-011: 运动员名册按 userId 收窄

| 字段 | 值 |
|---|---|
| 状态 | 随 `fix/athlete-roster-userid-scope` 提交。规则合入 main 之后才由控制台发布。 |
| 日期 | 2026-11-04 |
| 分支 | `fix/athlete-roster-userid-scope` |
| 不做 | 不改其它规则、不改档案编辑补丁、不在本切片发布规则、不在 prod 建测试运动员。 |

## 1. 冲突

壳顶选择器用 `collectionGroup("profile")` 列档案。固定深度的属主规则不授权集合组查询。模拟器进一步证实：集合组 `list` 上递归通配 `path` 不绑定父路径（字符串是 `"/"`），`resource['__name__']` 是空约束，`documentId` 上下界对规则不可见。因此三条查询（自己的子树、不收窄、别人的子树）在规则里无法区分，路径收窄放行不了该查询。

## 2. 决定

档案增加可选字段 `userId`。创建（bootstrap 的默认档案、`createAthlete`）写入当前登录用户的 id。编辑补丁不含该字段，`merge` 保留原值。旧档案没有该字段，类型保持可选，读路径不因此中断；合入后在控制台补写。

选择器查询改为 `where("userId", "==", userId)`，不再使用 `documentId` 上下界。

规则在 `users` 匹配块之外增加：

```
match /{path=**}/profile/{profileId} {
  allow list: if request.auth != null && resource.data.userId == request.auth.uid;
}
```

只放 `list`。单份读取仍走原来的固定深度属主规则。这条匹配不授予写。

## 3. 风险与回退

- 未补 `userId` 的旧档案不会出现在选择器里。查询结果为空时，壳仍只显示当前运动员。
- 属主写规则没有校验 `userId`。本切片不收紧写。创建路径写入当前用户 id；编辑不碰该字段。
- 回退：还原本提交。若规则已发布，用发布前的规则正文重新发布。已补上的 `userId` 可以留下，它不改变单份读取。

## 4. 合入后的控制台顺序

1. 发布前核对规则文件 SHA，确认是 main 上的版本，再发到 staging 和 prod。
2. 给 Lindsay 的 prod 档案 `profile/main` 补 `userId`（其 Auth uid），读回确认。staging 的现有运动员同样补，或新建两名测试运动员（创建路径自带 `userId`）。
3. staging 验收：选择器列出两人，切过去再切回来；切换失败有提示；列表为空或读失败时仍只显示当前运动员。
4. prod 不建测试运动员。只确认 Lindsay 补字段后选择器不退化、单运动员显示正常。
