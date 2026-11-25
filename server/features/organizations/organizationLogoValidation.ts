const SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
  "text",
  "tspan",
]);

const SVG_ATTRIBUTES = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "transform",
  "preserveAspectRatio",
  "id",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clip-rule",
  "clip-path",
  "mask",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "dx",
  "dy",
  "textLength",
  "lengthAdjust",
]);

const SAFE_XML_ENTITIES = /&(?:amp|quot|apos|lt|gt);/g;

/**
 * Accepts a deliberately small, static SVG subset for organization logos.
 * Active content, CSS, external references, and unknown elements/attributes
 * are rejected rather than stored and later rendered.
 */
export function isSafeSvgLogo(bytes: Buffer): boolean {
  const source = bytes.toString("utf8");
  if (!source.trim() || source.includes("\u0000")) return false;

  const withoutPreamble = source
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml\s+version=(["'])1\.[01]\1(?:\s+encoding=(["'])UTF-8\2)?\s*\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  if (/<!DOCTYPE|<!ENTITY|<\?|<!(?!\[CDATA\[)/i.test(withoutPreamble)) {
    return false;
  }

  const tokens = withoutPreamble.match(/<[^>]*>/g);
  if (!tokens?.length) return false;

  const remainder = withoutPreamble.replace(/<[^>]*>/g, "");
  if (remainder.trim().length > 0) return false;

  const stack: string[] = [];
  let rootSeen = false;

  for (const token of tokens) {
    const closing = /^<\/([A-Za-z][\w:-]*)\s*>$/.exec(token);
    if (closing) {
      if (stack.pop() !== closing[1]) return false;
      continue;
    }

    const opening = /^<([A-Za-z][\w:-]*)([\s\S]*?)\s*(\/?)>$/.exec(token);
    if (!opening) return false;

    const [, element, rawAttributes, selfClosing] = opening;
    if (!SVG_ELEMENTS.has(element)) return false;
    if (!rootSeen) {
      if (element !== "svg") return false;
      rootSeen = true;
    } else if (stack.length === 0) {
      return false;
    }

    let rest = rawAttributes;
    const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
    let match: RegExpExecArray | null;
    let consumed = "";
    while ((match = attributePattern.exec(rawAttributes)) !== null) {
      const gap = rawAttributes.slice(consumed.length, match.index);
      if (gap.trim()) return false;
      const [, name, , value] = match;
      if (!SVG_ATTRIBUTES.has(name)) return false;
      if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") {
        return false;
      }
      const withoutLocalReferences = value.replace(
        /url\(\s*#[A-Za-z_][\w.-]*\s*\)/gi,
        ""
      );
      if (
        name !== "xmlns" &&
        /(?:javascript:|data:|https?:|url\s*\(|\\|<|>)/i.test(
          withoutLocalReferences
        )
      ) {
        return false;
      }
      const entitiesRemoved = value.replace(SAFE_XML_ENTITIES, "");
      if (entitiesRemoved.includes("&")) return false;
      consumed = rawAttributes.slice(0, attributePattern.lastIndex);
    }
    rest = rawAttributes.slice(consumed.length);
    if (rest.trim()) return false;

    if (!selfClosing) stack.push(element);
  }

  return rootSeen && stack.length === 0;
}
