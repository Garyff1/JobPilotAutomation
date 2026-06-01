const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutorState, STAGES } = require("../src/state/executorState");

test("ExecutorState records warning when starting over a running stage", () => {
  const state = new ExecutorState();
  state.start(STAGES.NAVIGATE);
  state.start(STAGES.COLLECT_FIELDS);
  const trace = state.getTrace();
  assert.equal(trace.some((item) => item.stage === "STATE_WARNING"), true);
  assert.equal(trace[0].status, "failed");
});

test("ExecutorState can explicitly auto-close previous stage", () => {
  const state = new ExecutorState();
  state.start(STAGES.NAVIGATE);
  state.start(STAGES.COLLECT_FIELDS, "", { autoClosePrevious: true });
  const trace = state.getTrace();
  assert.equal(trace[0].status, "done");
  assert.equal(trace.some((item) => item.stage === "STATE_WARNING"), true);
});
