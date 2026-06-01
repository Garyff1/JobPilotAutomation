const { createBrowserSession, openPage, takeScreenshot, closeBrowserSession } = require("../src/browser/browserSession");
const { getPlatformConfig } = require("../src/config/platformConfig");
const { inferPlatformFromUrl } = require("../src/config/platformInference");
const { detectCaptcha } = require("../src/detectors/captchaDetector");
const { detectLogin } = require("../src/detectors/loginDetector");
const { detectRisk } = require("../src/detectors/riskDetector");
const { classifyError } = require("../src/errors/errorTypes");
const { ExecutorState, STAGES } = require("../src/state/executorState");
const { applyRateLimit } = require("../src/utils/rateLimiter");

function parseArgs(argv) {
  const urlIndex = argv.findIndex((arg) => arg === "--url");
  const platformIndex = argv.findIndex((arg) => arg === "--platform");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    url: urlIndex >= 0 ? argv[urlIndex + 1] : undefined,
    platform: platformIndex >= 0 ? argv[platformIndex + 1] : "",
    noRateLimit: argv.includes("--no-rate-limit")
  };
}

function printUsage() {
  console.log(`
Usage:
  node scripts\\job_check.js --url "https://example.com/job"
  node scripts\\job_check.js --url "https://example.com/job" --platform "公司官网"

Options:
  --no-rate-limit   Skip the local rate-limit wait for this run.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const state = new ExecutorState();
  let session;
  let currentStage = STAGES.INIT;
  const platform = args.platform || inferPlatformFromUrl(args.url);
  const platformConfig = getPlatformConfig(platform);

  try {
    state.start(STAGES.VALIDATE_INPUT);
    currentStage = STAGES.VALIDATE_INPUT;
    state.done("Input accepted.");

    await applyRateLimit({ action: "job_check", noRateLimit: args.noRateLimit, state });

    state.start(STAGES.LAUNCH_BROWSER);
    currentStage = STAGES.LAUNCH_BROWSER;
    session = await createBrowserSession();
    state.done("Browser launched.");

    state.start(STAGES.NAVIGATE);
    currentStage = STAGES.NAVIGATE;
    const navigation = await openPage(session.page, args.url);
    const finalUrl = session.page.url();
    const pageTitle = await session.page.title().catch(() => "");
    const bodyText = await session.page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    state.done("Page loaded.");

    state.start(STAGES.DETECT_SECURITY);
    currentStage = STAGES.DETECT_SECURITY;
    const [captcha, login] = await Promise.all([
      detectCaptcha({ page: session.page, title: pageTitle, bodyText, platformConfig }),
      detectLogin({ page: session.page, url: finalUrl, bodyText, platformConfig })
    ]);
    const risk = detectRisk({ title: pageTitle, bodyText, platformConfig });
    state.done("Security detectors completed.");

    state.start(STAGES.SCREENSHOT);
    currentStage = STAGES.SCREENSHOT;
    const screenshotPath = await takeScreenshot(session.page, "screenshot_check");
    state.done("Screenshot captured.");

    state.start(STAGES.BUILD_REPORT);
    currentStage = STAGES.BUILD_REPORT;
    const report = {
      type: "page_check_report",
      platform,
      dryRun: true,
      pageAccessible: true,
      pageTitle,
      finalUrl,
      visibleTextLength: bodyText.length,
      loginDetected: login.detected && login.confidence === "high",
      captchaDetected: captcha.detected && captcha.confidence !== "low",
      riskDetected: risk.detected && risk.confidence === "high",
      riskFlags: risk.riskFlags || [],
      screenshotPath,
      errorType: "",
      navigationAttempts: navigation?.navigationAttempts || [],
      pageReadiness: navigation?.pageReadiness || null,
      riskSignalDetails: risk.riskSignalDetails || [],
      ignoredRiskSignals: risk.ignoredRiskSignals || [],
      warnings: [
        ...(captcha.warnings || []),
        ...(risk.warnings || [])
      ],
      executionTrace: state.getTrace(),
      storageStateUsed: Boolean(session.storageStateUsed),
      reportTime: new Date().toISOString()
    };
    state.done("Report built.");
    state.start(STAGES.DONE);
    state.done("Job check completed.");
    report.executionTrace = state.getTrace();

    console.log("\n===== CHECK REPORT =====");
    console.log(JSON.stringify(report, null, 2));
    console.log("===== END REPORT =====");
  } catch (error) {
    const classified = classifyError(error, currentStage);
    state.fail(classified.message);
    state.start(STAGES.FAILED);
    state.done(classified.message);
    const report = {
      type: "page_check_report",
      platform,
      dryRun: true,
      pageAccessible: false,
      finalUrl: session?.page ? session.page.url() : "",
      errorType: classified.errorType,
      error: classified,
      navigationAttempts: error?.navigationAttempts || [],
      executionTrace: state.getTrace(),
      storageStateUsed: Boolean(session?.storageStateUsed),
      reportTime: new Date().toISOString()
    };
    console.log("\n===== CHECK REPORT =====");
    console.log(JSON.stringify(report, null, 2));
    console.log("===== END REPORT =====");
    process.exitCode = 1;
  } finally {
    await closeBrowserSession(session, false);
  }
}

main();
