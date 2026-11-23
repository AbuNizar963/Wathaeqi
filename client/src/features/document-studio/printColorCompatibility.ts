const SAFE_COLOR_FALLBACK = "rgb(100, 116, 139)";

/**
 * Replaces CSS Color 4 OKLCH tokens with colors resolved by the browser.
 * html2canvas currently cannot parse OKLCH even when Chromium can render it.
 */
export function replaceUnsupportedColorFunctions(
  value: string,
  resolveColor: (colorFunction: string) => string
): string {
  let result = "";
  let cursor = 0;
  const matcher = /oklch\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) !== null) {
    const start = match.index;
    let depth = 1;
    let end = matcher.lastIndex;

    while (end < value.length && depth > 0) {
      if (value[end] === "(") depth += 1;
      if (value[end] === ")") depth -= 1;
      end += 1;
    }

    if (depth !== 0) break;

    const token = value.slice(start, end);
    const resolved = resolveColor(token);
    result += value.slice(cursor, start);
    result += resolved || SAFE_COLOR_FALLBACK;
    cursor = end;
    matcher.lastIndex = end;
  }

  return result + value.slice(cursor);
}

function sanitizeDeclaration(
  declaration: CSSStyleDeclaration,
  resolveColor: (colorFunction: string) => string
): void {
  for (let index = 0; index < declaration.length; index += 1) {
    const property = declaration.item(index);
    const value = declaration.getPropertyValue(property);
    if (!/oklch\s*\(/i.test(value)) continue;

    declaration.setProperty(
      property,
      replaceUnsupportedColorFunctions(value, resolveColor),
      declaration.getPropertyPriority(property)
    );
  }
}

/** Sanitizes cloned inline styles and accessible stylesheet rules in-place. */
export function sanitizeUnsupportedPrintColors(document: Document): void {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;color:#000";
  document.body.appendChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  const resolveColor = (colorFunction: string): string => {
    try {
      probe.style.color = colorFunction;
      const computed = document.defaultView?.getComputedStyle(probe).color;
      if (computed && !/oklch\s*\(/i.test(computed)) return computed;

      if (!context) return SAFE_COLOR_FALLBACK;
      context.fillStyle = "#000000";
      context.fillStyle = computed || colorFunction;
      // Chromium may serialize canvas fillStyle as OKLCH too. Reading a pixel
      // converts it to sRGB without replacing the original color with gray.
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    } catch {
      return SAFE_COLOR_FALLBACK;
    }
  };

  document
    .querySelectorAll<HTMLElement>("[style]")
    .forEach(element => sanitizeDeclaration(element.style, resolveColor));

  const visitRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if ("style" in rule) {
        sanitizeDeclaration((rule as CSSStyleRule).style, resolveColor);
      }

      if ("cssRules" in rule) {
        try {
          visitRules((rule as CSSGroupingRule).cssRules);
        } catch {
          // A browser-protected imported stylesheet must not abort printing.
        }
      }
    }
  };

  for (const styleElement of Array.from(
    document.querySelectorAll<HTMLStyleElement>("style")
  )) {
    styleElement.textContent = replaceUnsupportedColorFunctions(
      styleElement.textContent ?? "",
      resolveColor
    );
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visitRules(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets are not readable; inline and same-origin
      // rules are still sanitized before html2canvas parses the clone.
    }
  }

  probe.remove();
}
