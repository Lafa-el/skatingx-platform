# M1 盘点报告 — 旧日志站 journal.blazeskate.com

日期：2026-10-21
状态：待评审。评审通过前不进入 M2 契约。
本文件路径：`docs/migration/journal-inventory.md`（与分析、训练模块 M1 一样，先单文件。`mapping.md` / `runbook.md` / `validation.md` 留到 M2，本次不建。）

本步只盘点。没有改 skatingx-platform 的代码、规则或数据，没有改 `blaze-skate-journal`，没有写 Firestore，没有新建 service account，没有导出日记或账号。

第一任务结论：权威数据在 Firebase 项目 `blaze-skate-journal` 的 Firestore 原生库 `(default)`（区域 `nam5`）里，按顶层集合存放，不是浏览器本地库，也不是本仓库之外的另一套自建 HTTP API。认证是 Firebase Auth 的邮箱加密码。2026-10-12 那次「自研认证、后端不明」的 bundle 判断，与 2026-10-21 的线上包不符。

对照来源：

1. 只读对照 legacy 仓库 `blaze-skate-journal` HEAD `32cac68`（2026-06-25，`docs(journal): record v1 rc release decision`）。工作区干净。远端只有 `main`。**未修改 legacy 仓库。**
2. 公开线上文件（2026-10-21）：`GET https://journal.blazeskate.com/`、`/assets/index-BPK7WRIu.js`、`/assets/index-BtwZidmW.css`、`/sw.js`、`/registerSW.js`、`/manifest.webmanifest`。没有登录，没有改写。
3. 登录页只读走查：打开 `https://journal.blazeskate.com/login`。本浏览器 IndexedDB `firebaseLocalStorageDb` 条数为 0，停在登录页。没有输入凭证。
4. Firebase CLI 只读：`firestore:databases:list`、`firestore:indexes`（输出被截断）、Rules API 的 release 元数据。没有部署，没有导出。
5. 新平台对照 `skatingx-platform` 基线 `95ddd48`。只读。

未写入本文的内容：Firebase `apiKey` / `appId` / `messagingSenderId`、任何日记正文或标题、邮箱、密码、成绩秒数。

## 0. 范围

旧站产品名是「冰焰滑冰日记 / Blaze Skate Journal」。界面版本字符串是 `v1.5.0`（`src/pages/Login.jsx`、`src/i18n/dictionaries/zh.js` 的 `settings.appVersion`）。`package.json` 的 `version` 仍是 `0.0.0`，不能当线上版本。

技术栈与线上包一致：Vite 构建、React 19、Tailwind CSS v4（线上 CSS 首行是 `tailwindcss v4.3.0`）、`react-router-dom` 7。源码依赖见 `package.json`。线上是 Vercel 托管的单页应用，HTML `last-modified` 为 2026-10-16，JS 为 2026-10-17，`sw.js` 为 2026-10-20。git 历史停在 2026-06-25，没有更新的分支。线上包里能找到与这份源码相同的集合名、`skatingx-journal-v1`、`v1.5.0`、`notification_preferences`、`summer_camp_dates`。因此把 10 月的 `last-modified` 看成同一次源码的再次部署时间，而不是另一份未入库源码。没有做逐字节比对。

底栏五项是首页、日历、统计、视频、更多（`src/components/BottomNav.jsx`）。「更多」里才有每日记录、训练课、教练笔记、身体、周回顾、夏令营、导出、设置。登录前不显示底栏。

新平台主导航仍是五项：总览、训练、分析、AI 教练、设置（`apps/web/src/app/navigation.ts`）。没有日志入口。`AGENTS.md` 里的 `journalEntries/{entryId}` 只出现在规范文本里，仓库代码没有这个集合。

## 1. 后端与数据在哪

证据：源码 `src/firebase/firebaseConfig.js`、`src/firebase/firestore.js`、`src/constants/skatingx.js`；线上包内的 `projectId`。

| 项 | 值 | 证据 |
|---|---|---|
| 服务 | Firebase：Auth + Cloud Firestore。Storage SDK 有初始化，页面没有上传调用 | 源码 + 线上包 |
| GCP 项目 | `blaze-skate-journal` | 线上包 `projectId`；`authDomain` 为 `blaze-skate-journal.firebaseapp.com`；`storageBucket` 为 `blaze-skate-journal.firebasestorage.app` |
| 数据库 | `projects/blaze-skate-journal/databases/(default)`，`FIRESTORE_NATIVE`，`nam5` | `firebase firestore:databases:list` |
| 路径形状 | 顶层集合，不是 `users/{uid}/...` | `COLLECTIONS` |
| 浏览器 | 不是主库。localStorage 只放语言、通知开关、夏令营起止日期。IndexedDB 是 Firebase Auth 持久化和 Service Worker 缓存 | 源码键名；线上包字符串出现次数 |

集合（`src/constants/skatingx.js`）：

- `athletes`（文档 ID 为 `uid`）
- `journal_days`
- `training_sessions`
- `coach_notes`
- `body_status`
- `performance_records`
- `video_refs`
- `weekly_reviews`
- `milestones`

每条业务文档用 `athleteId == Firebase Auth uid` 表示归属（`docs/journal-v1-data-model.md` 与各 service 的 `where('athleteId','==', athleteId)`）。没有单独的 `ownerUid`。

应用自己的 HTTP API：**没有。** 线上包中 `/api/` 出现 0 次，`graphql` 出现 0 次。网络调用是 Firebase SDK 打到 Google 的身份和 Firestore 端点，不是本仓库实现的后端。后端实现不在 `blaze-skate-journal` 仓库里；仓库只有客户端、规则文件和索引文件。

SDK 使用的端点（线上包字符串，不是本应用自定义路由）：

| 用途 | 端点 | 包内出现 |
|---|---|---|
| 登录 | Identity Toolkit `accounts:signInWithPassword` | `signInWithPassword` 3 次 |
| 注册 | `accounts:signUp` | 2 次 |
| 找回密码 | `accounts:sendOobCode` | 1 次 |
| 刷新会话 | `https://securetoken.google.com/` | `securetoken` 2 次 |
| 读写文档 | `firestore.googleapis.com` | 1 次 |
| 项目标识 | `identitytoolkit.googleapis.com` | 2 次 |

源码对应关系：`signInWithEmailAndPassword`、`createUserWithEmailAndPassword`、`sendPasswordResetEmail`（`src/contexts/AuthContext.jsx`）。这些函数名在压缩包里被收掉了，上面的 REST 方法名还在。

线上 Firestore 规则与仓库不一致，这是访问边界，不是另一套数据库：

- 唯一 release：`projects/blaze-skate-journal/releases/cloud.firestore`
- ruleset：`58842b1c-3f33-4e8b-a03e-48b3bcb89ac7`
- `updateTime`：`2026-06-07T19:30:50.910605Z`
- 正文 233 字节。空白归一化后不等于仓库 `firestore.rules`。正文不含字符串 `journal_days`，也不含 `allow ...: if true` 这一写法。
- 没有 `firebase.storage` release。仓库有 `storage.rules`，不能当成已经发布。
- 规则全文没有抄进本文。M2 之前要再打开控制台核对允许条件，不能假设仓库那份规则已经生效。

## 2. 认证

证据：`src/contexts/AuthContext.jsx`、`src/pages/Login.jsx`、`src/pages/PrivacySecurity.jsx`、`src/App.jsx` 的 `ProtectedRoute`；登录页走查。

登录页三个模式：登录、创建账号、忘记密码。没有匿名登录。`signInAnonymously` 不在源码里。`isAnonymous` 只是读 `user.isAnonymous`。

| 动作 | 实现 | 写到哪里 |
|---|---|---|
| 注册 | `createUserWithEmailAndPassword`，可选 `updateProfile({ displayName })` | Firebase Auth。不在 Firestore 建用户文档，除非之后保存运动员资料 |
| 登录 | `signInWithEmailAndPassword` | Firebase Auth |
| 退出 | `signOut` | 清本地 Auth 会话。设置页调用 |
| 找回密码 | `sendPasswordResetEmail` | Firebase 发邮件。本步没有发信 |
| 改密码 | 用当前密码 `reauthenticateWithCredential`，再 `updatePassword` | Firebase Auth |
| 改邮箱 | 同样先重新认证，再 `updateEmail` | Firebase Auth |
| 删除账号 | 重新认证后 `deleteUser` | 只删 Auth 用户。源码没有连带删除 Firestore 集合 |

已登录的判断：`onAuthStateChanged` 给出 `user`。`user` 为空就 `Navigate` 到 `/login`。加载中显示 `Loading...`。

会话载体：源码没有 `setPersistence`，用 Web SDK 默认的本地持久化（IndexedDB，库名 `firebaseLocalStorageDb`）。刷新走 `securetoken.google.com`。源码没有写死有效期。SDK 默认是 ID token 约 1 小时，由刷新令牌更换。本步没有在控制台改这个期限，也没有导出用户去核对。

密码：源码不哈希、不保存密码。密码在 Firebase Auth，不在 Firestore 文档里。本步没有导出用户记录，所以没有核对 salt 或哈希参数。Firebase 公开文档写的是修改版 scrypt。这是文档线索，不是本步从控制台读到的参数。

2026-10-21 本浏览器打开登录页时，`firebaseLocalStorageDb` 条数为 0，界面停在「登录 / 创建账号 / 忘记密码」，版本号 `v1.5.0`。没有已有会话。用户本步没有提供账号，因此没有登录。

## 3. 功能清单

证据：对应页面与 service。登录后的点击没有做，标在第 11 节。

所有 Firestore 写入都走 service，用 `addDoc` / `updateDoc` / `setDoc` / `deleteDoc`。没有 `onSnapshot`。日期是 `YYYY-MM-DD` 字符串，时间戳是 ISO 字符串，不是 Firestore Timestamp。

| 表面 | 路由 | 读 | 写 | 备注 |
|---|---|---|---|---|
| 登录 | `/login` | Auth 状态 | 注册 / 登录 / 发重置邮件 | 见 §2 |
| 首页 | `/`、`/dashboard` | 各集合的列表，用来做汇总 | 无直接保存 | 只读汇总 |
| 每日记录 | `/daily` | `journalService.getByDate` / `list` | `journalService.save`：按日期有则更新，无则新增。完成开关再 `save` 一次 | 服务有 `delete`，页面没有调用 |
| 日历 | `/calendar` | 按日展示已加载的日记、课、笔记 | 无保存 | 月历浏览。没有搜索框 |
| 训练课 | `/sessions` | `sessionService` | 保存与 `sessionService.delete` | 焦点标签在表单里拼成数组 |
| 教练笔记 | `/coach-notes` | `coachNoteService` | 保存与 `delete` | 技术标签同上 |
| 成绩 | `/performance` | `performanceService` | 保存与 `delete`。PB 在页面里算完再写入 | `event`+`timeSeconds` 与旧的 `metric`+`value` 一起写 |
| 身体 | `/body` | `bodyStatusService` | 保存与 `delete` | 心情是 1–5 的数字，不是日记正文 |
| 视频 | `/videos` | `videoService` | 保存与 `delete` | 存的是 `externalUrl` 和 `fileName` 字符串。源码没有 `uploadBytes` |
| 周回顾 | `/weekly-review` | `weeklyReviewService` | `save`：同一周已有则更新 | 统计字段由 `autoGenerateStats` 填，手写字段另存 |
| 夏令营 | `/summer-camp` | `aggregateCampStats` 读多集合 | 只写 localStorage `summer_camp_dates`：`{ start, end }` | 不写 Firestore |
| 里程碑 | 无独立页 | 夏令营统计会 `milestoneService.list` | `create` / `update` / `delete` 没有任何页面调用 | 集合仍在导出列表里 |
| 导出 | `/export`，设置里也有入口 | 按 `athleteId` 把 8 个集合 `getDocs` 下来 | 浏览器下载 JSON 或 CSV。不上传 | 不含 `athletes` |
| 设置 | `/settings` | 通知开关从 localStorage 读 | `notification_preferences`；语言写 `blaze_lang`；退出 Auth | 不写 Firestore |
| 编辑资料 | `/edit-profile` | `athleteService.getAthleteProfile` | `upsertAthleteProfile` 到 `athletes/{uid}` | 头像字段是 `avatarUrl` 字符串 |
| 隐私与安全 | `/privacy-security` | 当前 Auth 用户 | 改密码、改邮箱、删除 Auth 账号 | 不删日记文档 |
| 帮助 | `/help-support` | 静态文案 | 无 | |

搜索：源码和线上包都没有日记搜索 endpoint 或搜索输入框。按日浏览在 `/daily`，按月在 `/calendar`。

图片或附件：日记文档没有图片字段。视频不是文件上传。仓库 `storage.rules` 允许 `avatars/{athleteId}` 和 `users/{athleteId}`，但没有已发布的 Storage release，源码也没有上传函数。附件能力按「未实现」记录，不按「文件在 Storage」记录。

## 4. 数据模型

证据：`src/utils/journalPayloadBuilders.js` 比 `docs/journal-v1-data-model.md` 新。下表以 builder 和页面对表单的字段为准。文档里没写、但 builder 会写的字段，在第 10 节再点一次。

共用元数据（builder 的 `metadata`）：

| 字段 | 类型 | 含义 | 写入方 |
|---|---|---|---|
| `athleteId` | string | 等于 Auth `uid` | service |
| `sourceApp` | string | `blaze-skate-journal` | service |
| `schemaVersion` | string | 日记类 `skatingx-journal-v1`；运动员 `skatingx-athlete-v1` | service |
| `createdAt` | string | ISO 时间。更新时不覆盖 | 仅创建 |
| `updatedAt` | string | ISO 时间 | 创建和更新 |

`journal_days` 叶子：

| 字段 | 类型 | 含义 |
|---|---|---|
| `date` | string | `YYYY-MM-DD`。同一运动员同一天更新同一条 |
| `location` | string | 地点。经 `...data` 原样写入 |
| `dayType` | string | 页面默认 `training` |
| `overallFeeling` | number | 1–5，默认 3 |
| `energy` | number | 1–5，默认 3 |
| `soreness` | string | 酸痛描述 |
| `trainingFocus` | string | 当日重点 |
| `coachFeedback` | string | 教练反馈 |
| `parentNote` | string | 家长备注 |
| `lindsayReflection.bestThing` | string | 最好的一件事 |
| `lindsayReflection.needsWork` | string | 要改进的 |
| `lindsayReflection.tomorrowFocus` | string | 明天重点 |
| `isCompleted` | boolean | 页面默认 false。完成开关会再保存 |

`buildJournalDayPayload` 先展开调用方传入的对象，再覆盖上表这些键。调用方多给的键也会进文档。

`training_sessions`：`date`、`sessionLabel`、`location`、`durationMinutes`（≥0，默认 0）、`intensity`（1–5，默认 3）、`focusTags`（string 数组）、`coachName`、`notes`、`iceTimeMinutes`、`drylandMinutes`、`technicalFocus`、`mainSet`、`startsPractice`、`cornerFocus`、`straightawayFocus`、`relayPractice`、`raceSimulation`（后五个是 boolean）、`lapTimesNote`、`equipmentNote`、`recoveryNote`。`sessionType` 若页面传入，会经展开保留；builder 不单独规范化。

`coach_notes`：`date`、`technicalTags`（数组）。`coachName`、`note`、`priority`、`followUpTomorrow`、`linkedSessionId` 经展开保留。页面默认 `priority` 为 `medium`。

`body_status`：`date`、`sleepHours`（≥0）、`fatigueLevel`（1–6，默认 3）、`sorenessAreas`（数组）、`bodyWeightLb`、`heightCm`、`mood`（1–6，默认 3）。`injuryNote` 经展开保留。

`performance_records`：`date`、`timeSeconds`（≥0）、`value`（≥0）。`event`、`metric`、`isPB`、`context`、`notes` 经展开保留。

`video_refs`：`technicalTags`（数组）。`title`、`fileName`、`externalUrl`、`sessionId`、`analysisStatus`、`notes` 经展开保留。页面默认 `analysisStatus` 为 `pending`。

`weekly_reviews`：`weekStart`（该日期所在周的周一）、`iceSessions`、`drylandSessions`、`privateLessons`、`totalTrainingMinutes`。`bestMoment`、`nextWeekFocus`、`parentSummary`，以及 `weekSessions`、`topTechnicalIssues`、`topCoachNotes`、`bestPerformances` 经展开或自动统计写入。

`milestones`：service 把调用方对象展开后加上元数据。夏令营读取 `date`、`category`、`title`、`name`、`description`。没有页面创建它。

`athletes/{uid}`：`displayName`、`bio`、`level`、`avatarUrl`、`skatingFrom`、`birthday`，加上运动员 schema 元数据。`getLegacyAthleteProfilesByAthleteId` 会再查 `athleteId == uid` 且文档 ID 不是 `uid` 的旧文档。线上包里这个函数名还在。

Auth 用户对象不在 Firestore。客户端用到的是 `uid`、`email`、`displayName`、`isAnonymous`。

localStorage：

| 键 | 值 | 写入页面 |
|---|---|---|
| `blaze_lang` | `zh` 或 `en` | `src/i18n/index.jsx` |
| `notification_preferences` | JSON：`enabled` 与六类开关 | `src/pages/Settings.jsx` |
| `summer_camp_dates` | JSON：`{ start, end }` | `src/pages/SummerCamp.jsx` |

没有应用自己的 IndexedDB 对象仓库。Firebase Auth 与 Workbox 缓存除外。

单条与总量字节：未测量。日记没有二进制附件，体积来自文本字段。条数见 §6，本人条数为未验证。

## 5. 同步、离线与 PWA

证据：`vite.config.js` 的 Workbox 配置；线上 `/sw.js`、`/registerSW.js`；登录页 `navigator.serviceWorker.getRegistrations()`。

源码没有 `enableIndexedDbPersistence`、`persistentLocalCache` 或 `onSnapshot`。读是一次 `getDocs` / `getDoc`。没有冲突合并函数。

Service Worker **已经在线上生效**，与 2026-10-12「sw.js 疑似未部署」相反：

- `GET /sw.js` 返回 200，`content-type` 为 `application/javascript`，2868 字节，`last-modified` 2026-10-20。
- `registerSW.js` 在 `load` 时 `navigator.serviceWorker.register('/sw.js', { scope: '/' })`。
- 2026-10-21 登录页上有一条已激活的注册，script 为 `https://journal.blazeskate.com/sw.js`，scope 为站点根。
- 预缓存列表含当前的 `index-BPK7WRIu.js`、`index-BtwZidmW.css` 和 `index.html`。
- `firestore.googleapis.com` 与 `firebase.googleapis.com` 的 GET 使用 NetworkFirst，缓存名 `firestore-cache` / `firebase-cache`，最多 50 / 10 条，最长 24 小时。
- `/firebase-messaging-sw.js` 与 `/dev-sw.js` 返回的是 HTML 回退（1225 字节），不是独立的 SW 文件。

无网时：导航和静态资源可能来自缓存。Firestore 写仍然要有网。缓存里的 GET 能不能当成离线日记，本步没有断网走查，标未验证。多设备同时改同一天日记时，后一次 `updateDoc` 覆盖该次补丁里的字段，没有版本向量。

## 6. 线上数据量级

本人账号：**未验证。** 本浏览器没有 Auth 会话，本步也没有收到账号。因此没有日记总条数、最早日期、最晚日期、带附件条数或字节量。带附件这一项在模型上预期是 0（没有文件字段），但仍须等登录后用计数确认，不能把源码缺口当成生产计数。

全库账号数与条目总数：**未验证。** 原因：不做 Auth 导出，也不对 Firestore 做全表聚合。规则正文又与仓库不一致，不能假设用管理员身份计数是下一步的默认手段。M2 若要做零丢失，必须先有只读计数（按集合的文档数，以及按 `athleteId` 的人数），并且只记录数字。

## 7. 外部依赖

第一方，由 Vercel 从本站提供：

| URL | 作用 |
|---|---|
| `https://journal.blazeskate.com/` | 入口 HTML |
| `https://journal.blazeskate.com/assets/index-BPK7WRIu.js` | 唯一 JS，842805 字节，gzip 232113。无路由级代码分割 |
| `https://journal.blazeskate.com/assets/index-BtwZidmW.css` | 唯一 CSS，36795 字节 |
| `https://journal.blazeskate.com/sw.js` | Workbox Service Worker |
| `https://journal.blazeskate.com/registerSW.js` | 注册 SW |
| `https://journal.blazeskate.com/manifest.webmanifest` | PWA manifest |
| `/favicon.svg`、`/apple-touch-icon.png`、`/pwa-192x192.png`、`/pwa-512x512.png`、`/icons.svg` | 图标。manifest 与 SW 预缓存引用它们 |

运行时会再请求的第三方（在 JS 字符串里，页面加载登录屏时不一定全部发出）：

| URL | 作用 |
|---|---|
| `https://identitytoolkit.googleapis.com/` | 注册、登录、重置邮件 |
| `https://securetoken.google.com/` | 刷新 ID token |
| `https://firestore.googleapis.com/` | 文档读写 |
| `https://www.google.com/recaptcha/api.js` | Firebase Auth SDK 自带 |
| `https://www.google.com/recaptcha/enterprise.js` | 同上 |
| `https://apis.google.com/js/api.js` | Firebase SDK 自带 |
| `blaze-skate-journal.firebaseapp.com` | Auth domain |
| `blaze-skate-journal.firebasestorage.app` | Storage bucket 名。未见上传 |

React、Firebase JS SDK、lucide 图标、Tailwind 都打进上面的两个静态文件，不从 jsDelivr 或其他 CDN 拉。CSS 里没有 `fonts.googleapis.com`。没有统计脚本。

## 8. i18n

双语。`src/i18n/dictionaries/zh.js` 与 `en.js` 各 614 个叶子键，键集合相同，没有只在一侧出现的键。用法是 `t('login.signIn')` 这种点路径（`src/i18n/index.jsx`）。

语言存在 `blaze_lang`。没有保存时：`navigator.language` 以 `zh` 开头则中文，否则用 `src/i18n/constants.js` 的默认语言。2026-10-21 登录页显示中文，与本浏览器 `zh-CN` 一致，不能当成用户资料里的语言字段。

英文值在旧站是正式文案，不是新平台那种待定英译。迁到新平台时仍要按新平台的 i18n 规则重做键名，不能把旧句子当键。

## 9. 对照与缺口

新平台上靠近「日记」的表面，以及它们是不是日志落点：

| 新平台表面 | 是不是日记落点 | 事实 |
|---|---|---|
| 主导航五项 | 不是 | 没有日志项。本步不决定要不要加 |
| `AGENTS.md` 的 `users/{uid}/journalEntries/{entryId}` | 还不是 | 规范里的路径。代码和规则都没有 |
| 训练成绩 `notes`（`packages/schema/src/training.ts`） | 不是 | 单条成绩的备注，不是按日日记 |
| 器材调整备注 | 不是 | 分析模块的器材事件字段 |
| 比赛日 `coachNote`（`packages/schema/src/race-day.ts`） | 不是 | 一场比赛的总结备注，有待确认状态。不是 `journal_days`，也不是旧站的 `coach_notes` 集合 |
| 旧训练站迁过来的 `weeklyTemplate`、距离成绩 | 不是 | 训练模块的数据，已经有自己的迁移 |

旧站有、新平台日志模块还没有的能力（只列事实，不选落点）：

- 按日一篇的 `journal_days`（感受、精力、酸痛、反思、家长备注、完成标记）
- 训练课、教练笔记、身体状态、周回顾、成绩、外部视频链接、里程碑，共 8 个业务集合加 `athletes`
- 日历月视图、夏令营日期范围和汇总
- 浏览器内 JSON/CSV 导出
- 邮箱账号的改密、改邮箱、删 Auth 用户
- 顶层集合 + `athleteId == uid` 的归属，和仓库里那份尚未证实已发布的规则

零丢失要同时覆盖这 8 个集合和 `athletes`，不能只迁 `journal_days`。导出功能还不包含 `athletes`，不能把导出文件当成完整备份。本地三个 localStorage 键不是日记正文；通知开关和夏令营日期若要保留，得单独算。

候选只到这里：继续放在顶层集合、或改到 `users/{uid}` 下。本步不选。

## 10. 疑似缺陷与怪现象

只记录，不修。

1. 2026-10-12 的静态结论写「自研邮箱密码、非 Firebase、后端不明」。2026-10-21 的线上包是 Firebase 项目 `blaze-skate-journal`。以本次线上包和源码为准。
2. 仓库 `firestore.rules` 按集合限制 `athleteId`。线上规则 233 字节，2026-06-07 发布，不含 `journal_days` 这个字符串，且与仓库文件不一致。谁可以读全部日记，本步没有把规则正文抄下来，不能下结论。
3. `storage.rules` 在仓库里，线上没有 Storage release。视频页也不上传文件。`fileName` 只是字符串。
4. `docs/journal-v1-data-model.md` 的 `journal_days` 没有 `energy`、`soreness`、`trainingFocus`、`coachFeedback`。builder 会写这四项。训练课的分项分钟、布尔练习标记、`lapTimesNote` 等也没全部进那份文档。迁字段时以 builder 和页面为准。
5. `journalService.delete` 没有页面调用。每日记录看起来删不掉。未登录确认按钮是否藏在别处。
6. `milestoneService` 能创建，没有任何页面调用。集合仍会被导出读到。旧数据可能是空的，也可能是以前写进去的。
7. 仓库 `firestore.indexes.json` 没有 `journal_days`、`performance_records`。`journalService.list` 使用 `athleteId` + `orderBy(date)`，这种复合查询通常要复合索引。线上索引列表本次只看全了前半：`body_status`、`coach_notes`、`milestones`、`training_sessions`、`video_refs` 都有 `athleteId` 升序加日期类字段降序。后半被截断，所以上面两个集合的线上索引未核对完。
8. `buildJournalDayPayload` 展开任意输入。多出来的键会进文档。真实文档可能比上表更宽。登录计数之前看不到。
9. 删除账号只调用 `deleteUser`。Firestore 文档会留下，且 `athleteId` 仍指向已删除的 uid。
10. `getLegacyAthleteProfilesByAthleteId` 说明 `athletes` 里可能有文档 ID 不是 uid 的旧档。数量未验证。
11. Service Worker 缓存 Firestore 的 GET，而源码又没有官方离线持久化。弱网下可能看到缓存响应。本步没有断网复现。
12. git 停在 2026-06-25，静态资源的 `last-modified` 在 2026-10-16 至 10-20。特征字符串与 `32cac68` 相同，更像再次部署，不是另一份源码。未做哈希比对。

## 11. 未验证与停止点

未验证：

- 本人日记条数、最早/最晚日期、带附件条数、字节量
- 全库账号数、各集合文档数
- 登录后逐页点击（没有会话，也没有本次提供的账号）
- 断网读写、两台设备改同一天的结果
- 线上 Firestore 规则的完整允许条件（只确认了与仓库不一致、长度、以及两个否定字符串）
- `journal_days` 与 `performance_records` 的线上复合索引是否存在
- 里程碑集合是否有历史文档
- 旧 `athletes` 文档 ID 不等于 uid 的条数

本步停止在这份盘点。评审通过前不做 M2，不改规则，不写旧站，不导出数据。
