import { describe, expect, it } from "vitest";
import picomatch from "picomatch";

describe("picomatch repeated-extglob ReDoS mitigation", () => {
  const unsafePatterns = [
    {
      pattern: "+(*a)",
      expectedSource: "^(?:\\+\\(\\*a\\))$",
    },
    {
      pattern: "*(*a)",
      expectedSource: "^(?:\\*\\(\\*a\\))$",
    },
    {
      pattern: "+(a|*a)",
      expectedSource: "^(?:\\+\\(a\\|\\*a\\))$",
    },
  ];

  it.each(unsafePatterns)(
    "literalizes the risky pattern $pattern",
    ({ pattern, expectedSource }) => {
      const compiled = picomatch.makeRe(pattern);

      expect(compiled).toBeInstanceOf(RegExp);
      if (!(compiled instanceof RegExp)) {
        throw new Error(`Expected a regular expression for ${pattern}`);
      }

      expect(compiled.source).toBe(expectedSource);
      expect(picomatch(pattern)("a".repeat(30) + "!")).toBe(false);
    }
  );

  it("preserves repeated extglobs that do not contain the unsafe shape", () => {
    expect(picomatch("+(*)")("abc")).toBe(true);
    expect(picomatch("+(a*)")("aaa")).toBe(true);
  });
});
