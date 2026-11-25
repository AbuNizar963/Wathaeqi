import { XMLParser, XMLValidator } from "fast-xml-parser";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const MAX_SVG_NODES = 20_000;
const MAX_SVG_DEPTH = 128;

const SAFE_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "switch", "view",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "title", "desc", "metadata",
  "linearGradient", "radialGradient", "stop",
  "pattern", "marker", "clipPath", "mask",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer",
  "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
  "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur",
  "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "fePointLight", "feSpecularLighting", "feSpotLight", "feTile",
  "feTurbulence", "style",
]);

const SAFE_NAMESPACE_ATTRIBUTES = new Set([
  "xmlns",
  "xmlns:xlink",
  "xml:space",
]);

const UNSAFE_CSS = /(?:@import|@namespace|@font-face|@keyframes|expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:)/i;
const EXTERNAL_SCHEME = /(?:javascript|vbscript|https?|file|ftp|blob|data)\s*:/i;
const URL_FUNCTION = /url\(\s*(?:(["'])\s*(.*?)\s*\1|([^)]*?))\s*\)/gi;

type XmlNode = Record<string, unknown>;

/**
 * Validates a static SVG logo using a real XML parser and a broad SVG 1.1/2
 * presentation allowlist. Active content and network/file references are
 * rejected; local fragment references (gradients, masks, filters, symbols)
 * remain supported.
 */
export function isSafeSvgLogo(bytes: Buffer): boolean {
  try {
    if (bytes.length === 0) return false;

    const source = bytes.toString("utf8");
    if (
      !source.trim() ||
      source.includes("\u0000") ||
      source.includes("\uFFFD") ||
      /<!DOCTYPE|<!ENTITY/i.test(source) ||
      /<\?(?!xml(?:\s|\?>))/i.test(source)
    ) {
      return false;
    }

    const withoutBom = source.replace(/^\uFEFF/, "");
    const validation = XMLValidator.validate(withoutBom, {
      allowBooleanAttributes: false,
      unpairedTags: [],
    });
    if (validation !== true) return false;

    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "#text",
      commentPropName: "#comment",
      cdataPropName: "#cdata",
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      processEntities: false,
      htmlEntities: false,
      allowBooleanAttributes: false,
    });

    const document = parser.parse(withoutBom) as unknown;
    if (!Array.isArray(document)) return false;

    let nodeCount = 0;
    let rootCount = 0;

    const visit = (items: unknown[], depth: number, isRoot = false): boolean => {
      if (depth > MAX_SVG_DEPTH) return false;

      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return false;
        }

        const record = item as XmlNode;
        if ("#comment" in record) continue;

        if ("#text" in record || "#cdata" in record) {
          const value = String(record["#text"] ?? record["#cdata"] ?? "");
          if (value.trim() && !isTextAllowed(depth, currentTextElements)) {
            return false;
          }
          continue;
        }

        const names = Object.keys(record).filter(
          key => key !== ":@" && !key.startsWith("?")
        );
        if (names.length !== 1) return false;

        const qualifiedName = names[0];
        const elementName = qualifiedName.split(":").pop() ?? qualifiedName;
        if (!SAFE_ELEMENTS.has(elementName)) return false;

        if (isRoot) {
          rootCount += 1;
          if (rootCount !== 1 || elementName !== "svg") return false;
        }

        nodeCount += 1;
        if (nodeCount > MAX_SVG_NODES) return false;

        const attributes = record[":@"];
        if (
          attributes !== undefined &&
          (!attributes ||
            typeof attributes !== "object" ||
            Array.isArray(attributes) ||
            !validateAttributes(attributes as Record<string, unknown>))
        ) {
          return false;
        }

        const children = record[qualifiedName];
        if (!Array.isArray(children)) return false;

        currentTextElements.push(elementName);
        const validChildren = visit(children, depth + 1);
        currentTextElements.pop();
        if (!validChildren) return false;
      }
      return true;
    };

    const currentTextElements: string[] = [];
    const valid = visit(document, 0, true);
    return valid && rootCount === 1;
  } catch {
    return false;
  }
}

function isTextAllowed(_depth: number, ancestors: string[]): boolean {
  const parent = ancestors[ancestors.length - 1];
  return parent === "text" || parent === "tspan" || parent === "textPath" ||
    parent === "title" || parent === "desc" || parent === "style" ||
    parent === "metadata";
}

function validateAttributes(attributes: Record<string, unknown>): boolean {
  for (const [rawName, rawValue] of Object.entries(attributes)) {
    if (typeof rawValue !== "string") return false;

    const name = rawName;
    const value = rawValue.trim();

    if (/^on/i.test(name) || name.toLowerCase() === "src") return false;
    if (name === "xml:base") return false;

    if (SAFE_NAMESPACE_ATTRIBUTES.has(name)) {
      if (name === "xmlns" && value !== SVG_NAMESPACE) return false;
      if (name === "xmlns:xlink" && value !== XLINK_NAMESPACE) return false;
      if (name === "xml:space" && value !== "default" && value !== "preserve") {
        return false;
      }
      continue;
    }

    if (name.startsWith("xmlns:") || name.startsWith("xml:")) return false;
    if (name.includes(":") && name !== "xlink:href") return false;

    if (name === "href" || name === "xlink:href") {
      if (value && !/^#[A-Za-z_][\w:.-]*$/.test(value)) return false;
      continue;
    }

    if (name === "style" && !isSafeCss(value)) return false;
    if (EXTERNAL_SCHEME.test(value)) return false;

    URL_FUNCTION.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_FUNCTION.exec(value)) !== null) {
      const reference = (match[2] ?? match[3] ?? "").trim();
      if (!/^#[A-Za-z_][\w:.-]*$/.test(reference)) return false;
    }
    if (/url\s*\(/i.test(value) && !/url\s*\(/i.test(value)) return false;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return false;
    }
  }
  return true;
}

function isSafeCss(css: string): boolean {
  if (UNSAFE_CSS.test(css) || /[<>]/.test(css)) return false;

  URL_FUNCTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_FUNCTION.exec(css)) !== null) {
    const reference = (match[2] ?? match[3] ?? "").trim();
    if (!/^#[A-Za-z_][\w:.-]*$/.test(reference)) return false;
  }

  const withoutLocalUrls = css.replace(URL_FUNCTION, "");
  return !/url\s*\(|expression\s*\(|javascript\s*:/i.test(withoutLocalUrls);
}
