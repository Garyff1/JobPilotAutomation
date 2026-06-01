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
      jobUrl: "https://boards.greenhouse.io/demo/jobs/123",
      jobTitle: "AI Product Assistant",
      locationText: "Shenzhen"
    },
    allowedActions: ["click_apply_button", "fill_allowed_fields", "take_screenshot", "return_report"],
    allowedFields: ["姓名", "邮箱", "求职岗位", "求职城市"],
    blockedFields: ["身份证号", "银行卡"],
    profile: {
      email: "test@example.com"
    },
    ...overrides
  };
}

function makePage({ bodyText = "Careers page", finalUrl = "https://boards.greenhouse.io/demo/jobs/123" } = {}) {
  const filled = {};
  const page = {
    filled,
    title: async () => "Demo Job",
    url: () => finalUrl,
    locator: (selector) => {
      if (selector === "body") {
        return { innerText: async () => bodyText };
      }
      return {
        fill: async (value) => {
          filled[selector] = value;
        },
        dispatchEvent: async () => undefined
      };
    }
  };
  return page;
}

function makeDeps({ page = makePage(), detectCaptcha, collectFields, safeClickApply, fillTracker } = {}) {
  return {
    getPlatformConfig: () => ({
      level: "full_auto_prepare",
      allowedFields: ["姓名", "邮箱", "求职岗位", "求职城市"],
      blockedFields: ["身份证号", "银行卡"],
      riskKeywords: ["押金"],
      captchaKeywords: ["captcha", "Security Verification"]
    }),
    createBrowserSession: async () => ({ page, browser: {}, storageStateUsed: false }),
    openPage: async () => undefined,
    detectCaptcha: detectCaptcha || (async () => ({ detected: false, type: "captcha", confidence: "low", matchedSignals: [], reason: "" })),
    detectLogin: async () => ({ detected: false, type: "login", confidence: "low", matchedSignals: [], reason: "" }),
    detectRisk: () => ({ detected: false, type: "risk", confidence: "low", matchedSignals: [], riskFlags: [], reason: "" }),
    collectFields: collectFields || (async () => ({
      fields: [
        { selector: "#first", tagName: "input", type: "text", labelText: "First Name" },
        { selector: "#last", tagName: "input", type: "text", labelText: "Last Name" },
        { selector: "#email", tagName: "input", type: "email", labelText: "Email" }
      ],
      iframeCount: 0,
      accessibleFrameCount: 0,
      inaccessibleFrameCount: 0,
      shadowHostCount: 0
    })),
    safeClickApply: safeClickApply || (async () => ({
      clicked: true,
      buttonText: "Apply",
      reason: "apply_clicked",
      finalUrl: "https://boards.greenhouse.io/demo/jobs/123#app",
      applyWaitResult: {
        ready: true,
        reason: "application_form_signal_detected",
        elapsedMs: 300
      }
    })),
    takeScreenshot: async () => "mock-apply-flow.png",
    closeBrowserSession: async () => undefined,
    waitForManualClose: async () => undefined,
    applyRateLimit: async () => ({ waitedMs: 0 }),
    ...(fillTracker ? { fillAllowedFields: fillTracker } : {})
  };
}

test("full auto dryRun apply flow clicks apply, fills split name and email, and never submits", async () => {
  const page = makePage({ bodyText: "First Name Last Name Email" });
  const result = await runFullAutoPrepare({ instruction: makeInstruction(), deps: makeDeps({ page }) });

  assert.equal(result.applyClicked, true);
  assert.equal(result.applyButtonText, "Apply");
  assert.equal(result.applyWaitResult.ready, true);
  assert.equal(result.formDetected, true);
  assert.ok(result.fieldsFilled.includes("firstName"));
  assert.ok(result.fieldsFilled.includes("lastName"));
  assert.ok(result.fieldsFilled.includes("email"));
  assert.equal(result.testValueUsed, true);
  assert.equal(result.submitClicked, false);
  assert.equal(page.filled["#first"], "Test");
  assert.equal(page.filled["#last"], "User");
  assert.equal(page.filled["#email"], "test@example.com");
});

test("security challenge after apply stops before collecting and filling fields", async () => {
  let captchaCalls = 0;
  let collectCalled = false;
  let fillCalled = false;
  const result = await runFullAutoPrepare({
    instruction: makeInstruction(),
    deps: makeDeps({
      detectCaptcha: async () => {
        captchaCalls += 1;
        if (captchaCalls >= 2) {
          return { detected: true, type: "captcha", confidence: "high", matchedSignals: ["hCaptcha"], reason: "security_after_apply" };
        }
        return { detected: false, type: "captcha", confidence: "low", matchedSignals: [], reason: "" };
      },
      collectFields: async () => {
        collectCalled = true;
        return { fields: [], iframeCount: 0, accessibleFrameCount: 0, inaccessibleFrameCount: 0, shadowHostCount: 0 };
      },
      fillTracker: async () => {
        fillCalled = true;
        return { fieldsFilled: [], fieldsSkipped: [], unknownFields: [] };
      }
    })
  });

  assert.equal(result.applyClicked, true);
  assert.equal(result.captchaDetected, true);
  assert.equal(result.stopped, true);
  assert.equal(collectCalled, false);
  assert.equal(fillCalled, false);
});
