# V2.0 工作簿清单

只读解析 `docs/skatingx-v2/source/` 里的原样工作簿，生成可重复的清单和异常报告。解析器不改工作簿，也不改 manifest。

## 重新生成

在仓库根目录运行：

```bash
node scripts/catalog/parse-workbook.mjs
```

同一份工作簿连续跑两次，`workbook-inventory.json` 与 `workbook-exceptions.json` 的字节必须一致。校验：

```bash
npm run test:catalog
```

## 文件

- `workbook-inventory.json`：工作簿与 manifest 的 SHA-256、51 张表，以及 Exercises 120、Drills 68、Blocks 51、Sessions 18。每条记录含映射字段、`legacyAttributes`、引用和来源行号（Excel 行号）。
- `workbook-exceptions.json`：已知缺口，以及附注（`21_V1.2_ProdMapping` 的 4 个历史公式单元格、每张表的空白列统计）。

## 已知缺口

1. 工作簿没有 Drill→Exercise 这条边。每条 Drill 的 `exerciseRefs` 为 `[]`，`exerciseRefsSource` 为 `source_not_provided`。不要用名称、标签或猜测补链接。
2. `21_V1.2_ProdMapping` 里 BL-L031 与 BL-I017 没有 `systemTemplateId`（记为 `null`）。其余 49 个 Block 有 `stb_*` 映射。
3. Exercises 里 Youth Default 为 Conditional 的 4 条带 `safetyFlag: review_required`（EX-L039、EX-L078、EX-L079、EX-L080）。本清单不判断发布状态。
