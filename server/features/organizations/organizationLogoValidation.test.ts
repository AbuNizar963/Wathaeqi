import { describe, expect, it } from "vitest";
import { isSafeSvgLogo } from "./organizationLogoValidation";

function svg(source: string): Buffer {
  return Buffer.from(source, "utf8");
}

function expectValidSvg(source: string): void {
  expect(isSafeSvgLogo(svg(source))).toBe(true);
}

function expectInvalidSvg(source: string): void {
  expect(isSafeSvgLogo(svg(source))).toBe(false);
}

// prettier-ignore
describe("isSafeSvgLogo", () => {
  it("accepts standard vector shapes and paths", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 90" fill="#123456"/><circle cx="50" cy="50" r="12"/></svg>'
    );
  });

  it("accepts XML declarations, comments, whitespace and CDATA", () => {
    expectValidSvg(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported logo -->\n<svg xmlns="http://www.w3.org/2000/svg"><title><![CDATA[Official logo]]></title><path d="M0 0 L10 10"/></svg>'
    );
  });

  it("accepts Illustrator-style metadata, classes and inline presentation", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" version="1.1"><metadata>Artwork metadata</metadata><g class="logo" style="fill:#123456;stroke:none"><path id="mark" d="M0 0h100v100z"/></g></svg>'
    );
  });

  it("accepts Inkscape and RDF editor metadata", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><sodipodi:namedview inkscape:zoom="1"/><metadata><rdf:RDF><rdf:Description><dc:title>Logo</dc:title></rdf:Description></rdf:RDF></metadata><path d="M0 0h10v10z"/></svg>'
    );
  });

  it("accepts local gradients, masks, clip paths, patterns and filters", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><clipPath id="c"><circle cx="50" cy="50" r="40"/></clipPath><filter id="f"><feGaussianBlur stdDeviation="2"/></filter><pattern id="p" width="4" height="4"><path d="M0 0h2v2H0z"/></pattern></defs><g clip-path="url(#c)" filter="url(#f)"><path d="M0 0h100v100z" fill="url(#g)"/></g></svg>'
    );
  });

  it("accepts local symbol and xlink references", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><symbol id="mark"><path d="M0 0h10v10z"/></symbol></defs><use href="#mark" x="2" y="2"/><use xlink:href="#mark"/></svg>'
    );
  });

  it("accepts embedded PNG images without network access", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/+ioAAAAASUVORK5CYII="/></svg>'
    );
  });

  it("accepts text, text paths and safe embedded CSS", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.wordmark { fill: #123456; font-weight: 700; }</style><text class="wordmark"><textPath href="#curve">Wathaeqi</textPath></text><path id="curve" d="M0 10h100" fill="none"/></svg>'
    );
  });

  it("accepts SVG 2 filter primitives", () => {
    expectValidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><filter id="shadow"><feDropShadow dx="1" dy="1" stdDeviation="2"/></filter><rect width="20" height="20" filter="url(#shadow)"/></svg>'
    );
  });

  it("rejects scripts and foreign HTML content", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>bad</div></foreignObject></svg>'
    );
  });

  it("rejects event handlers and external image references", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>'
    );
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>'
    );
  });

  it("rejects direct and entity-obfuscated script references", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>'
    );
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="&#x6a;avascript:alert(1)"/></svg>'
    );
  });

  it("rejects unsafe CSS and external style imports", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://example.com/a.svg)" d="M0 0"/></svg>'
    );
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/a.css);</style><path d="M0 0"/></svg>'
    );
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path style="behavior:url(x)" d="M0 0"/></svg>'
    );
  });

  it("rejects DTDs and XML entity declarations", () => {
    expectInvalidSvg(
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>'
    );
  });

  it("rejects animation and malformed or non-SVG XML", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>'
    );
    expectInvalidSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></svg>');
    expectInvalidSvg("<html></html>");
  });

  it("rejects multiple roots and non-whitespace outside the root", () => {
    expectInvalidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"/><svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    expectInvalidSvg(
      'unexpected<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
  });

  it("rejects excessive nesting and element counts", () => {
    const deeplyNested =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      "<g>".repeat(130) +
      "</g>".repeat(130) +
      "</svg>";
    expectInvalidSvg(deeplyNested);

    const tooManyNodes =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      "<path/>".repeat(20_001) +
      "</svg>";
    expectInvalidSvg(tooManyNodes);
  });
});
