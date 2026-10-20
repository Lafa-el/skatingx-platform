# S0 盘点 — 设置页现状与四分组缺口

日期：2026-10-20
状态：待评审。评审通过前不做设置页改版实现。
本文件路径：`docs/settings-inventory.md`。本步只有这一份交付物。

对照来源：

1. 本任务给定的目标结构：四个分组卡片（账号 / 运动员 / 订阅 / 偏好），新增订阅组，权益状态全 app 以只读 `settings/main.isPro` 为单一来源。
2. `skatingx-platform` `main` `b265f55`（2026-10-20，PR #67）的源码与组件测试。**未改代码、未改 `firestore.rules`、未写任何 Firestore 或 Auth 数据。**
3. 定版视觉稿不在本仓库。缺口表按本任务点名的分组和条目对照，不把稿面上没被本任务点名的控件补成需求。

证据方法：

| 方法 | 结果 |
|---|---|
| 读设置页、外壳、Auth、`settings/main` 读写、`isPro` 引用 | 见 §1–§8。行号对 `b265f55`。 |
| 组件测试 `SettingsPage.test.tsx` 等 | 用来核对文案和显隐，不是线上走查。 |
| 打开线上设置页 | **未做。** 见 §9。冷打开会 `signInAnonymously`，随后 `bootstrapUserDocuments` 可能创建文档。 |

未写入本文的内容：任何用户的 uid、邮箱、PIN、文档正文。

---

## 0. 页面在哪

- 路由：`/settings`，`apps/web/src/app/router.tsx` 第 42 行，组件 `SettingsPage`。
- 外壳：`AppShell` → `ShellFrame`。顶栏 `Header` 含运动员选择器；底栏 / 侧栏有「设置」（`nav.primary.settings`：中文「设置」，英文 `Settings`）。设置页自己的内容不包含选择器。
- 页面根：`apps/web/src/pages/SettingsPage.tsx`。文案在 `apps/web/src/shared/i18n/settings-page-messages.ts`；语言卡片另在 `settings-messages.ts`。
- 数据根：`paths.userSettings` = `artifacts/skatingx-production/users/{uid}/settings/main`（`packages/schema/src/paths.ts` 第 7 行）。
- 规则：`settings` 落在 `firestore.rules` 第 18–22 行的属主通配里（`collection != raceDay / analyses / athletes`）。属主可读写，**没有字段校验**。`isPro` 因此是客户端可写的，不是安全边界。本步未改规则。这一点 ADR-001 已写过。

`UserSettings`（`packages/schema/src/user.ts` 第 7–18 行）字段：`activeAthleteId`、`language`、`theme`、`isPro?`、`parentPinEnabled?`、`parentPinHash?`、`createdAt?`、`updatedAt?`。

新用户第一次进应用时，`bootstrapUserDocuments`（`packages/firebase-client/src/firestore/bootstrap.ts` 第 61–64 行）若文档不存在则写入默认值（`packages/schema/src/defaults.ts` 第 29–35 行）：`activeAthleteId = "lindsay"`、`language = "zh"`、`theme = "system"`、`isPro = false`、`parentPinEnabled = false`。已存在的文档原样留下。这不是设置页按钮触发的。

应用里唯一调用 `updateUserSettings` 的地方是语言开关（§6）。该函数的补丁类型还允许 `theme`、`isPro`、`parentPinEnabled`、`activeAthleteId`（`packages/firebase-client/src/firestore/settings.ts` 第 7–24 行），但没有任何调用传入这些字段。

---

## 1. 设置页条目全清单

顺序与 `SettingsPage.tsx` 渲染顺序一致。卡片标题是三级标题（组件测试如此断言）。

| # | 区块 / 控件 | 中文 | 英文 | i18n key | 数据来源 | 点击或变更 |
|---|---|---|---|---|---|---|
| 1 | 页标题 | 设置 | Settings | `settings.page.title` | 写死文案 | 无 |
| 2 | 页介绍 | 账户与登录。个人资料和运动员数据同步将在后续阶段提供。 | Account and authentication. Profile and athlete data sync come in a later phase. | `settings.page.intro` | 写死文案 | 无 |
| 3 | 语言卡片标题 | 语言 / Language | Language / 语言 | `settings.language.title` | 写死；标题按**当前语言**取词，所以中英标题不同 | 无 |
| 4 | 语言说明 | 选择界面语言。 | Choose the interface language. | `settings.language.description` | 同上 | 无 |
| 5 | 单选「中文」 | 中文 | 中文 | `settings.language.option.zh` | 选中态 = `settings/main.language` 经 `toLocale`。见 §6 | 选中且与当前不同时写 `language` |
| 6 | 单选「English」 | English | English | `settings.language.option.en` | 同上 | 同上，写入 `"en"` |
| 7 | 语言失败提示 | 语言没有保存成功。请检查网络后再试。 | The language was not saved. Please check your connection and try again. | `settings.language.error` | 仅 `useLanguageSetting` 的 `failed` 为真时出现 | 无 |
| 8 | 家长设置卡片 | 家长设置 | Parent settings | `settings.parent.title` | 写死 | 无 |
| 9 | 家长说明 | 家长 PIN 锁在 M6 中尚未实现。PIN 不会以明文保存。PIN 安全功能上线后，只会把哈希值保存在 `settings/main` 中。 | Parent PIN lock is not implemented in M6. PINs are not stored in plaintext. When PIN security ships, only a hash will be saved on `settings/main`. | `settings.parent.noteBefore` + `settings.parent.noteAfter`；中间 `<code>settings/main</code>` 是常量 `SETTINGS_DOC_PATH`，不翻译 | **不读** `parentPinEnabled` / `parentPinHash` | 无 |
| 10 | 当前用户卡片 | 当前用户 | Current user | `settings.account.title` | Auth | 无 |
| 11 | 行「状态」 | 加载中… / 服务未配置 / 访客（匿名） / 已注册用户 | Loading… / Firebase not configured / Guest (anonymous) / Registered User | `settings.account.status` + `settings.account.loading` / `notConfigured` / `guest` / `registered` | `useAuth()`：`loading`、`firebaseReady`、`isAnonymous`。见 §3 | 无 |
| 12 | 行「UID」 | UID | UID | `settings.account.uid` | `user.uid`；加载中显示「…」，无用户显示「—」 | 无 |
| 13 | 行「匿名」 | 匿名：是 / 否；加载中「…」 | Anonymous: Yes / No | `settings.account.anonymous` + `yes` / `no` | `isAnonymousUser(user)` | 无 |
| 14 | 行「邮箱」 | 邮箱 | Email | `settings.account.email` | `user.email`，空则「—」 | 无 |
| 15 | Auth 错误条 | 按错误码翻译，例如「邮箱或密码不正确。」未知句原样显示 | Incorrect email or password. 等 | `auth-messages.ts` 的 `auth.error.*`；非码则 `received` | `useAuth().authError` | 无关闭按钮。下次提交前 `clearAuthError` |
| 16 | 绑定卡片（仅匿名且 Firebase 就绪、Auth 不在加载） | 绑定邮箱和密码 | Link email & password | `settings.link.title` | 显隐看 Auth，不看 Firestore | 无 |
| 17 | 绑定说明 | 把当前访客会话变成永久账户。密码至少 6 个字符。 | Turn this guest session into a permanent account. Password must be at least 6 characters. | `settings.link.help` | 写死 | 无 |
| 18 | 绑定邮箱、密码输入 | 邮箱 / 密码 | Email / Password | `settings.field.email` / `settings.field.password` | 组件 `useState`，不入库 | 输入 |
| 19 | 绑定按钮 | 绑定账户 / 绑定中… | Link account / Linking… | `settings.link.submit` / `settings.link.busy` | 邮箱非空且密码 ≥ 6 才可点 | 提交：`linkEmailPassword`。见 §2 |
| 20 | 登录卡片（Firebase 就绪且 Auth 不在加载；**匿名和已注册都显示**） | 登录已有账户 | Sign in to existing account | `settings.signIn.title` | 显隐不看是否已注册 | 无 |
| 21 | 登录说明 | 使用已注册的邮箱和密码登录。登录会替换当前会话（访客数据不会自动合并）。 | Use a registered email and password. Signing in replaces the current session (guest data is not merged automatically). | `settings.signIn.help` | 写死 | 无 |
| 22 | 登录邮箱、密码 | 同上 field key | 同上 | 同上 | 另一组 `useState` | 输入 |
| 23 | 登录按钮 | 登录 / 登录中… | Sign in / Signing in… | `settings.signIn.submit` / `settings.signIn.busy` | 邮箱和密码都非空才可点；**没有** 6 字符下限 | 提交：`signInEmailPassword`。见 §2 |
| 24 | 退出按钮（仅已注册、Firebase 就绪、不在加载） | 退出登录 | Sign out | `settings.signOut.button` | Auth | `window.confirm` 后 `logout`。见 §2、§3 |
| 25 | 确认句（浏览器对话框，不是页面控件） | 要退出登录吗？你会回到一个新的访客会话。除非你之前已经绑定账户，否则这台设备上未保存的访客数据不会转移到已注册账户。 | Sign out? You will return to a new guest session. Unsaved guest data on this device will not carry over to a registered account unless you linked first. | `settings.signOut.confirm` | 写死 | 取消则不调用 `logout` |
| 26 | 访客脚注（仅匿名且已有 user） | 访客 UID（前 8 位）：{uid} | Guest UID (first 8 chars): {uid} | `settings.account.guestUid` | `uid` 前 8 位 | 无 |

页面上**没有**：PRO / 方案 / 免费版、订阅、运动员姓名或 `activeAthleteId`、编辑资料链接、主题开关、家长 PIN 输入、修改密码、`localStorage` 键。`SettingsPage.test.tsx` 第 92–138 行断言：即便 `isPro: true`，页面文本也不出现 PRO、开发、免费版。第 161–172 行断言不出现 `parentPinEnabled` 这串字段名。

设置页不使用 `localStorage` 或 `sessionStorage`。语言不在本地存储。

英文字符串与中文 key 对齐。这两个资源文件**没有**「待评审 / pending review」注释（M4 在部分训练文案上有）。这是现状，本步不改文案。

外壳上、设置页能看见但不属于 `SettingsPage` 的控件：顶栏运动员按钮（§4）、主导航。它们的行为不在设置页的写路径里。

---

## 2. 写操作清单

设置页内会写数据的动作只有下面几项。其余行都是只读。

| 动作 | 触发 | 写到哪里 | 字段 | 不写什么 |
|---|---|---|---|---|
| 切换语言 | 已有 `uid`，目标语言与当前不同，`getFirestoreDb()` 有值 | `settings/main`，`updateDoc` | `language`（`"zh"` 或 `"en"`），以及 `updatedAt`（server timestamp） | 不改 `isPro`、`theme`、`activeAthleteId`、PIN |
| 绑定邮箱密码 | 匿名、邮箱非空、密码 ≥ 6、提交 | Firebase Auth `linkWithCredential`。uid 不变 | Auth 的 email / password provider | 不写 Firestore。成功后清空输入框 |
| 登录已有账户 | 邮箱和密码非空、提交。已注册用户也能看见这张表 | Firebase Auth `signInWithEmailAndPassword` | 替换当前 Auth 会话 | 不写 Firestore。文案写明访客数据不自动合并。成功后清空输入框 |
| 退出登录 | 已注册，确认对话框选确定 | Firebase Auth `signOut` | 当前会话结束 | 按钮本身不写 Firestore |

退出之后：`AuthProvider` 在 `user` 变为空时调用 `signInAnonymouslyIfNeeded`（`AuthProvider.tsx` 第 91–107 行）。那是一次新的匿名 Auth 用户，随后 `FirestoreProvider` 会对该新 uid 跑 `bootstrapUserDocuments`。组件测试只断言确认后调用了 `logout`，**没有**覆盖「退出后立刻又匿名登录」。线上未点。标未验证（§9）。

语言写入不等待服务器：`useLanguageSetting.ts` 第 11–15、37 行。本地监听先改界面；无 db，或服务器拒绝，则 `failed` 为真并显示 `settings.language.error`。无 uid 或语言没变时直接返回，不写。加载中或无 uid 时单选禁用。

绑定失败、登录失败：`AuthProvider` 记下错误码并重新抛出；页面吞掉异常，输入保留，按钮恢复（`SettingsPage.tsx` 第 80–82、96–98 行；测试第 179–202 行）。

**只读：** 页标题、介绍、家长说明、状态、UID、匿名、邮箱、访客脚注、Auth 错误条。没有开关去写 `isPro`。

应用启动时的 `bootstrapUserDocuments` 会在文档缺失时创建 `settings/main`，但它不是设置页上的按钮。

---

## 3. 账号区现状

登录态来自 Firebase Auth 的 `User`，经 `useAuth()`：

| 页面上的值 | Auth 字段 / 函数 | 位置 |
|---|---|---|
| UID | `user.uid` | `AuthProvider.tsx` 第 191 行 |
| 邮箱 | `user.email` | `SettingsPage.tsx` 第 123 行 |
| 是否匿名 | `isAnonymousUser`：有 password provider，或「有 email 且 `isAnonymous` 为假」，算已注册；否则算匿名（含 `user === null`） | `packages/firebase-client/src/user.ts` 第 12–28 行 |
| 加载中 | Auth 首帧，以及退出过程中 `setLoading(true)` | `AuthProvider.tsx` 第 73、177 行 |
| 服务未配置 | `getFirebaseAuth()` 为空 | 第 81–85 行 |

没有展示 displayName、photoURL、provider 列表、邮箱是否已验证。

冷启动没有用户时会匿名登录（第 99–107 行）。这是写 Auth。本步没有打开线上页，因此没有新造匿名用户。

**退出登录。** 仅已注册显示按钮。`window.confirm` 用当前语言的 `settings.signOut.confirm`。取消不调用 `logout`（测试第 381–392 行）。确定则 `signOut`。失败时 `authError`，并结束加载（`AuthProvider.tsx` 第 183–185 行）。退出后的新匿名会话见 §2，线上未验证。

**匿名升级入口：有。** 仅 `firebaseReady && isAnonymous && !loading` 时渲染「绑定邮箱和密码」。实现是 `linkAnonymousWithEmailPassword`：`EmailAuthProvider.credential` + `linkWithCredential`，然后 `reload`（`packages/firebase-client/src/auth.ts` 第 56–70 行）。uid 保持。密码短于 6 时按钮禁用，且 `handleBindSubmit` 直接 return。已注册用户看不到这张卡。

**修改密码：无。** 全仓生产代码没有 `updatePassword`、`sendPasswordResetEmail`、`reauthenticate`。设置页没有「修改密码」或「忘记密码」。登录表单的密码只用于本次 `signInWithEmailAndPassword`，不提供改密。

另外一张「登录已有账户」对匿名和已注册都显示。它是换会话，不是升级当前 uid。

---

## 4. 运动员区现状

**设置页内没有运动员条目。** 没有姓名、id、档案链接。介绍句只说个人资料和运动员数据同步将在后续阶段提供（`settings.page.intro`）。

**顶栏选择器**在 `Header` → `AthleteSelector`（`apps/web/src/components/AthleteSelector.tsx`），设置页因为共用 `ShellFrame` 也能看见它。它不是设置页的一块卡片。

| 选择器上的东西 | 来源 | 行为 |
|---|---|---|
| 头像首字、显示名 | `useAthleteProfile().data.displayName`，没有则「…」 | 只读 |
| 副文案 id | `useActiveAthlete().athleteId` | 只读 |
| 展开后的唯一选项，标「当前」 | 同上，`shell.athlete.active` | `aria-selected`，不能改选 |
| 「多运动员切换：后续阶段提供。」 | `shell.athlete.switchingLater` | 只读说明 |
| 「运动员档案 →」 | `shell.athlete.profileLink` | `Link` 到 `/athlete`，然后关掉菜单 |

选择器**不写** `activeAthleteId`。没有运动员列表。

**`activeAthleteId` 读：**

- 文档字段：`settings/main.activeAthleteId`。
- 上下文：`FirestoreProvider` 第 92–93 行，缺省 `DEFAULT_ATHLETE_ID`（`"lindsay"`，`packages/schema/src/constants.ts`）。
- `useActiveAthlete`（同文件第 253–265 行）把这个 id 交给外壳。
- 档案监听却**写死** `DEFAULT_ATHLETE_ID`，不用 `activeAthleteId`（第 160–168 行）。ADR-001 记过这件事。因此选择器上的名字来自 `athletes/lindsay/profile/main`，即便 settings 里的 id 是别人。
- 训练、商店、学院、日切等用 `settings?.activeAthleteId ?? "lindsay"`（例如 `useTrainingActions.ts` 第 34 行、`useAcademyImport.ts` 第 82 行）。这是另一套缺省，和常量同字面量，但是各写各的。
- 展示：`/athlete` 的「当前运动员 ID」读 `settings.activeAthleteId`，没有则用 hook 的 id（`AthletePage.tsx` 第 91 行）。设置页不显示。

**`activeAthleteId` 写：** 默认文档创建时写成 `"lindsay"`。`updateUserSettings` 的类型允许以后改它。生产代码没有任何调用传入 `activeAthleteId`。设置页和选择器都不写。

**编辑资料 / `/athlete`：** 设置页没有「编辑资料」。顶栏链接到 `/athlete`（`AthletePage.tsx`）。该页只展示档案：姓名、出生日期、项目、国家/地区、当前运动员 ID、账户 UID。没有输入框，没有保存。全仓没有更新 `athletes/{id}/profile/main` 的应用函数（bootstrap 只在缺失时 `setDoc` 默认档案，默认姓名是 `"Lindsay Lin"`）。所以「跳到 /athlete」在顶栏已经有；「在那里改资料」没有。

---

## 5. 权益显示全 app

### 5.1 设置页

没有 PRO、方案、免费版、价格、到期日。没有读取 `isPro` 来显示。测试把 `isPro: true` 灌进去，页面仍不出现这些词（`SettingsPage.test.tsx` 第 130–138 行）。

### 5.2 总览「方案」卡

`DashboardPage.tsx` 第 177–182 行，卡片标题 `dashboard.card.plan`。

| 状态 | 中文 | 英文 | key |
|---|---|---|---|
| `loading` 为真（档案、积分、训练、纪录、商店、`useIsPro` 任一还在加载） | … | … | 无 key，字面量 |
| `isPro === true` | PRO 已开通 | PRO active | `dashboard.plan.pro` |
| 否则 | 免费版 | Free plan | `dashboard.plan.free` |

数据：`useIsPro()` → `useUserSettings().data.isPro === true`（`apps/web/src/hooks/useIsPro.ts` 第 4–10 行）。字符串 `"true"` 不算开通（`useIsPro.test.tsx`）。总览**不用** `useIsPro().error`。设置文档单独读失败、其他卡片仍成功时，这张卡显示「免费版」，页面错误条也不一定包含这次失败（总览的 `error` 拼接的是档案、积分、训练、纪录、商店，不是 settings）。

这张卡没有正文、没有价格、没有链接。

### 5.3 生产代码里的 `isPro` 读取点

口径：`b265f55` 上，生产 `.ts` / `.tsx` 里每一处根据该标志做判断或展示的表达式，共 **17** 处、**7** 个文件。测试文件、类型声明、默认值、注释里的 `AnalysisProvenance` 不算。`ProPlanBanner` 只接收调用方已经算好的布尔值，不自己读文档，不计入这 17。

直接读 Firestore 字段的只有两处文件：

| 文件 | 行 | 用途 |
|---|---|---|
| `apps/web/src/hooks/useIsPro.ts` | 7 | `settings?.isPro === true`。唯一的严格布尔入口，并带出 `loading` / `error` / `language` |
| `apps/web/src/hooks/useAcademyImport.ts` | 146、175 | `requirePro && settings?.isPro !== true` 时拒绝「按星期导入」和「按日计划导入」。第 170、200 行是这两处的依赖数组，不算另一次判断 |

消费 `useIsPro()` 的判断：

| 文件 | 行 | 用途 |
|---|---|---|
| `apps/web/src/pages/DashboardPage.tsx` | 181 | 方案卡「PRO 已开通」或「免费版」。第 67 行只是取出返回值 |
| `apps/web/src/pages/training/TrainingHomePage.tsx` | 148 | 商店卡第二行。第 44 行只是取出返回值 |
| `apps/web/src/pages/training/TrainingAcademyPage.tsx` | 74、86 | 非 PRO 则日计划 / 星期导入函数直接 return |
| 同上 | 111 | `ProPlanBanner` |
| 同上 | 261、269、277、291、321 | 周计划区：锁定卡、半透明、禁用下拉和两个导入按钮 |
| 同上 | 332 | 仅 PRO 显示「PRO」说明卡 |
| `apps/web/src/pages/training/TrainingShopPage.tsx` | 72 | `ProPlanBanner` |
| 同上 | 152 | PRO 显示自定义奖励占位卡，否则 `ProLockedCard` |
| `apps/web/src/modules/race-day/hooks/useProAccess.ts` | 22 | `isPro` 为真则 `"unlocked"`，否则 `"locked"`。加载是 `"loading"`，`error` 非空是 `"error"`（第 16–21 行）。注释写明这不是安全边界 |

`ProGate`（视频页、总结页）不写 `isPro` 这个词，它只读 `useProAccess()`。

不是读取、但名字里有 `isPro`：

| 文件 | 行 | 是什么 |
|---|---|---|
| `packages/schema/src/user.ts` | 12 | 可选布尔字段 |
| `packages/schema/src/defaults.ts` | 33 | 新文档默认 `false` |
| `packages/firebase-client/src/firestore/settings.ts` | 13 | `updateUserSettings` **可以**补丁这个字段；没有任何 UI 这么调用 |

分析页、计划页、任务页、纪录页、AI 教练页、设置页不读 `isPro`。学院里**单条**内容导入（`importItem` / `handleImportItem`）不检查 `isPro`；被挡住的是周计划导入。商店目录兑换不检查 `isPro`；被挡住的是自定义奖励区。比赛日的今天 / 赛程 / 成绩 / 设置不经过 `ProGate`；视频和总结经过。

### 5.4 显示口径不一致

同一个 `settings/main.isPro === true`，文案和失败时的说法不一样：

| 表面 | 开通时 | 未开通时 | 读失败时 |
|---|---|---|---|
| 总览方案卡 | PRO 已开通 | 免费版 | 显示「免费版」。不使用 `useIsPro().error` |
| 训练首页商店卡 | PRO 已开启 · 目录奖励 + 自定义奖励（占位） | 免费版 · 仅目录奖励 | 同样落进「免费版」那句（`loading` 结束后） |
| 学院 / 商店 `ProPlanBanner` | 标题「PRO 已开启」，正文「高阶计划导入与 PRO 专区已解锁。」 | 标题「免费版」，正文讲浏览学院、兑换默认奖励、高阶导入需联系管理员 | 调用方不看 `error`，横幅按未开通画 |
| 学院锁定卡 / 商店自定义区 | 不显示锁定卡 | 「需要 PRO」+ 各自一句 + 「目前只对试用账号开放。如需使用，请联系管理员开通。」 | 同上，按未开通锁 |
| 比赛日视频 / 总结 | 打开页面 | 「这一页需要 PRO」+ 「这一页目前只对试用账号开放…」+ 「这是比赛日试用期间的临时安排，不代表最终的定价或功能划分。」 | **不说免费版**：「暂时无法确认你的套餐状态，所以这一页先保持锁定。请检查网络后刷新页面。」 |

「PRO 已开通」只出现在总览；「PRO 已开启」出现在训练首页和横幅。未开通有的叫「免费版」，比赛日不叫。只有比赛日把读失败和「未开通」分开。

开通方式在文案注释里是管理员在 Firebase 控制台改文档（`pro-messages.ts` 第 3–7 行，`ProGate.tsx` 第 18–20 行）。应用内没有付款、没有改 `isPro` 的按钮。规则仍允许属主自己写这个字段（§0）。

---

## 6. 偏好区现状

### 6.1 语言

| 项 | 现状 |
|---|---|
| 控件 | 两个原生 radio，`LanguageSetting.tsx` |
| 存储 | `settings/main.language`。不是 `localStorage` |
| 默认 | 新文档 `"zh"`。`toLocale`（`translator.ts` 第 18–20 行）：只有正好 `"en"` 才是英文，其他任何值（缺字段、`"zh"`、垃圾字符串）都当中文 |
| 谁在用 | `useLocale()` 返回 `useIsPro().language`，也就是这份 `toLocale`。全 app 界面语言走这里，不是单独的 `isEn` 标志 |
| `isEn` | 不是设置来源。`packages/content/src/academy.ts` 第 44 行有局部变量 `const isEn = language === "en"`，只用来挑学院内容的中英字段。语言值仍来自 settings |
| 写入 | §2。失败有 `settings.language.error` |
| 禁用 | 无 `uid` 或 settings 仍在加载 |

### 6.2 家长 PIN 与 DR-011

DR-011（`docs/SKATINGX_OPEN_DECISIONS.md`，状态 Approved，选项 A）：不明文；Firestore 存 `parentPinHash`（bcrypt/argon2）；创建后客户端不再拿明文；要跨设备；公开测试前必须做。

落实情况：**决策已批，产品没有做。**

- 设置页只有 §1 第 8–9 行那句「M6 中尚未实现」。没有输入、没有开关、没有校验。
- 不读 `parentPinEnabled`，不读 `parentPinHash`。测试禁止把字段名画到页面上。
- `parentPinEnabled` 只在类型、默认值 `false`、以及 `updateUserSettings` 的允许补丁里出现。没有调用写入。
- `parentPinHash` 只在 `UserSettings` 类型里出现。没有默认值，没有写入，没有读取。
- 因此现在既不是明文，也不是哈希：PIN 根本没有被保存。DR-011 的「不要明文」被这句说明和「没有存储」同时满足；「要有哈希、要能跨设备校验」没有做。

`theme` 同理闲置：默认 `"system"`，类型允许更新，没有设置项去读或写。本任务的四分组没有点名主题，这里只记录，不放进缺口表。

---

## 7. 页面状态

| 状态 | 设置页现在怎么表现 | 证据 |
|---|---|---|
| Auth 加载 | 状态行「加载中…」；UID「…」；匿名行「…」。绑定、登录、退出都不渲染 | `SettingsPage.tsx` 第 115–121、162–163、178、211、244、256 行 |
| Firebase 未配置 | 状态「服务未配置」。表单和退出不渲染。`authError` 可为 `auth.error.notConfiguredSetup` | 第 117–118、178、211、244 行 |
| Auth 错误 | 页内 `ErrorNotice`（`role="alert"`），跟当前语言 | 第 174–176 行 |
| 语言保存失败 | 语言卡片下的错误句 | `LanguageSetting.tsx` 第 60–62 行 |
| settings 文档加载中 | 语言单选禁用。账号区不等这份文档 | `useLanguageSetting.ts` 第 50 行 |
| settings 文档监听失败 | **设置页不显示。** `useIsPro` 会带上 `error`，设置页不用它 | `SettingsPage.tsx` 无 `useUserSettings` |
| Firestore 连接横幅 | **设置页没有挂 `FirestoreStatusBanner`。** 总览、运动员、训练首页、任务、纪录、学院、商店有。横幅文案：加载「正在加载你的数据…」；失败「无法连接到数据服务：{detail}」 | `FirestoreStatusBanner.tsx`；`SettingsPage.tsx` 无此组件 |
| 离线 | 语言写入的注释说：有离线持久化时，界面先跟本地监听变，服务器拒绝后再失败。设置页没有单独的离线横幅，也没有「你现在离线」 | `useLanguageSetting.ts` 第 11–15 行。线上弱网未走查 |

横幅读的是 `useFirestoreStatus()`：bootstrap 失败或四个监听（settings、profile、gamification、training state）里第一个错误（`FirestoreProvider.tsx` 第 280–295 行）。设置页不挂它，所以这些错误在 `/settings` 上看不到，除非它同时变成 Auth 错误或语言保存失败。

---

## 8. 缺口对照

三类只表示现状够不够支撑本任务点名的那一项。不选实现，不决定视觉稿里有没有未点名的控件。

| 目标 | 现状 | 标注 |
|---|---|---|
| 账号 · 登录态（状态、UID、匿名、邮箱） | Auth `User` 已展示。见 §3 | 已有数据与能力支撑 |
| 账号 · 退出登录 | 已注册才有按钮；确认后 `signOut`。见 §2、§3 | 已有数据与能力支撑 |
| 账号 · 匿名账号升级 | 「绑定邮箱和密码」+ `linkWithCredential`，uid 不变。见 §3 | 已有数据与能力支撑 |
| 账号 · 修改密码 | 无改密、无重置邮件、无页面入口。见 §3 | **缺能力。** 缺的是已登录用户修改或重置密码的流程。影响账号组里的改密项。没有对应字段要加；Auth 流程本身不存在 |
| 运动员 · 设置页里的运动员块 | 页内没有。姓名和 id 已在档案文档和 `activeAthleteId`。顶栏选择器已在读它们 | 需新增前端组装（无新数据） |
| 运动员 · 和顶栏选择器的关系 | 选择器在外壳，不在设置页；不能切换；链到 `/athlete` | 需新增前端组装（无新数据）。把现有选择器收进或指到设置页，不需要新字段 |
| 运动员 · 展示 `activeAthleteId` | 字段在 `settings/main`。展示在 `/athlete`，不在设置页。见 §4 | 需新增前端组装（无新数据） |
| 运动员 · 编辑资料跳到 `/athlete` | 顶栏已有链接。设置页没有 | 需新增前端组装（无新数据） |
| 运动员 · 在 `/athlete` 修改并保存资料 | `/athlete` 只读。没有更新档案的应用函数。见 §4 | **缺能力。** 缺的是编辑并写回 `athletes/{athleteId}/profile/main` 的流程。影响「编辑资料」如果它意味着改字段而不只是打开只读页 |
| 运动员 · 切换当前运动员 | 选择器写明后续才提供。没有任何调用写入 `activeAthleteId`。档案监听仍钉死 `lindsay`。见 §4 | **缺能力。** 缺的是列出运动员并把所选 id 写进 `settings/main.activeAthleteId` 的流程。字段已经在文档里。影响运动员组的切换项 |
| 订阅 · 设置页订阅组，只读 `isPro` | 字段已有，`useIsPro` 已是严格布尔。设置页完全不显示。见 §5.1、§5.3 | 需新增前端组装（无新数据） |
| 订阅 · 全 app 权益文案同一来源 | 布尔来源已经是这一个字段。总览、训练首页、学院/商店横幅、比赛日锁卡用四套句子；读失败时只有比赛日单独说「无法确认」。见 §5.4 | 需新增前端组装（无新数据）。不需要新字段 |
| 偏好 · 语言 | 已读写 `settings/main.language`，默认中文。见 §6.1 | 已有数据与能力支撑 |
| 偏好 · 家长 PIN | 只有一句「尚未实现」。DR-011 选项 A 已批。无输入、无校验、无 `parentPinHash` 写入。见 §6.2 | **缺能力。** 缺的是设 PIN、只存哈希、以及跨设备校验的流程。类型上有 `parentPinHash`，应用从未写入。影响偏好组的家长 PIN |

**缺能力：4 条**（修改密码、编辑并保存运动员资料、切换当前运动员、家长 PIN）。

---

## 9. 未验证

这些要写入或要打开线上会话才能看见。本步没有做，下面都不猜结果。

1. 线上 `/settings` 的实际画面（已注册、匿名、加载、错误、窄屏）。冷打开会匿名登录，并可能创建 `settings/main` 等默认文档，所以没有打开生产站，也没有打开带着 `.env.local` 的本地 dev。
2. 点「绑定账户」「登录」「退出登录」，包括退出后是否马上变成新的匿名 uid，以及旧访客数据是否还在。
3. 点语言单选后，文档里的 `language` 和 `updatedAt` 是否如代码所写，以及断网时先变语言、再失败提示，是否在真机上发生。
4. 已有账号的 `settings/main` 里 `isPro`、`parentPinEnabled`、`parentPinHash`、`theme`、`activeAthleteId` 的实际取值。没有读生产库。
5. 总览方案卡、训练首页、学院、商店、比赛日视频/总结，在同一次 `isPro` 读失败时并排长什么样。§5.4 是代码结论。
6. 定版视觉稿的逐项控件。稿不在本仓库，缺口表只覆盖本任务点名的条目。
