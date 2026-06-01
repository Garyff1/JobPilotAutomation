const { findKeywords, hasNegatedKeyword, unique } = require("../utils/textUtils");

const ENGLISH_RISK_TERMS = [
  { keyword: "deposit", flag: "deposit", language: "en" },
  { keyword: "fee", flag: "fee", language: "en" },
  { keyword: "fees", flag: "fee", language: "en" },
  { keyword: "charge", flag: "fee", language: "en" },
  { keyword: "training fee", flag: "training_fee", language: "en" },
  { keyword: "training fees", flag: "training_fee", language: "en" },
  { keyword: "training loan", flag: "training_loan", language: "en" },
  { keyword: "unpaid trial", flag: "unpaid_trial", language: "en" },
  { keyword: "bank card", flag: "bank_card", language: "en" },
  { keyword: "bank account", flag: "bank_card", language: "en" },
  { keyword: "identity photo", flag: "identity_photo", language: "en" },
  { keyword: "id photo", flag: "identity_photo", language: "en" },
  { keyword: "passport photo", flag: "identity_photo", language: "en" }
];

function detectRisk({ title = "", bodyText = "", platformConfig }) {
  const riskKeywords = platformConfig.riskKeywords || [];
  const text = `${title}\n${bodyText}`;
  const matched = findKeywords(text, riskKeywords);
  const riskSignalDetails = [];

  matched.forEach((keyword) => {
    riskSignalDetails.push({
      keyword,
      flag: keyword,
      language: /[a-z]/i.test(keyword) ? "en" : "zh",
      negated: hasNegatedKeyword(text, keyword),
      confidence: hasNegatedKeyword(text, keyword) ? "low" : "high"
    });
  });

  const lower = String(text || "").toLowerCase();
  ENGLISH_RISK_TERMS.forEach((term) => {
    if (!lower.includes(term.keyword)) return;
    if (riskSignalDetails.some((item) => item.keyword.toLowerCase() === term.keyword)) return;
    const negated = hasNegatedKeyword(text, term.keyword) || hasEnglishNegation(lower, term.keyword);
    riskSignalDetails.push({
      ...term,
      negated,
      confidence: negated ? "low" : "high"
    });
  });

  const activeSignals = riskSignalDetails.filter((item) => !item.negated);
  const ignoredRiskSignals = riskSignalDetails.filter((item) => item.negated);
  const detected = activeSignals.length > 0;
  const confidence = activeSignals.length > 0 ? "high" : "low";

  return {
    detected,
    type: "risk",
    confidence,
    matchedSignals: unique([
      ...activeSignals.map((item) => item.keyword),
      ...ignoredRiskSignals.map((item) => `negated:${item.keyword}`)
    ]),
    riskFlags: unique(activeSignals.map((item) => item.flag || item.keyword)),
    riskSignalDetails,
    ignoredRiskSignals,
    warnings: ignoredRiskSignals.map((item) => `Risk term appeared in a negated context: ${item.keyword}`),
    reason: detected
      ? "Detected risk keywords without local negation."
      : (ignoredRiskSignals.length ? "Risk keywords appeared only in negated contexts." : "")
  };
}

function hasEnglishNegation(lowerText, keyword) {
  const escapedKeyword = escapeRegExp(keyword).replace(/\\ /g, "\\s+");
  const patterns = [
    new RegExp(`\\bno\\s+${escapedKeyword}\\b`, "i"),
    new RegExp(`\\bwithout\\s+${escapedKeyword}\\b`, "i"),
    new RegExp(`\\b${escapedKeyword}\\s+(is\\s+)?not\\s+required\\b`, "i"),
    new RegExp(`\\b${escapedKeyword}\\s+(is\\s+)?not\\s+needed\\b`, "i"),
    /\bfree\s+of\s+charge\b/i
  ];
  if (keyword === "unpaid trial") return false;
  return patterns.some((pattern) => pattern.test(lowerText));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  detectRisk,
  hasEnglishNegation
};
