import { TextDecoder } from "node:util";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import postcss from "postcss";

const MAX_SVG_BYTES = 2.5 * 1024 * 1024;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const TEXT_ELEMENTS = new Set([
  "text",
  "tspan",
  "textPath",
  "title",
  "desc",
  "metadata",
  "style",
]);

const SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
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
  "style",
  "linearGradient",
  "radialGradient",
  "stop",
  "pattern",
  "clipPath",
  "mask",
  "marker",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feFuncR",
  "feFuncG",
  "feFuncB",
  "feFuncA",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
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
]);

const SVG_ATTRIBUTES = new Set([
  "xmlns",
  "xmlns:xlink",
  "version",
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
  "pathLength",
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
  "transform-origin",
  "preserveAspectRatio",
  "id",
  "class",
  "role",
  "focusable",
  "aria-label",
  "aria-labelledby",
  "aria-hidden",
  "xml:space",
  "style",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clip-rule",
  "clip-path",
  "mask",
  "maskUnits",
  "maskContentUnits",
  "clipPathUnits",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "marker-start",
  "marker-mid",
  "marker-end",
  "refX",
  "refY",
  "orient",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "word-spacing",
  "writing-mode",
  "direction",
  "dx",
  "dy",
  "textLength",
  "lengthAdjust",
  "href",
  "xlink:href",
  "filter",
  "color-interpolation",
  "color-interpolation-filters",
  "flood-color",
  "flood-opacity",
  "lighting-color",
  "in",
  "in2",
  "result",
  "mode",
  "values",
  "type",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "stdDeviation",
  "edgeMode",
  "kernelMatrix",
  "kernelUnitLength",
  "targetX",
  "targetY",
  "order",
  "divisor",
  "bias",
  "scale",
  "xChannelSelector",
  "yChannelSelector",
  "baseFrequency",
  "numOctaves",
  "seed",
  "stitchTiles",
  "surfaceScale",
  "diffuseConstant",
  "specularConstant",
  "specularExponent",
  "limitingConeAngle",
  "azimuth",
  "elevation",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "tableValues",
  "slope",
  "intercept",
  "amplitude",
  "exponent",
  "color",
  "startOffset",
  "method",
  "spacing",
  "side",
  "font-size-adjust",
  "font-stretch",
  "font-kerning",
  "font-feature-settings",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
  "paint-order",
  "vector-effect",
  "isolation",
]);

const SAFE_STYLE_PROPERTIES = new Set([
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "visibility",
  "display",
  "clip-path",
  "clip-rule",
  "mask",
  "filter",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
  "paint-order",
  "vector-effect",
  "isolation",
]);

const XML_PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  processEntities: false,
  htmlEntities: false,
  allowBooleanAttributes: false,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  maxNestedTags: 100,
});

function isSafeLocalReference(value: string): boolean {
  return /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value.trim());
}

function isSafeStyle(value: string): boolean {
  if (
    /[<>\\]|@import|expression\s*\(|javascript:|data:|https?:|\/\//i.test(
      value
    )
  ) {
    return false;
  }

  for (const declaration of value.split(";")) {
    if (!declaration.trim()) continue;

    const separator = declaration.indexOf(":");
    if (separator <= 0) return false;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();

    if (!SAFE_STYLE_PROPERTIES.has(property) || !propertyValue) return false;
    if (
      /url\s*\(/i.test(propertyValue) &&
      !isSafeLocalReference(propertyValue)
    ) {
      return false;
    }
    if (/\b(var|attr)\s*\(/i.test(propertyValue)) return false;
  }

  return true;
}

// prettier-ignore
function isSafeStylesheet(css: string): boolean {
  if (!css.trim()) return true;

  try {
    const stylesheet = postcss.parse(css, { from: undefined });

    stylesheet.walkAtRules(() => {
      throw new Error("SVG stylesheets may not contain at-rules");
    });

    stylesheet.walkRules(rule => {
      if (!rule.selector || !/^[\w\s.#,*+>~:-]+$/.test(rule.selector)) {
        throw new Error("Unsupported SVG CSS selector");
      }
    });

    stylesheet.walkDecls(declaration => {
      if (!isSafeStyle(`${declaration.prop}:${declaration.value}`)) {
        throw new Error("Unsafe SVG CSS declaration");
      }
    });

    return true;
  } catch {
    return false;
  }
}

function isSafeStylesheetNodes(nodes: unknown[]): boolean {
  let css = "";

  for (const item of nodes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }

    const node = item as XmlNode;

    if (Object.hasOwn(node, "#comment")) continue;

    if (Object.hasOwn(node, "#text")) {
      const text = node["#text"];
      if (typeof text !== "string") return false;
      css += text;
      continue;
    }

    return false;
  }

  return isSafeStylesheet(css);
}

function isSafeAttribute(name: string, value: string): boolean {
  if (name.startsWith("on") || !SVG_ATTRIBUTES.has(name)) return false;

  if (name === "xmlns") return value === SVG_NAMESPACE;
  if (name === "xmlns:xlink") return value === XLINK_NAMESPACE;

  if (name === "href" || name === "xlink:href") {
    return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
  }

  if (name === "style") return isSafeStyle(value);

  if (
    /(?:javascript:|data:|https?:|file:|blob:|ftp:|\/\/|@import|expression\s*\()/i.test(
      value
    )
  ) {
    return false;
  }

  if (/url\s*\(/i.test(value) && !isSafeLocalReference(value)) {
    return false;
  }

  if (/[<>\\]/.test(value)) return false;
  return true;
}

type XmlNode = Record<string, unknown>;

function validateNodes(nodes: unknown[], parent?: string): boolean {
  for (const item of nodes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;

    const node = item as XmlNode;

    if (Object.hasOwn(node, "#comment")) continue;

    if (Object.hasOwn(node, "#cdata")) {
      if (!TEXT_ELEMENTS.has(parent ?? "")) return false;
      continue;
    }

    if (Object.hasOwn(node, "#text")) {
      const text = node["#text"];
      if (typeof text !== "string") return false;
      if (text.trim() && !TEXT_ELEMENTS.has(parent ?? "")) return false;
      continue;
    }

    const elementNames = Object.keys(node).filter(key => key !== ":@");
    if (elementNames.length !== 1) return false;

    const element = elementNames[0];
    if (!SVG_ELEMENTS.has(element)) return false;

    const attributes = node[":@"];
    if (attributes !== undefined) {
      if (
        !attributes ||
        typeof attributes !== "object" ||
        Array.isArray(attributes)
      ) {
        return false;
      }

      for (const [rawName, rawValue] of Object.entries(
        attributes as Record<string, unknown>
      )) {
        if (!rawName.startsWith("@_") || typeof rawValue !== "string") {
          return false;
        }

        const name = rawName.slice(2);
        if (!isSafeAttribute(name, rawValue)) return false;
      }
    }

    const children = node[element];
    if (!Array.isArray(children)) return false;

    if (element === "style") {
      if (!isSafeStylesheetNodes(children)) return false;
      continue;
    }

    if (!validateNodes(children, element)) return false;
  }

  return true;
}

function hasSvgRootNamespace(root: XmlNode): boolean {
  const attributes = root[":@"];

  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return false;
  }

  return (attributes as Record<string, unknown>)["@_xmlns"] === SVG_NAMESPACE;
}

/**
 * Validates static SVG logos with a real XML parser and an explicit SVG allowlist.
 * Common vector-editor output is supported without permitting active content,
 * external resource loading, foreign namespaces, or unsafe CSS.
 */
export function isSafeSvgLogo(bytes: Buffer): boolean {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > MAX_SVG_BYTES
  ) {
    return false;
  }

  let source: string;

  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }

  if (!source.trim() || source.includes("\u0000")) return false;
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml(?:\s|\?>))/i.test(source)) {
    return false;
  }

  const withoutDeclaration = source
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml\s+[^?]*\?>/i, "");

  try {
    const validation = XMLValidator.validate(withoutDeclaration, {
      allowBooleanAttributes: false,
      unpairedTags: [],
    });

    if (validation !== true) return false;

    const parsed = XML_PARSER.parse(withoutDeclaration) as unknown[];
    if (!Array.isArray(parsed)) return false;

    const documentElements = parsed.filter(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }

      if (Object.hasOwn(item, "#comment")) return false;

      if (Object.hasOwn(item, "#text")) {
        const text = (item as XmlNode)["#text"];
        return typeof text !== "string" || text.trim().length > 0;
      }

      return true;
    });

    if (documentElements.length !== 1) return false;

    const root = documentElements[0];
    if (!root || typeof root !== "object" || Array.isArray(root)) {
      return false;
    }

    const rootNode = root as XmlNode;
    if (!Object.hasOwn(rootNode, "svg")) return false;
    if (!hasSvgRootNamespace(rootNode)) return false;

    return validateNodes(parsed);
  } catch {
    return false;
  }
}
