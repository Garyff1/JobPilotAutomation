# JobPilot Automation

招聘平台浏览器 dryRun 执行器。自动导航到岗位页面，检测风控/登录/验证码，安全点击 Apply 入口，识别表单字段并预填允许的信息，生成可回填的结构化报告。

## 架构

```
JobPilot (前端)          JobPilotAutomation (执行器)
  ┌─────────────┐         ┌──────────────────────┐
  │ 岗位详情页    │  JSON  │  fullAutoPrepareRunner │
  │ 指令包生成    │ ─────→ │  ├─ Security Detector │
  │ 结果回填解析  │ ←───── │  ├─ Apply Clicker     │
  └─────────────┘         │  ├─ Field Collector    │
                          │  ├─ Field Classifier   │
                          │  ├─ Field Filler       │
                          │  └─ Report Builder     │
                          └──────────────────────┘
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

## 工具

| 命令 | 说明 |
|------|------|
| `npm run full-auto:dryrun` | 公司官网全自动填写 dryRun |
| `npm run job:check` | 单岗位页面快速检查 |
| `npm run platform:probe` | 批量平台可用性巡检 |
| `npm run syntax:check` | 全量语法检查 |
| `npm test` | 运行所有测试 |

## 安全边界

- 不尝试绕过验证码
- 不自动登录
- 不提交表单
- 不上传文件
- 不填写敏感字段（身份证、银行卡等）
- 不填写未知字段（仅填 `allowedFields` 列表中的）
- 检测到风险信号立即停止

## 工作流

```
导航 → 安全检测 → 点击 Apply → 再检安全 → 收集字段 → 分类 → 填写允许字段 → 截图 → 报告
```

## 测试

```bash
npm test
```

包含单元测试、集成测试和回归测试。`syntax:check` 验证所有模块语法。
