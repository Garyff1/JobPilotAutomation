const STAGES = {
  INIT: "INIT",
  RATE_LIMIT_WAIT: "RATE_LIMIT_WAIT",
  VALIDATE_INPUT: "VALIDATE_INPUT",
  VALIDATE_INSTRUCTION: "VALIDATE_INSTRUCTION",
  LAUNCH_BROWSER: "LAUNCH_BROWSER",
  NAVIGATE: "NAVIGATE",
  DETECT_SECURITY: "DETECT_SECURITY",
  CLICK_APPLY: "CLICK_APPLY",
  COLLECT_FIELDS: "COLLECT_FIELDS",
  CLASSIFY_FIELDS: "CLASSIFY_FIELDS",
  FILL_FIELDS: "FILL_FIELDS",
  SCREENSHOT: "SCREENSHOT",
  BUILD_REPORT: "BUILD_REPORT",
  DONE: "DONE",
  STOPPED: "STOPPED",
  FAILED: "FAILED"
};

class ExecutorState {
  constructor() {
    this.trace = [];
    this.current = null;
  }

  start(stage, message = "", options = {}) {
    if (this.current && this.current.status === "running") {
      const warning = "Previous stage was still running when new stage started";
      this.current.warning = warning;
      this.trace.push({
        stage: "STATE_WARNING",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: "warning",
        message: `${warning}: ${this.current.stage} -> ${stage}`
      });
      if (options.autoClosePrevious) {
        this.done(warning);
      } else {
        this.current.endedAt = new Date().toISOString();
        this.current.status = "failed";
      }
    }
    this.current = {
      stage,
      startedAt: new Date().toISOString(),
      status: "running",
      message
    };
    this.trace.push(this.current);
  }

  done(message = "") {
    if (!this.current) return;
    this.current.endedAt = new Date().toISOString();
    this.current.status = "done";
    if (message) this.current.message = message;
  }

  fail(message = "") {
    if (!this.current) return;
    this.current.endedAt = new Date().toISOString();
    this.current.status = "failed";
    if (message) this.current.message = message;
  }

  skipped(stage, message = "") {
    this.trace.push({
      stage,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      status: "skipped",
      message
    });
  }

  getTrace() {
    return this.trace;
  }
}

module.exports = {
  STAGES,
  ExecutorState
};
