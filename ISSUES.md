# JobPilot Automation — 问题清单

## 架构设计缺陷

| # | 分类 | 问题 | 严重度 | 说明 | 涉及文件 |
|---|------|------|--------|------|---------|
| 1 | 架构 | 没有分层设计，三个脚本都是大泥球 | P0 | 浏览器管理、页面导航、风控检测、字段分析、报告生成全部平铺在一个文件里，无法单元测试，无法复用组件 | 全部三个脚本 |
| 2 | 架构 | platforms.json 是装饰品，没有代码读取它 | P0 | 设计了平台配置体系但零使用，每个脚本各自硬编码关键词列表，改平台规则要改三个文件 | config/platforms.json + 全部脚本 |
| 3 | 架构 | 没有状态机，流程是线性撞墙式 | P1 | navigate → check → report 一条道走到底，没有重试/退避、没有超时差异化、没有断点恢复 | 全部三个脚本 |
| 4 | 架构 | 错误分类缺失 | P1 | 所有异常统一 catch(err)+err.message，不区分网络超时、浏览器崩溃、CDN拦截、字段缺失 | 全部三个脚本 |
| 5 | 架构 | dryRun → 正式执行没有演进路径 | P1 | 校验逻辑把 dryRun!==true、userConfirmed!==false 写死成验证规则，转正式时必须改源码 | full_auto_prepare_executor.js |
| 6 | 架构 | 报告格式不统一 | P2 | 三种报告结构相同含义的字段名不一致，无法统一消费 | 全部三个脚本 |
| 7 | 架构 | 无会话管理，每次全新环境 | P2 | 所有 newContext 都传 storageState:undefined，强登录平台每次都要重登 | 全部三个脚本 |

## 功能缺陷

| # | 分类 | 问题 | 严重度 | 说明 | 涉及文件 |
|---|------|------|--------|------|---------|
| 8 | 功能 | `<select>` 下拉框被 `fillField` 跳过 | P0 | 对 select 直接 return false，求职城市、学历等下拉字段永远填不了 | full_auto_prepare_executor.js:218 |
| 9 | 功能 | 关键词检测无上下文感知 | P1 | 纯字符串 includes 匹配，职位描述出现"请登录"即触发登录检测。不检测 HTTP状态码/DOM结构/iframe注入 | 全部三个脚本 |
| 10 | 功能 | 字段检测不支持 iframe/Shadow DOM/多步骤表单 | P1 | collectFields 只查当前 page 的简单表单元素，主流招聘平台用 iframe 表单则完全检测不到 | full_auto_prepare_executor.js:162 |

## 工程缺陷

| # | 分类 | 问题 | 严重度 | 说明 | 涉及文件 |
|---|------|------|--------|------|---------|
| 11 | 工程 | 没有 `.gitignore` | P0 | node_modules、reports/screenshots、截图文件可能被提交，截图含平台敏感内容 | 根目录 |
| 12 | 工程 | 截图散落在 scripts/ 目录 | P2 | 混合在源码目录中，应统一存到 reports/screenshots/ | scripts/screenshot_check_*.png |
| 13 | 工程 | npm scripts 不全 | P2 | 只配了 full-auto:dryrun，job_check 和 platform_probe 没有快捷命令 | package.json |
| 14 | 工程 | job_check.js URL 硬编码 | P2 | JOB_URL 写死在代码第4行，不通过参数传入 | job_check.js:4 |
| 15 | 工程 | select 选项不支持 | P2 | 字段映射规则只覆盖 input/textarea，select 的 option 完全没有处理 | full_auto_prepare_executor.js:162-190 |
| 16 | 工程 | 字段匹配只取第一条规则 | P3 | classifyField 在 allowedFields 中找到第一个匹配就返回，可能有更精确的匹配在后面 | full_auto_prepare_executor.js:200 |

## 严重度定义

- **P0** — 必须修复，影响可用性或安全性
- **P1** — 应该修复，影响可靠性或准确性
- **P2** — 建议修复，影响体验或可维护性
- **P3** — 值得改进，不影响当前功能
