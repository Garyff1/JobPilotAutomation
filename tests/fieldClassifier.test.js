const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyField } = require("../src/forms/fieldClassifier");

const instruction = {
  allowedFields: ["姓名", "项目经历摘要"],
  blockedFields: ["身份证号"]
};
const platformConfig = {
  allowedFields: ["姓名", "项目经历摘要"],
  blockedFields: ["身份证号"]
};

test("name field is allowed", () => {
  const field = { tagName: "input", type: "text", labelText: "姓名", placeholder: "", name: "", id: "" };
  const result = classifyField(field, instruction, platformConfig);
  assert.equal(result.kind, "allowed");
  assert.equal(result.label, "姓名");
  assert.equal(result.normalizedFieldKey, "fullName");
});

test("split name fields are allowed when full name is allowed", () => {
  const firstName = classifyField({ tagName: "input", type: "text", labelText: "First Name", placeholder: "", name: "", id: "" }, instruction, platformConfig);
  const lastName = classifyField({ tagName: "input", type: "text", labelText: "Last Name", placeholder: "", name: "", id: "" }, instruction, platformConfig);
  assert.equal(firstName.kind, "allowed");
  assert.equal(firstName.normalizedFieldKey, "firstName");
  assert.equal(lastName.kind, "allowed");
  assert.equal(lastName.normalizedFieldKey, "lastName");
});

test("optional profile links are recognized without becoming unknown fields", () => {
  const field = { tagName: "input", type: "text", labelText: "LinkedIn Profile", placeholder: "", name: "", id: "" };
  const result = classifyField(field, instruction, platformConfig);
  assert.equal(result.kind, "allowed");
  assert.equal(result.normalizedFieldKey, "linkedin");
  assert.equal(result.safeOptional, true);
});

test("identity field is blocked", () => {
  const field = { tagName: "input", type: "text", labelText: "身份证号", placeholder: "", name: "", id: "" };
  const result = classifyField(field, instruction, platformConfig);
  assert.equal(result.kind, "blocked");
});

test("project number is not treated as project experience", () => {
  const field = { tagName: "input", type: "text", labelText: "项目编号", placeholder: "", name: "", id: "" };
  const result = classifyField(field, instruction, platformConfig);
  assert.equal(result.kind, "unknown");
});

test("unknown field remains unknown", () => {
  const field = { tagName: "input", type: "text", labelText: "喜欢的颜色", placeholder: "", name: "", id: "" };
  const result = classifyField(field, instruction, platformConfig);
  assert.equal(result.kind, "unknown");
});
