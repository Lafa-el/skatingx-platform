# Pose Landmarker 升级评估报告

版本：v1.0 ｜ 日期：2026-10-20 ｜ 状态：spike 结果，未切换模型

对应计划：`docs/migration/pose-landmarker-upgrade-spike.md`。本报告不修改线上生物力学页，也不把 Pose 0.5 换成 Landmarker。

## 结论

**继续用 Pose 0.5。** 不要按这次结果切换。

在同一批合成人体模型上，heavy 并没有比 Pose 0.5 更接近绘制出来的关节。计划写的是：精度优先、默认 heavy；若 heavy 这个精度上限超不过 0.5，整个 Landmarker 家族这次就不替换 0.5。full 和 0.5 非常接近，但没有稳定胜过 0.5。lite 更差。

若以后真机门禁仍要先选一档再上机，这一批里最接近 0.5 的是 **full**，不是 heavy。那只是下一次实验的候选，不是这次的切换决定。真机帧率、内存和滑行视频的门禁，这次没有测，要由负责人和使用者另定。

## 不确定的地方

- 画面是程序画的、没有五官的人体模型，不是滑冰视频，也不是可识别的人。不能当成场上精度。
- 数字来自这台 Mac 上的 Headless Desktop Chrome 155（ANGLE Metal，Intel Iris Plus）。不是手机，不是比赛设备，也不是窗口模式的完整对照。
- 窗口模式的 Chrome 在 Pose 0.5 跑 `fx-normal` 时原生中止（`Aborted(native code called abort())`）。所以 0.5 没有窗口模式数字。Landmarker 三档在同一次 headless 运行里用的是 GPU，没有落到 CPU。
- 0.5 是对照基线，绘制关节只是这批图片自己的坐标，不是人工标注的真值。
- 没有测持续数分钟的内存，也没有把模型放进生产构建。`public/mediapipe/` 仍被 gitignore，`prebuild` 不会拷贝 Landmarker 文件。

## 怎么跑的

隔离页面：`scripts/spikes/pose-landmarker/runner.html`。应用路由和 `pose-engine.ts` 都不引用它。

Pose 0.5 与 Landmarker 分两次打开 Chrome。同页同时加载两套 Emscripten 会互相中止。0.5 仍走现有自托管目录 `/mediapipe/pose/0.5.1675469404/`，选项与线上一致：`modelComplexity: 1`、`smoothLandmarks: true`、检测和跟踪阈值 0.5。Landmarker 为 `VIDEO`、`numPoses: 1`，三个阈值都是 0.5，先请求 GPU。

同一批 PNG 帧先画进 canvas，四个引擎看的是同一张位图。另外用 MediaRecorder 把这批帧收成 WebM，留在本地 `out/videos/`，没有上传。

指标用 `packages/skating-domain/src/analysis/legacy-pose.ts` 的同一套定义：

- 膝角：支撑腿髋-膝-踝
- 倾斜：肩中点到髋中点相对竖直的夹角
- 骨盆：两侧髋的平均 y，写成画面高度的百分比

每段视频单独重置这套跟踪状态。另外报告身体 12 个关键点相对绘制坐标的平均距离，用来回答「heavy 有没有超过 0.5」。

## 测试批次

生成器：`scripts/spikes/pose-landmarker/synthetic-batch.mjs`。640×480，没有照片、没有五官、没有姓名。

| 片段 | 帧数 | 内容 |
|---|---|---|
| `fx-normal` | 8 | 一个模型，平移很小，膝弯逐渐加大 |
| `fx-no-person` | 4 | 只有冰面色和两条线 |
| `fx-multi-person` | 6 | 两个模型，更大的那个左右交替 |
| `fx-low-frame-rate` | 4 | 一个模型，帧间位置跳得很远 |

M2 目录里的固件仍是合成关键点，没有视频像素。这次用的是新画的片段，不是 Lindsay 的视频。

## 依赖

`@mediapipe/tasks-vision@1.1.1`，写在仓库根的 devDependencies，精确版本。没有跑 `npm audit fix`，也没有动其他依赖。

| 项 | 记录 |
|---|---|
| 用途 | 只给这次对照做浏览器本地 Pose Landmarker。线上页面不 import |
| 许可证 | Apache-2.0 |
| 维护 | Google MediaPipe。1.1.1 发布于 2026-10-14，其后仍有 rc |
| 体积 | npm 解包约 40.1 MB，主要是多套 WASM。运行时实际请求的是下面自托管文件 |
| 替代 | 继续用 `@mediapipe/pose@0.5.1675469404`。计划已排除 RTMPose、YOLO-Pose 和 ONNX 转换 |

自托管目录：`apps/web/public/mediapipe/pose-landmarker/1.1.1/`。运行时不访问 jsDelivr，也不从 Google 拉模型或 WASM。模型只在准备脚本里按固定 SHA-256 下载一次。

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `vision_bundle.mjs` | 156139 | `a84921e02321…` |
| `wasm/vision_wasm_internal.wasm` | 13519922 | `0e101a010e26…` |
| `pose_landmarker_lite.task` | 5777746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `pose_landmarker_full.task` | 9398198 | `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1` |
| `pose_landmarker_heavy.task` | 30664242 | `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b` |

模型来源版本是官方 float16 revision 1。库在运行时试图向 `https://odml.pa.googleapis.com/v1/log` 发日志（headless 这次 12 次）。spike 在页面里拦截了这些请求，没有把画面送出去。模型、WASM 和库文件没有走这条请求。

懒加载：对比开始前，页面不请求 `pose.js`、`vision_bundle.mjs`、WASM 或 `.task`。应用源码没有 import 这个包，因此它不进首屏包。构建若发现磁盘上已有 `public/mediapipe/pose-landmarker/`，Vite 会把该目录拷进 `dist`，但页面不引用，浏览器不会下载。干净检出不会带上这些文件。

## 精度

环境：HeadlessChrome 155.0.0.0，macOS，WebGL 渲染器 `ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics`。Pose 0.5 用 SIMD WASM。三档 Landmarker 的 delegate 都是 GPU，`gpuFallback` 为空。

### 相对 Pose 0.5（同一套生产指标）

平均绝对差。只统计两边都算出数字的帧。

| 片段 | 档 | 膝角 ° | 倾斜 ° | 骨盆 百分点 | 两边都可读的帧 |
|---|---|---|---|---|---|
| `fx-normal` | lite | 5.375 | 1.375 | 0.375 | 8/8 |
| `fx-normal` | full | 1.625 | 1.125 | 0.313 | 8/8 |
| `fx-normal` | heavy | 12.875 | 1.500 | 1.800 | 8/8 |
| `fx-multi-person` | lite | 13.500 | 0.800 | 0.860 | 4 |
| `fx-multi-person` | full | 11.250 | 1.000 | 0.560 | 4 |
| `fx-multi-person` | heavy | 6.667 | 2.000 | 1.640 | 3 |
| `fx-low-frame-rate` | lite | — | 2.000 | 1.950 | 0 |
| `fx-low-frame-rate` | full | 8.000 | 2.500 | 1.600 | 2 |
| `fx-low-frame-rate` | heavy | 8.500 | 2.500 | 5.250 | 2 |

`fx-no-person`：四个引擎都是 0 次检出、0 次误报成可读。没有可比较的角度。

`fx-normal` 上，full 与 0.5 的膝角差约 1.6°，heavy 约 12.9°。倾斜三者都在 1.1° 到 1.5°。

### 相对绘制坐标

身体 12 点的平均归一化距离越小，越接近这张图上画出来的关节。这不是滑冰真值。

| 片段 | Pose 0.5 | lite | full | heavy |
|---|---|---|---|---|
| `fx-normal` 身体距离 | 0.0235 | 0.0311 | 0.0252 | 0.0736 |
| `fx-normal` 膝角误差 ° | 1.875 | 4.750 | 1.500 | 13.750 |
| `fx-normal` 倾斜误差 ° | 2.375 | 1.750 | 1.750 | 1.625 |
| `fx-normal` 骨盆误差 百分点 | 0.937 | 1.313 | 1.175 | 2.738 |
| `fx-multi-person` 身体距离 | 0.0696 | 0.0952 | 0.0722 | 0.1264 |
| `fx-low-frame-rate` 身体距离 | 0.0478 | 0.1435 | 0.0672 | 0.1672 |

`fx-normal` 上 heavy 的身体距离大约是 0.5 的三倍。full 与 0.5 相差 0.0017，小于预先定的 0.005 并列带，不能算胜过 0.5。

检出：`fx-normal` 四家都是 8/8 可读。`fx-multi-person` 都是 5/6 帧有骨架；可读帧 0.5 为 5，full 为 4，heavy 为 3。`fx-low-frame-rate` 四家都只检出 2/4 帧，lite 这两帧没有通过支撑腿判定。

## 速度

同一 headless Chrome。加载时间是第一次 `createFromOptions` 或 Pose 构造加一次 640×480 预热。1×1 预热会让这份 WASM 中止，所以预热用了真实尺寸，不计入下面的逐帧时间。

逐帧时间包含一次 `detectForVideo` 或 `pose.send`。每个片段都会新建 Landmarker，因此每段的第一帧明显更慢。下表「稳态」是包含该首帧在内的中位数；首帧单独列出。

| 引擎 | 加载 ms | `fx-normal` 首帧 ms | `fx-normal` 中位数 ms | 约等于的推理 fps |
|---|---|---|---|---|
| Pose 0.5 | 1524 | 34.4 | 26.4 | 38 |
| lite GPU | 559 | 932.6 | 19.2 | 52 |
| full GPU | 302 | 596.8 | 27.8 | 36 |
| heavy GPU | 556 | 895.1 | 62.5 | 16 |

线上采样间隔是 180 ms。在这台机器上，heavy 的中位数 62.5 ms 仍落在这个间隔里。这只说明这次 headless 桌面运行没有被 180 ms 挡住，不能当成手机或赛场通过了性能门禁。lite 的首帧接近 1 秒，打开分析后的第一下会明显顿一下。

GPU 初始化没有失败，因此 CPU 回退没有发生，也没有 CPU 数字。

## 建议

1. 生产路径保持 Pose 0.5。
2. 不要以 heavy 作为默认下一档。这一批上它离绘制关节更远，也比 0.5 慢。
3. 真机门禁如果还要做，优先拿 full 和 0.5 比，并换真实、不可识别的测试条件。阈值仍由负责人在看到那次结果后定。
4. 切换 PR 若将来发生，必须继续懒加载、自托管，并保留 0.5 可回退。那不是这个分支要做的事。
