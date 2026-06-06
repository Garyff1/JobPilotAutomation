const { createBrowserSession, openPage, takeScreenshot, closeBrowserSession } = require("./browser/browserSession");
const { getPlatformConfig } = require("./config/platformConfig");
const { inferPlatformFromUrl } = require("./config/platformInference");
const { detectCaptcha } = require("./detectors/captchaDetector");
const { detectLogin } = require("./detectors/loginDetector");
const { detectRisk } = require("./detectors/riskDetector");
const { classifyError, ERROR_TYPES } = require("./errors/errorTypes");
const { baseSemiAutoInspectResult, withSemiAutoTrace } = require("./reports/semiAutoInspectResultBuilder");
const { ExecutorState, STAGES } = require("./state/executorState");
const { manualCheckpoint } = require("./actions/manualCheckpoint");
const { applyRateLimit } = require("./utils/rateLimiter");

const ALLOWED_LEVELS = new Set(["semi_auto", "manual_readonly", "manual"]);
const REDIRECT_LEVELS = new Set(["full_auto_prepare", "full_auto"]);

function normalizeInput({ instruction, url, platform } = {}) {
  if (instruction) {
    return {
      type: instruction.type,
      url: instruction.url || instruction.jobUrl || instruction?.job?.jobUrl || "",
      platform: instruction.platform || platform || "",
      dryRun: instruction.dryRun !== false,
      allowManualCheckpoint: instruction.allowManualCheckpoint !== false
    };
  }
  return {
    type: "semi_auto_job_inspect_instruction",
    url: url || "",
    platform: platform || "",
    dryRun: true,
    allowManualCheckpoint: true
  };
}

function validateSemiAutoInspectInput(input, platformConfig = {}) {
  const errors = [];
  const level = platformConfig.level || "manual";
  if (input.type && input.type !== "semi_auto_job_inspect_instruction") {
    errors.push("type must be semi_auto_job_inspect_instruction.");
  }
  if (!input.url) errors.push("url is required.");
  if (input.dryRun !== true) errors.push("dryRun must be true.");
  if (REDIRECT_LEVELS.has(level)) {
    errors.push(`platform level ${level} should use full_auto_prepare executor instead of semi_auto_job_inspector.`);
  } else if (!ALLOWED_LEVELS.has(level)) {
    errors.push(`platform level ${level} is not supported by semi_auto_job_inspector.`);
  }
  return { accepted: errors.length === 0, errors, level };
}

function highConfidenceCaptcha(detection) {
  return Boolean(detection?.detected && detection.confidence !== "low");
}

function highConfidenceLogin(detection) {
  return Boolean(detection?.detected && detection.confidence === "high");
}

function highConfidenceRisk(detection) {
  return Boolean(detection?.detected && detection.confidence === "high");
}

function shouldEnterManualCheckpoint({ captcha, login, risk } = {}) {
  return highConfidenceCaptcha(captcha) || highConfidenceLogin(login) || highConfidenceRisk(risk);
}

function evaluatePostManualDetection({ captcha, login, risk } = {}) {
  const captchaBlocked = highConfidenceCaptcha(captcha);
  const loginBlocked = highConfidenceLogin(login);
  const riskBlocked = highConfidenceRisk(risk);
  const stopped = captchaBlocked || loginBlocked || riskBlocked;
  const reasons = [];
  if (loginBlocked) reasons.push("登录");
  if (captchaBlocked) reasons.push("验证码/安全验证");
  if (riskBlocked) reasons.push("风险信号");
  return {
    stopped,
    stopReason: stopped ? `手动处理后仍检测到${reasons.join("、")}，停止继续读取。` : ""
  };
}

function buildManualReason({ captcha, login, risk } = {}) {
  const parts = [];
  if (highConfidenceLogin(login)) parts.push("登录");
  if (highConfidenceCaptcha(captcha)) parts.push("验证码/安全验证");
  if (highConfidenceRisk(risk)) parts.push(`风险信号：${(risk.riskFlags || []).join("、") || "未知风险"}`);
  return parts.join(" / ");
}

function trimLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickFirstMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? trimLine(match[0] || match[1]) : "";
}

function collectSectionLines(text, headers) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(trimLine)
    .filter(Boolean);
  const results = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!headers.some((header) => lines[index].includes(header))) continue;
    for (let offset = 1; offset <= 5 && lines[index + offset]; offset += 1) {
      const line = lines[index + offset];
      if (/岗位职责|工作内容|任职要求|岗位要求|职位要求|薪资|工作地点/.test(line) && offset > 1) break;
      if (line.length >= 6 && line.length <= 160) results.push(line);
      if (results.length >= 5) return results;
    }
  }
  return results;
}

function extractJobInfoFromText({ title = "", bodyText = "", headingText = "" } = {}) {
  const normalizedBody = String(bodyText || "");
  const titleCandidates = [headingText, title]
    .map((item) => trimLine(item).replace(/招聘|岗位|职位/g, ""))
    .filter(Boolean);
  const salary = pickFirstMatch(normalizedBody, /(\d+(?:\.\d+)?\s*[kK]\s*[-~至]\s*\d+(?:\.\d+)?\s*[kK]|\d+\s*[-~至]\s*\d+\s*元\/?月|薪资面议|面议)/);
  const location = pickFirstMatch(normalizedBody, /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|厦门|合肥|青岛|宁波|佛山|东莞|工作地点[:：]?\s*[^\n\r]{2,40})/);
  const company = pickFirstMatch(`${title}\n${normalizedBody}`, /([^\s，,｜|]{2,30}(?:公司|科技|集团|网络|智能|数据|教育|信息|有限))/);
  return {
    possibleJobTitle: titleCandidates[0] || "",
    possibleCompanyName: company,
    possibleSalaryText: salary,
    possibleLocationText: location,
    possibleResponsibilities: collectSectionLines(normalizedBody, ["岗位职责", "工作内容", "职位描述", "职责描述"]),
    possibleRequirements: collectSectionLines(normalizedBody, ["任职要求", "岗位要求", "职位要求", "能力要求"]),
    extractedTextPreview: normalizedBody.slice(0, 2000)
  };
}

async function readPageSnapshot(page) {
  const title = await page.title().catch(() => "");
  const finalUrl = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const headingText = await page.locator("h1, [class*='title' i], [class*='job' i]").first().innerText({ timeout: 1500 }).catch(() => "");
  return { title, finalUrl, bodyText, headingText };
}

async function runDetectors({ page, title, finalUrl, bodyText, platformConfig, deps = {} }) {
  const detectCaptchaFn = deps.detectCaptcha || detectCaptcha;
  const detectLoginFn = deps.detectLogin || detectLogin;
  const detectRiskFn = deps.detectRisk || detectRisk;
  const [captcha, login] = await Promise.all([
    detectCaptchaFn({ page, title, bodyText, platformConfig }),
    detectLoginFn({ page, url: finalUrl, bodyText, platformConfig })
  ]);
  const risk = detectRiskFn({ title, bodyText, platformConfig });
  return { captcha, login, risk };
}

async function runSemiAutoJobInspector({ instruction, url, platform, noRateLimit = false, deps = {} } = {}) {
  const getPlatformConfigFn = deps.getPlatformConfig || getPlatformConfig;
  const inferPlatformFromUrlFn = deps.inferPlatformFromUrl || inferPlatformFromUrl;
  const createBrowserSessionFn = deps.createBrowserSession || createBrowserSession;
  const openPageFn = deps.openPage || openPage;
  const takeScreenshotFn = deps.takeScreenshot || takeScreenshot;
  const closeBrowserSessionFn = deps.closeBrowserSession || closeBrowserSession;
  const manualCheckpointFn = deps.manualCheckpoint || manualCheckpoint;
  const applyRateLimitFn = deps.applyRateLimit || applyRateLimit;
  const logger = deps.logger || console.log;
  const state = new ExecutorState();
  let session;
  let currentStage = STAGES.INIT;

  const input = normalizeInput({ instruction, url, platform });
  const inferredPlatform = input.platform || inferPlatformFromUrlFn(input.url);
  const platformConfig = getPlatformConfigFn(inferredPlatform);
  const validation = validateSemiAutoInspectInput(input, platformConfig);
  let report = baseSemiAutoInspectResult({
    platform: inferredPlatform,
    url: input.url,
    dryRun: input.dryRun
  });

  try {
    state.start(STAGES.VALIDATE_INPUT);
    currentStage = STAGES.VALIDATE_INPUT;
    if (!validation.accepted) {
      state.fail(validation.errors.join(" "));
      return withSemiAutoTrace({
        ...report,
        stopped: true,
        stopReason: validation.errors.join(" "),
        errorType: ERROR_TYPES.INVALID_INSTRUCTION
      }, state);
    }
    state.done("Input accepted.");

    await applyRateLimitFn({ action: "semi_auto_job_inspect", noRateLimit, state });

    logger("[1/5] 打开页面");
    state.start(STAGES.LAUNCH_BROWSER);
    currentStage = STAGES.LAUNCH_BROWSER;
    session = await createBrowserSessionFn();
    state.done("Browser launched.");

    state.start(STAGES.NAVIGATE, input.url);
    currentStage = STAGES.NAVIGATE;
    const navigation = await openPageFn(session.page, input.url);
    state.done("Page loaded.");

    logger("[2/5] 检测登录/验证码/风控");
    state.start(STAGES.DETECT_SECURITY);
    currentStage = STAGES.DETECT_SECURITY;
    let snapshot = await readPageSnapshot(session.page);
    let detections = await runDetectors({ page: session.page, platformConfig, deps, ...snapshot });
    const manualNeeded = shouldEnterManualCheckpoint(detections);
    report = {
      ...report,
      finalUrl: snapshot.finalUrl,
      title: snapshot.title,
      pageAccessible: true,
      loginDetectedBefore: highConfidenceLogin(detections.login),
      captchaDetectedBefore: highConfidenceCaptcha(detections.captcha),
      riskDetectedBefore: highConfidenceRisk(detections.risk),
      securityDetectedBefore: highConfidenceCaptcha(detections.captcha),
      manualInterventionRequired: manualNeeded,
      manualInterventionType: manualNeeded ? "login_or_captcha" : "",
      navigationAttempts: navigation?.navigationAttempts || [],
      pageReadiness: navigation?.pageReadiness || null,
      warnings: [
        ...(detections.captcha.warnings || []),
        ...(detections.risk.warnings || [])
      ]
    };
    state.done(manualNeeded ? "Manual checkpoint required." : "No manual checkpoint needed.");

    if (manualNeeded) {
      logger("[3/5] 等待用户手动处理");
      if (input.allowManualCheckpoint === false) {
        state.start(STAGES.STOPPED, "Manual checkpoint disabled.");
        state.done("Manual checkpoint disabled.");
        const screenshotPath = await takeScreenshotFn(session.page, "semi_auto_job_inspect_stopped");
        return withSemiAutoTrace({
          ...report,
          screenshotPath,
          stopped: true,
          stopReason: "检测到登录/验证码/风控，但 allowManualCheckpoint=false，已停止。"
        }, state);
      }
      await manualCheckpointFn({ reason: buildManualReason(detections) });
      report.manualInterventionCompleted = true;

      snapshot = await readPageSnapshot(session.page);
      detections = await runDetectors({ page: session.page, platformConfig, deps, ...snapshot });
      const postManual = evaluatePostManualDetection(detections);
      report = {
        ...report,
        finalUrl: snapshot.finalUrl,
        title: snapshot.title,
        loginDetectedAfter: highConfidenceLogin(detections.login),
        captchaDetectedAfter: highConfidenceCaptcha(detections.captcha),
        riskDetectedAfter: highConfidenceRisk(detections.risk),
        securityDetectedAfter: highConfidenceCaptcha(detections.captcha),
        warnings: [
          ...(report.warnings || []),
          ...(detections.captcha.warnings || []),
          ...(detections.risk.warnings || [])
        ]
      };
      if (postManual.stopped) {
        state.start(STAGES.STOPPED, postManual.stopReason);
        state.done(postManual.stopReason);
        const screenshotPath = await takeScreenshotFn(session.page, "semi_auto_job_inspect_stopped");
        return withSemiAutoTrace({
          ...report,
          screenshotPath,
          stopped: true,
          stopReason: postManual.stopReason,
          riskFlags: detections.risk.riskFlags || []
        }, state);
      }
    } else {
      logger("[3/5] 无需手动处理，继续只读检查");
    }

    logger("[4/5] 读取岗位信息");
    state.start("READ_VISIBLE_JOB_TEXT");
    currentStage = "READ_VISIBLE_JOB_TEXT";
    const extracted = extractJobInfoFromText(snapshot);
    state.done("Visible job text extracted.");

    state.start(STAGES.SCREENSHOT);
    currentStage = STAGES.SCREENSHOT;
    const screenshotPath = await takeScreenshotFn(session.page, "semi_auto_job_inspect");
    state.done("Screenshot captured.");

    logger("[5/5] 生成岗位体检素材报告");
    state.start(STAGES.BUILD_REPORT);
    currentStage = STAGES.BUILD_REPORT;
    report = {
      ...report,
      finalUrl: snapshot.finalUrl,
      title: snapshot.title,
      visibleTextLength: snapshot.bodyText.length,
      ...extracted,
      riskDetectedAfter: highConfidenceRisk(detections.risk),
      riskFlags: detections.risk.riskFlags || [],
      screenshotPath,
      stopped: false,
      stopReason: ""
    };
    state.done("Report built.");
    state.start(STAGES.DONE);
    state.done("Semi-auto job inspection completed.");
    return withSemiAutoTrace(report, state);
  } catch (error) {
    const classified = classifyError(error, currentStage);
    state.fail(classified.message);
    state.start(STAGES.FAILED, classified.message);
    state.done(classified.message);
    const screenshotPath = session?.page ? await takeScreenshotFn(session.page, "semi_auto_job_inspect_error") : "";
    return withSemiAutoTrace({
      ...report,
      screenshotPath,
      stopped: true,
      stopReason: classified.message,
      errorType: classified.errorType
    }, state);
  } finally {
    await closeBrowserSessionFn(session, false);
  }
}

module.exports = {
  ALLOWED_LEVELS,
  normalizeInput,
  validateSemiAutoInspectInput,
  shouldEnterManualCheckpoint,
  evaluatePostManualDetection,
  extractJobInfoFromText,
  runSemiAutoJobInspector
};
