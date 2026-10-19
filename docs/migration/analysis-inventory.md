# M1 盘点报告 — 旧分析站 analysis.blazeskate.com

日期：2026-10-18
状态：评审通过（2026-10-18，有条件；条件已写入「评审结论」）。可以进入 M2。
本文件路径：`docs/migration/analysis-inventory.md`（按开工包单文件输出。AGENTS.md 还要求 `docs/migration/<module>/inventory.md` 等四件套；其余三件在 M2 契约阶段补，不在本次静默改口径。）

对照来源：

1. 用户走查稿《M1-analysis-inventory.md》（浏览器只读，未登录、未上传视频）。
2. 线上 `GET https://analysis.blazeskate.com/`（2026-10-18）。
3. 只读对照 legacy 仓库 `blaze-skate-analysis` HEAD `1242226`（2026-06-23）。**未修改 legacy 仓库。**

证据方法（网络层）：

| 方法 | 结果 |
|---|---|
| 拉线上 HTML / 第一方 JS / `firebase-config.js` / PWA 图标，算 SHA-1 | 见 §8.1 |
| 把 `git archive HEAD` 拷到仓库外临时目录，跑 `vite build`，与线上 JS/HTML 逐字节比对 | **一致**（见 §8.1）。因此 `index.html` + `src/` 可作为线上行为的可信源码。 |
| 对未 pin 的 CDN URL 做 `HEAD`/`GET`，读 `x-jsd-version` / 302 Location | 见 §8.2；版本是 2026-10-18 的瞬时解析，**未 pin，会漂**。 |
| 打开线上页做 DevTools Network / Console | **未做。** 浏览器自动化被拒绝；用真实浏览器打开线上页会触发匿名 Auth 写入（见 §8.5），M1 不额外制造账号。 |
| 上传视频触发 Pose | **未做。** 中途取消 / 无人 / 多人 / 低帧率只做代码级结论（§8.7）。 |

未写入本文的内容：Firebase `apiKey` / `appId` / `messagingSenderId`、任何用户数据、任何视频。

## 评审结论（2026-10-18，owner）

方法成立：线上构建与 `blaze-skate-analysis` HEAD `1242226` 逐字节相同，源码可以当行为依据。下列四条是合并条件，覆盖走查稿和 2026-10-12 评审里写错或作废的说法。

| # | 纠正 | 以什么为准 |
|---|---|---|
| 1 | `/` 四页签之外，`/analysis` 还有一套 TypeScript 表面（手动 finding 表单；Videos、Settings 是空页）。不是「只有一份 vanilla SPA」。 | §0.1 |
| 2 | Firebase GCP 项目是 **`blaze-skate-analysis`**。`blaze-skate-academy` 只是 Firestore 路径前缀 `artifacts/{appId}`。10/12 评审把项目 ID 写成 academy，是错的。 | §8.5 |
| 3 | `modelComplexity: 1` 用的是 **full** 模型 `pose_landmark_full.tflite`（约 6.4 MB），不是 lite，也不是 heavy。 | §8.3 |
| 4 | idle 文案「正在预热模型...」**作废，不算缺陷**。走查约 8 分钟未就绪，是因为没上传视频、warmup 根本没开始。`initPoseModel()` 只在点击「启动 Edge 视觉引擎分析」之后运行。 | §5.2 |

不挡 M2 的 unverified：加载期控制台（§8.6）、线上已部署的 Security Rules 是否等于仓库 `firestore.rules`（§8.5）。

M2 ADR 按这次评审写死：

- 移植基准是 **`/` 四页签 vanilla 应用**。
- `/analysis` 那套（手动 finding、空 Videos/Settings）**倾向搁置**。ADR 写清搁置理由，不把两套表面合成一个产品。
- Vanilla 三路 `onSnapshot`（`profile/lindsay`、`completedTasks`、`equipmentRecords`）没有 unsubscribe。M2 移植时补上，不原样留下。

---

## 0. 站点基本信息

- URL：https://analysis.blazeskate.com/
- 标题：BLAZE SKATE LAB / SPEED SKATING ANALYTICS SYSTEM
- 部署：Vercel 静态站（`vercel.json`：`outputDirectory: dist`，`cleanUrls`，`/analysis` 与 `/analysis/:path*` rewrite 到 `/`）
- 线上 HTML `Last-Modified`：Fri, 16 Oct 2026 14:39:19 GMT（Vercel 缓存头；内容仍等于 HEAD `1242226` 的构建产物）

走查稿写「单 HTML 的 vanilla-JS SPA」。这只覆盖用户实际打开的 `/` 四页签。线上同一份 HTML 还挂着一套 TypeScript「Analysis V1」应用，路径是 `/analysis…`。两套共用一份构建产物、同一个 Firebase 项目，**不是** 2026-06-03 `docs/architecture-audit.md` 所描述的「无 Vite、无 `src/`、无 TypeScript」单文件站。该审计已过期，M2 不要当现状。

### 0.1 两条用户可见表面

| 表面 | 入口 | 用户能看见什么 | 语言 | Firebase |
|---|---|---|---|---|
| **Vanilla 四页签**（走查走过的产品） | `https://analysis.blazeskate.com/` | 生物力学 LIVE / 配速 / 阶段训练规划 / 器材 | 中文单语，无语言开关 | 页面加载即匿名登录；SDK 为 gstatic Firebase **11.6.1** |
| **Analysis V1（TS）** | `https://analysis.blazeskate.com/analysis` 及子路径；PWA `start_url` 也是 `/analysis` | Dashboard / Sessions / 手动 Findings / Pace 表单 / Equipment snapshot / Report；Videos 与 Settings 是空状态页 | `en` / `zh` 切换，字典在 `src/pages/analysis/i18n.ts` | 仅在 `/analysis…` 路由由 npm `firebase` **12.15.0** 初始化；Vanilla 同步模块在该路径上被关掉 |

Vanilla 四页签才是执行计划 §0「四个页签平移」的对象。TS 应用是平行的未完成工作流：生物力学页是**手动 finding 表单**，不跑 MediaPipe；`VideoLibraryPage` / `VideoDetailPage` / `AnalysisSettingsPage` 只有空状态；`createAnalysisVideo` 无 UI 调用。M2 必须明确：TS 的类型与集合是复用还是搁置，**不得把两套表面当成同一产品静默合并**。

### 0.2 与走查稿 §0 的勘误

- 第一方资源不只图标。完整清单见 §8.1。
- 头像仍走 `placehold.co`（走查正确）。
- 「无登录」指没有邮箱/密码/Google 按钮；后台在 `/` 上会 `signInAnonymously`（走查见到「物理同步」变绿，与此一致）。

---

## 1. 页签一 — 生物力学实验室 LIVE

（走查原文，行为基线。仅 `/` Vanilla 表面。）

输入：

- 视频上传区（文案「点击上传测试视频 / AI 引擎将使用本地算力进行解析」）；无视频时分析按钮禁用，文案为「请先上传视频」。
- 镜头偏航/翻滚矫正 (Roll) 滑杆：0.0°，最大纠偏 ±15°。
- 相机标定开关：默认勾选；「启用智能重力水平网格」开关：默认关闭。

输出：

- 左侧 Console 三行：模型状态 / 标定纠错：3D Normal Projection Active / 物理同步。
- 右侧主面板 idle 态：「AI 动作实验室休眠中」，关键帧诊断区无可见 canvas。
- 内嵌控制台显示「模型状态：正在预热模型...」，走查约 8 分钟始终未变为就绪。代码级原因见 §5.2 / §8.3：`initPoseModel()` **只在用户点击「启动 Edge 视觉引擎分析」之后才调用**；未上传视频时这行只是 HTML 默认文案，并不是一次卡住的 WASM 下载。**2026-10-18 评审：这条现象作废。**

---

## 2. 页签二 — 智能配速优化（乳酸衰减分析）

输入：

- 距离按钮：500m / 777m / 1000m（Junior D；500m 记录起跑前半圈，777m/1000m 从起跑圈开始）。
- 5 个分段输入：起跑前半圈、Lap 1~Lap 4（秒）。
- JUNIOR D 标准编辑：5 个可改标杆值（默认 7.05 / 9.10 / 9.42 / 9.85 / 10.30）+ 「恢复默认标准」。
- 「生成配速衰减曲线」按钮。

输出（以默认标杆实测）：

- 「500m 配速标杆比对」面积折线图：US Junior D（11-12 岁赛季冰龄标杆）vs Lindsay 的测算配速。**Chart.js 已使用**，见 §8.4。
- 节奏稳定指数 100%、配速评级「优秀」、推荐训练侧重 60:40、配速衰减归因报告（总成绩 45.72s、后段衰减 8.8% 等文本正常生成）。

---

## 3. 页签三 — 阶段训练规划（自适应课表）

输入：「本周训练侧重」三选项：技术基础与弯道控制 / 速度窗口与500m配速 / 比赛周与恢复管理。
输出：「第 1 周周期微循环」7 张日卡（周一~周日），每卡含训练内容、强度标签（高/中/低）、时长（冰前 30min + 上冰 60min 等）、积分徽标（+30/+20/+15/+10）、「打卡同步」按钮；底部「本周已打卡积分：0」。设计依据：USOPC ADM、加拿大 LTPAD/NCCP、中韩公开青少年速滑训练资料。
（走查未点击打卡。代码会在已连接时对 `completedTasks/{taskId}` 做事务写入，并 `increment` `profile/lindsay.points`。）

按执行计划 §0：本页签 **不迁入分析模块**，M2 契约以训练模块为宿主；打卡积分走训练体系（DR-004）。

---

## 4. 页签四 — 器材智能调校（底盘诊断）

输入：

- 症状 textarea + 6 快捷症状按钮（弯道咬冰不足 / Boot out/鞋帮蹭冰 / 直道稳定性差 / 脚踝压力或酸痛 / 出弯推蹬释放不顺 / 左右脚感觉不一致）。
- 运动员体重 (kg)、身高 (cm)、刀长 (inch)、项目类型（短道速滑 / Short Track）。
- 左/右脚 Radius/Rocker 各 21 个读数框（-10~+10，以 Marchese Gauge 表盘读数记录，中心 0 为基准；±9、±10 可选填）。
- 左/右脚 Front/Rear Offset 共 4 框（记录「内侧/外侧 + mm」）。
- Bend 头段/中段/后段 3 框（表盘读数简写，如「18」=0.0018 inch）。
- 本次记录类型下拉（记录未调整 / 重磨 Radius/Rocker / 调整 Offset / 调整 Bend / 换刀 / 换鞋 / 综合调整）。
- 上冰反馈评级下拉（未上冰验证 / 明显改善 / 小幅改善 / 无明显变化 / 变差，需要回退）。
- 调整备注 textarea。

输出流程：

- 「生成清单」 → 「器材记录与复核清单」。
- 「保存记录」在清单生成前禁用，生成后启用；成功文案「已保存到云端器材档案」。同步的是表单数据，与视频无关。云端集合见 §8.5。本机还有 `localStorage` 键 `blaze-equipment-history-v1`（最多 30 条）作离线兜底。
- 器材历史档案：对比记录 A/B 两个下拉 + 「生成对比」；A/B 选同一条记录时提示「请选择两条不同的历史记录进行对比」。

---

## 5. Quirks 与缺陷（基线行为，移植时保留或修，须经评审决定）

1. **「删除记录」按钮走查失效**：点击两次均无确认框、记录仍在。源码里函数和委托监听是存在的（`deleteEquipmentRecord` + `#equipHistoryList` 上 `event.target.closest('[data-delete-equipment-id]')`，确认文案「确定删除这条器材历史记录吗？」）。走查看不到确认框，更像点击目标不是 Element（例如点到按钮内文本节点时 `closest` 抛错）或云端重绘后未点到按钮，而不是功能被删掉。M4 不得在无决定的情况下「顺便修好」。走查留下的 10/18 测试记录见 §9。
2. **idle 文案「正在预热模型...」作废（2026-10-18 评审）**：这不是缺陷。默认 HTML 就是这句；`initPoseModel()` 只在分析按钮点击后运行。走查未上传视频，WASM/tflite **从未开始下载**。模型能否跑完一次分析仍 **unverified**（未上传视频），但「预热停滞 8 分钟」不再进入 quirks 基线。
3. 数字输入框 DOM 值为 float32 精度伪影（如 7.050000190734863），显示层四舍五入为 7.05。
4. 无视频时分析按钮禁用、右侧保持休眠提示，无报错。中途取消 / 无人 / 多人 / 低帧率的代码级处理见 §8.7。
5. 头像依赖第三方 `placehold.co`（运行时外部图片，迁移时去掉）。

---

## 6. 视频上传结论

**无任何视频文件上传到服务器。** 叠加证据：

| 证据 | 状态 |
|---|---|
| 页面文案声明本地解析、视频无需上传 | verified（走查 + HTML） |
| Vanilla 使用 `URL.createObjectURL(file)` 赋给 `<video>`；重置时 `revokeObjectURL` | verified（`index.html`） |
| 源码与 743 KB bundle 中 **没有** `getStorage` / `uploadBytes` / `firebase/storage` | verified |
| `AnalysisVideo.storagePath` 类型字段存在，但 UI **从不调用** `createAnalysisVideo` | verified（`src/pages` 零引用） |
| 器材保存写入的是表单字段，不是视频字节 | verified |
| 线上 Network 瀑布未抓 | unverified（工具边界；不否定上面的源码结论） |

SkatingX 规范「视频不上传」与现状一致。类型里的 `storagePath` 是预留，不是现行上传通道。M2 不要把它做成新的上传口。

---

## 7. i18n 结论

**Vanilla `/` 四页签：中文单语，无语言开关**（页眉仅「自动 / 日间」主题按钮与用户徽标）。英文只作为术语内嵌（BLAZE SKATE LAB / LIVE / TARGET: US Junior D / Lap 1 (s) / Console / Boot out / Radius / Rocker / Marchese / Offset / Bend / EQUIPMENT LOG 等）。

**`/analysis` TS 应用：已有 `en`/`zh` 字典和语言按钮**（`blaze-analysis-language`）。这套文案是 Analysis V1 工作流的，不是四页签的英译。

→ M2：四页签英文文案仍须 **新建并评审**；不得把 TS 字典误当成四页签已有英译。平台侧最终进统一 i18n 资源（ADR-004），key 按领域命名。

---

## 8. 网络层清单（M1 待补项）

凡标 **verified** 的，都有 SHA / 源码行 / CDN 响应头三者之一。凡标 **unverified** 的，不得在 M2 当成已测事实。

### 8.1 第一方 bundle 与静态资源

**verified。** 线上 HTML 的 `<script src>` / `<link href>` / 第一方 `<img>`：

| URL | 角色 | 体积 | SHA-1 | 与 HEAD `1242226` 构建 |
|---|---|---|---|---|
| `/`（`index.html`） | 文档 + 内联 CSS + 四段内联脚本 | 214 239 B | `27ff7d951b07d70089f71433181017728c1e6b93` | 相同 |
| `/assets/index-DdLAWH4o.js` | Vite 产物：Vanilla Firebase 同步模块（顶部 `import` gstatic 11.6.1）+ `src/main.ts` 及 Firebase 12 与 Analysis V1 页面 | 743 074 B | `8745ad8abbf039cda954a6a39a3bda7700d5876a` | 相同 |
| `/firebase-config.js` | `window.__BLAZE_FIREBASE_CONFIG__`（构建时生成，gitignored） | 347 B | （配置文件，不入库） | 线上在用 |
| `/assets/site-BQhOgF6J.webmanifest` | PWA；`start_url: /analysis` | 563 B | `d93d957e500d732e1a049434c703301933d9e52f` | 相同 |
| `/assets/blaze-skate-lab-icon.png` | favicon + 页眉 logo | 943 602 B | `504672ee99a85a28018050d85080fe031bc31545` | 相同 |
| `/assets/blaze-skate-lab-icon-192.png` | 192 图标 / apple-touch-icon | 41 547 B | `7f3fd93d02034681fe5a177da3f7b0ba77974a20` | 相同 |
| `/assets/blaze-skate-lab-icon-512.png` | 仅 PWA manifest 引用，HTML `<link>` 未列 | 257 935 B | `9d963871a423e9d4b1c150dcd8eb875ddfaa22a4` | 相同 |

没有第一方 `.css` 文件。样式 = 大段内联 `<style>` + Tailwind Play CDN。

内联脚本四段：

1. `localStorage` 主题（`blaze-theme-mode`）boot。
2. `tailwind.config` + 内联 CSS。
3. SkatingX metadata 常量、页签切换、打卡本地兜底（`window.currentFirebaseUserId` 初始为 `null`）。
4. MediaPipe 渲染器 + Chart.js 配速 + 器材 CRUD（非 module）。

另：`<script type="module" src="/assets/index-DdLAWH4o.js">`、`<script src="/firebase-config.js">`。

线上 404（抽查）：`/firestore.rules`、`/.env.local`、`/firebase.json`、`/.firebaserc`、`/src/main.ts`。规则文件没有随静态站发布，**不能**用这个 404 推断 Firebase 控制台里部署了哪版规则。

### 8.2 运行时 CDN 全清单

**verified（HTML 声明 + 2026-10-18 解析）。** 全部未自托管。迁移硬性要求：零运行时 CDN。

| 优先级 | URL（HTML 所写） | 2026-10-18 实际解析 | 何时加载 |
|---|---|---|---|
| Tailwind Play CDN | `https://cdn.tailwindcss.com` | 302 → `/3.4.17` | 解析 HTML 立即 |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js` | **4.5.1**（`x-jsd-version`），208 522 B | 解析 HTML 立即 |
| MediaPipe camera_utils | `https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js` | **0.3.1675466862** | 解析 HTML 立即。源码 **没有** `new Camera` / `getUserMedia`，等于白下载 |
| MediaPipe drawing_utils | `https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js` | **0.3.1675466124** | 解析 HTML 立即。`drawConnectors` / `drawLandmarks` / `POSE_CONNECTIONS` 在骨架绘制里使用 |
| MediaPipe pose loader | `https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js` | **0.5.1675469404**（npm `latest` 也是该版本） | 解析 HTML 立即。WASM/tflite **不**在此时下载，见 §8.3 |
| Font Awesome 6.4.0 | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css` | 已 pin 6.4.0 | 解析 HTML 立即；CSS 再拉 `../webfonts/fa-solid-900.woff2` 等（cdnjs 同源） |
| Google Fonts Inter | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap` | CSS 再拉 `fonts.gstatic.com/s/inter/v20/…` | 解析 HTML 立即 |
| 头像占位 | `https://placehold.co/100x100/f8fafc/7c3aed?text=Lin` | 第三方图床 | 解析 HTML 立即 |
| Firebase 11.6.1 ESM | bundle 顶部 `import`：`https://www.gstatic.com/firebasejs/11.6.1/{firebase-app,firebase-auth,firebase-firestore}.js` | 固定 11.6.1 | 加载第一方 module 立即，**即使**当前路径是 `/analysis`（只是不 `initializeApp`） |

Auth / Firestore 在已连接之后还会打 Google 后端（identitytoolkit / securetoken / firestore.googleapis.com）。**具体主机与时序 unverified**（未抓瀑布）。Firebase 12 bundle 字符串里还有 `apis.google.com/js/api.js`、reCAPTCHA URL，匿名登录路径是否真去拉这些 **unverified**；源码没有显式调用。

未 pin 的 jsDelivr / Tailwind URL 会随 registry 漂移。M4 必须 pin 并自托管，不能继续写「latest」。

### 8.3 MediaPipe Pose

**verified（版本、URL 模板、选项、调用时机、失败文案）。**
**unverified（真机一次完整预热 + 推理是否成功；SIMD vs 非 SIMD 回退在本机实际选哪套）。**

| 项 | 值 | 状态 |
|---|---|---|
| 包 | `@mediapipe/pose` **0.5.1675469404**（Solution API，不是 Pose Landmarker） | verified |
| 构造 | `new Pose({ locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}\` })` | verified。HTML **未 pin**，与今天的 0.5.1675469404 碰巧一致 |
| `setOptions` | `modelComplexity: 1`，`smoothLandmarks: true`，`minDetectionConfidence: 0.5`，`minTrackingConfidence: 0.5`。未设 `enableSegmentation`（默认关） | verified |
| 复杂度 1 对应模型 | `pose_landmark_full.tflite`（包内 6 440 512 B）。同包还有 lite 2 819 824 B、heavy 27 709 200 B | verified（包文件列表 + pose.js 引用）。运行时是否只拉 full：**代码意图是的**；网络未抓，标 verified-by-source |
| `locateFile` 会再要的文件 | `pose_web.binarypb`；`pose_solution_simd_wasm_bin.js` + `.wasm`（6 104 372 B）或回退 `pose_solution_wasm_bin.js` + `.wasm`（5 994 571 B）；`pose_solution_packed_assets_loader.js` + `pose_solution_packed_assets.data`（2 962 288 B）；以及对应 tflite | verified（包清单）。实际顺序与 SIMD 探测 **unverified** |

加载路径与顺序（代码）：

1. 解析 HTML：下载 `camera_utils.js`、`drawing_utils.js`、`pose.js`（仅 JS loader，约 47 KB）。
2. 页面 idle：**不**创建 `Pose` 实例。状态文案保持「正在预热模型...」。
3. 用户选本地视频 → `createObjectURL` → 点击分析按钮 → `initPoseModel()`。
4. 若 `typeof Pose === 'undefined'` → 「模型脚本加载失败，请检查网络」，结束。
5. 否则 `new Pose` + `setOptions` + `onResults(onResults)`。
6. 用 1×1 canvas 调 `poseModel.send({image})` 做 warmup：成功 → 「就绪并缓存在本地」；失败 → 「模型预热失败」，`poseModel = null`。
7. `video.play()` 后每 200 ms 轮询 `isModelReady`，就绪才 `requestAnimationFrame(processVideoFrame)`。
8. 每帧：把当前 crop 画到离屏 canvas（最长边 ≤ 640）再 `poseModel.send`。节流 `POSE_FRAME_INTERVAL_MS = 180`，且 `bioPoseSendInFlight` 串行，上一帧没回来就跳过。

失败模式（代码级，verified）：

| 条件 | 用户可见 | `console` |
|---|---|---|
| `pose.js` 没把 `Pose` 挂到全局 | 「模型脚本加载失败，请检查网络」 | 无 |
| warmup `send` reject | 「模型预热失败」 / `STATUS: MODEL WARMUP FAILED` | `Pose model warmup failed:` |
| 播放中 `send` reject | `STATUS: FRAME SKIPPED` | `Video frame analysis skipped:` |
| `onResults` throw | `STATUS: RESULT SKIPPED` | `Pose result skipped:` |
| 无 `results.poseLandmarks` | 角度显示 `--°`，「当前帧无稳定支撑腿」 | 无 |
| 关键帧采样时上述失败 | 「目标不可判读」，摘要建议避开遮挡、多人重叠或运动模糊 | 无 |

资源释放缺口（verified）：全文件 **没有** `poseModel.close()`，也没有 `new Camera`。`resetUpload()` 会停 rAF 标志并 `revokeObjectURL`，但 Pose 实例留在内存；warmup 期间的 `setInterval` 是 `startPlayback` 闭包局部变量，中途重置可能泄漏并在就绪后误开帧循环。

升级边界：执行计划禁止本次把 0.5 Solution API 换成 Pose Landmarker。M2 输出须带算法版本 / 模型版本 / 参数；建议记录 `mediapipe-pose@0.5.1675469404`、`modelComplexity=1`、`POSE_FRAME_INTERVAL_MS=180`、crop 640。

### 8.4 Chart.js

**verified：在用。** 走查稿「未能验证」可以关掉。

| 项 | 值 |
|---|---|
| 是否使用 | 是。页签二「生成配速衰减曲线」走 `new Chart(ctx, { type: 'line', ... })`，两个 dataset：虚线 Junior D 标杆 + 实线「Lindsay 的测算配速」 |
| HTML URL | `https://cdn.jsdelivr.net/npm/chart.js`（未 pin） |
| 2026-10-18 版本 | **4.5.1** |
| 回退 | `typeof Chart === 'undefined'` 时走 `drawPacingCanvas` / `drawLine` 的 2D canvas 折线，不依赖 Chart.js |
| 其他页签 | Vanilla 生物力学 / 规划 / 器材 **不用** Chart.js。TS Analysis V1 也不 import Chart.js |
| 销毁 | 距离切换或重绘前 `pacingChart.destroy()` |

M4：自托管并 pin，或改用平台已有图表方案（二选一写进 PR）。不得继续 CDN。

### 8.5 Firebase

**verified（项目 ID、Auth 用法、源码中的路径与监听）。**
**unverified（控制台里实际部署的 Security Rules 是否等于仓库 `firestore.rules`；走查那条器材记录的文档 ID）。**

#### 项目

| 项 | 值 | 状态 |
|---|---|---|
| GCP / Firebase projectId | `blaze-skate-analysis` | verified（线上 `firebase-config.js` + `.firebaserc`） |
| authDomain | `blaze-skate-analysis.firebaseapp.com` | verified |
| storageBucket（配置里有；SDK 未用） | `blaze-skate-analysis.firebasestorage.app` | verified |
| Firestore 路径用的 `appId` 段 | 默认 **`blaze-skate-academy`**（`typeof __app_id !== 'undefined' ? __app_id : 'blaze-skate-academy'`）。线上 HTML / `firebase-config.js` **没有**定义 `__app_id` | verified |
| 走查稿「疑似 blaze-skate-academy」 | 那是路径前缀，**不是** GCP 项目 ID | 勘误 |

配置对象还有 `apiKey`、`messagingSenderId`、`appId`，本文不记录取值。

#### Auth

`/` Vanilla（走查这条路径）：

1. 读 `window.__BLAZE_FIREBASE_CONFIG__`。
2. 若存在未声明的 `__initial_auth_token` 则 `signInWithCustomToken`，否则 **`signInAnonymously`**。线上未定义该 token。
3. `onAuthStateChanged` → `window.currentFirebaseUserId = uid`，指示灯「● 已连接」。
4. 没有邮箱/密码、没有 Google 按钮、没有退出。

`/analysis` TS：`getOrCreateAnonymousUser()` 同样 `signInAnonymously`，`ownerUserId = athleteId = uid`。因为路径匹配 `/analysis`，Vanilla 同步模块把 config 设为 `null`，**不会**再用 11.6.1 `initializeApp`。两套 SDK 仍都打进同一份 JS：gstatic 11.6.1（外部 import）+ npm 12.15.0（打进 bundle）。

打开 `/` 本身就会创建或复用匿名用户，并可能 `setDoc` `profile/lindsay`（文档不存在时）。M1 因此没有再用浏览器打开线上页。

#### Vanilla 读写与实时监听（`/`）

根路径：`artifacts/blaze-skate-academy/users/{uid}/…`

| 路径 | 操作 | 监听 |
|---|---|---|
| `profile/lindsay` | 不存在则 `setDoc`（name `Lindsay`、birthDate、points、SkatingX metadata） | **`onSnapshot`** → 更新页眉积分 |
| `completedTasks/{taskId}` | 打卡 `runTransaction`：不存在才 `set`，同时 `increment` profile.points | **`onSnapshot` 整集合** |
| `equipmentRecords/{autoId}` | `addDoc` 保存；`deleteDoc` 删除 | **`onSnapshot` + `orderBy('createdAt','desc')`** |

三路 `onSnapshot` 都 **没有 unsubscribe**。

元数据常量：`sourceApp = "blaze-skate-analysis"`；schema `skatingx-athlete-v1` / `skatingx-analysis-v1` / `skatingx-equipment-v1` / `skatingx-training-task-v1`。`ownerUserId` 与 `athleteId` 都写成当前 `uid`（不是字符串 `"lindsay"`）。文档 ID `profile/lindsay` 才是写死的运动员档案名。

#### Analysis V1 读写（`/analysis`，一次性 `getDocs` / `getDoc`，无 `onSnapshot`）

同一 `artifacts/{appId}/users/{uid}/` 下另一组集合：

`analysisSessions` · `analysisVideos` · `biomechanicsFindings` · `paceSessions` · `equipmentSnapshots` · `analysisReports`

UI 实际调用了 session / finding / pace / equipment snapshot / report 的 create-update-list。`analysisVideos` 的 service 有，页面没调用。Videos 路由是空状态。

#### 仓库 `firestore.rules`（是否已部署：unverified）

Owner-only：`request.auth.uid == userId`。`profile/lindsay`、`completedTasks`、`equipmentRecords` 为读写。六个 Analysis V1 集合：读=owner；create 要求 `ownerUserId` 与 `athleteId` 等于 uid；update 冻结 owner / athlete / createdAt；delete 要求 owner。`firebase.json` 只声明了 rules 文件，**没有 indexes 文件**。`orderBy('createdAt')` 与 `where('sessionId')` 在未建索引时可能失败——线上是否已手建索引 **unverified**。

DR-001 新写路径是 `artifacts/skatingx-production/users/{uid}/…`。M2 ADR 必须画出：

- Vanilla `equipmentRecords` / `completedTasks` / `profile/lindsay`
- TS 六个 `analysis*` 集合

分别映射到哪里。页签三打卡不得再往分析侧积分写（DR-004）。

### 8.6 加载期控制台

**unverified（没有 DevTools 会话）。** 源码在 `/` 正常配置下，加载阶段显式 `console.*` 只有 Auth/Profile/Tasks/Equipment 失败时的 `console.error`。配置缺失才会 `console.warn("Firebase config missing…")`。线上走查指示灯变绿，说明 Auth 成功路径走过；**不能**据此断言没有第三方脚本警告（Tailwind Play、Font Awesome、Chart.js、匿名 Auth 内部日志）。

M3 若要补这条，用去标识化环境或 Emulator，不要再对生产项目开匿名登录。

### 8.7 取消 / 无人 / 多人 / 低帧率（代码级）

**verified-by-source；运行时 unverified（未上传任何视频，更没有用 Lindsay 真实视频）。**

| 情形 | 现行行为 |
|---|---|
| 分析前无文件 | 按钮禁用，「请先上传视频」。无报错。 |
| 中途取消 / 替换 | 分析按钮第二次变成「替换或重置测试视频」，调用 `resetUpload()`：pause、清 `src`、`revokeObjectURL`、停 rAF 标志、清 crop/COM/关键帧。**不** `pose.close()`。见 §8.3 泄漏。 |
| 无人帧 | Pose 0.5 无 `poseLandmarks` → 指标 `--°`。若正在采关键帧，记「当前帧没有稳定骨架，目标不可判读。」 |
| 多人 / 跳到别人 | 0.5 只返回一个人体。用 COM 平滑（`COM_SMOOTHING=0.28`）和跳变拒绝（`COM_MAX_JUMP=0.18`，手动锁定时 0.34）；连续拒绝后 `holdCurrentTarget("检测结果突然跳离当前运动员…")`。关键帧文案把「遮挡、多人重叠或目标跳变」算同一类不可判读。有点击画布选目标 + 左右支撑腿手动覆盖。 |
| 低帧率 / 重视频 | 分析节流 180 ms + 串行 `send` + crop 缩到 ≤640 px。`send` 失败只 skip 帧，不中止会话。没有单独的「低帧率」提示。视频 `playbackRate` 用户可调，与推理节流独立。 |

M2 固件必须覆盖这五类（执行计划 M2.4），且 **不得**用 Lindsay 真实影像。

---

## 9. 测试污染说明

走查在器材页生成了一条测试记录（10/18 · 本次记录类型「记录未调整」），因 §5.1 未能从 UI 删掉。可能在 `artifacts/blaze-skate-academy/users/{某匿名uid}/equipmentRecords`，并可能镜像在该浏览器的 `blaze-equipment-history-v1`。

**2026-10-18 评审：删。** 它会混进器材 A/B 对比候选。位置：GCP 项目 `blaze-skate-analysis`（不是路径前缀），集合 `artifacts/blaze-skate-academy/users/{匿名 uid}/equipmentRecords`，日期 10/18、记录类型「记录未调整」。本仓库没有 Admin 服务账号，本文合入时没有对生产执行删除；由 owner 在 Firebase 控制台删这一条。浏览器里的 `blaze-equipment-history-v1` 若还在，只存在那次走查的本机。

---

## 10. 给 M2 的输入

- 移植基准：`/` 四页签 vanilla（§1–§4）。这是评审写死的。
- `/analysis` TS 工作流倾向搁置（手动 finding、空 Videos/Settings）。ADR 写理由。六个集合不要默默并进四页签模型。
- Vanilla 三路 `onSnapshot` 在 M2 补 unsubscribe。
- 数据模型：Vanilla 三集合 + TS 六集合都在 `artifacts/blaze-skate-academy/users/{uid}/` 下，GCP 项目是 `blaze-skate-analysis`。映射到 DR-001 的 `artifacts/skatingx-production/users/{uid}/analyses/{analysisId}`（以及训练侧计划/打卡）写进 ADR。DR-007 正文是 Approved 选项 C；tracker 随 #51 对齐。M2 按正文，不把执行计划里的「未定」写成另一套口径。
- MediaPipe：Pose **0.5.1675469404**，`modelComplexity: 1`（full tflite），jsDelivr `locateFile`，懒加载仅在点击分析之后。自托管 pin 该版本，不升级 Landmarker。
- Chart.js：**在用**，当前 CDN 解析为 4.5.1，仅配速页。
- 运行时 CDN：§8.2 全表。Tailwind Play 必须换成仓库内 Tailwind v4。
- 用户可见文案逐条清单（CN/EN）是 **M2 契约输入**，英文起草之前必须完成。本阶段不写这张清单。四页签英文要新建；TS 字典可参考但不是同一套 UI。见附录 A.7。
- 截图/录屏索引：2026-10-18 正式关闭，不补。
- Quirks 仍待评审（保留或修）：删除按钮、float32 伪影、Pose 不 `close()`。idle「正在预热模型...」已作废，不在此列。
- 页签三宿主 = 训练模块；打卡积分走训练体系（DR-004）。
- 分析→训练反馈环 = Phase 1.5；M2 只预留 finding 编码类型。
- 固件：去标识化；禁止 Lindsay 真实视频。

---

## 11. 与仓库文档的差异（不在本 PR 修改）

| 文档 | 现状 | 本盘点 |
|---|---|---|
| `blaze-skate-analysis/docs/architecture-audit.md`（2026-06-03） | 单文件、无 `src/`、无 Vite、无 TS | 过期。线上是 HTML Vanilla + Vite TS 混合 |
| `docs/SKATINGX_OPEN_DECISIONS.md` | tracker 曾与正文不一致 | #51：DR-001～011 与 DR-013～015 的 tracker 对齐正文。DR-012 正文改回 Open，选项 C 作废。DR-010 正文仍写 pnpm，盘点不改它。 |

---

## 12. 验收对照（开工包 §8 + 执行计划 M1）

| 清单项 | 结论 | 标记 |
|---|---|---|
| 每页签输入/输出/状态 | §1–§4 | verified（走查；代码未反驳） |
| MediaPipe 版本、模型/WASM URL、顺序、失败模式 | §8.3 | 版本与代码路径 verified；真机推理 unverified |
| Chart.js 是否使用、版本、URL | §8.4 使用，CDN 现解析 4.5.1 | verified |
| 运行时 CDN 全清单 | §8.2 | HTML/CDN 头 verified；Auth 后续主机 unverified |
| Firebase 项目、Auth、路径、监听 | §8.5 | 源码 + 线上 config verified；部署中的 rules/indexes unverified |
| 第一方 bundle | §8.1 | verified |
| 视频不上传 | §6 | verified-by-source |
| 用户可见文案 CN/EN | §7 只确认 `/` 中文单语；逐条清单未做 | M2 契约输入（附录 A.7）；英文起草前必须完成 |
| 截图/录屏索引 | 执行计划曾列为 M1 审计证据 | 2026-10-18 正式关闭，不补 |
| quirks：低帧率、无人/多人、中途取消 | §8.7 | 代码 verified；运行时 unverified |
| 加载期控制台 | §8.6 | unverified |

回滚：不适用（只读文档）。

# 附录：M1 盘点 — 10/12 评审与 kickoff checklist 8 项逐条对照

（收进 `docs/migration/analysis-inventory.md` 附录）

## A. kickoff checklist 8 项

| # | 项 | M1 覆盖情况 |
|---|---|---|
| 1 | 四页签输入/输出/状态 | ✓ 覆盖（走查稿 §1–§4；PR #49 补齐网络层后完整） |
| 2 | MediaPipe 版本/模型/WASM URL、加载路径、失败模式 | ✓ 覆盖（@mediapipe/pose 0.5.1675469404；modelComplexity: 1 → pose_landmark_full.tflite；locateFile → jsDelivr；WASM/tflite 只在点击"启动分析"后下载；真机推理 unverified 已标注） |
| 3 | Chart.js 用法（图表/数据/渲染触发） | ✓ 覆盖（页签二 `new Chart` 折线；CDN 未 pin，当前解析 4.5.1；无 Chart 时走 canvas 手绘回退） |
| 4 | 运行时 CDN 全清单 | ✓ 覆盖（Tailwind Play 现 3.4.17、Chart.js、三份 MediaPipe、FA 6.4.0、Google Fonts Inter、placehold.co、gstatic Firebase 11.6.1） |
| 5 | Firebase 项目/读写路径/监听 | ✓ 覆盖（GCP 项目 `blaze-skate-analysis`；路径前缀 `blaze-skate-academy`；`/` 加载即匿名登录；vanilla 三路 onSnapshot 无 unsubscribe；TS 应用六个 `analysis*` 集合一次性 get） |
| 6 | 视频不上传确认 | ✓ 覆盖（createObjectURL 本地播放；bundle 无 Storage SDK；页面明文声明） |
| 7 | 用户可见文案逐条清单 CN/EN | ✗ 缺失 → 转为 M2 契约输入项，英文起草前必须完成 |
| 8 | quirks 基线 | ✓ 覆盖（删除记录按钮疑似失效；float32 显示伪影；三路监听无 unsubscribe；页面加载即匿名写入生产；"正在预热模型..."为 idle 默认文案，"停滞 8 分钟"误读已作废） |

## B. 10/12 评审结论对照

| 10/12 结论 | M1 验证结果 |
|---|---|
| 分析 app：Vite + 原生 JS + Tailwind Play CDN + Chart.js + MediaPipe Pose 0.5（jsDelivr 加载，本地推理，视频不上传）+ Firebase 匿名 + Firestore 实时同步 + Vercel | 全部命中 |
| MediaPipe Pose 0.5 是 legacy，先平移再升级 | 命中（版本 0.5.1675469404） |
| jsDelivr 国内不稳定，新平台须自托管模型/WASM | 命中（locateFile → jsDelivr；Chart.js CDN 未 pin） |
| Chart.js 4.5.1 | 命中（CDN 未 pin，当前解析为 4.5.1） |
| Firebase 项目（旧述为 blaze-skate-academy） | 纠正：GCP 项目为 `blaze-skate-analysis`，`blaze-skate-academy` 仅为 Firestore 路径前缀 |
| — | 新增：同一构建含第二表面 `/analysis`（TS "Analysis V1"：生物力学为手动 finding 表单不跑 Pose，Videos/Settings 为空页；PWA start_url 指向它）；M2 ADR 决定复用或搁置（倾向搁置，需写理由） |
