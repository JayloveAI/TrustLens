# TrustLens — AI 工具九维度安全评估平台

基于九维度安全框架，对企业级 AI 工具和传统安全工具进行深度安全评估，生成可视化 HTML 报告和高清截图。

## 评估框架

9 个安全维度，满分 100 分（加权计算）：

| 维度 | 名称 | 权重 |
|------|------|------|
| D1 | 身份认证与访问控制 | 15% |
| D2 | 权限最小化与操作授权 | 20% |
| D3 | 数据流向与主权控制 | 18% |
| D4 | 审计日志与可追溯性 | 15% |
| D5 | Prompt Injection 防御 | 12% |
| D6 | 第三方扩展安全 | 8% |
| D7 | 配置治理与集中管控 | 6% |
| D8 | 成本控制与使用监控 | 4% |
| D9 | 合规与法规对齐 | 2% |

## 已评估工具

### 传统安全工具
- **CrowdStrike Falcon** (EDR/XDR)
- **SentinelOne** (EDR/XDR)
- **Okta Workforce Identity** (IAM)
- **Microsoft Entra ID** (IAM)
- **Zscaler Internet Access** (云安全)
- **Fortinet FortiGate** (NGFW)

### AI Coding 工具
- **GitHub Copilot Enterprise**
- **Cursor**
- **Windsurf (Codeium)**

## 项目结构

```
trustlens/
├── lib/
│   ├── scorer.js            # 评分引擎（九维度定义、权重、计算）
│   ├── detailed_reporter.js # 详细报告生成器（含雷达图 SVG）
│   └── reporter.js          # 汇总报告生成器
├── data.js                  # 前端数据层
├── app.js                   # Web 应用主逻辑
├── cli.js                   # CLI 入口
├── styles.css               # 全局样式
├── index.html               # Web 前端
├── tools_list.yaml          # 工具配置（名称 + 文档 URL）
├── generate_reports.mjs     # 报告批量生成脚本
├── inject_exec_summary.mjs  # 执行摘要注入脚本
├── screenshot_reports.mjs   # Puppeteer 截图导出脚本
├── *_analysis.json          # 各工具原始分析数据
├── report_*.html            # 生成的 HTML 评估报告
└── package.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 生成所有报告（从 JSON 数据）
node generate_reports.mjs

# 注入执行摘要到报告
node inject_exec_summary.mjs

# 导出高清截图（需 Puppeteer）
node screenshot_reports.mjs
```

## 报告输出

每个工具生成独立的 HTML 报告，包含：
- 执行摘要（优缺点一目了然）
- 九维度雷达图（SVG）
- 逐项评分（含进度条和百分比）
- 文档证据引用
- 风险清单（高/中/低分级）
- 补偿控制建议
- 一票否决检查

另有汇总对比报告（`report_summary.html`），包含多工具雷达图叠加和分类对比。

## License

MIT
