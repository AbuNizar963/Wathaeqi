import { describe, expect, it } from "vitest";
import { isSafeSvgLogo } from "./organizationLogoValidation";

function svg(source: string): Buffer {
  return Buffer.from(source, "utf8");
}

describe("isSafeSvgLogo", () => {
  it("accepts basic vector paths and local gradients", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      "<defs><linearGradient id=\"g\"><stop offset=\"0\" stop-color=\"#123456\"/>" +
      "</linearGradient></defs><path d=\"M10 10 L90 90\" fill=\"url(#g)\"/></svg>";

    expect(isSafeSvgLogo(svg(source))).toBe(true);
  });

  it("accepts common editor output with styles, metadata and comments", () => {
    const source = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<!-- exported vector artwork -->",
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">',
      "<metadata>Created with a vector editor</metadata>",
      '<defs><clipPath id="clip"><rect width="90" height="90"/></clipPath></defs>',
      '<g class="logo" style="opacity: 0.95" clip-path="url(#clip)">',
      '<path d="M10 10 L90 90" style="fill: #123456; stroke: #ffffff; stroke-width: 2"/>',
      "</g></svg>",
    ].join("");

    expect(isSafeSvgLogo(svg(source))).toBe(true);
  });

  it("accepts safe embedded CSS style blocks", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      "<style>.mark { fill: #123456; stroke: #ffffff; stroke-width: 2; }</style>" +
      '<path class="mark" d="M10 10 L90 90"/></svg>';

    expect(isSafeSvgLogo(svg(source))).toBe(true);
  });

  it("accepts symbols and local use references", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">' +
      '<defs><symbol id="mark"><circle cx="10" cy="10" r="8"/></symbol></defs>' +
      '<use href="#mark"/></svg>';

    expect(isSafeSvgLogo(svg(source))).toBe(true);
  });

  it("accepts text and static shapes", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">' +
      '<text x="0" y="15" font-size="12">Wathaeqi</text>' +
      '<rect x="1" y="1" width="5" height="5"/></svg>';

    expect(isSafeSvgLogo(svg(source))).toBe(true);
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="file:///etc/passwd"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill: url(https://example.com/a.svg)" d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="@import url(https://example.com/x.css)" d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/a.css);</style></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<?xml-stylesheet href="https://example.com/a.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><!-- malformed comment --!><path d="M0 0"/></svg>',
    "<svg><path d=\"M0 0\"/></svg>",
  ])("rejects active, external or malformed content: %s", source => {
    expect(isSafeSvgLogo(svg(source))).toBe(false);
  });

  it("rejects malformed XML and non-SVG content", () => {
    expect(isSafeSvgLogo(svg("<svg><path></svg>"))).toBe(false);
    expect(isSafeSvgLogo(svg("<html></html>"))).toBe(false);
    expect(isSafeSvgLogo(svg("<svg/><svg/>"))).toBe(false);
  });

  it("rejects invalid UTF-8 and oversized input", () => {
    expect(isSafeSvgLogo(Buffer.from([0xff, 0xfe, 0xfd]))).toBe(false);
    expect(
      isSafeSvgLogo(Buffer.alloc(2.5 * 1024 * 1024 + 1, 0x20))
    ).toBe(false);
  });
});
