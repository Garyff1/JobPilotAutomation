const test = require("node:test");
const assert = require("node:assert/strict");
const { hasNegatedKeyword } = require("../src/utils/textUtils");
const { detectRisk } = require("../src/detectors/riskDetector");
const { detectCaptcha } = require("../src/detectors/captchaDetector");

test("Chinese negation lowers deposit risk", () => {
  assert.equal(hasNegatedKeyword("本岗位无押金，不收任何费用。", "押金"), true);
});

test("English negation patterns are detected", () => {
  assert.equal(hasNegatedKeyword("No deposit is required for this application.", "押金"), true);
  assert.equal(hasNegatedKeyword("There is no fee for candidates.", "收费"), true);
  assert.equal(hasNegatedKeyword("Deposit not required.", "押金"), true);
});

test("ordinary risk keyword is still high risk", () => {
  const result = detectRisk({
    bodyText: "入职前需要押金。",
    platformConfig: { riskKeywords: ["押金"] }
  });
  assert.equal(result.detected, true);
  assert.equal(result.confidence, "high");
});

test("bank card is risk, not captcha", async () => {
  const fakePage = {
    locator() {
      return { count: async () => 0 };
    }
  };
  const captcha = await detectCaptcha({
    page: fakePage,
    bodyText: "请填写银行卡信息。",
    platformConfig: { captchaKeywords: ["验证码", "Cloudflare", "Security Verification"] }
  });
  const risk = detectRisk({
    bodyText: "请填写银行卡信息。",
    platformConfig: { riskKeywords: ["银行卡"] }
  });
  assert.equal(captcha.detected, false);
  assert.equal(risk.detected, true);
});
