async function collectFields(page) {
  const fields = await page.$$eval("input, textarea, select, [contenteditable='true']", (elements) => {
    function clean(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function labelFor(el) {
      const id = el.getAttribute("id");
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrappingLabel = el.closest("label");
      const previous = el.previousElementSibling;
      const parentText = clean(el.parentElement && el.parentElement.textContent).slice(0, 120);
      return clean(byFor && byFor.textContent) || clean(wrappingLabel && wrappingLabel.textContent) || clean(previous && previous.textContent) || parentText;
    }

    return elements
      .map((el, index) => {
        const tagName = el.tagName.toLowerCase();
        const selector = `[data-jobpilot-field-index="${index}"]`;
        el.setAttribute("data-jobpilot-field-index", String(index));
        const options = tagName === "select"
          ? Array.from(el.options || []).map((option) => ({ value: option.value || "", text: clean(option.textContent) }))
          : undefined;
        return {
          selector,
          tagName,
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          placeholder: el.getAttribute("placeholder") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          labelText: labelFor(el),
          visibleText: clean(el.textContent).slice(0, 120),
          options,
          visible: isVisible(el),
          disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
          readonly: Boolean(el.readOnly) || el.getAttribute("readonly") !== null
        };
      })
      .filter((field) => field.visible && !field.disabled && !field.readonly);
  });

  const iframeCount = await page.locator("iframe").count().catch(() => 0);
  const accessibleFrameCount = Math.max(page.frames().length - 1, 0);
  const inaccessibleFrameCount = Math.max(iframeCount - accessibleFrameCount, 0);
  const shadowHostCount = await page
    .$$eval("form, form *, input, textarea, select, [contenteditable='true'], [class*='form' i], [id*='form' i]", (nodes) => nodes.slice(0, 300).filter((node) => node.shadowRoot).length)
    .catch(() => 0);

  return {
    fields,
    iframeCount,
    accessibleFrameCount,
    inaccessibleFrameCount,
    shadowHostCount
  };
}

module.exports = {
  collectFields
};
