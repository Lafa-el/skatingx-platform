# P3-10 指针演练记录

演练时间：2026-11-18 22:55（America/Toronto），模拟器内时间戳为 UTC。

环境：Firestore Emulator，项目 `demo-skatingx-import`，`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`。未连接生产项目，未写入生产数据，未启用生产策略。

驱动方式：在模拟器里调用 `trusted-flow.mjs` 的 `enablePolicyPointer`、`rollbackPolicyPointer`、`disablePolicyPointer` 和 `showPolicyPointer`（`policy-status` 的只读实现）。操作者 `policy-ops@example.com`。模拟器 CLI 没有 ADC operator，所以这次用驱动脚本传入 operator，而不是生产 CLI。

策略：

- v1 是 `youth-conditional-v1` 版本 `"1"`。EX-L039 为 `manual_review_only`，EX-L078 / EX-L079 / EX-L080 为 `blocked`。限制 5 项、恢复标志 7 项，与 v1.1 草案一致。
- v2 是测试策略，不是真实策略。文档 ID `youth-conditional-v1--v2`，版本 `"2"`。与 v1 只差一处：EX-L039 为 `conditional`，`minTrainingAgeYears: 0`。这样做是为了让启用和回退在评估结果上能看出来。

每步的指针值来自 `policy-status` 的实际打印。评估输入是同一名完整运动员：年龄段 `age11_13`，训练年龄 2，已验证技能 `controlled_landing_verified`，负荷 `low`，恢复标志和授权限制都是空数组，监督合格且在场。

## 1. 启用 v1

`policy-status`：

| 字段 | 读回值 |
|---|---|
| activePolicyVersion | `"1"` |
| previousPolicyVersion | `null` |
| revision | `1` |
| updatedBy | `policy-ops@example.com` |
| updatedAt | `2026-11-19T03:55:48.958Z` |
| reason | `rehearsal enable v1` |

审计：`policy_enable`，`result: ok`，`detail: rehearsal enable v1`，`at: 2026-11-19T03:55:48.959Z`，target `{ collection: trainingCatalogSafetyPolicyPointers, id: youth-conditional-v1 }`，actor `policy-ops@example.com`。

| 动作 | decision | reasonCodes | policyVersion | pointerState | alertEvents |
|---|---|---|---|---|---|
| EX-L039 | review_required | MANUAL_REVIEW_ONLY | 1 | enabled | [] |
| EX-L078 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L079 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L080 | block | OBJECT_BLOCKED | 1 | enabled | [] |

## 2. 启用测试策略 v2

`policy-status`：

| 字段 | 读回值 |
|---|---|
| activePolicyVersion | `"2"` |
| previousPolicyVersion | `"1"` |
| revision | `2` |
| updatedBy | `policy-ops@example.com` |
| updatedAt | `2026-11-19T03:55:49.108Z` |
| reason | `rehearsal enable test v2` |

审计：`policy_enable`，`result: ok`，`detail: rehearsal enable test v2`，`at: 2026-11-19T03:55:49.108Z`，target 同上。

| 动作 | decision | reasonCodes | policyVersion | pointerState | alertEvents |
|---|---|---|---|---|---|
| EX-L039 | allow_with_supervision | POLICY_SATISFIED | 2 | enabled | [M-E3] |
| EX-L078 | block | OBJECT_BLOCKED | 2 | enabled | [] |
| EX-L079 | block | OBJECT_BLOCKED | 2 | enabled | [] |
| EX-L080 | block | OBJECT_BLOCKED | 2 | enabled | [] |

EX-L039 的 M-E3 是测试策略造成的：该对象被设成条件放行，而且条件满足。这不是 v1 的决定。三条 BFR 仍是 `block`，没有 M-E3。

## 3. 回退到 v1

回退前 `policy-status` 读到 `revision` 为 `2`。回退命令使用 `expectedRevision: 2`。

`policy-status`：

| 字段 | 读回值 |
|---|---|
| activePolicyVersion | `"1"` |
| previousPolicyVersion | `"2"` |
| revision | `3` |
| updatedBy | `policy-ops@example.com` |
| updatedAt | `2026-11-19T03:55:49.259Z` |
| reason | `rehearsal roll back to v1` |

审计：`policy_rollback`，`result: ok`，`detail: rehearsal roll back to v1`，`at: 2026-11-19T03:55:49.259Z`，target 同上。

| 动作 | decision | reasonCodes | policyVersion | pointerState | alertEvents |
|---|---|---|---|---|---|
| EX-L039 | review_required | MANUAL_REVIEW_ONLY | 1 | enabled | [] |
| EX-L078 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L079 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L080 | block | OBJECT_BLOCKED | 1 | enabled | [] |

回退后 EX-L039 不再放行，M-E3 消失。四条动作回到 v1。

## 4. 禁用

禁用时生效版本已经是回退后的 `"1"`，所以 `previousPolicyVersion` 记下的是这个正在生效的版本，不是更早的测试版本 `"2"`。

`policy-status`：

| 字段 | 读回值 |
|---|---|
| activePolicyVersion | `null` |
| previousPolicyVersion | `"1"` |
| revision | `4` |
| updatedBy | `policy-ops@example.com` |
| updatedAt | `2026-11-19T03:55:49.384Z` |
| reason | `rehearsal disable` |

审计：`policy_disable`，`result: ok`，`detail: rehearsal disable`，`at: 2026-11-19T03:55:49.384Z`，target 同上。

四条动作的评估相同：

| 动作 | decision | reasonCodes | policyVersion | pointerState | alertEvents |
|---|---|---|---|---|---|
| EX-L039 | review_required | POLICY_MISSING | null | disabled | [] |
| EX-L078 | review_required | POLICY_MISSING | null | disabled | [] |
| EX-L079 | review_required | POLICY_MISSING | null | disabled | [] |
| EX-L080 | review_required | POLICY_MISSING | null | disabled | [] |

没有沿 `previousPolicyVersion` 回到 v1 的放行结果，也没有 M-E1。`pointerState` 为 `disabled`。

## 5. 显式恢复 v1

恢复命令是 `policy-enable --policyVersion 1`，不是回退，也不是“恢复上一版本”。禁用时 `activePolicyVersion` 为 `null`，启用规则把 `previousPolicyVersion` 记成这个旧的生效值，所以读回是 `null`。

`policy-status`：

| 字段 | 读回值 |
|---|---|
| activePolicyVersion | `"1"` |
| previousPolicyVersion | `null` |
| revision | `5` |
| updatedBy | `policy-ops@example.com` |
| updatedAt | `2026-11-19T03:55:49.471Z` |
| reason | `rehearsal explicit enable v1` |

审计：`policy_enable`，`result: ok`，`detail: rehearsal explicit enable v1`，`at: 2026-11-19T03:55:49.472Z`，target 同上。

| 动作 | decision | reasonCodes | policyVersion | pointerState | alertEvents |
|---|---|---|---|---|---|
| EX-L039 | review_required | MANUAL_REVIEW_ONLY | 1 | enabled | [] |
| EX-L078 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L079 | block | OBJECT_BLOCKED | 1 | enabled | [] |
| EX-L080 | block | OBJECT_BLOCKED | 1 | enabled | [] |

## 结果

五步都按读回的指针、审计和四条动作评估核对过。v1 与回退、显式恢复后的评估一致。测试策略 v2 只改变了 EX-L039，并触发了一次 M-E3。禁用后四条动作都是 `POLICY_MISSING` / `disabled`，没有 M-E1。演练结束后删除了本次写入的指针、两份策略文档和对应审计。生产数据没有被触碰。
