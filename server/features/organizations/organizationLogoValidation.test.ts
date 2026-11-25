import { describe, expect, it } from "vitest";
import { isSafeSvgLogo } from "./organizationLogoValidation";

function svg(source: string): Buffer {
  return Buffer.from(source, "utf8");
}

describe("isSafeSvgLogo", () => {
  it("accepts a basic vector logo with paths and local gradients", () => {
    expect(
      isSafeSvgLogo(
        svg(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/></linearGradient></defs><path d="M10 10 L90 90" fill="url(#g)"/></svg>'
        )
      )
    ).toBe(true);
  });

  it("accepts static SVG shapes without external references", () => {
    expect(
      isSafeSvgLogo(
        svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10" fill="#123456"/></svg>')
      )
    ).toBe(true);
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:red" d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(https://example.com/a.svg)"/></svg>',
  ])("rejects unsafe SVG content: %s", source => {
    expect(isSafeSvgLogo(svg(source))).toBe(false);
  });

  it("rejects malformed XML and non-SVG content", () => {
    expect(isSafeSvgLogo(svg("<svg><path></svg>"))).toBe(false);
    expect(isSafeSvgLogo(svg("<html></html>"))).toBe(false);
  });
});
