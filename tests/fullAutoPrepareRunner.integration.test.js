const test = require("node:test");
const assert = require("node:assert/strict");
const { runFullAutoPrepare } = require("../src/fullAutoPrepareRunner");

function makeInstruction(overrides = {}) {
  return {
    type: "full_auto_executor_instruction",
    platform: "公司官网",
    action: "prepare_application_form",
    dryRun: true,
    userConfirmed: false,
    job: {
      jobUrl: "https://example.com/careers/ai-product-assistant",
      jobTitle: "AI 产品助理",
      locationText: "深圳"
    },
    allowedFields: ["姓名", "邮箱", "求职岗位"],
    blockedFields: ["身份证号"],
    profile: {
      name: "测试用户",
      email: "test@example.com"
    },
    ...overrides
  };
}

function makeDeps(overrides = {}) {
  const page = {
    title: async () => "Example Careers",
    url: () => "https://example.com/careers/ai-product-assistant",
    locator: () => ({
      innerText: async () => "普通招聘页，无登录无验证码无风险"
    })
  };
  return {
    getPlatformConfig: () => ({ level: "full_auto_prepare", allowedFields: ["姓名", "邮箱", "求职岗位"], blockedFields: ["身份证号"], riskKeywords: ["押金"], captchaKeywords: ["验证码"] }),
    createBrowserSession: async () => ({ page, browser: {}, storageStateUsed: false }),
    openPage: async () => undefined,
    detectCaptcha: async () => ({ detected: false, type: "captcha", confidence: "low", matchedSignals: [], reason: "" }),
    detectLogin: async () => ({ detected: false, type: "login", confidence: "low", matchedSignals: [], reason: "" }),
    detectRisk: () => ({ detected: false, type: "risk", confidence: "low", matchedSignals: [], riskFlags: [], reason: "" }),
    collectFields: async () => ({ fields: [{ labelText: "姓名" }], iframeCount: 0, accessibleFrameCount: 0, inaccessibleFrameCount: 0, shadowHostCount: 0 }),
    fillAllowedFields: async () => ({ fieldsFilled: ["姓名", "邮箱"], fieldsSkipped: [], unknownFields: [] }),
    takeScreenshot: async () => "mock-screenshot.png",
    closeBrowserSession: async () => undefined,
    waitForManualClose: async () => undefined,
    applyRateLimit: async () => ({ waitedMs: 0 }),
    ...overrides
  };
}

test("dryRun safe flow builds a complete executor result", async () => {
  const result = await runFullAutoPrepare({ instruction: makeInstruction(), deps: makeDeps() });
  assert.equal(result.type, "full_auto_executor_result");
  assert.equal(result.pageAccessible, true);
  assert.equal(result.formDetected, true);
  assert.equal(result.captchaDetected, false);
  assert.equal(result.loginDetected, false);
  assert.equal(result.riskDetected, false);
  assert.equal(result.stopped, false);
  assert.deepEqual(result.fieldsFilled, ["姓名", "邮箱"]);
  const stages = result.executionTrace.map((item) => item.stage);
  assert.ok(stages.includes("NAVIGATE"));
  assert.ok(stages.includes("DETECT_SECURITY"));
  assert.ok(stages.includes("COLLECT_FIELDS"));
  assert.ok(stages.includes("CLASSIFY_FIELDS"));
  assert.ok(stages.includes("FILL_FIELDS"));
  assert.ok(stages.includes("BUILD_REPORT"));
  const classifyStage = result.executionTrace.find((item) => item.stage === "CLASSIFY_FIELDS");
  assert.match(classifyStage.message, /Classified/);
  assert.equal(result.fieldClassificationSummary.allowedCount >= 1, true);
});

test("captcha detection stops before filling fields", async () => {
  let fillCalled = false;
  const result = await runFullAutoPrepare({
    instruction: makeInstruction(),
    deps: makeDeps({
      detectCaptcha: async () => ({ detected: true, type: "captcha", confidence: "high", matchedSignals: ["Security Verification"], reason: "security" }),
      fillAllowedFields: async () => {
        fillCalled = true;
        return { fieldsFilled: [], fieldsSkipped: [], unknownFields: [] };
      }
    })
  });
  assert.equal(result.captchaDetected, true);
  assert.equal(result.stopped, true);
  assert.match(result.stopReason, /captcha|security/i);
  assert.equal(fillCalled, false);
});

test("risk detection is not reported as captcha", async () => {
  const result = await runFullAutoPrepare({
    instruction: makeInstruction(),
    deps: makeDeps({
      detectRisk: () => ({ detected: true, type: "risk", confidence: "high", matchedSignals: ["银行卡"], riskFlags: ["银行卡"], reason: "risk" })
    })
  });
  assert.equal(result.riskDetected, true);
  assert.equal(result.captchaDetected, false);
  assert.deepEqual(result.riskFlags, ["银行卡"]);
  assert.equal(result.stopped, true);
});

test("invalid instruction does not launch browser", async () => {
  let launched = false;
  const result = await runFullAutoPrepare({
    instruction: makeInstruction({ action: "submit_application" }),
    deps: makeDeps({
      createBrowserSession: async () => {
        launched = true;
        return {};
      }
    })
  });
  assert.equal(result.errorType, "INVALID_INSTRUCTION");
  assert.equal(result.stopped, true);
  assert.equal(launched, false);
});
