const test = require("node:test");
const assert = require("node:assert/strict");

const { getPlatformConfig } = require("../src/config/platformConfig");
const { validateInstruction } = require("../src/fullAutoPrepareRunner");
const { detectCaptcha } = require("../src/detectors/captchaDetector");
const { detectRisk } = require("../src/detectors/riskDetector");
const { hasNegatedKeyword } = require("../src/utils/textUtils");
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

test("ordinary English charge usage does not trigger fee risk", () => {
  const productOps = detectRisk({ bodyText: "You will be in charge of product operations.", platformConfig: { riskKeywords: [] } });
  assert.equal(productOps.detected, false);

  const project = detectRisk({ bodyText: "The manager will oversee the charge of the project.", platformConfig: { riskKeywords: [] } });
  assert.equal(project.detected, false);
});

test("specific English fee and sensitive field phrases still trigger risk", () => {
  const trainingFee = detectRisk({ bodyText: "training fee required", platformConfig: { riskKeywords: [] } });
  assert.equal(trainingFee.detected, true);
  assert.ok(trainingFee.riskFlags.includes("training_fee"));

  const applicationFee = detectRisk({ bodyText: "application fee required", platformConfig: { riskKeywords: [] } });
  assert.equal(applicationFee.detected, true);
  assert.ok(applicationFee.riskFlags.includes("fee"));

  const bankCard = detectRisk({ bodyText: "bank card required", platformConfig: { riskKeywords: [] } });
  assert.equal(bankCard.detected, true);
  assert.ok(bankCard.riskFlags.includes("bank_card"));

  const noFee = detectRisk({ bodyText: "no fee required", platformConfig: { riskKeywords: [] } });
  assert.equal(noFee.detected, false);

  const unpaidTrial = detectRisk({ bodyText: "unpaid trial", platformConfig: { riskKeywords: [] } });
  assert.equal(unpaidTrial.detected, true);
  assert.ok(unpaidTrial.riskFlags.includes("unpaid_trial"));
});

test("free of charge only negates fee-like risk terms", () => {
  const mixed = detectRisk({
    bodyText: "All equipment provided free of charge. Bank card required.",
    platformConfig: { riskKeywords: [] }
  });
  assert.equal(mixed.detected, true);
  assert.ok(mixed.riskFlags.includes("bank_card"));

  const safeFee = detectRisk({
    bodyText: "No application fee. Equipment is free of charge.",
    platformConfig: { riskKeywords: [] }
  });
  assert.equal(safeFee.detected, false);
});

test("English negation uses word boundaries instead of substrings", () => {
  assert.equal(hasNegatedKeyword("no feedback will be provided", "fee"), false);
  assert.equal(hasNegatedKeyword("no depository institution relationship", "deposit"), false);
  assert.equal(hasNegatedKeyword("no fee required", "fee"), true);
  assert.equal(hasNegatedKeyword("no deposit required", "deposit"), true);
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
