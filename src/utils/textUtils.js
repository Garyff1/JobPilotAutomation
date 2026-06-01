function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value) {
  return normalizeText(value).replace(/[\s_-]+/g, "");
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function findKeyword(text, keywords = []) {
  const normalized = normalizeText(text);
  return (keywords || []).find((keyword) => normalized.includes(normalizeText(keyword))) || "";
}

function findKeywords(text, keywords = []) {
  const normalized = normalizeText(text);
  return unique((keywords || []).filter((keyword) => normalized.includes(normalizeText(keyword))));
}

function hasNegatedKeyword(text, keyword) {
  const raw = String(text || "");
  const kw = String(keyword || "");
  if (!kw) return false;
  const patterns = [
    `无${kw}`,
    `不${kw}`,
    `不收${kw}`,
    `无需${kw}`,
    `没有${kw}`,
    `不涉及${kw}`,
    `非${kw}`,
    `不需要${kw}`
  ];
  if (patterns.some((pattern) => raw.includes(pattern))) return true;

  const lower = raw.toLowerCase();
  const normalizedKeyword = String(keyword || "").toLowerCase();
  const normalizedKeywordPattern = escapeRegExp(normalizedKeyword).replace(/\\ /g, "\\s+");
  if (normalizedKeyword && normalizedKeyword !== "unpaid trial") {
    const directEnglishNegations = [
      new RegExp(`\\bno\\s+${normalizedKeywordPattern}s?\\b`, "i"),
      new RegExp(`\\bwithout\\s+${normalizedKeywordPattern}s?\\b`, "i"),
      new RegExp(`\\b${normalizedKeywordPattern}\\s+(is\\s+)?not\\s+required\\b`, "i"),
      new RegExp(`\\b${normalizedKeywordPattern}\\s+(is\\s+)?not\\s+needed\\b`, "i")
    ];
    if (directEnglishNegations.some((pattern) => pattern.test(lower))) return true;
  }
  if ((normalizedKeyword === "fee" || normalizedKeyword === "fees" || normalizedKeyword === "charge") && lower.includes("free of charge")) return true;
  const englishRiskMap = {
    "押金": ["deposit"],
    "收费": ["fee", "fees", "charge"],
    "培训费": ["training fee", "training fees"],
    "培训贷": ["training loan"],
    "身份证照片": ["id photo", "identity photo"],
    "银行卡": ["bank card", "bank account"]
  };
  const englishKeywords = englishRiskMap[kw] || [normalizedKeyword];
  const negativePrefixes = ["no ", "without ", "not required", "not needed", "free of charge"];
  return englishKeywords.some((englishKeyword) => {
    if (!englishKeyword) return false;
    if (lower.includes("unpaid trial") && englishKeyword.includes("paid")) return false;
    return (
      lower.includes(`no ${englishKeyword}`) ||
      lower.includes(`without ${englishKeyword}`) ||
      lower.includes(`${englishKeyword} not required`) ||
      lower.includes(`${englishKeyword} not needed`) ||
      (["fee", "fees", "charge"].includes(englishKeyword) && lower.includes("free of charge")) ||
      negativePrefixes.some((prefix) => lower.includes(`${prefix}${englishKeyword}`))
    );
  });
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesOption(option, expectedValue) {
  const expected = compactText(expectedValue);
  const value = compactText(option.value);
  const text = compactText(option.text);
  if (!expected) return false;
  const valueMatches = Boolean(value) && (value === expected || value.includes(expected) || expected.includes(value));
  const textMatches = Boolean(text) && (text === expected || text.includes(expected) || expected.includes(text));
  return valueMatches || textMatches;
}

module.exports = {
  normalizeText,
  compactText,
  unique,
  findKeyword,
  findKeywords,
  hasNegatedKeyword,
  matchesOption
};
