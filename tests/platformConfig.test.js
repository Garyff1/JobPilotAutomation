const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlatformConfig, getAllowedFields } = require("../src/config/platformConfig");
const { inferPlatformFromUrl } = require("../src/config/platformInference");

test("platformConfig reads company website config", () => {
  const config = getPlatformConfig("公司官网");
  assert.equal(config.level, "full_auto_prepare");
  assert.ok(config.riskKeywords.includes("银行卡"));
});

test("unknown platform falls back safely", () => {
  const config = getPlatformConfig("不存在的平台");
  assert.ok(Array.isArray(config.allowedFields));
  assert.ok(getAllowedFields("不存在的平台").includes("姓名"));
});

test("inferPlatformFromUrl maps common platforms", () => {
  assert.equal(inferPlatformFromUrl("https://www.zhaopin.com/jobdetail/1.htm"), "智联招聘");
  assert.equal(inferPlatformFromUrl("https://www.zhipin.com/job_detail/abc.html"), "BOSS直聘");
  assert.equal(inferPlatformFromUrl("https://jobs.lever.co/demo/123"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://boards.greenhouse.io/gitlab/jobs/123"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://job-boards.greenhouse.io/company/jobs/123"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://www.apple.com/careers/us/"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://careers.google.com/jobs/results/123"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://company.example/about/careers/product-manager"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://example.com/jobs/123"), "公司官网");
  assert.equal(inferPlatformFromUrl("https://unknown.example/path"), "未知平台");
});
