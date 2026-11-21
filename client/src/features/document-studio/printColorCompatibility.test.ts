import { describe, expect, it } from "vitest";
import { replaceUnsupportedColorFunctions } from "./printColorCompatibility";

describe("replaceUnsupportedColorFunctions", () => {
  it("replaces OKLCH colors while preserving surrounding CSS", () => {
    const result = replaceUnsupportedColorFunctions(
      "linear-gradient(oklch(0.7 0.2 30), #fff)",
      () => "rgb(220, 80, 60)"
    );

    expect(result).toBe("linear-gradient(rgb(220, 80, 60), #fff)");
  });

  it("handles nested functions inside an OKLCH token", () => {
    const result = replaceUnsupportedColorFunctions(
      "oklch(0.7 calc(0.2 - 0.01) 30 / 80%)",
      () => "rgb(120, 130, 140)"
    );

    expect(result).toBe("rgb(120, 130, 140)");
  });

  it("leaves values without OKLCH unchanged", () => {
    const value = "1px solid rgb(20, 30, 40)";
    expect(replaceUnsupportedColorFunctions(value, () => "#000")).toBe(value);
  });
});
