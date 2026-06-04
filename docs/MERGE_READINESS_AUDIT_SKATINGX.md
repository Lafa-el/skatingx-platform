# MERGE_READINESS_AUDIT_SKATINGX.md

**审计日期：** 2026-06-03  
**审计范围：** `blaze-skate-training`、`blaze-skate-analysis`、`skatingx-platform`  
**审计目标：** 评估 Training 与 Analysis 是否可合并为统一 SkatingX Platform  
**约束：** 仅代码检视，未修改、创建、删除或移动任何文件（审计阶段）；本文件为审计交付物存档。

---

## 执行摘要

| 维度 | 结论 |
|------|------|
| **合并就绪度** | **有条件就绪（约 55/100）** — 可合并，但**不能**直接拼接代码或共用现有 Firestore 数据 |
| **推荐策略** | **选项 B：迁移至新 `skatingx-platform` 壳层**（非全量重写，非无 schema 的软合并） |
| **最大阻塞项** | Firebase 项目/`appId`/档案模型不一致；双单体文件（3834 + 3570 行）；积分与任务双轨 |
| **`skatingx-platform`** | 空目录，无 Git、无源码 — 仅 VS Code 工作区占位 |
| **当前 AI** | Analysis 有 **MediaPipe 边缘姿态分析**；**无** LLM / AI Coach API |

**一句话：** 产品域高度相关，工程上为零共享；合并价值高，必须先做平台壳 + 数据模型统一，再迁模块。

---

## 1. 项目结构

### 1.1 `blaze-skate-training`

| 项 | 详情 |
|----|------|
| **形态** | 单包 SPA，非 monorepo |
| **源文件规模** | ~43 个跟踪文件；`src/App.jsx` **3834 行** |
| **入口** | `index.html` → `src/main.jsx` → `App.jsx` |
| **路由** | **无 URL 路由**；`activeTab`：`dashboard` \| `tasks` \| `academy` \| `data` \| `shop` |
| **构建** | Vite 8 + `@vitejs/plugin-react`；`npm run build` → `dist/` |
| **框架** | React 19 |
| **包管理** | npm（`package-lock.json`） |
| **语言** | JavaScript（JSX），无 TypeScript 业务代码 |
| **Git** | `origin` → `https://github.com/lafa-el/blaze-skate.git`；最近提交：`fa2e477 Firebase 离线缓存` |

```
blaze-skate-training/
├── index.html          # PWA 壳、启动屏、blaze_lang 预读
├── src/
│   ├── main.jsx
│   ├── App.jsx         # 全部业务
│   ├── index.css       # Tailwind
│   └── App.css         # 存在，主逻辑不依赖拆分
├── public/             # favicon.svg, icons.svg（无 logo.png）
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
└── package.json        # name: "blaze-skate"
```

### 1.2 `blaze-skate-analysis`

| 项 | 详情 |
|----|------|
| **形态** | 静态单页应用，无 `src/` |
| **源文件规模** | ~38 个跟踪文件；`index.html` **3570 行** |
| **入口** | `index.html`（内联 CSS + 多段 script） |
| **路由** | **无 URL 路由**；`switchTab()`：`biomechanics` \| `pacing` \| `planning` \| `equipment` |
| **构建** | `npm run build` 仅生成 `firebase-config.js`；应用本身不打包 |
| **框架** | 原生 DOM + CDN |
| **包管理** | npm（无 runtime dependencies） |
| **语言** | JavaScript（内联），无 TypeScript |
| **部署** | Vercel（`vercel.json`） |
| **Git** | `origin` → `https://github.com/lafa-el/blaze-skate-analysis.git`；最近提交：`13eb214 Improve light mode UI styling` |

```
blaze-skate-analysis/
├── index.html                    # 全应用
├── scripts/generate-firebase-config.mjs
├── firebase-config.sample.js
├── firestore.rules
├── vercel.json
├── site.webmanifest
└── assets/                       # SVG 品牌资源
```

### 1.3 `skatingx-platform`

| 项 | 详情 |
|----|------|
| **文件数** | **0**（审计时）；本 `docs/` 目录为首次平台交付物 |
| **Git** | 无（建议初始化） |
| **作用** | `SKATINGX.code-workspace` 第三根目录，意图为统一平台 |

### 1.4 结构对比小结

| 对比项 | Training | Analysis | Platform |
|--------|----------|----------|----------|
| 模块化 | 单文件单体 | 单文件单体 | 待建 |
| 入口数量 | 1（React） | 1（HTML） | — |
| URL 路由 | 无 | 无 | 待建 |
| 构建产物 | Vite bundle | 静态根目录 + 生成 JS | — |
| TS | 否 | 否 | 建议引入 |

---

## 2. 技术栈对比

| 维度 | blaze-skate-training | blaze-skate-analysis |
|------|------------------------|----------------------|
| **UI 框架** | React 19 | Vanilla JS |
| **构建** | Vite 8 | 无 bundler（CDN） |
| **Next.js** | 否 | 否 |
| **样式** | Tailwind 3（PostCSS 构建） | Tailwind CDN + 大量内联 CSS |
| **图标** | lucide-react | Font Awesome 6 |
| **图表** | 内联 SVG | Chart.js（CDN） |
| **状态管理** | `useState` / `useEffect` | `window.*` 全局 + DOM |
| **API 调用** | 无 HTTP API；仅 Firebase SDK | 同左 |
| **Firebase SDK** | npm `firebase ^12.13.0` | CDN ESM `firebasejs/11.6.1` |
| **离线** | Firestore IndexedDB persistence | 无显式 persistence |
| **AI / ML** | 无 | **MediaPipe Pose**（浏览器内，视频不上传） |
| **LLM / AI Coach** | **无** | **无** |
| **CI** | 无 | 无（仅 Vercel 构建） |
| **测试** | 无 | 无 |
| **i18n** | zh / en 完整 | 主要为 zh-CN |

---

## 3. Firebase 审计

### 3.1 初始化与配置

| 项目 | Training | Analysis |
|------|----------|----------|
| **初始化位置** | `src/App.jsx` L57–68 | `index.html` ES module ~L1600+ |
| **配置来源** | **硬编码**于源码 | **构建时** `VITE_FIREBASE_*` → `firebase-config.js` |
| **示例/模板** | 无 | `firebase-config.sample.js` |
| **GCP 项目（可见）** | `blaze-skate-training-platform` | 由环境变量决定（仓库内未知） |
| **逻辑 appId** | `blaze-skate-production`（`safeAppId`） | 默认 `blaze-skate-academy`（可 `__app_id` 覆盖） |
| **Storage** | `storageBucket` 在 config 中，**未使用** `getStorage` | 未使用 |
| **Functions** | 无 | 无 |
| **Hosting 配置** | 仓库内无 | Vercel，非 Firebase Hosting |

**硬编码（Training，`App.jsx`）：** `apiKey`、`authDomain`、`projectId`、`storageBucket`、`messagingSenderId`、`appId` 均明文 — 合并前必须改为环境变量注入。

**环境变量（Analysis）：**

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

**沙箱全局（Analysis）：** `__firebase_config`、`__app_id`、`__initial_auth_token`

### 3.2 Auth

| 能力 | Training | Analysis |
|------|----------|----------|
| 默认登录 | `signInAnonymously` | `signInAnonymously` |
| 账号升级 | `linkWithCredential`（邮箱密码） | 无 |
| 已有账号登录 | `signInWithEmailAndPassword`（覆盖本地） | 无 |
| 登出 | `signOut` + 整页刷新 | 未强调 |
| 特殊 | — | `signInWithCustomToken`（`__initial_auth_token`） |

**合并风险：** 统一平台需同时支持家庭邮箱绑定与 Lab 自定义令牌（教练/嵌入场景）。

### 3.3 Firestore 集合/路径（实际为 artifacts 模式，非顶层 collection 名）

**Training** — `artifacts/blaze-skate-production/users/{uid}/profile/main`（单文档存全状态）

**Analysis** — `artifacts/{appId}/users/{uid}/` 下：

| 路径 | 类型 | 用途 |
|------|------|------|
| `profile/lindsay` | 固定文档 | 运动员档案、积分 |
| `completedTasks/{taskId}` | 子集合 | 计划打卡 |
| `equipmentRecords/{autoId}` | 子集合 | 器材调试记录 |

### 3.4 Security Rules

| 项目 | 状态 |
|------|------|
| **Analysis** | `firestore.rules`：`artifacts/{appId}/users/{userId}/**` → `auth.uid == userId` |
| **Training** | **仓库内无 rules** |
| **Firebase CLI** | 两仓库均无 `firebase.json` / `.firebaserc` |

### 3.5 同步模式对比

| 操作 | Training | Analysis |
|------|----------|----------|
| 读 | `onSnapshot(profile/main)` | `onSnapshot` profile + completedTasks + equipment |
| 写 | `setDoc(merge)` 整包 JSON | `setDoc`、`addDoc`、`runTransaction`+`increment` |
| 事务 | 无 | 任务打卡 + 积分原子更新 |

### 3.6 Firebase 审计结论

- **不能**假设两应用已共用同一 Firebase 项目或数据树。
- 合并前必须：**选定单一 GCP 项目**、统一 `appId`、迁移脚本、统一 rules 至 platform 仓库。
- 修复 Analysis 器材查询：`orderBy('createdAt')` 与写入 `savedAt` 不一致（合并后历史排序风险）。

---

## 4. 功能清单

### 4.1 `blaze-skate-training`

| 类别 | 功能 | 实现要点 |
|------|------|----------|
| **训练计划** | 每日任务清单 | `tasks[]`，模板任务，跨日清空 + `taskHistory` 快照 |
| | 一周训练模板 | `weeklyTemplate`（0–6 中文标签） |
| | BLAZE Academy | 内嵌 `BLAZE_ACADEMY`（4–6 / 7–10 / 11–16 岁，zh/en）；PRO 可导入到今日任务 |
| **XP / 积分 / 奖励** | 积分 | `points`，完成任务加分（`pointsPerTask`、`dailyBonusPoints`） |
| | 连续打卡 | `completedDays[]` + 连续天数计算 |
| | 积分商店 | `customRewards[]`、`rewardHistory[]` 兑换 |
| | PRO | `isPro` 手动解锁（文案：微信 + UID，无支付 SDK） |
| **运动员档案** | 用户名、头像（JPEG data URL 存 Firestore） | `username`、`avatar` |
| | 家长锁 | `parentPin` + PRO |
| **日历 / 进度** | 任务历史日历 | `taskHistory[YYYY-MM-DD]` |
| | 比赛倒计时 | `races[]` |
| | 成绩数据 | `records*` 多距离 PB（秒） |
| **Firebase** | Auth + Firestore 单文档同步 | 离线 persistence |
| **未具备** | 视频分析、器材、LLM 教练、URL 分享报告 | — |

### 4.2 `blaze-skate-analysis`

| 类别 | 功能 | 实现要点 |
|------|------|----------|
| **视频** | 本地上传 | `<input type="file">` → `URL.createObjectURL`；**不上传云端** |
| **分析工作流** | 生物力学实验室 | MediaPipe Pose；裁剪跟踪；滚转校正；支撑腿判定；关键帧采样（最多 10 帧，会话内） |
| **技术评分** | 支撑腿启发式评分 | `scoreSupportLeg` / `pickSupportLeg`；HUD：倾角、膝屈、骨盆高度、踝恢复等 |
| **配速分析** | Junior D 500/777/1000m | 分段输入 vs 标杆；乳酸衰减指数（启发式，非真实乳酸） |
| **报告** | 叙事反馈 + Chart.js 曲线 | 无 PDF/无持久化报告文档 |
| **计划 / 积分** | `plansDatabase` 三类周模板 | `checkTask` → Firestore 事务 |
| **器材** | 症状模板、rocker/offset/bend、A/B 对比 | Firestore + localStorage 降级 |
| **运动员** | **硬编码 Lindsay** | `lindsayBirthDate`、`profile/lindsay` |
| **Firebase** | Auth + 多集合 | 无离线 persistence 配置 |
| **AI** | MediaPipe only | **无 generative AI** |

---

## 5. 数据模型对比

### 5.1 Firestore 实体关系（目标理解）

```
Training:  artifacts/blaze-skate-production/users/{uid}/profile/main  (单文档全状态)

Analysis:  artifacts/blaze-skate-academy/users/{uid}/
             ├── profile/lindsay
             ├── completedTasks/{taskId}
             └── equipmentRecords/{autoId}
```

### 5.2 本地存储

| Key | 项目 | 内容 |
|-----|------|------|
| `blaze_lang` | Training | 语言缓存 zh/en |
| `blaze-theme-mode` | Analysis | auto/light/dark |
| `blaze-equipment-history-v1` | Analysis | 器材历史最多 30 条（Firebase 不可用时的降级） |

### 5.3 ID 与模型对照

| 概念 | Training | Analysis | 共享？ |
|------|----------|----------|--------|
| **userId** | Firebase Auth `uid` | 同 | 同 Auth 项目时可共用 |
| **athleteId** | **无**；仅 `username` 字符串 | **隐式** `lindsay` 固定 profile 文档名 | **缺失统一 athleteId** |
| **训练会话** | 无独立 session 实体；任务在 `tasks[]` / `taskHistory` | `completedTasks` 按 `taskId` | 模型不同 |
| **分析结果** | 无 | `keyframeSamples[]` 仅内存；配速无持久化 | 无共享 schema |
| **积分** | `profile/main.points` | `profile/lindsay.points` + 事务增量 | **重复计数风险** |
| **时间成绩** | Firestore `records*` | UI 临时计算 | **未联通** |

### 5.4 缺失的共享标识（合并前必须补齐）

1. **`athleteId`** — 多子女 / 多运动员扩展
2. **`sessionId`** — 单次训练或分析会话
3. **`analysisTagId`** — 生物力学/配速结论的结构化标签
4. **`planId` / `contentVersion`** — Academy 与 `plansDatabase` 内容溯源
5. **`platformAppId`** — 统一 `artifacts/skatingx-production/...`

---

## 6. 合并风险

### 6.1 风险矩阵

| 严重度 | 领域 | 具体问题 |
|--------|------|----------|
| **阻断** | Firebase | 不同 GCP 项目 + 不同 `appId` + 不同 profile 文档结构 |
| **阻断** | 数据 schema | 单文档 blob vs 子集合；积分双写逻辑冲突 |
| **高** | 代码结构 | 双单体 7400+ 行；React vs CDN 无法直接 merge |
| **高** | 包版本 | Firebase 12 vs 11；Tailwind 构建 vs CDN |
| **高** | Auth | 邮箱绑定 vs custom token |
| **高** | 部署 | Training 未定义 CI/CD；Analysis 依赖 Vercel env |
| **中** | 路由 | 合并后需新 URL 体系，旧书签失效 |
| **中** | UI | 浅色家庭风 vs 深色 Lab 风；组件零共享 |
| **中** | 命名 | 文件夹 `blaze-skate-training` / 包名 `blaze-skate` / 远程 `blaze-skate.git` |
| **中** | 内容 | `BLAZE_ACADEMY` vs `plansDatabase` 双源课程 |
| **低** | localStorage | `blaze_*` 键前缀冲突（同域时） |
| **低** | 资源 | Training 缺 `/logo.png`；Analysis manifest 引用缺失 PNG |

### 6.2 路由冲突（合并后）

| 现有（内存 Tab） | 建议统一路径 | 冲突说明 |
|----------------|--------------|----------|
| dashboard/tasks/academy/data/shop | `/training/*` | 需 React Router 新建 |
| biomechanics/pacing/planning/equipment | `/analysis/*` | MediaPipe 包体积需 code-split |

### 6.3 合并就绪评分

| 子项 | 分数 (0–10) | 说明 |
|------|-------------|------|
| 产品域一致性 | 8 | 同品牌、同运动项目、重叠距离/积分 |
| 代码可合并性 | 2 | 零共享模块 |
| 数据可合并性 | 3 | 需迁移与 schema 设计 |
| 运维成熟度 | 4 | Analysis 有 Vercel；Training 无 |
| 测试/类型安全 | 1 | 无测试、无 TS |
| **综合** | **~5.5/10** | **有条件就绪** |

---

## 7. 推荐合并策略

### 选项对比

| 选项 | 描述 | 优点 | 缺点 | 风险 |
|------|------|------|------|------|
| **A：软合并 + 共享导航** | 两应用独立部署，顶部互链 | 最快上线 | **不解决** 数据分裂、双 Firebase、双积分；技术债加倍 | **高** |
| **B：迁移至 `skatingx-platform`** | Monorepo：`apps/training` + `apps/lab` + `packages/*` | 保留业务逻辑；可渐进拆文件；统一 schema | 需迁移与 Vite 化 Lab | **中（推荐）** |
| **C：全量重写** | 新栈重做全部功能 | 架构最干净 | 周期长、回归风险大、浪费已有 7000+ 行领域逻辑 | **高** |

### 推荐：**选项 B（迁移式平台化）**

**理由：**

1. 两应用均已可运行，含完整领域规则（计时、Academy、MediaPipe、Junior D、器材）。
2. 全量重写（C）在无测试覆盖下回归成本极高。
3. 软合并（A）不统一 Firebase，**积分与训练记录将永久分裂**。
4. `skatingx-platform` 已预留工作区根，天然适合 B。

**不推荐 A 作为终态；C 仅当 B 迁移后发现单体不可拆时再局部重写。**

---

## 8. 提议的 SkatingX 架构

### 8.1 路由与产品地图

| 路径 | 职责 | 来源映射 |
|------|------|----------|
| **`/dashboard`** | 今日概览：任务完成率、连续打卡、最近分析标签、下一场比赛 | Training Dashboard + Lab 摘要卡片 |
| **`/training`** | 任务、Academy、商店、周模板 | Training tabs |
| **`/training/records`** | PB 成绩录入与图表 | Training Data |
| **`/analysis`** | 子路由：`biomechanics` \| `pacing` \| `equipment` | Lab 前三 Tab |
| **`/analysis/planning`** | 可选：并入 `/training/plan` 或保留教练视图 | Lab planning |
| **`/athlete`** | 多运动员档案、出生日期、组别、头像 | 新建 + 吸收 `profile/lindsay` |
| **`/ai-coach`** | LLM 层 + 规则引擎；读取 analysisTags 生成建议 | **新建**（当前不存在） |
| **`/settings`** | 语言、主题、家长锁、PRO、账号绑定、Firebase 状态 | Training Settings + Lab 主题 |

### 8.2 共享 `athleteId` 模型（提议）

```
athleteId: string          // 例: "lindsay" | uuid
userId: string             // Firebase Auth uid（家长账号）
displayName: string
birthDate: string          // ISO date
skatingDivision: string    // 由 birthDate 计算，如 Junior D
avatarUrl?: string         // 建议 Storage URL，避免 Firestore 大 blob
activeAthleteId: string    // 存在 users/{uid}/settings/main
```

**迁移：** `profile/lindsay` → `athletes/lindsay`；Training 单用户默认 `athletes/default` 或首个子女 ID。

### 8.3 共享 Firestore 布局（目标态）

```
artifacts/skatingx-production/users/{userId}/
├── settings/main              # language, theme, parentPin, isPro, activeAthleteId
├── athletes/{athleteId}/
│   ├── profile                # name, birthDate, division
│   ├── gamification           # points, completedDays, pointsPerTask
│   ├── tasks/current          # 或 tasks 子集合
│   ├── taskHistory/{date}     # 可选子集合替代大 map
│   ├── records/{distance}     # 500m, 777m, ...
│   ├── completedTasks/{id}    # 来自 Lab
│   ├── equipmentRecords/{id}
│   └── analysisSessions/{sessionId}
│       ├── summary            # tags[], scores, createdAt
│       └── keyframes/{id}     # 可选；大对象放 Storage
```

### 8.4 共享 AI Coach 层

| 层级 | 职责 | 技术建议 |
|------|------|----------|
| **L0 规则** | 已有启发式：支撑腿分、乳酸衰减指数、器材 ruleHints | `packages/skating-domain` |
| **L1 标签** | 将 L0 输出规范为 `analysisTag[]` | 例：`high_late_decay`、`left_support_weak` |
| **L2 LLM** | `/ai-coach`：根据 tags + 周计划 + 年龄组生成建议 | Firebase Callable 或 Vercel Edge |
| **L3 反馈闭环** | 用户采纳建议 → 写入 `training/tasks` 或 `weeklyTemplate` | UX「应用到今日训练」 |

**当前状态：** 仅 L0 部分存在于 Analysis；**L1–L3 均需新建**。

### 8.5 Analysis Tags → Training 推荐（逻辑）

| 示例 Tag | 训练侧动作 |
|----------|------------|
| `pace_late_decay_high` | 增加耐力日比例；推荐 endurance 模板或 Academy 耐力模块 |
| `support_leg_left_weak` | 插入单腿平衡、侧向力量任务 |
| `symptom_slide_instability` | 关联器材记录 + 技术冰任务；**不**自动改刀 |
| `equipment_rocker_adjusted` | 仅记录；3 天后提醒复测生物力学 |

---

## 9. 实施路线图

| 阶段 | 名称 | 交付物 |
|------|------|--------|
| **Phase 1** | 审计与备份 | 本文档；Firebase 导出；环境变量清单 |
| **Phase 2** | 创建 SkatingX Shell | Git 初始化；pnpm workspace；React Router 壳 |
| **Phase 3** | 迁移 Training 模块 | 拆分 `App.jsx`；环境变量 Firebase；`athleteId` |
| **Phase 4** | 迁移 Analysis 模块 | Vite 化；MediaPipe chunk；`/analysis/*` |
| **Phase 5** | 统一 Firebase | 单一 GCP 项目；rules；迁移脚本 |
| **Phase 6** | Tags → 训练计划 | `analysisTags`；规则引擎；Dashboard 建议 |
| **Phase 7** | Vercel 部署 | 预览环境；env 同步；域名 |

**Phase 1 检查清单：**

- [ ] 导出 `blaze-skate-training-platform` Firestore
- [ ] 记录 Analysis 生产 `VITE_FIREBASE_PROJECT_ID`
- [ ] 确认 Lindsay 生产数据路径与文档数
- [ ] 锁定统一域名与品牌命名（SkatingX vs BLAZE）

**预估工期（粗估，1 名全职）：** Phase 1–2：1–2 周；Phase 3–5：4–8 周；Phase 6–7：2–4 周。

---

## 10. 最终结论

### 能否合并？

**能，但属于「平台迁移型合并」，而非「仓库合并型合并」。**

### 合并前必须完成的先决条件

1. 选定**单一 Firebase 项目**与统一 `artifacts/skatingx-production`。
2. 定义并迁移 **`athleteId`** 与运动员子文档结构。
3. 统一 **积分与任务** 模型（建议保留 Analysis 的 `runTransaction` 模式用于打卡）。
4. 将 Analysis 从 CDN 单体迁入 **Vite + React**（或 ESM 模块化）并与 Training 共用 Firebase 12。
5. Training Firebase 配置**移出源码硬编码**。
6. 在 platform 仓库托管 **唯一** `firestore.rules`。

---

## 附录：快速对照表

| 项目 | Training | Analysis | Platform |
|------|----------|----------|----------|
| 行数（核心文件） | 3834 | 3570 | — |
| React | ✅ | ❌ | 待建 |
| Vite 应用构建 | ✅ | ❌ | 待建 |
| Firebase 12 | ✅ | ❌ (11) | — |
| Firestore rules 在库 | ❌ | ✅ | 应收拢 |
| MediaPipe | ❌ | ✅ | `apps/lab` |
| AI Coach LLM | ❌ | ❌ | 新建 |
| 多运动员 | 弱 | 单 Lindsay | 需 `athleteId` |

---

*文档路径：`skatingx-platform/docs/MERGE_READINESS_AUDIT_SKATINGX.md`*
