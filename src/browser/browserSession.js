const path = require("path");
const { chromium } = require("playwright");
const { SCREENSHOTS_DIR, ensureDirectories, timestamp } = require("../utils/fsUtils");
const { classifyError } = require("../errors/errorTypes");

async function createBrowserSession(options = {}) {
  ensureDirectories();
  const useStorageState = Boolean(options.useStorageState && options.storageStatePath);
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-features=PasswordManagerOnboarding,PasswordManager"]
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: useStorageState ? options.storageStatePath : undefined,
    acceptDownloads: false
  });
  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });

  return { browser, context, page, storageStateUsed: useStorageState };
}

async function waitForPageReadiness(page, options = {}) {
  const timeoutMs = options.timeoutMs || 3000;
  const intervalMs = options.intervalMs || 200;
  const startedAt = Date.now();
  let lastSnapshot = {
    readyState: "",
    bodyTextLength: 0,
    formLikeCount: 0,
    elapsedMs: 0,
    ready: false
  };

  while (Date.now() - startedAt <= timeoutMs) {
    lastSnapshot = await page.evaluate(() => {
      const bodyTextLength = document.body ? (document.body.innerText || "").length : 0;
      const formLikeCount = document.querySelectorAll("form, input, textarea, select, [contenteditable='true']").length;
      const readyState = document.readyState;
      return {
        readyState,
        bodyTextLength,
        formLikeCount,
        ready: readyState === "interactive" || readyState === "complete" || bodyTextLength > 120 || formLikeCount > 0
      };
    }).catch(() => ({
      readyState: "",
      bodyTextLength: 0,
      formLikeCount: 0,
      ready: false
    }));

    lastSnapshot.elapsedMs = Date.now() - startedAt;
    if (lastSnapshot.ready) return lastSnapshot;
    await page.waitForTimeout(intervalMs);
  }

  return {
    ...lastSnapshot,
    elapsedMs: Date.now() - startedAt,
    ready: false,
    reason: "page_readiness_timeout"
  };
}

async function navigateWithRetry(page, url, options = {}) {
  const timeouts = options.timeouts || [30000, 45000, 60000];
  const backoffs = options.backoffs || [800, 1600];
  const waitUntil = options.waitUntil || "domcontentloaded";
  const navigationAttempts = [];

  for (let index = 0; index < timeouts.length; index += 1) {
    const attempt = {
      attempt: index + 1,
      timeoutMs: timeouts[index],
      waitUntil,
      startedAt: new Date().toISOString(),
      status: "running"
    };
    navigationAttempts.push(attempt);

    try {
      await page.goto(url, { waitUntil, timeout: timeouts[index] });
      attempt.endedAt = new Date().toISOString();
      attempt.status = "success";
      const pageReadiness = await waitForPageReadiness(page, options.readiness || {});
      return { navigationAttempts, pageReadiness };
    } catch (error) {
      const classified = classifyError(error, "NAVIGATE");
      attempt.endedAt = new Date().toISOString();
      attempt.status = "failed";
      attempt.errorType = classified.errorType;
      attempt.message = classified.message;

      if (index < timeouts.length - 1) {
        const backoffMs = backoffs[Math.min(index, backoffs.length - 1)] || 800;
        attempt.backoffMs = backoffMs;
        await page.waitForTimeout(backoffMs).catch(() => undefined);
      } else {
        const finalError = new Error(`Navigation failed after ${timeouts.length} attempt(s): ${classified.message}`);
        finalError.navigationAttempts = navigationAttempts;
        finalError.errorType = classified.errorType;
        throw finalError;
      }
    }
  }

  const fallbackError = new Error("Navigation failed before an attempt was made.");
  fallbackError.navigationAttempts = navigationAttempts;
  throw fallbackError;
}

async function openPage(page, url, options = {}) {
  return navigateWithRetry(page, url, options);
}

async function takeScreenshot(page, prefix = "full_auto_prepare") {
  if (!page) return "";
  const filePath = path.join(SCREENSHOTS_DIR, `${prefix}_${timestamp()}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return "";
  }
}

async function closeBrowserSession(session, keepOpen = false) {
  if (!session?.browser || keepOpen) return;
  await session.browser.close();
}

async function waitForManualClose(session) {
  if (!session?.browser) return;
  console.log("\n--keep-open is enabled. Browser stays open. Press Ctrl+C or close the browser to exit.");
  await new Promise((resolve) => {
    let resolved = false;
    const done = async () => {
      if (resolved) return;
      resolved = true;
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      try {
        await session.browser.close();
      } catch {
        // Browser may already be closed by the user.
      }
      resolve();
    };
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
    session.browser.on("disconnected", done);
  });
}

module.exports = {
  createBrowserSession,
  openPage,
  navigateWithRetry,
  waitForPageReadiness,
  takeScreenshot,
  closeBrowserSession,
  waitForManualClose
};
