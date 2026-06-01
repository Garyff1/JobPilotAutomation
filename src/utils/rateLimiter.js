const fs = require("fs");
const path = require("path");
const { ROOT_DIR, writeJsonFile } = require("./fsUtils");
const { STAGES } = require("../state/executorState");

const TMP_DIR = path.join(ROOT_DIR, "tmp");
const LAST_RUN_PATH = path.join(TMP_DIR, "last_run.json");

const DEFAULT_INTERVALS = {
  job_check: 3000,
  platform_probe: 5000,
  full_auto_prepare: 5000
};

function readLastRun() {
  try {
    return JSON.parse(fs.readFileSync(LAST_RUN_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeLastRun(data) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  writeJsonFile(LAST_RUN_PATH, data);
}

function getRateLimitWaitMs(action, now = Date.now(), intervals = DEFAULT_INTERVALS) {
  const lastRun = readLastRun();
  const intervalMs = intervals[action] || 0;
  const previous = Number(lastRun[action] || 0);
  if (!intervalMs || !previous) return 0;
  return Math.max(0, intervalMs - (now - previous));
}

async function applyRateLimit({ action, noRateLimit = false, state, intervals = DEFAULT_INTERVALS } = {}) {
  if (!action || noRateLimit) {
    return { waitedMs: 0, skipped: Boolean(noRateLimit) };
  }

  const waitMs = getRateLimitWaitMs(action, Date.now(), intervals);
  if (waitMs > 0) {
    if (state?.start) state.start(STAGES.RATE_LIMIT_WAIT, `Waiting ${waitMs}ms before ${action}.`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (state?.done) state.done(`Rate limit wait completed: ${waitMs}ms.`);
  } else if (state?.skipped) {
    state.skipped(STAGES.RATE_LIMIT_WAIT, "No rate limit wait needed.");
  }

  const lastRun = readLastRun();
  lastRun[action] = Date.now();
  writeLastRun(lastRun);
  return { waitedMs: waitMs, skipped: false };
}

module.exports = {
  DEFAULT_INTERVALS,
  LAST_RUN_PATH,
  getRateLimitWaitMs,
  applyRateLimit
};
