# M1 盘点报告 — 旧训练站 training.blazeskate.com

日期：2026-10-20
状态：待评审。评审通过前不进入 M2 契约。
本文件路径：`docs/migration/training-inventory.md`（与分析模块 M1 一样，先单文件。AGENTS.md 要求的 `mapping.md` / `runbook.md` / `validation.md` 留到 M2，本次不建。）

本步只盘点。没有改 skatingx-platform 的代码、规则或数据，没有改 `blaze-skate-training`，没有写 Firestore，没有新建 service account，没有导出数据。

对照来源：

1. 只读对照 legacy 仓库 `blaze-skate-training` HEAD `5d17539`（提交说明：`docs: add training v1.10 final qa and release notes`）。工作区在盘点时是干净的。**未修改 legacy 仓库。**
2. 线上 `GET https://training.blazeskate.com/`（2026-10-20，只取 HTML，不执行页面脚本）。
3. 新平台现状对照 `skatingx-platform` 本分支基线 `f368e01` 的 schema 与训练相关页面。只读。

证据方法：

| 方法 | 结果 |
|---|---|
| 读 legacy `src/App.jsx`、`src/services/profileRepository.js`、`src/features/trainingV1/*`、`src/firebase/*`、`index.html` | 功能、字段、写入点、文案、依赖以这些文件为准 |
| `GET` 线上 HTML，记录 title、script、响应头 | 见 §6。**没有**把线上 JS 与 `git archive` 构建做逐字节比对 |
| 用浏览器打开线上站并点击 | **未做。** 源码在没有用户时会 `signInAnonymously`，随后在 `lastLoginDate` 为空时写入 `profile/main`（§5、§10）。打开即写入，违反本步只读 |
| 用现有密钥只读计数旧项目 users / `profile/main` / Lindsay 文档 | **未做。** 本机已有密钥只覆盖分析源项目与新平台，没有 `blaze-skate-training-platform` 的只读账号。本步不新建 service account |
| 打开 Firebase 控制台 | **未做** |

未写入本文的内容：Firebase `apiKey` / `appId` / `messagingSenderId`、任何用户文档正文、邮箱、成绩、PIN、头像。

## 0. 范围

旧站是单页应用，七个底栏：概览、任务、学院、目标、计划、数据、商店（`src/constants/app.js` 的 `TABS`，中文标签在 `src/App.jsx` 的 `translations.zh.nav`）。设置不在底栏里，在头像打开的个人页里（`ProfileModal` 调用 `SettingsView`，约 5262 行）。

产品版本字符串是界面上的 `v2.2.0`（`translations` 的 `version`）。`package.json` 的 `version` 仍是 `0.0.0`，不能当线上版本。

Firebase GCP 项目 ID 是 `blaze-skate-training-platform`（`src/firebase/firebaseConfig.js`）。Firestore 路径前缀是 `blaze-skate-production`（`SAFE_APP_ID`，`src/constants/app.js`）。二者不是同一个名字。

唯一用户数据文档：

```text
artifacts/blaze-skate-production/users/{uid}/profile/main
```

没有业务子集合。仓库里没有 `firestore.rules`。

新平台已经有自己的训练表面（今日任务、学院、Junior D 计划打卡、成绩、商店、积分）。本 Phase 不是整页搬运。后面要迁的是旧文档里的真实训练数据，尤其是历史记录；落点只在 §9 给候选。

## 1. 功能清单

所有会持久化的动作都进同一个函数 `updateData`（`src/App.jsx` 1491–1497 行）：先合并进内存里的整份 `data`，再 `JSON` 深拷贝，调用 `saveProfilePatch`。`saveProfilePatch`（`src/services/profileRepository.js`）用 `setDoc(..., { merge: true })` 写整份合并结果，并附上元数据。因此下表里的「写入字段」是这次补丁的业务字段；同一次调用还会重写合并后的其他已加载字段，并刷新 `ownerUid`、`sourceApp`、`schemaVersion`、`updatedAt`（新建时还有 `createdAt`）。`setDoc` 合并不会删掉未出现在补丁里的旧字段。

界面宽度是 `max-w-md`，桌面也是一条手机宽的栏。

### 1.1 概览（`dashboard`）

| 项 | 内容 | 证据 |
|---|---|---|
| 输入 | 只读展示：未来比赛轮播（`races`，没有则回退读 `raceDate`）、今日任务完成比例、连续打卡、积分、本周计划摘要 | `DashboardView` 自 2435 行；头栏火焰/奖杯 5918–5934 行 |
| 输出 | 进度条、比赛倒计时、V1 摘要卡 | 同文件 2668 行起 |
| 状态 | 无比赛、无任务、Lindsay 默认数据已存在则按钮禁用 | `canSeedLindsayDefaults` 与 2696–2715 行 |
| 写 | 「初始化默认数据」按钮：补 `competitionGoalsV1`、`trainingPlansV1`，必要时写 `activeTrainingPlanId` | `initializeLindsayTrainingV1Defaults` 1967–2000 行 |
| 不写 | 「周报」只打开 `WeeklyReportModal` | `openWeeklyReportModal` 1521 行；按钮 2689 行 |

今日任务的勾选不在概览里完成，在任务页。概览只显示进度。

### 1.2 任务（`tasks`）

| 动作 | 写入字段 | 证据 |
|---|---|---|
| 勾选 / 取消 | `tasks[].completed`、`points`、`completedDays` | `toggleTask` 2168–2202 行。全部完成时加 `dailyBonusPoints`，取消最后一项时扣回 |
| 手写一条 | `tasks[]` 追加 `{ id, text, target, desc, completed:false, isTemplate }` | `addTask` / `addSpecificTask` 2206–2227 行 |
| 改文字或目标 | `tasks[].text`、`tasks[].target` | `saveEditTask` 2340–2349 行 |
| 删除 | `tasks` 过滤掉该 id | `deleteTask` 2327–2330 行。不回退已经发出的积分 |
| 从学院导入 | 见 §1.3，同样追加 `tasks` | — |

任务对象没有 `createdAt`。`id` 来自 `Date.now() + Math.random()`（1260 行），不是字符串。

跨天副作用（不是按钮）：`lastLoginDate` 早于今天时，把当天 `tasks` 放进 `taskHistory[lastLoginDate]`，然后把 `tasks` 清空，并更新 `lastLoginDate`。第一次没有 `lastLoginDate` 时只写入今天的日期（2064–2096 行）。这是打开应用就会发生的写。

### 1.3 学院（`academy`）

内容是源码常量 `BLAZE_ACADEMY`（146 行起），中文和英文各三档：`age4_6`、`age7_10`、`age11_16`。每档有 `title`、`age`、`target`、`duration`、`frequency`、`core`、`modules[].items[]`（`name`、`target`、`tag`、`desc`）、`weeklyPlan[]`（`day`、`title`、`duration`、`tasks[]` 字符串）。

| 动作 | 行为 | 证据 |
|---|---|---|
| 切换年龄档 | 只改组件 state `activeAcademyAgeIdx`，不写 Firestore | `AcademyView` 5277 行起 |
| 导入一周 | `isPro === false` 时只弹 PRO 窗，不写。已开通则把匹配到的动作追加进 `tasks` | `importAcademyRoutine` 2230–2301 行 |
| 导入单个动作 | 同样被 `isPro` 挡住；通过后走 `addSpecificTask` | `importSingleTask` 2311–2318 行 |

导入成功的闪动（`importedWeeklyIds`）只在内存里，约 2 秒后清掉。

### 1.4 目标（`goals`）

集合字段 `competitionGoalsV1`。单条由 `createCompetitionGoal`（`src/features/trainingV1/goals.js` 151–168 行）生成。

| 叶子字段 | 类型 | 含义 |
|---|---|---|
| `id` | string，`goal_` 前缀 | 客户端 id |
| `title` | string | 必填 |
| `competitionName` | string | 比赛名 |
| `competitionDate` | string | 日期文本 |
| `eventName` | string | 与 `targetDistance` 至少填一个 |
| `targetDistance` | string | 距离标签 |
| `targetTimeSeconds` | number 或 null | 目标成绩，秒 |
| `currentTimeSeconds` | number 或 null | 手填当前成绩；展示时若成绩库有同距离记录，读取逻辑会改用记录（`getGoalCurrentPerformance`） |
| `priority` | `'A' \| 'B' \| 'C'` | 默认 C 以外的非法值会被收成 C；表单只接受 A/B/C |
| `status` | `'active' \| 'completed' \| 'archived'` | 新建是 `active`。归档写成 `archived`。源码里没有把状态写成 `completed` 的按钮 |
| `notes` | string | 备注 |
| `createdAt` / `updatedAt` | ISO 字符串 | 客户端时间 |

写操作：保存（新建或覆盖该 id）、归档（`archiveCompetitionGoal`，1587–1596 行）。没有删除函数。周报和差距曲线是读 `competitionGoalsV1` 加上成绩数组算出来的，不另存一份历史。

### 1.5 计划（`plans`）

集合字段 `trainingPlansV1`，当前计划 id 在 `activeTrainingPlanId`。计划由 `createTrainingPlan`（`src/features/trainingV1/plans.js` 94–108 行）生成。

| 叶子字段 | 类型 | 含义 |
|---|---|---|
| `id` | string，`plan_` 前缀 | 客户端 id |
| `title` / `focus` | string | 标题、重点 |
| `startDate` / `endDate` | string | 日期文本 |
| `goalId` | string 或 null | 指向 `competitionGoalsV1[].id`，可空 |
| `status` | `'draft' \| 'active' \| 'completed' \| 'archived'` | 表单只提交 draft 或 active。归档写成 `archived`，恢复写成 `draft` |
| `days[]` | array | 见下 |
| `days[].date` | string | 该日 |
| `days[].focus` | string | 新建日时空字符串 |
| `days[].tasks[]` | array | 计划任务 |
| 任务 `id` | string，`plan_task_` 前缀 | |
| 任务 `text` / `target` / `desc` | string 或 null | |
| 任务 `category` | 十选一：`ice` `dryland` `strength` `running` `mobility` `recovery` `video` `mental` `competition` `other` | 非法值收成 `other` |
| 任务 `durationMinutes` | number 或 null | |
| 任务 `intensity` | `'low' \| 'medium' \| 'high'` 或 null | |
| 任务 `completed` / `completedAt` | boolean / ISO 或 null | 勾选计划任务时写 |
| 任务 `source` | 常量 `'trainingPlanV1'` | |
| 任务 `createdAt` / `updatedAt` | ISO 字符串 | |
| 计划 `createdAt` / `updatedAt` | ISO 字符串 | |

写操作（都进 `trainingPlansV1`，激活时再写 `activeTrainingPlanId`）：创建、从模板创建、编辑、归档、恢复、设为当前、按日期加/改/删计划任务、勾选计划任务。模板常量在 `src/features/trainingV1/planTemplates.js`，内置 id 包括 `regular_week`。模板不是 Firestore 文档。

「把计划任务加到今日任务」会额外写 `tasks`（与任务页同一数组）。具体按钮在计划视图；字段就是 §1.2 的任务形状。

### 1.6 数据（`data`）

| 动作 | 写入字段 | 证据 |
|---|---|---|
| 录入一条成绩 | 按距离选键，追加 `{ date, time }`，`time` 是秒（小数） | `addRecord` 2358–2373 行。注释写明不再发积分 |
| 删除一条成绩 | 同一个键的数组过滤 | 3565 行 |
| 新增 / 删除比赛 | `races[]` 的 `{ id, name, date }` | 3628、5013 行 |

距离键（`src/features/trainingV1/utils/recordUtils.js` 27–36 行）：

| 距离 | 字段 |
|---|---|
| 500m | `records` |
| 777m | `records777` |
| 1000m | `records1000` |
| 1500m | `records1500` |
| 起跑 / Start | `recordsStart` |
| 单圈 / Lap | `recordsLap` |
| 其他自定义距离 | `records_${规范化后的距离}` |

`customDistances` 是设置里的距离名列表，决定数据页有哪些距离可选。PRO 未开通时改这个列表会被弹窗拦住（4937 行）。已有的自定义键如果还在文档里，读取函数仍会按键名找。

`raceDate` 不在 `defaultData` 里。当前源码只读它，用来在 `races` 为空时合成一条旧比赛（2447、3627、4752 行）。没有找到写入 `raceDate` 的语句。

### 1.7 商店（`shop`）与个人页里的设置

商店读写：

| 动作 | 写入字段 | 证据 |
|---|---|---|
| 兑换 | `points` 扣 `cost`；`rewardHistory` 头部插入 `{ id, name, icon, cost, date }` | `buyReward` 2376 行起。积分不够则不写 |
| 新增商品 | `customRewards[]` 追加 `{ id, name, cost, icon }` | 3704 行。入口要求 `isPro`，否则只弹窗（5147 行） |
| 删除商品 | `customRewards` 过滤 | 5171 行。同样被 `isPro` 拦住 |

`defaultData.customRewards` 有 4 条内置商品（电影之夜、新装备、外出就餐、零花钱）。兑换不检查商品 id 是否仍在列表里，历史记录是兑换当时的拷贝。

设置在个人页，不在底栏。写操作：

| 动作 | 字段 | 是否看 `isPro` | 证据 |
|---|---|---|---|
| 显示名 | `username` | 否 | `buildUsernamePatch`，5701 行 |
| 头像 | `avatar`（data URL 字符串） | 否 | `buildAvatarPatch`，2428 行 |
| 语言 | `language`（`zh` 或 `en`），并写 `localStorage.blaze_lang` | 否 | 4688 行 |
| 主题 | `theme` | 非默认主题要求 `isPro`，否则只弹窗 | 4729–4730 行 |
| 家长 PIN | `parentPin` 明文 4 位；清空写成 `''` | 设置 PIN 要求 `isPro` | `handleSetPin` 4659–4681 行 |
| 每任务积分 / 全勤奖励 | `pointsPerTask`、`dailyBonusPoints` | 未开通时点击会弹窗；失焦仍调用 `updateData` | 5072–5086 行。失焦路径没有再判断 `isPro` |
| 积分加减按钮 | `points` | 未开通时弹窗 | 5057、5110、5123 行 |
| 积分归零 | `points: 0` | 源码此处没有 `isPro` 判断 | 5057 行 |
| 自定义距离 | `customDistances` | 见 §1.6 | |

`isParentMode = (!data.isPro || !data.parentPin) || isUnlocked`（2109 行）。没有 PIN、或不是 PRO、或已经解锁时，家长锁视为打开。PIN 存在则锁屏，解锁状态只在内存 `isUnlocked`，刷新后要重输。

个人页还展示邮箱绑定 / 登录 / 退出，见 §3。电话一行是固定「未绑定」文案，没有写入。

### 1.8 自动写，不经按钮

| 时机 | 字段 | 证据 |
|---|---|---|
| 匿名登录后第一次没有 `lastLoginDate` | `lastLoginDate` = 今天 | 2092–2094 行 |
| 本地日期越过 `lastLoginDate` | `tasks: []`，`taskHistory[旧日期]`，`lastLoginDate` | 2073–2089 行 |
| 云端没有该文档 | 监听回调把 `defaultData` 放进内存；要等上面的日期效果才会真正 `setDoc` | 2048–2050 行与 2092 行 |

## 2. 数据模型

### 2.1 根字段

来源：`defaultData`（`src/App.jsx` 1174–1215 行）加上写入路径里出现、但不在默认值里的字段。类型按源码用法，不是 Firestore 控制台抽样。

| 字段 | 类型 | 含义 | 写入方 | 仍在使用 |
|---|---|---|---|---|
| `lastLoginDate` | `YYYY-MM-DD` 或空串 | 跨天判断 | 日期效果 | 是 |
| `taskHistory` | map，键是日期，值是任务数组 | 跨天快照 | 日期效果 | 是 |
| `points` | number | 当前积分 | 勾选、兑换、设置加减、归零 | 是 |
| `language` | `'zh' \| 'en'` | 界面语言 | 设置 | 是 |
| `theme` | string，默认 `'purple'` | 主题键 | 设置 | 是 |
| `avatar` | string，data URL 或空 | 头像嵌在文档里 | 选图 | 是 |
| `parentPin` | string，明文 | 家长锁 | 设置 | 是 |
| `isPro` | boolean，默认 false | PRO 开关，无到期字段 | **客户端没有任何赋真值的语句** | 是，只读这个布尔 |
| `username` | string | 显示名 | 设置 | 是 |
| `pointsPerTask` | number，默认 10 | 每勾一条加的分 | 设置 | 是，但多处回退值不是 10，见 §10 |
| `dailyBonusPoints` | number，默认 20 | 当天任务全部完成的额外分 | 设置 | 是，回退值也不一致，见 §10 |
| `completedDays` | string[] | 全勤日期 | `toggleTask` | 是。连续天数是算出来的，不另存 |
| `competitionGoalsV1` | 目标数组 | §1.4 | 目标页、Lindsay 默认按钮 | 是 |
| `trainingPlansV1` | 计划数组 | §1.5 | 计划页、Lindsay 默认按钮 | 是 |
| `activeTrainingPlanId` | string 或 null | 当前计划 | 计划页、Lindsay 默认按钮 | 是 |
| `customRewards` | `{id,name,cost,icon}[]` | 商品 | 商店管理 | 是 |
| `customDistances` | string[] | 距离名 | 设置 | 是 |
| `rewardHistory` | `{id,name,icon,cost,date}[]` | 兑换记录，`date` 为 ISO | 兑换 | 是 |
| `races` | `{id,name,date}[]` | 训练页上的比赛清单 | 数据页 / 设置里的比赛编辑 | 是 |
| `weeklyTemplate` | 键 `"0"`…`"6"` 到中文标签 | 旧的周模板展示 | `defaultData` 给出；本步没有找到改它的 `updateData` | 仍被 `todayTrainingType` 读取（2166 行） |
| `tasks` | 任务数组 | 今日任务 | 任务页、学院导入、跨天清空 | 是 |
| `records` / `records777` / `records1000` / `records1500` / `recordsStart` / `recordsLap` | `{date,time}[]` | 固定距离成绩，`time` 为秒 | 数据页 | 是 |
| `records_${距离}` | 同上 | 自定义距离 | 数据页 | 键名动态，默认对象里没有 |
| `raceDate` | string | 旧的单一比赛日 | 当前源码只读 | 仅作 `races` 为空时的回退 |
| `ownerUid` | string | Auth uid | `saveProfilePatch` | 是 |
| `sourceApp` | `'blaze-skate-training'` | 来源标记 | 同上 | 是 |
| `schemaVersion` | 见下 | 元数据 | 同上 | 是 |
| `createdAt` / `updatedAt` | ISO 字符串 | 客户端时钟，不是 Firestore Timestamp | 同上 | 是 |

`PROFILE_SCHEMA_VERSION` 是 `skatingx-athlete-v1`，`TRAINING_SCHEMA_VERSION` 是 `skatingx-training-v1`（`src/constants/skatingx.js`）。`saveProfilePatch` 写到文档上的 `schemaVersion` 用哪一个，以 `profileRepository.js` 的调用参数为准；两个常量都存在，文档上只有一个 `schemaVersion` 字段。历史文档可以没有这些元数据：`withProfileMetadataDefaults` 在读进内存时补默认值，下次写入才落盘（`src/utils/firestoreMetadata.js`，以及 `docs/skatingx-training-metadata.md`）。

### 2.2 嵌套叶子（索引）

- 今日任务：`id`（number）、`text`、`target`、`desc`、`completed`、`isTemplate`。
- `taskHistory` 的值与今日任务同形。
- 目标、计划、计划日、计划任务：§1.4、§1.5。
- 成绩：`date`、`time`。没有备注、没有距离字段（距离由所在数组的键表示）。
- 兑换：`id`、`name`、`icon`、`cost`、`date`。
- 商品：`id`、`name`、`cost`、`icon`。
- 比赛清单：`id`、`name`、`date`。
- PRO：只有 `isPro` 布尔。没有价格、订单、到期日。

### 2.3 文档大小

单文档模型，Firestore 单文档上限是 1 MiB。头像以 data URL 嵌在 `avatar` 里，是最可能把文档撑大的字段。

线上某个真实文档有多大、Lindsay 的文档有哪些键、每个数组有几条：**未验证**。本步没有只读账号，也不把任何个人文档抄进来。

## 3. 账号与权益

### 3.1 匿名与邮箱

`onAuthStateChanged` 发现没有用户就 `signInAnonymously`（2023–2036 行）。匿名 uid 就是 `profile/main` 的路径 uid。

绑定：`EmailAuthProvider.credential` + `linkWithCredential`（2111–2124 行）。成功则 uid 不变，原文档仍归属这个 uid。密码至少 6 位。

邮箱已存在：确认后改走 `signInWithEmailAndPassword`（2134 行）。这会换成另一个 uid，界面文案写明当前游客数据会被云端已有数据盖住。源码没有把游客文档合并进正式账号。

退出：`signOut` 后整页 `reload`（2153–2161 行）。效果函数会再匿名登录，于是进入一份新的游客文档，而不是回到刚才的正式账号。

没有「忘记密码」调用。没有 Apple / Google 登录。

### 3.2 PRO

| 项 | 旧站 | 新平台 |
|---|---|---|
| 存在处 | `profile/main.isPro` 布尔 | `settings/main.isPro` 可选布尔 |
| 谁写成 true | 客户端源码零处赋值。开通按钮只把付款说明展开，并复制 uid（5832–5838、5813 行） | 设置页不写它。M6 起是人工标记 |
| 文案价格 | `$14.99` / 年，划线价 `$29.99` 或 `¥198`。付款说明指向微信 `BlazeSkate_VIP` | 产品口径是 `$19.99` / 月，人工开通（DR-012） |
| 到期 | 无字段，无定时任务 | 无字段 |
| 挡住的功能 | 学院整周导入、学院单条导入、非免费主题、家长 PIN、自定义距离、商品新增删除、部分积分编辑 | 赛日视频与汇总、完整分析、学院按周导入。学院单条导入在新平台不看 PRO |

对应关系只是「两边都有一个人工布尔」。不是同一个商品，也不是同一个文档。是否在迁移时抄这个布尔，本步不决定。

家长 PIN 与新平台 `parentPinHash` / `parentPinEnabled` 不是一回事。旧站是明文 `parentPin`。新平台这些字段还没有可用的设置界面（DR-011）。本步不把明文 PIN 当成新平台的设计。

## 4. 内容来源

| 内容 | 来源 | 证据 |
|---|---|---|
| 学院三档课程、周计划文案 | 硬编码在 `App.jsx` 的 `BLAZE_ACADEMY`，中英各一份 | 146 行起；英文档从 347 行起 |
| 计划模板（常规训练周等） | 硬编码 `TRAINING_PLAN_TEMPLATES` | `src/features/trainingV1/planTemplates.js` |
| 商店默认 4 个商品 | 硬编码在 `defaultData.customRewards` | 1174 行起 |
| 周模板周一到周日标签 | 硬编码在 `defaultData.weeklyTemplate` | 同块 |
| Lindsay 默认目标和默认周计划 | 硬编码生成函数，按钮按下才写入该用户文档 | `initializeLindsayTrainingV1Defaults` |
| 用户任务、目标、计划、成绩、商品、兑换 | 用户文档 | §1 |
| 没有任何课程或商品从 Firestore 集合下发 | 仓库内无第二套内容集合读写 | `profileRepository.js` 只有 `profile/main` |

新平台学院在 `@skatingx/content`，不是把 `BLAZE_ACADEMY` 原样搬过来的。两边条目是否同一套，本步没有逐条对过，标为未验证。

## 5. 同步与监听

| 项 | 行为 | 证据 |
|---|---|---|
| 监听 | 每个登录用户一个 `onSnapshot`，路径即 `profile/main` | `subscribeToProfile` |
| 写 | 只有 `setDoc` 合并，没有 `updateDoc`，没有子集合 | `saveProfilePatch` |
| 离线 | `enableIndexedDbPersistence` | `src/firebase/firestore.js`。失败只 `console.warn`，应用继续 |
| IndexedDB 库名 | 应用没有自己起名，用 Firebase SDK 默认库 | 源码无自定义库名 |
| `localStorage` | 只发现 `blaze_lang`。启动闪屏读它；云端语言回来时再写它 | `index.html`；`App.jsx` 2047 行 |
| 其他持久化 | `sessionStorage` 无匹配。导入动画、家长锁解锁、PRO 付款说明展开都是 React state | 仓库内 `localStorage` / `sessionStorage` 搜索 |

监听回调用 `{ ...defaultData, ...cloudData }` 覆盖内存（2046 行）。云端缺的键会变回默认值；云端多出来的键保留。随后一次 `updateData` 会把这份合并结果写回去。

## 6. 外部依赖

格式对齐分析盘点 §8：先分第一方与第三方，再标明没有 pin 住的地址会漂。本步没有做线上 bundle 与 HEAD 的逐字节比对，所以不能说线上等于 `5d17539`。

### 6.1 第一方

| 资源 | 证据 |
|---|---|
| `GET /` HTML，约 5.7 KB，`title` 为 `Blaze Skate 冰焰速滑`，`server: Vercel`，`last-modified: Tue, 20 Oct 2026 22:39:55 GMT`，`etag: "bb69246a9ed70b98e40ffefebf9baec6"` | 2026-10-20 的只读 `GET` / `HEAD` |
| 脚本一个：`/assets/index-BdwG1pWO.js` | 同一份 HTML。相对路径，第一方 |
| 源码入口 `/src/main.jsx`，无外部 `<script src>` | `index.html` |
| 图标来自 `lucide-react` 依赖，打进 bundle | `package.json` |

HTML 里没有出现 `https://` 资源地址。

### 6.2 第三方与运行时网络

| 依赖 | 怎么进来 | 说明 |
|---|---|---|
| `firebase` `^12.13.0` | npm，Vite 打进第一方 JS | 运行时仍会访问 Google 的 Auth / Firestore 端点。项目 ID `blaze-skate-training-platform`。具体主机名以 SDK 为准，本步没有在浏览器里抓包 |
| `react` / `react-dom` 19、`vite` 8、`tailwindcss` 3、`lucide-react` | npm | 构建期依赖，不是页面 CDN |
| 字体、jsDelivr、unpkg、Google Fonts | 在 `src/`、`index.html` 中无匹配 | 2026-10-20 的源码搜索 |

没有单独的未 pin CDN 脚本。Firebase 后端地址由 SDK 主版本决定，锁文件里有解析结果，但页面不直接写死 URL。

### 6.3 未验证

线上 `index-BdwG1pWO.js` 是否等于在 `5d17539` 上 `vite build` 的产物。分析模块 M1 做过这步；本步不做，因为要比对就得在仓库外构建 legacy 项目，而且不改变「不能用浏览器打开线上站」的结论。`last-modified` 是 2026-10-20，只能说明 CDN 上有一份当天的 HTML，不能证明它就是这个 HEAD。

## 7. i18n

一套对象 `translations`，从 `src/App.jsx` 546 行起，键是语言：`zh`、`en`。组件取 `translations[data.language || 'zh']`。没有独立 i18n 包，没有按领域拆文件。

缩进扫描（只数语言块下第一层 `key:`）：中文约 290 个，英文约 297 个。嵌套对象（例如 `nav`）内部的键另算。两边顶层数量已经不一致，所以不是「同一套键的两种译文」。另有少量直接写在 JSX 里的中英文，例如绑定失败提示（2113、2124 行）和 PRO 弹窗里的「付款指引」（5805 行）。

学院正文不在 `translations` 里，在 `BLAZE_ACADEMY.zh` / `BLAZE_ACADEMY.en`。计划模板的标题是 `{ zh, en }` 小对象。

新平台的要求是领域键、中英键集合相同。旧站这套不能原样当新平台词条。

## 8. 线上数据量级

| 项 | 结果 |
|---|---|
| `blaze-skate-training-platform` 的 Auth 用户数 | **未验证** |
| `artifacts/blaze-skate-production/users` 文档或子集合数 | **未验证** |
| 其中有 `profile/main` 的数量 | **未验证** |
| Lindsay 那份 `profile/main` 的键、数组长度、近似字节 | **未验证** |

未验证的原因：本机没有该 GCP 项目的只读凭证；本步不允许新建 service account，也不允许导出。新平台上的 Lindsay uid 属于另一个 Firebase 项目，不能拿来当旧训练项目的用户 id。

因此本步不能回答「旧站有多少真实用户」或「Lindsay 的历史有多大」。M2 之前如果要计数，需要单独授权一个只读账号，并且只输出计数和键名，不输出正文。

## 9. 对照表

标注只描述 2026-10-20 新平台已有表面，不决定要不要做旧功能。

「已覆盖」= 新平台有同一件用户能做的事，数据也有落点。
「部分覆盖」= 有类似页面或字段，但范围、门禁或形状不一样。
「缺失」= 新平台没有对应的可用功能。schema 里预留了路径、但页面不写，仍算缺失。

### 9.1 功能 × 新平台现状

| # | 旧站功能 | 标注 | 依据 |
|---|---|---|---|
| 1 | 概览：进度、连续天数、积分、比赛倒计时 | 部分覆盖 | 新平台有训练首页和仪表盘；没有旧站这套比赛轮播 |
| 2 | 今日任务的增删改和勾选积分 | 部分覆盖 | 新平台有今日任务和积分；旧任务没有 `createdAt`，删除不退分 |
| 3 | 任务历史月历 | 缺失 | 新平台页面没有月历。schema 的 `taskHistory` 路径页面未写 |
| 4 | 跨天把昨日任务推进 `taskHistory` 并清空今日 | 缺失 | 同上，自动归档没有对应页面行为 |
| 5 | 学院三档浏览，以及 PRO 才允许导入 | 部分覆盖 | 新平台学院来自 `@skatingx/content`。周导入看 PRO；单条导入不看 PRO。条目是否同一套未验证 |
| 6 | 比赛目标（优先级、目标秒数、与成绩的差距） | 缺失 | `apps/web` 无 `competitionGoals` 一类页面 |
| 7 | 用户自建的日期化周计划 | 缺失 | 新平台计划页是 Junior D 模板打卡，不是 `trainingPlansV1` |
| 8 | 内置计划模板 `regular_week` 等 | 缺失 | 与 Junior D 不是同一套模板 |
| 9 | 固定距离成绩（秒） | 部分覆盖 | 新平台有按距离的成绩文档；旧数据是 `{date,time}` 数组，500m 的键名就叫 `records` |
| 10 | 自定义距离 | 缺失 | 新成绩模型能按 `distanceId` 分文档，但没有旧站那份可编辑距离列表 |
| 11 | 训练模块里的比赛清单 `races` | 缺失 | 新平台赛日是另一套账号级结构，不是这个 `{id,name,date}` 列表 |
| 12 | 商店按积分兑换并留下历史 | 部分覆盖 | 新平台有商品与兑换路径；旧历史嵌在同一文档 |
| 13 | 自定义商品、每任务分、全勤分 | 部分覆盖 | 新商店对自定义奖励是 PRO 占位。schema 的 `Gamification` 留了 `pointsPerTask` 和 `dailyBonusPoints`，设置页没有这组控件 |
| 14 | 周报（含打印） | 缺失 | 新平台无对等只读周报 |
| 15 | 匿名登录、邮箱绑定、邮箱登录、退出 | 已覆盖 | 新平台有这四步。旧站没有忘记密码；邮箱已存在时直接换号、不合并数据 |
| 16 | PRO 布尔 | 部分覆盖 | 两边都是人工布尔、都无到期。价格、权益清单、所在文档都不同（§3.2） |
| 17 | 家长 PIN 锁屏 | 缺失 | 新平台字段未做进设置；旧值还是明文 |
| 18 | 多套配色主题 | 缺失 | 新平台 `theme` 默认 `system`，没有旧站那组主题 |
| 19 | 把头像 data URL 存进用户文档 | 缺失 | 新运动员档有 `avatarStoragePath`，没有「图片嵌进文档」 |
| 20 | 设置里手动加减积分、一键清零 | 缺失 | 新积分只跟任务勾选走 |
| 21 | `username` 显示名 | 部分覆盖 | 新平台显示名在运动员档 `displayName`，不是账号上的 `username` |
| 22 | 概览上的「初始化 Lindsay 默认目标/计划」按钮 | 缺失 | 新平台没有这个写入按钮。它写出的目标和计划仍属于第 6、7 行 |

缺失 13 行：3、4、6、7、8、10、11、14、17、18、19、20、22。
部分覆盖 8 行：1、2、5、9、12、13、16、21。
已覆盖 1 行：15。

### 9.2 旧数据 × 新平台落点候选

只列候选和依据，不选定。

| 旧字段 | 候选 | 依据 |
|---|---|---|
| `language` | `settings/main.language` | 两边都是账号级语言 |
| `isPro` | `settings/main.isPro` | 都是人工布尔。价格和权益不同，不能当成同一订阅 |
| `username` | `athletes/{athleteId}/profile/main.displayName` | 都是给人看的名字。旧站没有运动员子档 |
| `avatar` | 不直接落 `avatarStoragePath` | 旧值是 data URL，新字段是存储路径。嵌进文档的图片要不要另存，本步不决定 |
| `theme` | `settings/main.theme` | 字段同名，取值集合不同（旧站是配色名，新平台默认 `system`） |
| `parentPin` | 不落入 `parentPinHash` | 明文不能当哈希。新 PIN 尚未实现 |
| `points`、`completedDays` | `athletes/{athleteId}/gamification/main` | 新模型已经有 `points`、`completedDays`、`streakDays`。连续天数在旧站是算出来的 |
| `pointsPerTask`、`dailyBonusPoints` | 同一份 `gamification/main` 的可选字段 | schema 已留字段，页面未编辑 |
| `tasks`、`taskHistory` | `training/state` 的 `todayTasks`，以及 `training/main/taskHistory/{dateId}` | 路径在 `packages/schema/src/paths.ts`。旧任务缺 `createdAt`，`id` 还是 number |
| `weeklyTemplate` | `training/state.weeklyTemplate` | 旧键是 `"0"`–`"6"`，新键是 `monday`…`sunday` |
| `records*` | `training/main/records/{distanceId}` | 新文档按距离拆开。`records` 这个键要映射成 `500m`，不能把键名当距离 |
| `races` | 无现成同形落点 | 赛日模块是赛事、名单、分组，不是这个列表 |
| `competitionGoalsV1` | 无现成集合 | 计划打卡不是比赛目标 |
| `trainingPlansV1`、`activeTrainingPlanId` | 无现成同形落点 | `planning/main/completedTasks` 是 Junior D 打卡，不是用户周计划 |
| `customRewards` | `training/main/rewards/catalog` | 形状接近 `{id,name,cost,icon}` |
| `rewardHistory` | `training/main/redemptions/{id}` | 旧记录没有单独的商品 id，只有名称、图标、花费、时间 |
| 元数据 `ownerUid` / `sourceApp` / `schemaVersion` / ISO 时间 | 新文档自己的 `createdAt` / `updatedAt` 与来源标记 | 旧时间是 ISO 字符串，新平台约定是 Timestamp。不能原样抄字段名 |

一个旧 uid 对应一个新 uid，还是对应 `athletes/lindsay`，本步不决定。匿名游客文档和正式账号文档在旧项目里是两套 uid。

## 10. 疑似缺陷与怪现象

只记录，不修。

1. 打开网站就会匿名登录；`lastLoginDate` 为空时立刻写 `profile/main`。只读走查无法在不制造文档的情况下完成。
2. `updateData` 每次把整份内存档案合并后写回。一次改积分也会带上当时内存里的其他字段。监听和这次写会互相覆盖。
3. `package.json` 版本 `0.0.0`，界面版本 `v2.2.0`。
4. `pointsPerTask` 默认 10，但 `toggleTask` 在字段缺失时用 20，设置表单同步时也用 20。`dailyBonusPoints` 默认 20，缺失时用 50。三处不一致。
5. 删除任务不退回已经加上的积分；取消勾选会退分。
6. 设置里「每任务积分 / 全勤分」未开通 PRO 时，点击弹窗，失焦仍会 `updateData`。归零积分的按钮没有 PRO 判断。
7. `parentPin` 以明文存在用户文档里。解锁状态不持久，刷新即锁。
8. 客户端不能把自己设成 PRO。用户付完微信后要等文档外的人改 `isPro`。改法不在仓库里。
9. 邮箱已注册时，确认登录会换 uid，游客文档留在旧 uid 上，没有合并。
10. 退出后重新匿名，正式账号的数据还在旧 uid，界面回到空白游客。
11. `raceDate` 只读不写，和 `races` 并存。
12. `weeklyTemplate` 只见默认值和读取，不见编辑器。
13. 目标状态允许 `completed`，界面没有把它写成完成的操作。
14. 任务 `id` 是数字；目标和计划的 `id` 是字符串。同一文档里两套 id。
15. 头像 data URL 进单文档，和 1 MiB 上限冲突的风险是结构性的。实际大小未验证。
16. 中英词条顶层数量不一致，另有 JSX 硬编码句子。
17. 跨天效果依赖本机日期字符串，注释自己提到时区。本步没有用错时区样本验证。
18. `enableIndexedDbPersistence` 失败被吃掉，用户看不到离线失败。
19. 仓库没有 Security Rules。线上规则是否「只能读写自己的 `profile/main`」未验证。
20. 个人页电话显示「未绑定」，没有绑定动作。
21. GCP 项目 ID 与路径前缀不是同一个字符串，和旧分析站「项目 ID ≠ `artifacts/{appId}`」是同一类容易写错的地方。

## 11. 本步停止点

- 不进入 M2，不写映射契约，不写迁移脚本。
- 不打开 https://training.blazeskate.com/ 的交互页面。
- 不读、不写 `blaze-skate-training-platform` 的业务数据，直到有单独授权的只读计数。
- 不把旧 `isPro`、明文 PIN、data URL 头像写进新平台。
