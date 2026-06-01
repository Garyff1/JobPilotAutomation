# JobPilot Automation

招聘平台浏览器 dryRun 执行器。自动导航到岗位页面，检测风控/登录/验证码，安全点击 Apply 入口，识别表单字段并预填允许的信息，生成可回填的结构化报告。

## 架构

```
JobPilot (前端)          JobPilotAutomation (执行器)
  ┌─────────────┵         ┌──────────────────────┵
  │ 岗位详情页    │  JSON  │  fullAutoPrepareRunner │
  │ 指令包生成    │ ─────→ │  ├─ Security Detector  │
  │ 结果回填解析  │ ←───── │  ├─ Apply Clicker      │
  └─────────────┘         │  ├─ Field Collector     │
                          │  ├─ Field Classifier    │
                          │  ├─ Field Filler        │
                          │  └─ Report Builder      │
                          └──────────────────────┘
```

### 模块结构

```
src/
├── fullAutoPrepareRunner.js   # 核心编排引擎（10 阶段状态机）
├── actions/
│   └── applyClicker.js        # 安全点击 Apply 按钮
├── browser/
│   └── browserSession.js      # 浏览器创建、导航、截图
├── config/
│   ├── platformConfig.js      # 平台配置读取
│   └── platformInference.js   # URL → 平台名推断
├── detectors/
│   ├── captchaDetector.js     # 验证码/安全验证检测
│   ├── loginDetector.js       # 登录检测
│   └── riskDetector.js        # 风险关键词检测
├── errors/
│   └── errorTypes.js          # 错误分类体系
├── forms/
│   ├── fieldCollector.js      # 表单字段收集
│   ├── fieldClassifier.js     # 字段分类（allowed/blocked/unknown）
│   └── fieldFiller.js         # 字段填写
├── reports/
│   ├── resultBuilder.js       # 执行报告构建
│   └── probeResultBuilder.js  # 平台探测报告构建
├── state/
│   └── executorState.js       # 状态机 + 执行追踪
└── utils/
    ├── fsUtils.js             # 文件系统工具
    ├── rateLimiter.js         # 请求间隔限制
    └── textUtils.js           # 文本匹配工具
```

## 快速开始

```bash
# 安装依赖
npm install

# 首次用 example 配置文件快速测试
npm run full-auto:dryrun -- --input config/full_auto_prepare_instruction.example.json

# 用自定指令包运行
npm run full-auto:dryrun -- --input config/instruction.json

# 保持浏览器打开以观察
npm run full-auto:dryrun -- --input config/instruction.json --keep-open
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `npm run full-auto:dryrun -- --input <file>` | 公司官网全自动填写 dryRun |
| `npm run full-auto:dryrun -- --input <file> --keep-open` | dryRun 后保持浏览器打开 |
| `npm run full-auto:dryrun -- --input <file> --no-rate-limit` | 跳过请求间隔限制 |
| `npm run job:check -- --url <url>` | 单岗位页面快速安全检查 |
| `npm run job:check -- --url <url> --platform "公司官网"` | 指定平台进行检查 |
| `npm run platform:probe` | 批量平台可用性巡检 |
| `npm run platform:probe -- --url <url> --platform "公司官网"` | 指定单 URL 巡检 |
| `npm run syntax:check` | 全量语法检查 |
| `npm test` | 运行所有测试 |

### full-auto:dryrun 选项

| 选项 | 说明 |
|------|------|
| `--input <path>` | 指令包 JSON 文件路径 |
| `--keep-open` | dryRun 结束后保持浏览器打开，手动关闭 |
| `--storage-state <path>` | Playwright storageState 文件路径（登录态持久化） |
| `--no-rate-limit` | 跳过本次执行的请求间隔等待 |

### job:check 选项

| 选项 | 说明 |
|------|------|
| `--url <url>` | 岗位页面 URL |
| `--platform <name>` | 指定平台名（可选，默认从 URL 推断） |
| `--no-rate-limit` | 跳过请求间隔等待 |

## 配置指南

### 指令包 (instruction.json)

```json
{
  "type": "full_auto_executor_instruction",
  "platform": "公司官网",
  "action": "prepare_application_form",
  "dryRun": true,
  "userConfirmed": false,
  "job": {
    "companyName": "GitLab",
    "jobTitle": "Staff Backend Engineer",
    "jobUrl": "https://job-boards.greenhouse.io/gitlab/jobs/8450446002",
    "salaryText": "",
    "locationText": ""
  },
  "allowedActions": [
    "navigate",
    "read_visible_text",
    "detect_form_fields",
    "fill_allowed_fields",
    "take_screenshot",
    "return_report",
    "click_apply_button"
  ],
  "blockedActions": [
    "submit_form_without_confirmation",
    "bypass_captcha",
    "login_account",
    "upload_sensitive_documents",
    "fill_unknown_fields",
    "send_message"
  ],
  "allowedFields": ["姓名", "手机号", "邮箱", "求职岗位", "求职城市", "教育背景", "自我介绍", "项目经历摘要"],
  "blockedFields": ["身份证号", "身份证照片", "银行卡", "详细家庭住址", "紧急联系人", "不确定字段"],
  "stopConditions": ["验证码", "登录", "Security Verification", "Cloudflare", ...],
  "resumePolicy": { "uploadResume": false, "requireUserConfirmationBeforeUpload": true },
  "submitPolicy": { "canSubmit": false, "requireUserConfirmationBeforeSubmit": true },
  "profile": {
    "name": "测试用户",
    "phone": "13800138000",
    "email": "testuser@example.com",
    "educationSummary": "本科，计算机科学与技术",
    "introduction": "...",
    "projectSummary": "..."
  }
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | 平台名，如 `"公司官网"`, `"Greenhouse"` |
| `job.jobUrl` | string | **必填**。岗位页面完整 URL |
| `allowedActions` | string[] | 允许的操作列表。加入 `"click_apply_button"` 启用 Apply 点击 |
| `allowedFields` | string[] | 允许填写的字段名列表 |
| `blockedFields` | string[] | 禁止填写的字段名列表 |
| `profile` | object | 预填信息：name, phone, email, educationSummary, introduction, projectSummary |
| `stopConditions` | string[] | 检测到这些关键词时立即停止执行 |

#### Profile 支持字段

```json
{
  "profile": {
    "name": "张三",
    "firstName": "三",
    "lastName": "张",
    "phone": "13800138000",
    "email": "zhangsan@example.com",
    "educationSummary": "本科，计算机科学与技术",
    "introduction": "5年后端开发经验，熟悉分布式系统设计。",
    "projectSummary": "主导过高并发微服务架构设计与实现。",
    "linkedin": "https://linkedin.com/in/zhangsan",
    "country": "China",
    "currentCity": "深圳",
    "portfolio": "https://zhangsan.dev",
    "degree": "本科",
    "workType": "全职",
    "experienceYears": "5年"
  }
}
```

#### 平台推断规则

系统通过 URL 自动推断平台名，匹配规则 `src/config/platformInference.js`:

| 域名 | 推断平台 |
|------|---------|
| `zhaopin.com` | 智联招聘 |
| `zhipin.com` | BOSS直聘 |
| `liepin.com` | 猎聘 |
| `51job.com` | 前程无忧 |
| `jobs.lever.co` | 公司官网 |
| `greenhouse.io` / `boards.greenhouse.io` | 公司官网 |
| `workable.com` / `apply.workable.com` | 公司官网 |
| `ashbyhq.com` | 公司官网 |
| `smartrecruiters.com` | 公司官网 |
| 含 `/careers`, `/jobs`, `/apply` 等路径 | 公司官网 |
| 含 `jobid=`, `gh_jid=` 等参数 | 公司官网 |

### 平台配置 (platforms.json)

预置了 5 个平台的配置：公司官网（全自动）、智联招聘、BOSS直聘、猎聘、前程无忧（均为半自动）。每个平台定义：

- `level` — 自动化等级：`full_auto_prepare` 或 `semi_auto`
- `allowedFields` / `blockedFields` — 字段白名单/黑名单
- `loginKeywords` / `captchaKeywords` / `riskKeywords` — 安全检测关键词

## 工作流

```
导航 → 安全检测 → 点击 Apply → 再检安全 → 收集字段 → 分类 → 填写允许字段 → 截图 → 报告
```

### 10 阶段执行

| 阶段 | 说明 |
|------|------|
| `VALIDATE_INSTRUCTION` | 验证指令包格式和平台权限 |
| `LAUNCH_BROWSER` | 启动 Playwright 浏览器（非无头模式） |
| `NAVIGATE` | 导航至岗位页面（自动重试+退避） |
| `DETECT_SECURITY` | 三重检测：验证码、登录、风险关键词 |
| `CLICK_APPLY` | 安全查找并点击 Apply 按钮（仅当 `allowedActions` 包含 `click_apply_button`） |
| `COLLECT_FIELDS` | 收集页面所有可见表单字段 |
| `CLASSIFY_FIELDS` | 将字段分类为 allowed / blocked / unknown |
| `FILL_FIELDS` | 填写允许的字段，跳过不安全的 |
| `SCREENSHOT` | 截图保存 |
| `BUILD_REPORT` | 结构化报告输出 |

## 字段分类系统

系统内置约 20 条字段规则，覆盖中英文标签，定义在 `src/forms/fieldClassifier.js`：

| 字段 | 值键 | 说明 |
|------|------|------|
| 姓名 / First Name / Last Name | `fullName`, `firstName`, `lastName` | 支持中英文姓名拆分 |
| 手机号 | `phone` | |
| 邮箱 | `email` | |
| LinkedIn Profile | `linkedin` | safeOptional，无值时不填 |
| Country | `country` | safeOptional |
| Current Location | `currentLocation` | safeOptional |
| Website / Portfolio | `portfolio` | safeOptional |
| 求职岗位 / Job Title | `jobTitle` | |
| 求职城市 / Location | `city` | |
| 教育背景 / Education | `education` | |
| 自我介绍 / Introduction | `intro` | |
| 项目经历摘要 | `projectSummary` | |
| 学历 / Degree | `degree` | |
| 工作类型 / Work Type | `workType` | |
| 经验年限 | `experienceYears` | |

### 分类逻辑

1. file / checkbox / radio / submit / password 等类型 → **blocked**
2. 匹配 `blockedFields` 中的关键词 → **blocked**
3. 匹配 `FIELD_RULES` 且属于 `allowedFields` → **allowed**
4. safeOptional 字段始终允许（但无值时跳过不填）
5. 其余 → **unknown**（不填写，记录到报告）

### 姓名拆分

支持两种格式：
- 英文：`"John Doe"` → firstName: `"John"`, lastName: `"Doe"`
- 中文：`"张三"` → firstName: `"三"`, lastName: `"张"`

## 安全检测系统

### 1. 验证码检测 (captchaDetector)

- 文本扫描：匹配 `captchaKeywords`（验证码, captcha, Cloudflare, EdgeOne 等）
- iframe 检测：captcha, recaptcha, hcaptcha, cloudflare, edgeone 相关 iframe
- DOM 检测：captcha/slider 相关 class/id 容器

### 2. 登录检测 (loginDetector)

- URL 检测：URL 中包含 login/passport/signin 等
- 密码输入框检测
- 登录按钮文本检测
- 文本关键词匹配 `loginKeywords`

### 3. 风险检测 (riskDetector)

- 中文风控：收费、押金、培训贷、无薪试岗、银行卡 等
- 英文风控：deposit, fee, training loan, unpaid trial, bank card 等
- 否定检测：识别 "no fee", "without deposit", "不收费" 等否定语境，降低误报
- 按平台区分不同风险词库

### 安全边界

- 不尝试绕过验证码
- 不自动登录
- 不提交表单
- 不上传文件
- 不填写敏感字段（身份证、银行卡等）
- 不填写未知字段（仅填 `allowedFields` 列表中的）
- 检测到风险信号立即停止
- 点击 Apply 后再次全量安全检查
- 内建请求间隔限制（rate limiter）

## 输出报告

执行完成后生成结构化 JSON 报告，包含：

- 执行追踪（每个阶段的起止时间、状态）
- 安全检测结果（captcha/login/risk 检测详情）
- 表单字段处理结果（filled / skipped / unknown）
- 导航信息（URL、重试记录、页面就绪状态）
- 截图路径
- 错误类型和停止原因

报告保存在 `reports/` 目录。

## 测试

```bash
npm test
```

包含单元测试和集成测试。`syntax:check` 验证所有模块语法。

```bash
npm run syntax:check
```

## 开发

### 依赖

- Node.js >= 18
- Playwright >= 1.60

```bash
npm install
npx playwright install chromium
```

### 添加新平台

1. 在 `config/platforms.json` 中添加平台配置（level, keywords, allowedFields 等）
2. 在 `src/config/platformInference.js` 中添加 URL 推断规则
3. 如有特殊字段规则，在 `src/forms/fieldClassifier.js` 中添加 `FIELD_RULES` 条目

## License

MIT
