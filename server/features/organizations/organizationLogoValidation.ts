import { XMLParser, XMLValidator } from "fast-xml-parser";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const MAX_SVG_NODES = 20_000;
const MAX_SVG_DEPTH = 128;

// prettier-ignore
const SAFE_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "switch",
  "view",
  "path",
  "image",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textPath",
  "title",
  "desc",
  "metadata",
  "linearGradient",
  "radialGradient",
  "stop",
  "pattern",
  "marker",
  "clipPath",
  "mask",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "meshgradient",
  "meshrow",
  "meshpatch",
  "solidcolor",
  "hatch",
  "hatchpath",
  "altGlyph",
  "glyph",
  "font",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "hkern",
  "vkern",
  "style",
  "namedview",
  "guide",
  "perspective",
  "RDF",
  "Description",
  "Work",
  "Agent",
  "Bag",
  "Seq",
  "li",
  "creator",
  "date",
  "format",
  "type",
  "identifier",
  "rights",
  "language",
  "subject",
  "coverage",
  "relation",
  "publisher",
  "contributor",
  "source",
  "license",
  "attributionURL",
  "attributionName",
]);

// prettier-ignore
const UNSAFE_CSS =
  /(?:@import|@namespace|@font-face|@keyframes|expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:)/i;
// prettier-ignore
const EXTERNAL_SCHEME =
  /(?:javascript|vbscript|https?|file|ftp|blob|data)\s*:/i;
// prettier-ignore
const URL_FUNCTION_START = /url\s*\(/gi;
// prettier-ignore
const SAFE_LOCAL_URL_FUNCTION =
  /url\(\s*(?:"#[A-Za-z_][\w:.-]*"|'#[A-Za-z_][\w:.-]*'|#[A-Za-z_][\w:.-]*)\s*\)/gi;

// prettier-ignore
type XmlNode = Record<string, unknown>;

/**
 * Validates static SVG logos with a real XML parser and a broad SVG 1.1/2
 * presentation allowlist. Active content and external references are rejected;
 * local fragment references remain supported for gradients, masks and filters.
 */
// prettier-ignore
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

    const withoutBom = source
      .replace(/^\uFEFF/, "")
      .replace(/^\s*<\?xml\s+[^?]*\?>/i, "");
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
      processEntities: true,
      htmlEntities: false,
      allowBooleanAttributes: false,
    });

    const document = parser.parse(withoutBom) as unknown;
    if (!Array.isArray(document)) return false;

    let nodeCount = 0;
    let rootCount = 0;

    const visit = (
      items: unknown[],
      depth: number,
      isRoot = false
    ): boolean => {
      if (depth > MAX_SVG_DEPTH) return false;

      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return false;
        }

        const record = item as XmlNode;
        if ("#comment" in record) continue;

        if ("#text" in record || "#cdata" in record) {
          const value = String(record["#text"] ?? record["#cdata"] ?? "");
          if (value.trim() && !isTextAllowed(currentTextElements)) {
            return false;
          }
          if (
            currentTextElements[currentTextElements.length - 1] === "style" &&
            !isSafeCss(value)
          ) {
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
            !validateAttributes(
              attributes as Record<string, unknown>,
              elementName
            ))
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

// prettier-ignore
function isTextAllowed(ancestors: string[]): boolean {
  const parent = ancestors[ancestors.length - 1];
  return (
    parent === "text" ||
    parent === "tspan" ||
    parent === "textPath" ||
    parent === "title" ||
    parent === "desc" ||
    parent === "style" ||
    parent === "metadata"
  );
}

// prettier-ignore
function validateAttributes(
  attributes: Record<string, unknown>,
  elementName: string
): boolean {
  for (const [name, rawValue] of Object.entries(attributes)) {
    if (typeof rawValue !== "string") return false;

    const value = rawValue.trim();
    if (/^on/i.test(name) || name.toLowerCase() === "src") return false;

    if (name === "xmlns") {
      if (value !== SVG_NAMESPACE) return false;
      continue;
    }
    if (name === "xmlns:xlink") {
      if (value !== XLINK_NAMESPACE) return false;
      continue;
    }
    if (name.startsWith("xmlns:")) {
      if (
        /^(?:javascript|vbscript|data):/i.test(value) ||
        value.includes("\\")
      ) {
        return false;
      }
      continue;
    }
    if (name === "xml:space") {
      if (value !== "default" && value !== "preserve") return false;
      continue;
    }
    if (name.startsWith("xml:")) return false;

    if (name === "href" || name.endsWith(":href")) {
      if (value.startsWith("data:")) {
        if (
          (elementName !== "image" && elementName !== "feImage") ||
          !isSafeEmbeddedRaster(value)
        ) {
          return false;
        }
      } else if (value && !/^#[A-Za-z_][\w:.-]*$/.test(value)) {
        return false;
      }
      continue;
    }

    if (value.includes("\\") || EXTERNAL_SCHEME.test(value)) return false;

    if (name.includes(":")) {
      // Editor and metadata namespaces are inert; event-like names are denied.
      continue;
    }

    if (name === "style" && !isSafeCss(value)) return false;

    if (!hasOnlyLocalUrlFunctions(value)) return false;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return false;
    }
  }
  return true;
}

// prettier-ignore
function isSafeCss(css: string): boolean {
  const normalizedCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (
    normalizedCss.includes("\\") ||
    /\/\*|\*\//.test(normalizedCss) ||
    UNSAFE_CSS.test(normalizedCss) ||
    /[<>]/.test(normalizedCss)
  ) {
    return false;
  }

  return (
    hasOnlyLocalUrlFunctions(normalizedCss) &&
    !/expression\s*\(|javascript\s*:/i.test(normalizedCss)
  );
}

// prettier-ignore
function hasOnlyLocalUrlFunctions(value: string): boolean {
  URL_FUNCTION_START.lastIndex = 0;
  SAFE_LOCAL_URL_FUNCTION.lastIndex = 0;

  const urlCount = value.match(URL_FUNCTION_START)?.length ?? 0;
  if (urlCount === 0) return true;

  const safeUrlCount = value.match(SAFE_LOCAL_URL_FUNCTION)?.length ?? 0;
  return urlCount === safeUrlCount;
}

// prettier-ignore
function isSafeEmbeddedRaster(dataUri: string): boolean {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUri);
  if (!match) return false;

  const encoded = match[2].replace(/\s/g, "");
  if (
    encoded.length === 0 ||
    encoded.length > 2_800_000 ||
    encoded.length % 4 !== 0
  ) {
    return false;
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 2_000_000) return false;
  if (bytes.toString("base64") !== encoded) return false;

  switch (match[1].toLowerCase()) {
    case "png":
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        )
      );
    case "jpeg":
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case "webp":
      return (
        bytes.length >= 12 &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP"
      );
    default:
      return false;
  }
}
