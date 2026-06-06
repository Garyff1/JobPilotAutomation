const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlatformConfig } = require("../src/config/platformConfig");
const {
  validateSemiAutoInspectInput,
  shouldEnterManualCheckpoint,
  evaluatePostManualDetection,
  extractJobInfoFromText
} = require("../src/semiAutoJobInspector");
const { baseSemiAutoInspectResult } = require("../src/reports/semiAutoInspectResultBuilder");

test("semi_auto platform is accepted by semi_auto_job_inspector", () => {
  const config = getPlatformConfig("智联招聘");
  const validation = validateSemiAutoInspectInput({
    type: "semi_auto_job_inspect_instruction",
    platform: "智联招聘",
    url: "https://www.zhaopin.com/job/1",
    dryRun: true
  }, config);
  assert.equal(validation.accepted, true);
});

test("full_auto_prepare platform is redirected to full_auto executor", () => {
  const config = getPlatformConfig("公司官网");
  const validation = validateSemiAutoInspectInput({
    type: "semi_auto_job_inspect_instruction",
    platform: "公司官网",
    url: "https://jobs.lever.co/demo/1",
    dryRun: true
  }, config);
  assert.equal(validation.accepted, false);
  assert.match(validation.errors.join(" "), /full_auto_prepare executor/);
});

test("login or captcha detection enters manual checkpoint", () => {
  assert.equal(shouldEnterManualCheckpoint({
    login: { detected: true, confidence: "high" },
    captcha: { detected: false, confidence: "low" },
    risk: { detected: false, confidence: "low" }
  }), true);
});

test("remaining captcha after manual checkpoint stops the flow", () => {
  const result = evaluatePostManualDetection({
    login: { detected: false, confidence: "low" },
    captcha: { detected: true, confidence: "high" },
    risk: { detected: false, confidence: "low" }
  });
  assert.equal(result.stopped, true);
  assert.match(result.stopReason, /验证码/);
});

test("visible text is prepared as JobPilot job check material", () => {
  const extracted = extractJobInfoFromText({
    title: "AI 产品助理招聘 - 云舟智能",
    headingText: "AI 产品助理",
    bodyText: [
      "云舟智能公司",
      "薪资 8K-12K",
      "工作地点：深圳南山",
      "岗位职责",
      "负责需求文档整理和用户反馈分析",
      "任职要求",
      "熟悉 AI 工具和产品协作"
    ].join("\n")
  });
  assert.equal(extracted.possibleJobTitle, "AI 产品助理");
  assert.match(extracted.possibleSalaryText, /8K-12K/i);
  assert.match(extracted.possibleLocationText, /深圳/);
  assert.ok(extracted.extractedTextPreview.includes("岗位职责"));
});

test("semi-auto inspect report has stable type", () => {
  const report = baseSemiAutoInspectResult({ platform: "智联招聘" });
  assert.equal(report.type, "semi_auto_job_inspect_result");
  assert.equal(report.jobInspectionHints.canUseForJobCheck, true);
});
