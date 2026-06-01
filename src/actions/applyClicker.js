const { normalizeText } = require("../utils/textUtils");

const ALLOWED_APPLY_PATTERNS = [
  "apply for this job",
  "apply for this position",
  "apply now",
  "apply",
  "start application",
  "start your application",
  "begin application",
  "开始申请",
  "申请该职位",
  "申请此职位",
  "立即申请",
  "申请"
];

const BLOCKED_CLICK_PATTERNS = [
  "submit",
  "send",
  "confirm",
  "review",
  "next",
  "continue",
  "确认提交",
  "提交",
  "投递",
  "投递简历",
  "确认投递",
  "确定",
  "保存",
  "save",
  "finish"
];

async function findApplyButton(page) {
  const selectors = [
    "a[href*='apply']",
    "a[class*='apply']",
    "button[class*='apply']",
    "input[type='button'][value*='ply' i], input[type='submit'][value*='ply' i]",
    "button, a, [role='button'], input[type='button'], input[type='submit']"
  ];

  for (const selector of selectors) {
    const elements = await page.locator(selector).all().catch(() => []);
    for (const el of elements) {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;

      const text = (await el.textContent().catch(() => "") || "").trim();
      const value = await el.getAttribute("value").catch(() => "") || "";
      const ariaLabel = await el.getAttribute("aria-label").catch(() => "") || "";
      const title = await el.getAttribute("title").catch(() => "") || "";

      const combined = compactButtonText([text, value, ariaLabel, title]);
      const normalized = normalizeText(combined);
      if (!normalized) continue;

      const allowed = ALLOWED_APPLY_PATTERNS.some((p) => normalized.includes(p));
      if (!allowed) continue;

      const blocked = BLOCKED_CLICK_PATTERNS.some((p) => normalized.includes(p));
      if (blocked) continue;

      return { element: el, text: combined.substring(0, 120) };
    }
  }

  return null;
}

async function safeClickApply(page) {
  const found = await findApplyButton(page);
  if (!found) {
    return { clicked: false, buttonText: "", reason: "no_apply_button_found", applyWaitResult: null };
  }

  try {
    const previousUrl = page.url();
    await found.element.click();
    const applyWaitResult = await waitForApplicationForm(page, { previousUrl, timeout: 10000 });
    const currentUrl = page.url();

    return {
      clicked: true,
      buttonText: found.text,
      reason: "apply_clicked",
      finalUrl: currentUrl,
      applyWaitResult
    };
  } catch (error) {
    return {
      clicked: false,
      buttonText: found.text,
      reason: `click_failed:${error.message}`,
      applyWaitResult: null
    };
  }
}

async function waitForApplicationForm(page, { timeout = 10000, interval = 300, previousUrl = "" } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeout;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const formSignal = await hasApplicationFormSignal(page).catch(() => false);
    if (formSignal) {
      return {
        ready: true,
        reason: "application_form_signal_detected",
        elapsedMs: Date.now() - startedAt
      };
    }

    if (previousUrl && currentUrl !== previousUrl && /apply|application|jobs|greenhouse|lever/i.test(currentUrl)) {
      return {
        ready: true,
        reason: "url_changed_after_apply",
        elapsedMs: Date.now() - startedAt
      };
    }

    await page.waitForTimeout(interval);
  }

  return {
    ready: false,
    reason: "application_form_wait_timeout",
    elapsedMs: Date.now() - startedAt
  };
}

async function hasApplicationFormSignal(page) {
  const formCount = await page.locator("form, input, textarea, select, [contenteditable='true']").count().catch(() => 0);
  if (formCount > 0) return true;

  const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
  const normalized = normalizeText(bodyText);
  const atsSignals = [
    "first name",
    "last name",
    "email",
    "phone",
    "resume",
    "cover letter",
    "submit application",
    "application form",
    "hcaptcha",
    "security verification"
  ];
  return atsSignals.some((signal) => normalized.includes(signal));
}

function compactButtonText(parts) {
  const seen = new Set();
  const values = [];
  for (const part of parts || []) {
    const value = String(part || "").trim();
    const key = normalizeText(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values.join(" ");
}

module.exports = {
  safeClickApply,
  findApplyButton,
  waitForApplicationForm,
  compactButtonText,
  ALLOWED_APPLY_PATTERNS,
  BLOCKED_CLICK_PATTERNS
};
