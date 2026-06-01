const ERROR_TYPES = {
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  BROWSER_CRASH: "BROWSER_CRASH",
  PAGE_NAVIGATION_FAILED: "PAGE_NAVIGATION_FAILED",
  SECURITY_BLOCKED: "SECURITY_BLOCKED",
  CAPTCHA_DETECTED: "CAPTCHA_DETECTED",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  FORM_NOT_FOUND: "FORM_NOT_FOUND",
  FIELD_COLLECTION_FAILED: "FIELD_COLLECTION_FAILED",
  FIELD_FILL_FAILED: "FIELD_FILL_FAILED",
  INVALID_INSTRUCTION: "INVALID_INSTRUCTION",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
};

function classifyError(error, stage = "") {
  const message = error?.message || String(error || "");
  if (error?.errorType) {
    return { errorType: error.errorType, message, stage, recoverable: error.errorType !== ERROR_TYPES.BROWSER_CRASH };
  }
  const lower = message.toLowerCase();

  if (lower.includes("timeout")) {
    return { errorType: ERROR_TYPES.NETWORK_TIMEOUT, message, stage, recoverable: true };
  }
  if (lower.includes("browser has been closed") || lower.includes("target closed")) {
    return { errorType: ERROR_TYPES.BROWSER_CRASH, message, stage, recoverable: false };
  }
  if (stage === "NAVIGATE" || lower.includes("navigation") || lower.includes("net::")) {
    return { errorType: ERROR_TYPES.PAGE_NAVIGATION_FAILED, message, stage, recoverable: true };
  }
  if (stage === "VALIDATE_INSTRUCTION") {
    return { errorType: ERROR_TYPES.INVALID_INSTRUCTION, message, stage, recoverable: false };
  }
  if (stage === "COLLECT_FIELDS") {
    return { errorType: ERROR_TYPES.FIELD_COLLECTION_FAILED, message, stage, recoverable: true };
  }
  if (stage === "FILL_FIELDS") {
    return { errorType: ERROR_TYPES.FIELD_FILL_FAILED, message, stage, recoverable: true };
  }

  return { errorType: ERROR_TYPES.UNKNOWN_ERROR, message, stage, recoverable: false };
}

module.exports = {
  ERROR_TYPES,
  classifyError
};
