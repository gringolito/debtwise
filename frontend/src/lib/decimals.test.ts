import { describe, expect, it } from "vitest";
import { subtractDecimals } from "@/lib/decimals";

describe("subtractDecimals", () => {
  it.each([
    ["39845.60", "38581.30", "1264.30"],
    ["0.10", "0.05", "0.05"],
    ["1.00", "1.00", "0.00"],
    ["5.00", "7.25", "-2.25"],
    ["10", "0.5", "9.5"],
    ["-1.5", "-0.25", "-1.25"],
    ["100", "40", "60"],
  ])("takes %s − %s as %s", (a, b, difference) => {
    expect(subtractDecimals(a, b)).toBe(difference);
  });
});
