const { getPlatformConfig } = require("./config/platformConfig");
const { createBrowserSession, openPage, takeScreenshot, closeBrowserSession, waitForManualClose } = require("./browser/browserSession");
const { safeClickApply } = require("./actions/applyClicker");
const { detectLogin } = require("./detectors/loginDetector");
const { detectCaptcha } = require("./detectors/captchaDetector");
const { detectRisk } = require("./detectors/riskDetector");
const { collectFields } = require("./forms/fieldCollector");
const { classifyField, classifyFields, buildProfileValues } = require("./forms/fieldClassifier");
const { fillAllowedFields } = require("./forms/fieldFiller");
const { baseResult, withTrace } = require("./reports/resultBuilder");
const { ERROR_TYPES, classifyError } = require("./errors/errorTypes");
const { ExecutorState, STAGES } = require("./state/executorState");
const { applyRateLimit } = require("./utils/rateLimiter");

const ALLOWED_AUTOMATION_LEVELS = new Set(["full_auto_prepare", "full_auto"]);

function validateInstruction(instruction, platformConfig = {}) {
  const errors = [];
  if (!instruction || typeof instruction !== "object") errors.push("Instruction must be a JSON object.");
  if (instruction?.type !== "full_auto_executor_instruction") errors.push("type must be full_auto_executor_instruction.");
  if (instruction?.action !== "prepare_application_form") errors.push("This dryRun executor only accepts prepare_application_form.");
  if (instruction?.dryRun !== true) errors.push("dryRun must be true.");
  if (instruction?.userConfirmed !== false) errors.push("userConfirmed must be false.");
  const level = platformConfig?.level || "manual";
  if (!ALLOWED_AUTOMATION_LEVELS.has(level)) errors.push(`platform automation level ${level} does not allow full_auto_prepare.`);
  if (!instruction?.job?.jobUrl) errors.push("job.jobUrl is required.");
  return errors;
}

async function runFullAutoPrepare({ instruction, keepOpen = false, storageStatePath = "", noRateLimit = false, deps = {} } = {}) {
  const getPlatformConfigFn = deps.getPlatformConfig || getPlatformConfig;
  const createBrowserSessionFn = deps.createBrowserSession || createBrowserSession;
  const openPageFn = deps.openPage || openPage;
  const detectCaptchaFn = deps.detectCaptcha || detectCaptcha;
  const detectLoginFn = deps.detectLogin || detectLogin;
  const detectRiskFn = deps.detectRisk || detectRisk;
  const collectFieldsFn = deps.collectFields || collectFields;
  const classifyFieldsFn = deps.classifyFields || classifyFields;
  const fillAllowedFieldsFn = deps.fillAllowedFields || fillAllowedFields;
  const takeScreenshotFn = deps.takeScreenshot || takeScreenshot;
  const closeBrowserSessionFn = deps.closeBrowserSession || closeBrowserSession;
  const waitForManualCloseFn = deps.waitForManualClose || waitForManualClose;
  const safeClickApplyFn = deps.safeClickApply || safeClickApply;
  const applyRateLimitFn = deps.applyRateLimit || applyRateLimit;

  const state = new ExecutorState();
  let session;
  let beforeApplySecurityCheck = null;
  let afterApplySecurityCheck = null;
  const initialPlatformConfig = getPlatformConfigFn(instruction?.platform);
  const configuredAutomationLevel = initialPlatformConfig?.level || "manual";
  const platformAccepted = ALLOWED_AUTOMATION_LEVELS.has(configuredAutomationLevel);
  let result = baseResult(instruction, {
    configuredAutomationLevel,
    platformAccepted,
    platformRejectReason: platformAccepted ? "" : `platform automation level ${configuredAutomationLevel} does not allow full_auto_prepare.`
  });
  let currentStage = STAGES.INIT;

  try {
    state.start(STAGES.VALIDATE_INSTRUCTION);
    currentStage = STAGES.VALIDATE_INSTRUCTION;
    const validationErrors = validateInstruction(instruction, initialPlatformConfig);
    if (validationErrors.length) {
      state.fail(validationErrors.join(" "));
      return withTrace(baseResult(instruction, {
        configuredAutomationLevel,
        platformAccepted: false,
        platformRejectReason: validationErrors.join(" "),
        stopped: true,
        stopReason: validationErrors.join(" "),
        errorType: ERROR_TYPES.INVALID_INSTRUCTION
      }), state);
    }
    state.done("Instruction accepted.");

    const platformConfig = initialPlatformConfig;

    await applyRateLimitFn({ action: "full_auto_prepare", noRateLimit, state });

    state.start(STAGES.LAUNCH_BROWSER);
    currentStage = STAGES.LAUNCH_BROWSER;
    session = await createBrowserSessionFn({
      useStorageState: Boolean(storageStatePath),
      storageStatePath
    });
    state.done("Browser launched.");

    state.start(STAGES.NAVIGATE, instruction.job.jobUrl);
    currentStage = STAGES.NAVIGATE;
    const navigation = await openPageFn(session.page, instruction.job.jobUrl);
    const title = await session.page.title().catch(() => "");
    const bodyText = await session.page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const finalUrl = session.page.url();
    result = {
      ...result,
      finalUrl,
      pageAccessible: true,
      storageStateUsed: Boolean(session.storageStateUsed),
      navigationAttempts: navigation?.navigationAttempts || [],
      pageReadiness: navigation?.pageReadiness || null
    };
    state.done("Page loaded.");

    state.start(STAGES.DETECT_SECURITY);
    currentStage = STAGES.DETECT_SECURITY;
    const [captchaDetection, loginDetection] = await Promise.all([
      detectCaptchaFn({ page: session.page, title, bodyText, platformConfig }),
      detectLoginFn({ page: session.page, url: finalUrl, bodyText, platformConfig })
    ]);
    const riskDetection = detectRiskFn({ title, bodyText, platformConfig });
    beforeApplySecurityCheck = buildSecurityCheck({ captchaDetection, loginDetection, riskDetection });

    const shouldStopForCaptcha = captchaDetection.detected && captchaDetection.confidence !== "low";
    const shouldStopForLogin = loginDetection.detected && loginDetection.confidence === "high";
    const shouldStopForRisk = riskDetection.detected && riskDetection.confidence === "high";

    if (shouldStopForCaptcha || shouldStopForLogin || shouldStopForRisk) {
      const screenshotPath = await takeScreenshotFn(session.page, "full_auto_prepare_stopped");
      const stopReason = buildStopReason({ captchaDetection, loginDetection, riskDetection });
      state.done(stopReason);
      state.start(STAGES.STOPPED, stopReason);
      state.done(stopReason);
      return withTrace({
        ...result,
        captchaDetected: shouldStopForCaptcha,
        loginDetected: shouldStopForLogin,
        riskDetected: shouldStopForRisk,
        riskFlags: riskDetection.riskFlags || [],
        riskSignalDetails: riskDetection.riskSignalDetails || [],
        ignoredRiskSignals: riskDetection.ignoredRiskSignals || [],
        warnings: [
          ...(captchaDetection.warnings || []),
          ...(riskDetection.warnings || [])
        ],
        beforeApplySecurityCheck,
        afterApplySecurityCheck,
        screenshotPath,
        stopped: true,
        stopReason,
        errorType: shouldStopForCaptcha ? ERROR_TYPES.CAPTCHA_DETECTED : shouldStopForLogin ? ERROR_TYPES.LOGIN_REQUIRED : ERROR_TYPES.SECURITY_BLOCKED
      }, state);
    }
    state.done("No blocking security signal.");

    state.start(STAGES.CLICK_APPLY);
    currentStage = STAGES.CLICK_APPLY;
    const canClickApply = instruction.allowedActions?.includes("click_apply_button");
    if (canClickApply) {
      const applyResult = await safeClickApplyFn(session.page);
      if (applyResult.clicked) {
        const afterTitle = await session.page.title().catch(() => "");
        const afterBody = await session.page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
        const afterUrl = session.page.url();
        const [afterCaptcha, afterLogin] = await Promise.all([
          detectCaptchaFn({ page: session.page, title: afterTitle, bodyText: afterBody, platformConfig }),
          detectLoginFn({ page: session.page, url: afterUrl, bodyText: afterBody, platformConfig })
        ]);
        const afterRisk = detectRiskFn({ title: afterTitle, bodyText: afterBody, platformConfig });
        afterApplySecurityCheck = buildSecurityCheck({ captchaDetection: afterCaptcha, loginDetection: afterLogin, riskDetection: afterRisk });
        const afterStopCaptcha = afterCaptcha.detected && afterCaptcha.confidence !== "low";
        const afterStopLogin = afterLogin.detected && afterLogin.confidence === "high";
        const afterStopRisk = afterRisk.detected && afterRisk.confidence === "high";
        if (afterStopCaptcha || afterStopLogin || afterStopRisk) {
          const ssPath = await takeScreenshotFn(session.page, "full_auto_prepare_stopped_after_click");
          const sr = `After clicking apply: ${buildStopReason({ captchaDetection: afterCaptcha, loginDetection: afterLogin, riskDetection: afterRisk })}`;
          state.done(sr);
          state.start(STAGES.STOPPED, sr);
          state.done(sr);
          return withTrace({
            ...result, applyClicked: true, applyButtonText: applyResult.buttonText, applyWaitResult: applyResult.applyWaitResult || null,
            finalUrl: afterUrl, captchaDetected: afterStopCaptcha, loginDetected: afterStopLogin,
            riskDetected: afterStopRisk, riskFlags: afterRisk.riskFlags || [],
            riskSignalDetails: afterRisk.riskSignalDetails || [],
            ignoredRiskSignals: afterRisk.ignoredRiskSignals || [],
            warnings: [
              ...(afterCaptcha.warnings || []),
              ...(afterRisk.warnings || [])
            ],
            beforeApplySecurityCheck,
            afterApplySecurityCheck,
            screenshotPath: ssPath, stopped: true, stopReason: sr,
            errorType: afterStopCaptcha ? ERROR_TYPES.CAPTCHA_DETECTED : afterStopLogin ? ERROR_TYPES.LOGIN_REQUIRED : ERROR_TYPES.SECURITY_BLOCKED
          }, state);
        }
        result = { ...result, applyClicked: true, applyButtonText: applyResult.buttonText, applyWaitResult: applyResult.applyWaitResult || null, finalUrl: afterUrl };
        state.done(`Clicked "${applyResult.buttonText}". Re-detected security - clear.`);
      } else {
        state.done(`Apply click skipped: ${applyResult.reason || "button not found"}`);
      }
    } else {
      state.done("Apply click not allowed by instruction.");
    }

    state.start(STAGES.COLLECT_FIELDS);
    currentStage = STAGES.COLLECT_FIELDS;
    const collection = await collectFieldsFn(session.page);
    state.done(`Collected ${collection.fields.length} field(s).`);

    state.start(STAGES.CLASSIFY_FIELDS);
    currentStage = STAGES.CLASSIFY_FIELDS;
    const classificationResult = classifyFieldsFn(collection.fields, instruction, platformConfig);
    const fieldClassificationSummary = buildFieldClassificationSummary(classificationResult);
    state.done(`Classified ${collection.fields.length} field(s): ${fieldClassificationSummary.allowedCount} allowed, ${fieldClassificationSummary.blockedCount} blocked, ${fieldClassificationSummary.unknownCount} unknown.`);

    state.start(STAGES.FILL_FIELDS);
    currentStage = STAGES.FILL_FIELDS;
    const fillResult = await fillAllowedFieldsFn(session.page, collection.fields, instruction, platformConfig, classifyField, buildProfileValues, classificationResult);
    state.done(`Filled ${fillResult.fieldsFilled.length} field(s).`);

    state.start(STAGES.SCREENSHOT);
    currentStage = STAGES.SCREENSHOT;
    const screenshotPath = await takeScreenshotFn(session.page, "full_auto_prepare");
    state.done("Screenshot captured.");

    state.start(STAGES.BUILD_REPORT);
    currentStage = STAGES.BUILD_REPORT;
    const finalSecurityCheck = afterApplySecurityCheck || beforeApplySecurityCheck || buildSecurityCheck({ captchaDetection, loginDetection, riskDetection });
    result = {
      ...result,
      formDetected: collection.fields.length > 0,
      fieldsFilled: fillResult.fieldsFilled,
      fieldsSkipped: fillResult.fieldsSkipped,
      unknownFields: fillResult.unknownFields,
      fieldClassificationSummary,
      testValueUsed: Boolean(fillResult.testValueUsed),
      beforeApplySecurityCheck,
      afterApplySecurityCheck,
      captchaDetected: Boolean(finalSecurityCheck.captchaDetected),
      loginDetected: Boolean(finalSecurityCheck.loginDetected),
      riskDetected: Boolean(finalSecurityCheck.riskDetected),
      riskFlags: finalSecurityCheck.riskFlags || [],
      riskSignalDetails: finalSecurityCheck.riskSignalDetails || [],
      ignoredRiskSignals: finalSecurityCheck.ignoredRiskSignals || [],
      warnings: [
        ...(finalSecurityCheck.warnings || [])
      ],
      screenshotPath,
      stopped: false,
      stopReason: "",
      iframeCount: collection.iframeCount,
      accessibleFrameCount: collection.accessibleFrameCount,
      inaccessibleFrameCount: collection.inaccessibleFrameCount,
      shadowHostCount: collection.shadowHostCount
    };
    state.done("Report built.");
    state.start(STAGES.DONE);
    state.done("DryRun completed.");

    if (keepOpen) {
      await waitForManualCloseFn(session);
    }

    return withTrace(result, state);
  } catch (error) {
    const classified = classifyError(error, currentStage);
    state.fail(classified.message);
    state.start(STAGES.FAILED, classified.message);
    state.done(classified.message);
    const screenshotPath = session?.page ? await takeScreenshotFn(session.page, "full_auto_prepare_error") : "";
    return withTrace({
      ...result,
      finalUrl: session?.page ? session.page.url() : result.finalUrl,
      stopped: true,
      stopReason: classified.message,
      errorType: classified.errorType,
      navigationAttempts: error?.navigationAttempts || result.navigationAttempts || [],
      screenshotPath
    }, state);
  } finally {
    await closeBrowserSessionFn(session, keepOpen);
  }
}

function buildStopReason({ captchaDetection, loginDetection, riskDetection }) {
  if (captchaDetection.detected && captchaDetection.confidence !== "low") {
    return `Detected captcha/security verification: ${captchaDetection.matchedSignals.join(", ")}`;
  }
  if (loginDetection.detected && loginDetection.confidence === "high") {
    return `Detected login requirement: ${loginDetection.matchedSignals.join(", ")}`;
  }
  if (riskDetection.detected && riskDetection.confidence === "high") {
    return `Detected risk signal: ${(riskDetection.riskFlags || riskDetection.matchedSignals || []).join(", ")}`;
  }
  return "Execution stopped by safety detector.";
}

function buildSecurityCheck({ captchaDetection = {}, loginDetection = {}, riskDetection = {} }) {
  const captchaDetected = Boolean(captchaDetection.detected && captchaDetection.confidence !== "low");
  const loginDetected = Boolean(loginDetection.detected && loginDetection.confidence === "high");
  const riskDetected = Boolean(riskDetection.detected && riskDetection.confidence === "high");
  return {
    captchaDetected,
    loginDetected,
    riskDetected,
    captchaDetection,
    loginDetection,
    riskDetection,
    riskFlags: riskDetection.riskFlags || [],
    riskSignalDetails: riskDetection.riskSignalDetails || [],
    ignoredRiskSignals: riskDetection.ignoredRiskSignals || [],
    warnings: [
      ...(captchaDetection.warnings || []),
      ...(loginDetection.warnings || []),
      ...(riskDetection.warnings || [])
    ]
  };
}

function buildFieldClassificationSummary(classificationResult = {}) {
  return {
    allowedCount: classificationResult.allowedFields?.length || 0,
    blockedCount: classificationResult.blockedFields?.length || 0,
    unknownCount: classificationResult.unknownFields?.length || 0,
    duplicateCount: classificationResult.duplicateFields?.length || 0,
    safeOptionalCount: classificationResult.safeOptionalFields?.length || 0
  };
}

module.exports = {
  validateInstruction,
  runFullAutoPrepare
};
