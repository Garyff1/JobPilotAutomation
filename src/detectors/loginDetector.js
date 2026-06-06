const { findKeywords } = require("../utils/textUtils");

async function detectLogin({ page, url = "", bodyText = "", platformConfig }) {
  const matchedSignals = [];
  const loginKeywords = platformConfig.loginKeywords || [];
  const lowerUrl = String(url || "").toLowerCase();

  if (/(\/login\b|\/passport\b|\/signin\b|\/sign-in\b|\/auth\b|\/account\/login\b)/i.test(lowerUrl)) {
    matchedSignals.push(`url:${url}`);
  }

  const passwordInputCount = await page.locator("input[type='password']").count().catch(() => 0);
  if (passwordInputCount > 0) {
    matchedSignals.push("password_input");
  }

  const loginButtonCount = await page
    .locator("button, a, input[type='button'], input[type='submit']")
    .filter({ hasText: /登录|Sign in|Login|账号登录|扫码登录/i })
    .count()
    .catch(() => 0);
  if (loginButtonCount > 0) {
    matchedSignals.push("login_button");
  }

  const bodyMatches = findKeywords(bodyText, loginKeywords);
  bodyMatches.forEach((keyword) => matchedSignals.push(`text:${keyword}`));

  const hasStructure = matchedSignals.some((signal) => signal.startsWith("url:") || signal === "password_input" || signal === "login_button");
  const detected = hasStructure || bodyMatches.length > 0;
  const confidence = hasStructure ? "high" : (bodyMatches.length ? "low" : "low");

  return {
    detected,
    type: "login",
    confidence,
    matchedSignals,
    reason: detected ? (hasStructure ? "Detected login structure or login URL." : "Login text appeared without login structure.") : ""
  };
}

module.exports = {
  detectLogin
};
