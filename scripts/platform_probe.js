const path = require("path");
const { createBrowserSession, openPage, takeScreenshot, closeBrowserSession } = require("../src/browser/browserSession");
const { inferPlatformFromUrl, isCareerPath } = require("../src/config/platformInference");
const { getPlatformConfig } = require("../src/config/platformConfig");
const { detectCaptcha } = require("../src/detectors/captchaDetector");
const { detectLogin } = require("../src/detectors/loginDetector");
const { detectRisk } = require("../src/detectors/riskDetector");
const { collectFields } = require("../src/forms/fieldCollector");
const { classifyError } = require("../src/errors/errorTypes");
const { ExecutorState, STAGES } = require("../src/state/executorState");
const { baseProbeResult, recommendAutomationMode } = require("../src/reports/probeResultBuilder");
const { REPORTS_DIR, ensureDirectories, timestamp, writeJsonFile } = require("../src/utils/fsUtils");
const { applyRateLimit } = require("../src/utils/rateLimiter");

const DEFAULT_TEST_URLS = [
  "https://www.zhaopin.com/",
  "https://www.zhipin.com/",
  "https://www.liepin.com/",
  "https://www.51job.com/",
  "https://jobs.lever.co/frontify/afe4775b-b37d-42be-86e6-dcd5718b660f"
];

function parseArgs(argv) {
  const urlIndex = argv.findIndex((arg) => arg === "--url");
  const platformIndex = argv.findIndex((arg) => arg === "--platform");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    urls: urlIndex >= 0 ? [argv[urlIndex + 1]] : DEFAULT_TEST_URLS,
    platform: platformIndex >= 0 ? argv[platformIndex + 1] : "",
    noRateLimit: argv.includes("--no-rate-limit")
  };
}

function printUsage() {
  console.log(`
Usage:
  node scripts\\platform_probe.js
  node scripts\\platform_probe.js --url "https://jobs.lever.co/example" --platform "公司官网"

Options:
  --no-rate-limit   Skip the local rate-limit wait for this run.
`);
}

async function probeSingle(url, platformOverride = "", options = {}) {
  const state = new ExecutorState();
  const platform = platformOverride || inferPlatformFromUrl(url);
  const platformConfig = getPlatformConfig(platform);
  let session;
  let result = baseProbeResult({ platform, url });
  let currentStage = STAGES.INIT;

  try {
    await applyRateLimit({ action: "platform_probe", noRateLimit: options.noRateLimit, state });

    state.start(STAGES.LAUNCH_BROWSER);
    currentStage = STAGES.LAUNCH_BROWSER;
    session = await createBrowserSession();
    state.done("Browser launched.");

    state.start(STAGES.NAVIGATE);
    currentStage = STAGES.NAVIGATE;
    const navigation = await openPage(session.page, url);
    const finalUrl = session.page.url();
    const title = await session.page.title().catch(() => "");
    const bodyText = await session.page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    state.done("Page loaded.");

    state.start(STAGES.DETECT_SECURITY);
    currentStage = STAGES.DETECT_SECURITY;
    const [captcha, login] = await Promise.all([
      detectCaptcha({ page: session.page, title, bodyText, platformConfig }),
      detectLogin({ page: session.page, url: finalUrl, bodyText, platformConfig })
    ]);
    const risk = detectRisk({ title, bodyText, platformConfig });
    state.done("Security detectors completed.");

    state.start(STAGES.COLLECT_FIELDS);
    currentStage = STAGES.COLLECT_FIELDS;
    const collection = await collectFields(session.page);
    state.done(`Collected ${collection.fields.length} field(s).`);

    const jobInfoVisible = hasJobInfo(bodyText);
    const formDetected = collection.fields.length > 0;
    const captchaDetected = captcha.detected && captcha.confidence !== "low";
    const loginDetected = login.detected && login.confidence === "high";
    const riskDetected = risk.detected && risk.confidence === "high";
    const screenshotPath = await takeScreenshot(session.page, `platform_probe_${safeName(platform)}`);
    let careerPath = false;
    try {
      careerPath = isCareerPath(new URL(finalUrl).pathname.toLowerCase());
    } catch {
      careerPath = false;
    }
    const recommendation = recommendAutomationMode({
      platform,
      url: finalUrl,
      platformConfig,
      captchaDetected,
      loginDetected,
      riskDetected,
      formDetected,
      jobInfoVisible,
      isCareerPath: careerPath
    });

    result = baseProbeResult({
      platform,
      url,
      finalUrl,
      pageAccessible: true,
      title,
      textLength: bodyText.length,
      loginDetected,
      captchaDetected,
      riskDetected,
      riskFlags: risk.riskFlags || [],
      riskSignalDetails: risk.riskSignalDetails || [],
      ignoredRiskSignals: risk.ignoredRiskSignals || [],
      warnings: [
        ...(captcha.warnings || []),
        ...(risk.warnings || [])
      ],
      jobInfoVisible,
      formDetected,
      configuredAutomationLevel: recommendation.configuredAutomationLevel,
      recommendedAutomationMode: recommendation.recommendedAutomationMode,
      recommendationReason: recommendation.recommendationReason,
      screenshotPath,
      navigationAttempts: navigation?.navigationAttempts || [],
      pageReadiness: navigation?.pageReadiness || null,
      iframeCount: collection.iframeCount,
      accessibleFrameCount: collection.accessibleFrameCount,
      inaccessibleFrameCount: collection.inaccessibleFrameCount,
      shadowHostCount: collection.shadowHostCount,
      executionTrace: state.getTrace()
    });

    return result;
  } catch (error) {
    const classified = classifyError(error, currentStage);
    state.fail(classified.message);
    const screenshotPath = session?.page ? await takeScreenshot(session.page, `platform_probe_error_${safeName(platform)}`) : "";
    return baseProbeResult({
      platform,
      url,
      finalUrl: session?.page ? session.page.url() : "",
      screenshotPath,
      errorType: classified.errorType,
      navigationAttempts: error?.navigationAttempts || [],
      executionTrace: state.getTrace()
    });
  } finally {
    await closeBrowserSession(session, false);
  }
}

function hasJobInfo(text) {
  return ["职位描述", "岗位职责", "任职要求", "薪资", "工作地点", "公司信息", "Apply", "Job"].some((keyword) => String(text || "").includes(keyword));
}

function safeName(value) {
  return String(value || "unknown").replace(/[\/\\?%*:|"<>]/g, "_");
}

function printSummary(results) {
  console.log("\n| 平台 | 页面可读 | 登录/验证码 | 岗位信息 | 表单 | 建议等级 |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  results.forEach((result) => {
    const readable = result.pageAccessible ? "yes" : "no";
    const block = result.captchaDetected ? "captcha" : result.loginDetected ? "login" : "clear";
    const job = result.jobInfoVisible ? "yes" : "no";
    const form = result.formDetected ? "yes" : "no";
    console.log(`| ${result.platform} | ${readable} | ${block} | ${job} | ${form} | ${result.recommendedAutomationMode} |`);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  ensureDirectories();
  const results = [];
  for (const url of args.urls.filter(Boolean)) {
    console.log(`\n[probe] ${url}`);
    results.push(await probeSingle(url, args.platform, { noRateLimit: args.noRateLimit }));
  }

  const reportPath = path.join(REPORTS_DIR, `platform_probe_${timestamp()}.json`);
  writeJsonFile(reportPath, {
    type: "platform_probe_batch_result",
    results,
    reportTime: new Date().toISOString()
  });
  printSummary(results);
  console.log(`\nReport saved: ${reportPath}`);
}

main();
