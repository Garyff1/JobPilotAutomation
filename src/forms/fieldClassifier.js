const { findKeyword, normalizeText, compactText } = require("../utils/textUtils");

const FULL_NAME_LABEL = "姓名";

const FIELD_RULES = [
  {
    key: "firstName",
    valueKey: "firstName",
    normalizedFieldKey: "firstName",
    patterns: ["first name", "given name", "firstname"],
    allowedIfAllowedValueKeys: ["fullName", "name"]
  },
  {
    key: "lastName",
    valueKey: "lastName",
    normalizedFieldKey: "lastName",
    patterns: ["last name", "family name", "surname", "lastname"],
    allowedIfAllowedValueKeys: ["fullName", "name"]
  },
  {
    key: FULL_NAME_LABEL,
    valueKey: "fullName",
    normalizedFieldKey: "fullName",
    patterns: [FULL_NAME_LABEL, "名字", "全名", "full name", "realname", "username"],
    exactPatterns: ["name"]
  },
  { key: "手机号", valueKey: "phone", normalizedFieldKey: "phone", patterns: ["手机", "手机号", "电话", "联系方式", "mobile", "phone", "tel"] },
  { key: "邮箱", valueKey: "email", normalizedFieldKey: "email", patterns: ["邮箱", "邮件", "email", "mail"] },
  { key: "LinkedIn Profile", valueKey: "linkedin", normalizedFieldKey: "linkedin", patterns: ["linkedin", "linkedin profile", "linkedin url"], safeOptional: true },
  { key: "Country", valueKey: "country", normalizedFieldKey: "country", patterns: ["country", "国家", "所在国家"], safeOptional: true },
  { key: "Current Location", valueKey: "currentLocation", normalizedFieldKey: "currentLocation", patterns: ["current location", "current city", "current address", "现居地", "当前城市", "所在城市"], safeOptional: true },
  { key: "Website / Portfolio", valueKey: "portfolio", normalizedFieldKey: "portfolio", patterns: ["portfolio", "website", "personal website", "作品集", "个人网站"], safeOptional: true },
  { key: "求职岗位", valueKey: "jobTitle", normalizedFieldKey: "jobTitle", patterns: ["岗位", "职位", "应聘职位", "申请职位", "position", "job"] },
  { key: "求职城市", valueKey: "city", normalizedFieldKey: "city", patterns: ["城市", "地点", "工作地", "期望城市", "location", "city"] },
  { key: "教育背景", valueKey: "education", normalizedFieldKey: "education", patterns: ["教育", "学校", "学历", "专业", "education", "school", "degree"] },
  { key: "自我介绍", valueKey: "intro", normalizedFieldKey: "intro", patterns: ["自我介绍", "个人介绍", "个人优势", "简介", "介绍一下", "introduction", "summary", "about"] },
  {
    key: "项目经历摘要",
    valueKey: "projectSummary",
    normalizedFieldKey: "projectSummary",
    patterns: ["项目经历", "项目经验", "项目介绍", "项目描述", "项目成果", "作品经历", "实践经历", "project experience", "project description"]
  },
  { key: "学历", valueKey: "degree", normalizedFieldKey: "degree", patterns: ["学历", "学位", "degree", "education level"] },
  { key: "工作类型", valueKey: "workType", normalizedFieldKey: "workType", patterns: ["工作类型", "用工类型", "职位类型", "工作性质", "employment", "job type"] },
  { key: "经验年限", valueKey: "experienceYears", normalizedFieldKey: "experienceYears", patterns: ["经验", "年限", "工作年限", "experience years"] }
];

function fieldSearchText(field) {
  return [
    field.labelText,
    field.placeholder,
    field.name,
    field.id,
    field.ariaLabel,
    field.visibleText,
    field.type
  ].join(" ");
}

function pickFirst(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function splitName(fullName) {
  const clean = String(fullName || "").trim();
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ")
    };
  }
  const chars = Array.from(clean);
  if (/[\u4e00-\u9fff]/.test(clean) && chars.length >= 2) {
    return {
      firstName: chars.slice(1).join(""),
      lastName: chars[0]
    };
  }
  return { firstName: clean, lastName: "" };
}

function buildProfileValues(instruction) {
  const profile = instruction.profile || {};
  const basicInfo = profile.basicInfo || {};
  const job = instruction.job || {};
  const testValueKeys = new Set();

  const providedFullName = pickFirst(
    profile.fullName,
    profile.name,
    profile.realName,
    basicInfo.realName,
    basicInfo.nickname
  );
  const hasRealName = Boolean(String(providedFullName || "").trim() || profile.firstName || profile.lastName || basicInfo.firstName || basicInfo.lastName);
  const fullName = hasRealName ? pickFirst(providedFullName, [profile.firstName, profile.lastName].filter(Boolean).join(" ")) : "Test User";
  const split = splitName(fullName);
  const firstName = pickFirst(profile.firstName, basicInfo.firstName, split.firstName, hasRealName ? "" : "Test");
  const lastName = pickFirst(profile.lastName, basicInfo.lastName, split.lastName, hasRealName ? "" : "User");

  if (!hasRealName) {
    testValueKeys.add("fullName");
    testValueKeys.add("firstName");
    testValueKeys.add("lastName");
  }

  const currentCity = pickFirst(profile.currentCity, basicInfo.currentCity, profile.city, job.locationText);

  return {
    name: fullName,
    fullName,
    firstName,
    lastName,
    phone: pickFirst(profile.phone, basicInfo.phone),
    email: pickFirst(profile.email, basicInfo.email),
    linkedin: pickFirst(profile.linkedin, profile.linkedinProfile, basicInfo.linkedin),
    country: pickFirst(profile.country, basicInfo.country),
    currentLocation: currentCity,
    portfolio: pickFirst(profile.portfolio, profile.website, profile.personalWebsite, basicInfo.portfolio),
    jobTitle: job.jobTitle || "",
    city: pickFirst(profile.city, profile.targetCity, currentCity, job.locationText),
    education: profile.educationSummary || "",
    intro: profile.introduction || "我关注 AI 工具应用、产品协作、需求整理和项目推进方向，希望进一步了解岗位内容与团队情况。",
    projectSummary: profile.projectSummary || "曾参与 JobPilot AI 等 AI 工具应用项目，覆盖需求整理、功能拆解、风险识别和流程优化。",
    degree: profile.degree || profile.educationLevel || "",
    workType: profile.workType || "全职",
    experienceYears: profile.experienceYears || "",
    __testValueKeys: testValueKeys
  };
}

function classifyField(field, instruction, platformConfig) {
  const text = fieldSearchText(field);
  const blockedFields = [...(instruction.blockedFields || []), ...(platformConfig.blockedFields || [])];
  const blockedMatch = findKeyword(text, blockedFields);

  if (field.type === "file") {
    return { kind: "blocked", label: labelForResult(field), reason: "file_input_skipped" };
  }
  if (["checkbox", "radio", "submit", "button", "reset", "hidden", "password"].includes(normalizeText(field.type))) {
    return { kind: "blocked", label: labelForResult(field), reason: `input_type_${field.type || "unknown"}_skipped` };
  }
  if (blockedMatch) {
    return { kind: "blocked", label: labelForResult(field), reason: `blocked_field:${blockedMatch}` };
  }

  const instructionAllowedFields = instruction.allowedFields || [];
  const platformAllowedFields = platformConfig.allowedFields || [];
  const allowedFields = instructionAllowedFields.length ? instructionAllowedFields : platformAllowedFields;

  for (const rule of FIELD_RULES) {
    const allowed = rule.safeOptional || isRuleAllowed(rule, allowedFields);
    const matchesText = matchesRule(rule, text);
    if (allowed && matchesText) {
      return {
        kind: "allowed",
        label: rule.key,
        valueKey: rule.valueKey,
        normalizedFieldKey: rule.normalizedFieldKey || rule.valueKey,
        safeOptional: Boolean(rule.safeOptional),
        reason: `matched:${rule.key}`
      };
    }
  }

  return { kind: "unknown", label: labelForResult(field), reason: "no_allowed_rule_match" };
}

function classifyFields(fields = [], instruction = {}, platformConfig = {}) {
  const classifiedFields = (fields || []).map((field) => ({
    field,
    classification: classifyField(field, instruction, platformConfig)
  }));
  const allowedFields = [];
  const blockedFields = [];
  const unknownFields = [];
  const duplicateFields = [];
  const safeOptionalFields = [];
  const seenAllowedKeys = new Set();

  classifiedFields.forEach((item) => {
    const classification = item.classification || {};
    const normalizedKey = classification.normalizedFieldKey || classification.valueKey || classification.label || "";

    if (classification.kind === "allowed") {
      allowedFields.push(item);
      if (classification.safeOptional) safeOptionalFields.push(item);
      if (normalizedKey && seenAllowedKeys.has(normalizedKey)) {
        duplicateFields.push(item);
      } else if (normalizedKey) {
        seenAllowedKeys.add(normalizedKey);
      }
      return;
    }

    if (classification.kind === "blocked") {
      blockedFields.push(item);
      return;
    }

    unknownFields.push(item);
  });

  return {
    classifiedFields,
    allowedFields,
    blockedFields,
    unknownFields,
    duplicateFields,
    safeOptionalFields
  };
}

function isRuleAllowed(rule, allowedFields = []) {
  const normalizedAllowed = new Set((allowedFields || []).map((field) => normalizeText(field)));
  const compactAllowed = new Set((allowedFields || []).map((field) => compactText(field)));
  if (normalizedAllowed.has(normalizeText(rule.key)) || compactAllowed.has(compactText(rule.key))) return true;

  const aliases = rule.allowedAliases || [];
  if (aliases.some((alias) => normalizedAllowed.has(normalizeText(alias)) || compactAllowed.has(compactText(alias)))) return true;

  if (rule.allowedIfAllowedValueKeys?.length) {
    return FIELD_RULES.some((candidate) => {
      if (!rule.allowedIfAllowedValueKeys.includes(candidate.valueKey)) return false;
      return normalizedAllowed.has(normalizeText(candidate.key)) || compactAllowed.has(compactText(candidate.key));
    });
  }

  return false;
}

function matchesRule(rule, text) {
  const normalized = normalizeText(text);
  const compact = compactText(text);
  const patternMatch = (rule.patterns || []).some((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    const compactPattern = compactText(pattern);
    return normalized.includes(normalizedPattern) || compact.includes(compactPattern);
  });
  if (patternMatch) return true;

  return (rule.exactPatterns || []).some((pattern) => compact === compactText(pattern));
}

function labelForResult(field) {
  return field.labelText || field.placeholder || field.name || field.id || field.ariaLabel || `${field.tagName}_field`;
}

module.exports = {
  FIELD_RULES,
  buildProfileValues,
  classifyField,
  classifyFields,
  labelForResult
};
