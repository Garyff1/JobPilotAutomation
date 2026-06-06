const { matchesOption } = require("../utils/textUtils");

async function fillField(page, field, classification, value) {
  if (!value) {
    return { filled: false, reason: "missing_value" };
  }
  if (!field?.selector || classification.kind !== "allowed") {
    return { filled: false, reason: "not_allowed" };
  }

  if (field.tagName === "select") {
    return fillSelectField(page, field, value);
  }

  if (field.type === "file") {
    return { filled: false, reason: "file_upload_disabled" };
  }

  try {
    await page.locator(field.selector).fill(String(value), { timeout: 3000 });
    await page.locator(field.selector).dispatchEvent("change").catch(() => undefined);
    return { filled: true, reason: "filled" };
  } catch (error) {
    return { filled: false, reason: `fill_failed:${error.message}` };
  }
}

async function fillSelectField(page, field, value) {
  const options = field.options || [];
  const match = options.find((option) => matchesOption(option, value));
  if (!match) {
    return { filled: false, reason: "select_no_matching_option" };
  }

  try {
    const selectorValue = match.value ? { value: match.value } : { label: match.text };
    await page.selectOption(field.selector, selectorValue, { timeout: 3000 });
    await page.locator(field.selector).dispatchEvent("change").catch(() => undefined);
    return { filled: true, reason: "select_filled", selectedText: match.text || match.value };
  } catch (error) {
    return { filled: false, reason: `select_fill_failed:${error.message}` };
  }
}

async function fillAllowedFields(page, fields, instruction, platformConfig, classifyField, buildProfileValues, classificationResult = null) {
  const values = buildProfileValues(instruction);
  const testValueKeys = values.__testValueKeys || new Set();
  const fieldsFilled = [];
  const fieldsSkipped = [];
  const unknownFields = [];
  const filledKeys = new Set();
  let testValueUsed = false;
  const classifiedFields = classificationResult?.classifiedFields || fields.map((field) => ({
    field,
    classification: classifyField(field, instruction, platformConfig)
  }));
  const hasSplitNameFields = classifiedFields.some((item) => item.classification.normalizedFieldKey === "firstName") &&
    classifiedFields.some((item) => item.classification.normalizedFieldKey === "lastName");

  for (const { field, classification } of classifiedFields) {
    const normalizedKey = classification.normalizedFieldKey || classification.valueKey || classification.label;
    const fieldLabel = normalizedKey || classification.label;

    if (classification.kind === "blocked") {
      fieldsSkipped.push(`${fieldLabel} (${classification.reason})`);
      continue;
    }

    if (classification.kind === "unknown") {
      unknownFields.push(`${fieldLabel} (${classification.reason})`);
      continue;
    }

    if (normalizedKey === "fullName" && hasSplitNameFields) {
      fieldsSkipped.push(`${fieldLabel} (name_split_fields_preferred)`);
      continue;
    }

    if (filledKeys.has(normalizedKey)) {
      fieldsSkipped.push(`${fieldLabel} (duplicate_allowed_field)`);
      continue;
    }

    const value = values[classification.valueKey];
    if (!value) {
      fieldsSkipped.push(`${fieldLabel} (${missingValueReason(normalizedKey)})`);
      continue;
    }

    const result = await fillField(page, field, classification, value);
    if (result.filled) {
      fieldsFilled.push(result.selectedText ? `${fieldLabel}: ${result.selectedText}` : fieldLabel);
      filledKeys.add(normalizedKey);
      if (testValueKeys.has(normalizedKey) || testValueKeys.has(classification.valueKey)) {
        testValueUsed = true;
      }
    } else {
      fieldsSkipped.push(`${fieldLabel} (${result.reason})`);
    }
  }

  return {
    fieldsFilled: Array.from(new Set(fieldsFilled)),
    fieldsSkipped: Array.from(new Set(fieldsSkipped)),
    unknownFields: Array.from(new Set(unknownFields)),
    testValueUsed
  };
}

function missingValueReason(normalizedKey) {
  const reasons = {
    linkedin: "missing_optional_profile_link",
    portfolio: "missing_optional_profile_link",
    country: "missing_optional_country",
    currentLocation: "missing_optional_current_location"
  };
  return reasons[normalizedKey] || "missing_value";
}

module.exports = {
  fillField,
  fillSelectField,
  fillAllowedFields,
  missingValueReason
};
