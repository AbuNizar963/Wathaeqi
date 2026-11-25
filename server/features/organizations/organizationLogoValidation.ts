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

    let source = bytes.toString("utf8");
    if (
      !source.trim() ||
      source.includes("\u0000") ||
      source.includes("\uFFFD") ||
      /<!DOCTYPE|<!ENTITY/i.test(source)
    ) {
      return false;
    }

    source = source.replace(/^\uFEFF/, "");
    const declaration = /^\s*<\?xml\s+version\s*=\s*(['"])1\.[01]\1(?:\s+encoding\s*=\s*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*\?>/i.exec(source);
    if (declaration) {
      source = source.slice(declaration[0].length);
    }
    if (/<\?/.test(source)) return false;

    const stack: string[] = [];
    let index = 0;
    let rootSeen = false;
    let rootClosed = false;
    let nodeCount = 0;

    while (index < source.length) {
      if (source.startsWith("<!--", index)) {
        const commentEnd = source.indexOf("-->", index + 4);
        if (commentEnd < 0) return false;
        if (source.slice(index + 4, commentEnd).includes("--")) return false;
        index = commentEnd + 3;
        continue;
      }

      if (source.startsWith("<![CDATA[", index)) {
        const parentName = stack[stack.length - 1]?.split(":").pop() ?? "";
        if (!isTextElement(parentName)) return false;

        const cdataEnd = source.indexOf("]]>", index + 9);
        if (cdataEnd < 0) return false;
        const value = source.slice(index + 9, cdataEnd);
        if (parentName === "style" && !isSafeCss(value)) return false;
        index = cdataEnd + 3;
        continue;
      }

      if (source[index] !== "<") {
        const textEnd = source.indexOf("<", index);
        const end = textEnd < 0 ? source.length : textEnd;
        const value = decodeXmlEntities(source.slice(index, end));
        if (value === null) return false;

        const parentName = stack[stack.length - 1]?.split(":").pop() ?? "";
        if (value.trim() && !isTextElement(parentName)) return false;
        if (parentName === "style" && !isSafeCss(value)) return false;

        index = end;
        continue;
      }

      if (source.startsWith("</", index)) {
        index += 2;
        const nameStart = index;
        while (index < source.length && isXmlNameCharacter(source[index])) {
          index += 1;
        }
        const qualifiedName = source.slice(nameStart, index);
        if (!isValidXmlName(qualifiedName)) return false;

        while (index < source.length && isXmlWhitespace(source[index])) {
          index += 1;
        }
        if (source[index] !== ">") return false;
        if (stack.pop() !== qualifiedName) return false;

        index += 1;
        if (stack.length === 0) rootClosed = true;
        continue;
      }

      if (source.startsWith("<!", index) || source.startsWith("<?", index)) {
        return false;
      }

      index += 1;
      const nameStart = index;
      while (index < source.length && isXmlNameCharacter(source[index])) {
        index += 1;
      }
      const qualifiedName = source.slice(nameStart, index);
      if (!isValidXmlName(qualifiedName)) return false;

      const elementName = qualifiedName.split(":").pop() ?? qualifiedName;
      if (!SAFE_ELEMENTS.has(elementName)) return false;

      if (!rootSeen) {
        if (elementName !== "svg" || stack.length !== 0) return false;
        rootSeen = true;
      } else if (stack.length === 0 || rootClosed) {
        return false;
      }

      nodeCount += 1;
      if (nodeCount > MAX_SVG_NODES) return false;

      const attributes: Record<string, unknown> = {};
      let attributeCount = 0;
      let selfClosing = false;

      while (index < source.length) {
        while (index < source.length && isXmlWhitespace(source[index])) {
          index += 1;
        }

        if (source.startsWith("/>", index)) {
          index += 2;
          selfClosing = true;
          break;
        }
        if (source[index] === ">") {
          index += 1;
          break;
        }

        const attributeStart = index;
        while (
          index < source.length &&
          isXmlNameCharacter(source[index])
        ) {
          index += 1;
        }
        const attributeName = source.slice(attributeStart, index);
        if (!isValidXmlName(attributeName)) return false;
        if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
          return false;
        }

        while (index < source.length && isXmlWhitespace(source[index])) {
          index += 1;
        }
        if (source[index] !== "=") return false;
        index += 1;

        while (index < source.length && isXmlWhitespace(source[index])) {
          index += 1;
        }
        const quote = source[index];
        if (quote !== '"' && quote !== "'") return false;
        index += 1;

        const valueStart = index;
        while (index < source.length && source[index] !== quote) {
          if (source[index] === "<") return false;
          index += 1;
        }
        if (index >= source.length) return false;

        attributes[attributeName] = source.slice(valueStart, index);
        index += 1;

        attributeCount += 1;
        if (attributeCount > 256) return false;
      }

      if (
        index > source.length ||
        (source[index - 1] !== ">" && !selfClosing) ||
        !validateAttributes(attributes, elementName)
      ) {
        return false;
      }

      if (selfClosing) {
        if (stack.length === 0) rootClosed = true;
      } else {
        stack.push(qualifiedName);
        if (stack.length > MAX_SVG_DEPTH) return false;
      }
    }

    return rootSeen && rootClosed && stack.length === 0;
  } catch {
    return false;
  }
}

function isXmlNameCharacter(character: string): boolean {
  return /^[A-Za-z0-9_.:-]$/.test(character);
}

function isXmlWhitespace(character: string): boolean {
  return character === " " || character === "\t" ||
    character === "\n" || character === "\r";
}

function isValidXmlName(name: string): boolean {
  const parts = name.split(":");
  return (
    parts.length <= 2 &&
    parts.every(part => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(part))
  );
}

function isTextElement(name: string): boolean {
  return (
    name === "text" ||
    name === "tspan" ||
    name === "textPath" ||
    name === "title" ||
    name === "desc" ||
    name === "style" ||
    name === "metadata"
  );
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

    const decodedValue = decodeXmlEntities(rawValue);
    if (decodedValue === null) return false;

    const value = decodedValue.trim();
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

// prettier-ignore
function decodeXmlEntities(value: string): string | null {
  const entityPattern = /&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = entityPattern.exec(value)) !== null) {
    const precedingText = value.slice(cursor, match.index);
    if (precedingText.includes("&")) return null;
    result += precedingText;

    const entity = match[1].toLowerCase();
    switch (entity) {
      case "amp":
        result += "&";
        break;
      case "lt":
        result += "<";
        break;
      case "gt":
        result += ">";
        break;
      case "quot":
        result += '"';
        break;
      case "apos":
        result += "'";
        break;
      default: {
        const codePoint = entity.startsWith("#x")
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        if (
          !Number.isInteger(codePoint) ||
          codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
          codePoint === 0xfffe ||
          codePoint === 0xffff
        ) {
          return null;
        }
        result += String.fromCodePoint(codePoint);
      }
    }

    cursor = entityPattern.lastIndex;
  }

  const trailingText = value.slice(cursor);
  if (trailingText.includes("&")) return null;
  return result + trailingText;
}
