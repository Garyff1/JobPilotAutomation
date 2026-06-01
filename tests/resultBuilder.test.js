const test = require("node:test");
const assert = require("node:assert/strict");
const { baseResult } = require("../src/reports/resultBuilder");

test("base result includes stable executor result fields", () => {
  const result = baseResult({ action: "prepare_application_form", dryRun: true, userConfirmed: false, job: { jobUrl: "https://example.com" } });
  assert.equal(result.type, "full_auto_executor_result");
  assert.equal(result.instructionAction, "prepare_application_form");
  assert.equal(result.jobUrl, "https://example.com");
  assert.equal(Array.isArray(result.fieldsFilled), true);
  assert.equal(Array.isArray(result.fieldsSkipped), true);
  assert.equal(Array.isArray(result.unknownFields), true);
  assert.equal(Array.isArray(result.riskFlags), true);
  assert.equal(Array.isArray(result.executionTrace), true);
  assert.ok(result.reportTime);
});
