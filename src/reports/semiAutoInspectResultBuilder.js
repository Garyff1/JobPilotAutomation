function baseSemiAutoInspectResult(overrides = {}) {
  return {
    type: "semi_auto_job_inspect_result",
    platform: "",
    url: "",
    finalUrl: "",
    dryRun: true,
    pageAccessible: false,
    manualInterventionRequired: false,
    manualInterventionType: "",
    manualInterventionCompleted: false,
    loginDetectedBefore: false,
    captchaDetectedBefore: false,
    riskDetectedBefore: false,
    securityDetectedBefore: false,
    loginDetectedAfter: false,
    captchaDetectedAfter: false,
    riskDetectedAfter: false,
    securityDetectedAfter: false,
    riskFlags: [],
    title: "",
    visibleTextLength: 0,
    possibleJobTitle: "",
    possibleCompanyName: "",
    possibleSalaryText: "",
    possibleLocationText: "",
    possibleResponsibilities: [],
    possibleRequirements: [],
    extractedTextPreview: "",
    jobInspectionHints: {
      canUseForJobCheck: true,
      suggestedNextStep: "copy_to_jobpilot_job_check",
      notes: [
        "已读取页面可见岗位文本，可复制到 JobPilot 岗位体检中心进行进一步分析。"
      ]
    },
    screenshotPath: "",
    stopped: false,
    stopReason: "",
    errorType: "",
    warnings: [],
    navigationAttempts: [],
    pageReadiness: null,
    executionTrace: [],
    reportTime: new Date().toISOString(),
    ...overrides
  };
}

function withSemiAutoTrace(report, state) {
  return {
    ...report,
    executionTrace: state?.getTrace ? state.getTrace() : (report.executionTrace || []),
    reportTime: report.reportTime || new Date().toISOString()
  };
}

module.exports = {
  baseSemiAutoInspectResult,
  withSemiAutoTrace
};
