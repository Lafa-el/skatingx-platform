# M5 新旧对照

状态：对照已跑完。容差已由 owner 于 2026-10-19 批准。测试仍按精确相等失败，容差只写在这份文档里。M6 等通知。

分支 `migration/analysis-m5` 从 main 开出，并接到已合并的 PR #57 上。配速、器材、生物力学和训练计划都调用 main 上的页面函数。本分支不另带一份计划纯函数。

页面调用：

- 配速页 `calculatePacingAnalysis`。总时间等展示是 `toFixed(2)`，与 `formatPaceReport` 相同。
- 器材页 `buildEquipmentChecklist`。输入是 M3 回归里的两张合成清单。
- 生物力学页 `assessVideoInput`、`samplePoseFrame`、`shouldSendPoseFrame`、`aggregateKeyframes`、`resetAnalysisSession`。输入是五条固件。
- 计划页的周积分是 `weeklyCheckedPoints`。打卡事务里的余额是 `applyPlanCheckIn`。序列：余额 120，技术侧重，打卡 `jd_tech_mon`，再打卡 `jd_tech_sun`，再重复周一。重复打卡不加分。

旧站锁定值来自 M3 的 `*.expected.json`、`legacy-regression.test.ts`，以及 `blaze-skate-analysis` 的 `plansDatabase` / 云端 `checkTask`。`poseClosed` 与 `poseInstanceOpen` 的旧站值来自盘点：`resetUpload()` 不调用 `pose.close()`。

已批准容差（2026-10-19）。测试不读取这些界限，差不是 0 就失败：

- 文案、布尔、枚举、计数、积分：必须相同。
- 秒：绝对差小于 0.005。
- 衰减百分比：绝对差小于 0.00005。
- `poseClosed`、`poseInstanceOpen`、积分落点不进入容差。前两项是 2026-10-19 评审已定的改动。积分落点是 DR-004。

未解释差异：0。

| 指标 | 旧站锁定值 | 新实现值 | 差异 | 是否在容差内 |
| --- | --- | --- | --- | --- |
| 配速 · 评级 | 需强化 | 需强化 | 0 | 是 |
| 配速 · 训练比 | 45:55 | 45:55 | 0 | 是 |
| 配速 · 乳酸指数 | 72% | 72% | 0 | 是 |
| 配速 · 总时间 | 47.60s | 47.60s | 0 | 是 |
| 配速 · 标杆总时间 | 45.72s | 45.72s | 0 | 是 |
| 配速 · 终点差 | 0.90s | 0.90s | 0 | 是 |
| 配速 · 衰减 | 14.8936% | 14.8936% | 0 | 是 |
| 配速 · 标杆衰减 | 8.8013% | 8.8013% | 0 | 是 |
| 配速 · 后半程说明 | 后半程掉速明显，优先补节奏耐受 | 后半程掉速明显，优先补节奏耐受 | 0 | 是 |
| 配速 · 空圈速 | 请输入完整且大于 0 的圈速数据后再生成曲线。 | 请输入完整且大于 0 的圈速数据后再生成曲线。 | 0 | 是 |
| 配速 · 空标杆 | 请先填写完整且大于 0 的 Junior D 标准，再生成曲线。 | 请先填写完整且大于 0 的 Junior D 标准，再生成曲线。 | 0 | 是 |
| 器材 · 可复核徽章 | 可提交教练复核 | 可提交教练复核 | 0 | 是 |
| 器材 · 可复核方向 | 左右脚曲线待复核 | 左右脚曲线待复核 | 0 | 是 |
| 器材 · 规则提示条数 | 5 | 5 | 0 | 是 |
| 器材 · 规则提示 1 | 左脚刀头 +1 读数低于前一测点，建议复测是否量具角度或接触点偏了。 | 左脚刀头 +1 读数低于前一测点，建议复测是否量具角度或接触点偏了。 | 0 | 是 |
| 器材 · 规则提示 2 | 左右脚 +1 点相差 10 ticks，建议复核左右脚弧度一致性。 | 左右脚 +1 点相差 10 ticks，建议复核左右脚弧度一致性。 | 0 | 是 |
| 器材 · 规则提示 3 | 左脚前后 Offset 相差 3mm，建议检查刀架是否存在前后扭斜。 | 左脚前后 Offset 相差 3mm，建议检查刀架是否存在前后扭斜。 | 0 | 是 |
| 器材 · 规则提示 4 | 左右脚后点 Offset 相差 3mm，建议确认是否为刻意设定。 | 左右脚后点 Offset 相差 3mm，建议确认是否为刻意设定。 | 0 | 是 |
| 器材 · 规则提示 5 | Bend 三段最大差为 12 ticks，建议复核压弯是否过于集中在某一段。 | Bend 三段最大差为 12 ticks，建议复核压弯是否过于集中在某一段。 | 0 | 是 |
| 器材 · 空清单徽章 | 记录不完整 | 记录不完整 | 0 | 是 |
| 器材 · 空清单方向 | 补全曲线/体重 | 补全曲线/体重 | 0 | 是 |
| 器材 · 空清单提示 1 | 左脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。 | 左脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。 | 0 | 是 |
| 器材 · 空清单提示 2 | 右脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。 | 右脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。 | 0 | 是 |
| 生物力学 · fx-input-failure · poseInvoked | false | false | 0 | 是 |
| 生物力学 · fx-input-failure · uploadedBytes | 0 | 0 | 0 | 是 |
| 生物力学 · fx-input-failure · analyzeEnabled | false | false | 0 | 是 |
| 生物力学 · fx-input-failure · buttonLabel | 请先上传视频 | 请先上传视频 | 0 | 是 |
| 生物力学 · fx-no-person · readable | false | false | 0 | 是 |
| 生物力学 · fx-no-person · unreadableReason | no-pose | no-pose | 0 | 是 |
| 生物力学 · fx-no-person · kneeDisplay | --° | --° | 0 | 是 |
| 生物力学 · fx-no-person · leanDisplay | --° | --° | 0 | 是 |
| 生物力学 · fx-no-person · pelvisDisplay | --% | --% | 0 | 是 |
| 生物力学 · fx-no-person · recoveryDisplay | -- | -- | 0 | 是 |
| 生物力学 · fx-no-person · keyframeText | 当前帧没有稳定骨架，目标不可判读。 | 当前帧没有稳定骨架，目标不可判读。 | 0 | 是 |
| 生物力学 · fx-no-person · liveHoldText | null | null | 0 | 是 |
| 生物力学 · fx-no-person · issue | null | null | 0 | 是 |
| 生物力学 · fx-no-person · kneeAngle | null | null | 0 | 是 |
| 生物力学 · fx-no-person · leanAngle | null | null | 0 | 是 |
| 生物力学 · fx-no-person · supportSide | null | null | 0 | 是 |
| 生物力学 · fx-no-person · supportConfidence | null | null | 0 | 是 |
| 生物力学 · fx-no-person · 可读关键帧 | 0 | 0 | 0 | 是 |
| 生物力学 · fx-no-person · 不可读关键帧 | 1 | 1 | 0 | 是 |
| 生物力学 · fx-no-person · 平均膝角 | null | null | 0 | 是 |
| 生物力学 · fx-multi-person · returnedPersonCount | 1 | 1 | 0 | 是 |
| 生物力学 · fx-multi-person · comMaxJump | 0.18 | 0.18 | 0 | 是 |
| 生物力学 · fx-multi-person · poseJumpRejectCount | 1 | 1 | 0 | 是 |
| 生物力学 · fx-multi-person · readable | false | false | 0 | 是 |
| 生物力学 · fx-multi-person · unreadableReason | occlusion-or-jump | occlusion-or-jump | 0 | 是 |
| 生物力学 · fx-multi-person · liveHoldText | 检测结果突然跳离当前运动员，已暂时忽略这一帧。 | 检测结果突然跳离当前运动员，已暂时忽略这一帧。 | 0 | 是 |
| 生物力学 · fx-multi-person · keyframeText | 遮挡、多人重叠或目标跳变，当前帧不可判读。 | 遮挡、多人重叠或目标跳变，当前帧不可判读。 | 0 | 是 |
| 生物力学 · fx-multi-person · kneeDisplay | --° | --° | 0 | 是 |
| 生物力学 · fx-low-frame-rate · frameIntervalMs | 180 | 180 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · sends | [true,false,true] | [true,false,true] | 0 | 是 |
| 生物力学 · fx-low-frame-rate · analysisEnded | false | false | 0 | 是 |
| 生物力学 · fx-low-frame-rate · lowFrameRateCopy | null | null | 0 | 是 |
| 生物力学 · fx-low-frame-rate · readable | true | true | 0 | 是 |
| 生物力学 · fx-low-frame-rate · unreadableReason | null | null | 0 | 是 |
| 生物力学 · fx-low-frame-rate · kneeDisplay | 156° | 156° | 0 | 是 |
| 生物力学 · fx-low-frame-rate · leanDisplay | 0° | 0° | 0 | 是 |
| 生物力学 · fx-low-frame-rate · pelvisDisplay | 40.0% | 40.0% | 0 | 是 |
| 生物力学 · fx-low-frame-rate · recoveryDisplay | 0 | 0 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · keyframeText | null | null | 0 | 是 |
| 生物力学 · fx-low-frame-rate · liveHoldText | null | null | 0 | 是 |
| 生物力学 · fx-low-frame-rate · issue | 支撑膝角度偏大 | 支撑膝角度偏大 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · kneeAngle | 156 | 156 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · leanAngle | 0 | 0 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · supportSide | 运动员左腿 | 运动员左腿 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · supportConfidence | 99 | 99 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · 可读关键帧 | 1 | 1 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · 平均膝角 | 156 | 156 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · 平均倾角 | 0 | 0 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · 高膝角帧 | 1 | 1 | 0 | 是 |
| 生物力学 · fx-low-frame-rate · 高倾角帧 | 0 | 0 | 0 | 是 |
| 生物力学 · fx-cancel-midway · playbackStopped | true | true | 0 | 是 |
| 生物力学 · fx-cancel-midway · objectUrlRevoked | true | true | 0 | 是 |
| 生物力学 · fx-cancel-midway · keyframes | [] | [] | 0 | 是 |
| 生物力学 · fx-cancel-midway · kneeDisplay | --° | --° | 0 | 是 |
| 生物力学 · fx-cancel-midway · leanDisplay | --° | --° | 0 | 是 |
| 生物力学 · fx-cancel-midway · pelvisDisplay | --% | --% | 0 | 是 |
| 生物力学 · fx-cancel-midway · recoveryDisplay | -- | -- | 0 | 是 |
| 生物力学 · fx-cancel-midway · supportHint | 评分制识别支撑腿 | 评分制识别支撑腿 | 0 | 是 |
| 生物力学 · fx-cancel-midway · analyzeEnabled | false | false | 0 | 是 |
| 生物力学 · fx-cancel-midway · buttonLabel | 请先上传视频 | 请先上传视频 | 0 | 是 |
| 生物力学 · fx-cancel-midway · poseClosed | false | true | 2026-10-19 评审：重置时关闭 Pose。旧站 resetUpload 不调用 close。 | 已解释 |
| 生物力学 · fx-cancel-midway · poseInstanceOpen | true | false | 同一决定：关闭后实例不再保持打开。 | 已解释 |
| 计划 · 技术周积分表 | 30,20,30,15,30,30,10 | 30,20,30,15,30,30,10 | 0 | 是 |
| 计划 · 速度周积分表 | 35,20,35,15,30,35,10 | 35,20,35,15,30,35,10 | 0 | 是 |
| 计划 · 比赛周积分表 | 25,15,25,10,20,25,10 | 25,15,25,10,20,25,10 | 0 | 是 |
| 计划 · 打卡周一后的周积分 | 30 | 30 | 0 | 是 |
| 计划 · 打卡周一后的余额 | 150 | 150 | 0 | 是 |
| 计划 · 再打卡周日的周积分 | 40 | 40 | 0 | 是 |
| 计划 · 再打卡周日的余额 | 160 | 160 | 0 | 是 |
| 计划 · 重复周一的周积分 | 40 | 40 | 0 | 是 |
| 计划 · 重复周一的余额 | 160 | 160 | 0 | 是 |
| 计划 · 技术周不含速度周一 | 0 | 0 | 0 | 是 |
| 计划 · 积分落点 | profile.points | gamification/main.points | DR-004：走训练积分，不另建分析积分。旧站云端事务加的是 profile。 | 已解释 |
