const fs = require("fs");
const path = require("path");
const { ROOT_DIR } = require("../utils/fsUtils");
const { unique } = require("../utils/textUtils");

const CONFIG_PATH = path.join(ROOT_DIR, "config", "platforms.json");

const DEFAULT_ALLOWED_FIELDS = [
  "姓名",
  "手机号",
  "邮箱",
  "求职岗位",
  "求职城市",
  "教育背景",
  "自我介绍",
  "项目经历摘要",
  "学历",
  "工作类型",
  "经验年限"
];

const DEFAULT_BLOCKED_FIELDS = [
  "身份证号",
  "身份证照片",
  "银行卡",
  "详细家庭住址",
  "紧急联系人",
  "不确定字段",
  "性别",
  "婚育",
  "家庭成员",
  "头像",
  "照片",
  "证件照"
];

const DEFAULT_LOGIN_KEYWORDS = ["登录", "请登录", "账号登录", "扫码登录", "sign in", "login", "passport", "signin", "account"];
const DEFAULT_CAPTCHA_KEYWORDS = ["验证码", "captcha", "Security Verification", "Cloudflare", "EdgeOne", "滑块", "滑块验证", "人机验证", "确认您是真人", "安全验证", "访问验证"];
const DEFAULT_RISK_KEYWORDS = ["收费", "押金", "培训贷", "培训费", "无薪试岗", "身份证照片", "银行卡", "贷款", "保险", "购买课程", "访问受限", "异常访问"];
const DEFAULT_STOP_KEYWORDS = unique([...DEFAULT_LOGIN_KEYWORDS, ...DEFAULT_CAPTCHA_KEYWORDS, ...DEFAULT_RISK_KEYWORDS]);

const FALLBACK_CONFIG = {
  level: "manual",
  allowedFields: DEFAULT_ALLOWED_FIELDS,
  blockedFields: DEFAULT_BLOCKED_FIELDS,
  loginKeywords: DEFAULT_LOGIN_KEYWORDS,
  captchaKeywords: DEFAULT_CAPTCHA_KEYWORDS,
  riskKeywords: DEFAULT_RISK_KEYWORDS,
  stopKeywords: DEFAULT_STOP_KEYWORDS,
  blockTriggers: []
};

let cachedConfig;

function loadPlatformConfigFile() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    cachedConfig = JSON.parse(raw);
  } catch {
    cachedConfig = {};
  }
  return cachedConfig;
}

function normalizePlatformName(platformName) {
  const name = String(platformName || "");
  const lower = name.toLowerCase();
  const atsSignals = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "career", "careers"];
  if (name.includes("官网") || atsSignals.some((signal) => lower.includes(signal))) return "公司官网";
  return name;
}

function mergeConfig(raw = {}) {
  const rules = raw.rules || {};
  const blockTriggers = raw.blockTriggers || raw.stopKeywords || [];
  const captchaKeywords = unique([...(raw.captchaKeywords || []), ...(rules.captchaKeywords || []), ...DEFAULT_CAPTCHA_KEYWORDS]);
  const loginKeywords = unique([...(raw.loginKeywords || []), ...(rules.loginKeywords || []), ...DEFAULT_LOGIN_KEYWORDS]);
  const riskKeywords = unique([...(raw.riskKeywords || []), ...(rules.riskKeywords || []), ...DEFAULT_RISK_KEYWORDS]);
  const stopKeywords = unique([...(raw.stopKeywords || []), ...blockTriggers, ...captchaKeywords, ...loginKeywords, ...riskKeywords]);

  return {
    ...FALLBACK_CONFIG,
    ...raw,
    allowedFields: unique([...(raw.allowedFields || []), ...DEFAULT_ALLOWED_FIELDS]),
    blockedFields: unique([...(raw.blockedFields || []), ...DEFAULT_BLOCKED_FIELDS]),
    loginKeywords,
    captchaKeywords,
    riskKeywords,
    stopKeywords,
    blockTriggers
  };
}

function getPlatformConfig(platformName) {
  const all = loadPlatformConfigFile();
  const normalized = normalizePlatformName(platformName);
  return mergeConfig(all[normalized] || all[platformName] || {});
}

function getStopKeywords(platformName) {
  return getPlatformConfig(platformName).stopKeywords;
}

function getRiskKeywords(platformName) {
  return getPlatformConfig(platformName).riskKeywords;
}

function getAllowedFields(platformName) {
  return getPlatformConfig(platformName).allowedFields;
}

function getBlockedFields(platformName) {
  return getPlatformConfig(platformName).blockedFields;
}

function resetPlatformConfigCache() {
  cachedConfig = undefined;
}

module.exports = {
  CONFIG_PATH,
  getPlatformConfig,
  getStopKeywords,
  getRiskKeywords,
  getAllowedFields,
  getBlockedFields,
  resetPlatformConfigCache
};
