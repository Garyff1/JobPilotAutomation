const { findKeywords } = require("../utils/textUtils");

async function detectCaptcha({ page, title = "", bodyText = "", platformConfig }) {
  const matchedSignals = [];
  const warnings = [];
  const captchaKeywords = platformConfig.captchaKeywords || [];

  findKeywords(`${title}\n${bodyText}`, captchaKeywords).forEach((keyword) => matchedSignals.push(`text:${keyword}`));

  const captchaFrameCount = await page.locator("iframe[src*='captcha' i], iframe[src*='recaptcha' i], iframe[src*='hcaptcha' i], iframe[src*='cloudflare' i], iframe[src*='edgeone' i]").count().catch(() => 0);
  if (captchaFrameCount > 0) {
    matchedSignals.push("captcha_iframe");
  }

  const captchaContainerCount = await page
    .locator("[class*='captcha' i], [id*='captcha' i], [class*='recaptcha' i], [id*='recaptcha' i], [class*='hcaptcha' i], [id*='hcaptcha' i], [class*='slider' i], [id*='slider' i]")
    .count()
    .catch(() => 0);
  if (captchaContainerCount > 0) {
    matchedSignals.push("captcha_container");
  }

  const verifyLikeCount = await page
    .locator("[class*='verify' i], [id*='verify' i]")
    .count()
    .catch(() => 0);
  if (verifyLikeCount > 0) {
    warnings.push("verify_like_container_low_confidence");
  }

  const detected = matchedSignals.length > 0;
  const highSignals = matchedSignals.filter((signal) => signal.includes("Security Verification") || signal.includes("Cloudflare") || signal.includes("EdgeOne") || signal === "captcha_iframe" || signal === "captcha_container");
  const lowOnlyDetected = !detected && warnings.length > 0;

  return {
    detected: detected || lowOnlyDetected,
    type: "captcha",
    confidence: highSignals.length ? "high" : (detected ? "medium" : "low"),
    matchedSignals,
    warnings,
    reason: detected ? "Detected captcha, security verification, or bot-check signal." : (lowOnlyDetected ? "Found verify-like container only; not blocking by itself." : "")
  };
}

module.exports = {
  detectCaptcha
};
