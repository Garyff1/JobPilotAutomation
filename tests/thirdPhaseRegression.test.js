const test = require("node:test");
const assert = require("node:assert/strict");

const { getPlatformConfig } = require("../src/config/platformConfig");
const { validateInstruction } = require("../src/fullAutoPrepareRunner");
const { detectCaptcha } = require("../src/detectors/captchaDetector");
const { detectRisk } = require("../src/detectors/riskDetector");
const { getRateLimitWaitMs } = require("../src/utils/rateLimiter");
const { navigateWithRetry } = require("../src/browser/browserSession");

function instruction(platform = "Greenhouse") {
  return {
    type: "full_auto_executor_instruction",
    platform,
    action: "prepare_application_form",
    dryRun: true,
    userConfirmed: false,
    job: { jobUrl: "https://boards.greenhouse.io/demo/jobs/123" }
  };
}

test("ATS platform names use the company website full_auto_prepare config", () => {
  const config = getPlatformConfig("Greenhouse");
  assert.equal(config.level, "full_auto_prepare");
  assert.deepEqual(validateInstruction(instruction("Greenhouse"), config), []);

  const semiAutoErrors = validateInstruction(instruction("BOSS鐩磋仒"), { level: "semi_auto" });
  assert.equal(semiAutoErrors.some((error) => error.includes("semi_auto")), true);
});

test("verify-like class alone is low confidence and not a blocking captcha", async () => {
  const page = {
    locator(selector) {
      return {
        count: async () => selector.includes("verify") ? 1 : 0
      };
    }
  };
  const result = await detectCaptcha({ page, title: "", bodyText: "", platformConfig: { captchaKeywords: [] } });
  assert.equal(result.detected, true);
  assert.equal(result.confidence, "low");
  assert.equal(result.warnings.includes("verify_like_container_low_confidence"), true);
});

test("bank card is risk, not captcha", async () => {
  const page = {
    locator() {
      return { count: async () => 0 };
    }
  };
  const captcha = await detectCaptcha({ page, bodyText: "Please provide a bank card.", platformConfig: { captchaKeywords: ["captcha", "Security Verification"] } });
  const risk = detectRisk({ bodyText: "Please provide a bank card.", platformConfig: { riskKeywords: [] } });
  assert.equal(captcha.detected, false);
  assert.equal(risk.detected, true);
  assert.deepEqual(risk.riskFlags, ["bank_card"]);
});

test("English risk negation does not set riskDetected", () => {
  const safe = detectRisk({ bodyText: "No deposit and no fee are required.", platformConfig: { riskKeywords: [] } });
  assert.equal(safe.detected, false);
  assert.equal(safe.ignoredRiskSignals.length >= 2, true);

  const trainingFee = detectRisk({ bodyText: "A training fee is required before onboarding.", platformConfig: { riskKeywords: [] } });
  assert.equal(trainingFee.detected, true);
  assert.ok(trainingFee.riskFlags.includes("training_fee"));

  const unpaidTrial = detectRisk({ bodyText: "The process includes an unpaid trial.", platformConfig: { riskKeywords: [] } });
  assert.equal(unpaidTrial.detected, true);
  assert.ok(unpaidTrial.riskFlags.includes("unpaid_trial"));
});

test("rate limiter calculates remaining wait from last run", () => {
  const now = Date.now();
  const fs = require("node:fs");
  const path = require("node:path");
  const { LAST_RUN_PATH } = require("../src/utils/rateLimiter");
  fs.mkdirSync(path.dirname(LAST_RUN_PATH), { recursive: true });
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify({ full_auto_prepare: now - 1000 }), "utf8");
  const wait = getRateLimitWaitMs("full_auto_prepare", now, { full_auto_prepare: 5000 });
  assert.equal(wait, 4000);
});

test("navigateWithRetry retries with increasing timeouts", async () => {
  const calls = [];
  const page = {
    async goto(url, options) {
      calls.push({ url, options });
      if (calls.length < 2) throw new Error("Timeout 30000ms exceeded");
    },
    async waitForTimeout() {},
    async evaluate() {
      return { readyState: "complete", bodyTextLength: 250, formLikeCount: 1, ready: true };
    }
  };

  const result = await navigateWithRetry(page, "https://example.com/jobs/1", {
    timeouts: [30000, 45000],
    backoffs: [1],
    readiness: { timeoutMs: 50, intervalMs: 1 }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.navigationAttempts[0].status, "failed");
  assert.equal(result.navigationAttempts[1].status, "success");
  assert.equal(result.pageReadiness.ready, true);
});
