const test = require("node:test");
const assert = require("node:assert/strict");
const { findApplyButton, compactButtonText, ALLOWED_APPLY_PATTERNS, BLOCKED_CLICK_PATTERNS } = require("../src/actions/applyClicker");

test("allowed patterns include common apply texts", () => {
  assert.ok(ALLOWED_APPLY_PATTERNS.includes("apply for this job"));
  assert.ok(ALLOWED_APPLY_PATTERNS.includes("开始申请"));
  assert.ok(ALLOWED_APPLY_PATTERNS.includes("申请"));
});

test("blocked patterns never include allowed phrases", () => {
  for (const allowed of ALLOWED_APPLY_PATTERNS) {
    for (const blocked of BLOCKED_CLICK_PATTERNS) {
      if (allowed.includes(blocked)) {
        assert.fail(`"${allowed}" contains blocked pattern "${blocked}"`);
      }
    }
  }
});

test("blocked patterns catch submit-related texts", () => {
  assert.ok(BLOCKED_CLICK_PATTERNS.includes("submit"));
  assert.ok(BLOCKED_CLICK_PATTERNS.includes("确认提交"));
  assert.ok(BLOCKED_CLICK_PATTERNS.includes("投递"));
});

test("findApplyButton returns null for empty page", async () => {
  const page = {
    locator: () => ({
      all: async () => []
    })
  };
  const result = await findApplyButton(page);
  assert.equal(result, null);
});

test("compactButtonText removes duplicate apply text sources", () => {
  assert.equal(compactButtonText(["Apply", "Apply", " Apply ", ""]), "Apply");
  assert.equal(compactButtonText(["Apply", "Apply now", "Apply"]), "Apply Apply now");
});

test("findApplyButton skips invisible elements", async () => {
  let callCount = 0;
  const page = {
    locator: () => ({
      all: async () => {
        callCount++;
        if (callCount > 4) {
          return [{
            isVisible: async () => false,
            textContent: async () => "Apply for this job"
          }];
        }
        return [];
      }
    })
  };
  const result = await findApplyButton(page);
  assert.equal(result, null);
});
