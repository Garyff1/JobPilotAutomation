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
  return (keywords || []).find((keyword) => keywordAppears(normalized, keyword)) || "";
}

function findKeywords(text, keywords = []) {
  const normalized = normalizeText(text);
  return unique((keywords || []).filter((keyword) => keywordAppears(normalized, keyword)));
}

function keywordAppears(text, keyword) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;

  if (isAsciiKeyword(normalizedKeyword)) {
    return new RegExp(`\\b${keywordPattern(normalizedKeyword)}\\b`, "i").test(normalizedText);
  }

  return normalizedText.includes(normalizedKeyword);
}

function hasNegatedKeyword(text, keyword) {
  const raw = String(text || "");
  const kw = String(keyword || "");
  if (!kw) return false;

  const chinesePatterns = [
    `\u65e0${kw}`,
    `\u4e0d${kw}`,
    `\u4e0d\u6536${kw}`,
    `\u65e0\u9700${kw}`,
    `\u6ca1\u6709${kw}`,
    `\u4e0d\u6d89\u53ca${kw}`,
    `\u975e${kw}`,
    `\u4e0d\u9700\u8981${kw}`
  ];
  if (chinesePatterns.some((pattern) => raw.includes(pattern))) return true;

  const lower = raw.toLowerCase();
  const normalizedKeyword = normalizeText(keyword);
  if (normalizedKeyword === "unpaid trial") return false;

  const englishKeywords = englishAliasesForKeyword(kw, normalizedKeyword);
  if (englishKeywords.some((englishKeyword) => hasDirectEnglishNegation(lower, englishKeyword))) {
    return true;
  }

  return englishKeywords.some((englishKeyword) => isFeeRelatedEnglishKeyword(englishKeyword)) &&
    /\bfree\s+of\s+charge\b/i.test(lower);
}

function englishAliasesForKeyword(rawKeyword, normalizedKeyword) {
  const englishRiskMap = {
    "\u62bc\u91d1": ["deposit"],
    "\u6536\u8d39": ["fee", "fees", "application fee", "processing fee"],
    "\u57f9\u8bad\u8d39": ["training fee", "training fees"],
    "\u57f9\u8bad\u8d37": ["training loan"],
    "\u8eab\u4efd\u8bc1\u7167\u7247": ["id photo", "identity photo"],
    "\u94f6\u884c\u5361": ["bank card", "bank account"]
  };

  const aliases = englishRiskMap[rawKeyword] || [normalizedKeyword];
  if (normalizedKeyword === "fee" || normalizedKeyword === "fees") {
    aliases.push("application fee", "processing fee");
  }
  return unique(aliases.map(normalizeText));
}

function hasDirectEnglishNegation(lowerText, keyword) {
  if (!keyword) return false;
  const pattern = keywordPattern(keyword);
  const negations = [
    new RegExp(`\\bno\\s+${pattern}s?\\b`, "i"),
    new RegExp(`\\bwithout\\s+${pattern}s?\\b`, "i"),
    new RegExp(`\\b${pattern}\\s+(is\\s+)?not\\s+required\\b`, "i"),
    new RegExp(`\\b${pattern}\\s+(is\\s+)?not\\s+needed\\b`, "i")
  ];
  return negations.some((negation) => negation.test(lowerText));
}

function isFeeRelatedEnglishKeyword(value) {
  const normalized = normalizeText(value);
  return [
    "fee",
    "fees",
    "charge",
    "application fee",
    "processing fee",
    "charge required",
    "payment required",
    "pay to apply"
  ].includes(normalized);
}

function keywordPattern(value) {
  return escapeRegExp(value).replace(/\\ /g, "\\s+");
}

function isAsciiKeyword(value) {
  return /^[a-z0-9][a-z0-9\s_-]*$/i.test(value);
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
  keywordAppears,
  hasNegatedKeyword,
  isFeeRelatedEnglishKeyword,
  keywordPattern,
  matchesOption
};
