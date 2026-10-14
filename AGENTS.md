# SkatingX engineering rules

本文件是 `skatingx-platform` 仓库的工程约束源，所有 AI 开发工具（Cursor、Codex 等）和人类开发者都必须遵守。它落实《SkatingX 迁移工程规范 v1.0》（2026-10-12 确认）。

规范与代码冲突时，不允许静默绕过：必须先建立 ADR（架构决策记录，放在 `docs/adr/`），说明冲突、选择、影响和回退方案。

## Scope

- 所有迁移功能只建在 `skatingx-platform`，不新建独立 app。
- Legacy 仓库默认只读，不修改、不重构、不覆盖：
  - `blaze-skate-training`
  - `blaze-skate-analysis`
  - 日志应用（journal）
- 任何对 legacy 的改动（包括引导横幅、重定向、只读切换）都属于独立变更，必须由任务显式授权。
- 迁移顺序固定为：分析模块 → 训练模块 → 日志模块。每个阶段独立可发布。

## Tool roles

- **Cursor 是主要实施工具**：日常开发、跨文件重构、测试编写、调试、PR 修复。
- **Codex 仅做辅助**：独立代码审查、一次性 spike / 原型、迁移脚本草案、失败原因分析。Codex 的 spike 代码进入本仓库前，必须按本文件标准栈重写。
- 工具不得决定架构。「工具默认这样生成」不是偏离规范的理由。
- 同一分支、同一功能切片只能有一个写者；Cursor 与 Codex 不得同时修改同一区域。

## Required stack

| 层级 | 统一选择 |
|---|---|
| UI | React 19，仅函数组件与 hooks |
| 构建 | Vite，版本由 lockfile 固定 |
| 语言 | TypeScript，strict 模式 |
| 样式 | Tailwind CSS v4 |
| 路由 | React Router v7，路由级懒加载 |
| 身份 | Firebase Auth（新建的统一 Firebase 项目） |
| 数据 | Firestore，rules 与 indexes 随代码入库 |
| 分析 | MediaPipe + Chart.js，模型与 WASM 自托管 |
| 测试 | Vitest |
| 部署 | Vercel + Firebase，环境严格分离 |

- 必须提交 lockfile；CI 使用确定性安装（如 `npm ci`）。
- 禁止运行时 CDN 依赖：核心代码、样式、模型、WASM 不得从 jsDelivr 等公共 CDN 加载；MediaPipe 资产必须自托管、带版本号、懒加载。
- 不在迁移 PR 中顺便升级框架、AI 模型或业务逻辑；依赖升级单独建 PR，附构建、测试和回滚说明。
- 新依赖必须说明用途、体积、维护状态、许可证和可替代性。

## Architecture

推荐结构：平台壳 + 业务模块 + 共享基础设施。

```text
src/
├── app/        # 路由、providers、布局、启动逻辑
├── modules/    # analysis / training / journal / race-day
├── shared/     # components、hooks、i18n、types、utils
├── services/   # firebase、analytics、payments
└── test/       # fixtures、helpers
docs/
├── adr/
├── migration/
└── runbooks/
```

依赖方向：

- `app` 可以组合 `modules`、`shared`、`services`。
- `modules` 可以使用 `shared` 与公开的 service 接口；模块之间不得直接读取对方内部文件，跨模块能力走公共 API 或领域事件。
- UI 组件不得直接散落 Firestore 查询；所有读写必须经过 repository / service 层。
- Firebase SDK 类型不得扩散为业务模型；必须通过 converter 映射。
- 组件负责展示与交互；业务状态进入 hooks / service；复杂算法必须是可独立测试的纯函数。

## Before editing

每个任务开始前，先输出并确认：

1. 目标与非目标；
2. 计划修改的文件、允许修改的目录、禁止修改的目录；
3. 风险（数据、身份、性能、隐私、兼容性）；
4. 验收标准与必须运行的命令。

附加规则：

- 跨模块、数据模型或认证变更：先提交计划和影响面，再动代码。
- 涉及 Auth、Firestore schema、Security Rules 或迁移脚本：先创建或更新 ADR / runbook。
- 禁止盲目全局重写。迁移以可审查的小切片进行；单个 PR 应能独立测试和回滚。
- 复制 legacy 代码时保留来源说明，并先用回归测试包围旧行为；不得把压缩 bundle 当作可维护源码。
- 迁移时先保持行为一致，不同时优化算法或 UI。例如 MediaPipe 先平移 Pose 0.5 的可观察行为，引擎升级另开 PR。

## Identity and data

- 新平台只有一个身份系统：Firebase Auth。业务代码只认 `uid`，不得以邮箱作为主键。
- 统一数据模型以 `users/{uid}` 为根，业务数据用子集合；禁止新增「单文档承载全部用户数据」的设计：

```text
users/{uid}
  profile / preferences / membership / roles
  athletes/{athleteId}
  trainingSessions/{sessionId}
  journalEntries/{entryId}
  analyses/{analysisId}
```

- 匿名账号升级必须保持原 `uid`，或通过原子映射确保数据归属不变。
- 旧账号密码无法安全导入时，走受控的密码重置 / 账号认领流程；迁移前必须审计旧认证实现，不得假设密码可导入。
- 身份合并必须处理：同邮箱多账号、匿名账号、无邮箱、重复资料、孤儿数据。
- 前端路由守卫不是安全边界；Firestore Security Rules 才是强制边界。管理员、教练、家长、运动员角色必须有明确授权模型，不得只靠前端隐藏按钮。
- Firestore 文档必须按实际查询设计并记录索引；时间存 Timestamp、展示时按用户时区转换；金额存最小货币单位 + ISO 货币代码，不用浮点数；可变记录带 `createdAt`、`updatedAt`、schema 版本与来源标记。
- Security Rules 与 schema 同 PR 提交，并有 Emulator 测试覆盖允许与拒绝路径。

### Data migration scripts

- 默认 dry-run；正式写入需要显式参数和目标环境确认。
- 必须幂等、可安全重跑，支持续跑点和限速，并记录成功 / 跳过 / 失败数量。
- 迁移前导出备份；迁移后做总数、关键字段、抽样和所有权校验。
- 每个模块迁移必须备齐 `docs/migration/<module>/` 下的 `inventory.md`、`mapping.md`、`runbook.md`、`validation.md` 和当次执行结果记录。
- 硬性停止条件：出现未知 schema、所有权不明确、计数异常、权限拒绝或非预期覆盖时，立即停止写入，不得靠跳过错误完成迁移。

## Privacy and video analysis

- 视频分析默认在浏览器本地完成；视频不得上传 Firebase Storage、日志平台或分析平台，除非用户明确选择且有独立的数据处理设计。
- 模型与 WASM 懒加载；用户进入分析流程前不下载大模型。
- 监听器、Web Worker、视频对象 URL、MediaPipe 实例在组件卸载时必须释放。
- 算法输出必须带算法版本、模型版本和关键参数，保证历史结果可解释。
- 「3D」「AI 建议」「生物力学」等文案必须与实际计算能力一致，不得把估算描述成医学或专业诊断。
- 未经核对的业务数据（如赛程、成绩）必须显式标记为「待确认」，不得以确认口吻展示。

## UI, i18n, performance

- 中英文文案必须进入统一 i18n 资源，禁止在组件中硬编码混写；i18n key 按领域命名（如 `training.plan.create`），不得用整句英文作 key。
- 日期、时间、数字、单位、货币使用 locale-aware 格式化。
- 颜色、主题、响应式布局使用统一 design tokens；不复制 legacy 各自的主题系统。
- 表单必须有 label、键盘操作、错误说明和加载状态；核心流程至少验证手机与桌面两种尺寸。
- 路由级代码分割；分析、日志等重模块与 MediaPipe、Chart.js 按功能懒加载，不得进入通用首屏包。
- PR 必须报告构建产物变化；显著增长需说明原因和削减计划。
- 新代码不得使用无理由的 `any`；外部输入先验证再转换；禁止空 `catch`——错误必须有用户可理解的状态与开发可诊断的上下文。
- 注释解释「为什么」，不重复代码「做什么」。

## Testing and CI gates

每个 PR 必须通过以下门禁（以仓库脚本为准）：

```bash
npm ci
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

涉及 Firebase 时追加：

```bash
npm run test:rules
npm run test:migration
```

- 测试按风险分配：单元测试（算法、转换器、日期 / 单位计算、权限判断）、组件测试、Firebase 集成与 Security Rules 测试、端到端关键路径、迁移 fixture 测试（dry-run、幂等、回滚、对账）。
- 每个功能切片至少覆盖：正常路径、空状态、错误路径、权限拒绝，外加移动端手动检查。
- 缺陷修复必须先添加可复现测试；无法自动化时在 PR 中说明原因。
- 禁止绕过失败门禁。「AI 已检查」「本地能跑」「之后补测试」都不是理由；紧急例外需负责人批准、记录风险并建立限时补救项。
- AI 声称完成不算完成；以测试、构建、手动验收和审计记录为准。

## Environments and safety

- 环境至少分 `development`、`staging`、`production`，配置与 Firebase 项目隔离。
- 本地开发与自动化测试默认使用 Firebase Emulator，禁止指向生产环境。
- 环境变量只存非秘密客户端配置；服务端秘密进入受控 secret 管理。
- 每次发布绑定 Git commit、构建记录和变更说明；高风险切换使用 feature flag，关闭 flag 必须能恢复旧流程或安全只读状态。

**Never:**

- 用生产数据做本地测试；
- 把密钥、令牌、Firebase 管理凭证、服务账号文件提交到 Git；
- 把原始视频、日记正文、生产数据写入仓库或普通日志；
- 在日志中写入口令、令牌或视频内容。

## Git and PR

- 分支命名：迁移切片用 `migration/<module>-<slice>`；一个任务一个分支。
- 提交前缀：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`migration`。
- 一个 PR 不得同时包含无关格式化、依赖升级和业务迁移。
- 每个 PR 必须包含：目标、范围（含明确未修改的内容）、风险、实际运行的验证命令与结果、手动测试步骤、数据变更与对账方式、回滚方法、必要证据（截图、日志摘要或新旧对比）。

## Definition of Done

迁移切片同时满足以下条件才算完成：

- [ ] 需求与非目标已写清
- [ ] 架构和 schema 变更有 ADR 或明确说明
- [ ] lint、typecheck、tests、build 全部通过
- [ ] 正常、空、错误、权限路径已验证
- [ ] 中英文与移动端已手动检查
- [ ] 性能变化已记录，无未解释回退
- [ ] 隐私与安全边界已检查
- [ ] 数据变更经过 dry-run、对账和回滚验证
- [ ] 文档、runbook 和审计记录已更新
- [ ] reviewer 已确认；不以 AI 自检代替人工批准
