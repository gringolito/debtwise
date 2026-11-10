import { describe, expect, it } from "vitest";
import { formatDuration, groupThousands, inputToMoney, moneyToInput } from "@/lib/format";

describe("formatDuration", () => {
  it.each([
    [1, "1 mês"],
    [11, "11 meses"],
    [12, "1 ano"],
    [13, "1 ano e 1 mês"],
    [24, "2 anos"],
    [41, "3 anos e 5 meses"],
  ])("writes %i months as %s", (months, text) => {
    expect(formatDuration(months)).toBe(text);
  });
});

describe("moneyToInput", () => {
  it.each([
    ["60000.00", "60.000,00"],
    ["1250000", "1.250.000"],
    ["999.99", "999,99"],
    ["0.5", "0,5"],
  ])("writes %s as %s", (decimal, input) => {
    expect(moneyToInput(decimal)).toBe(input);
    expect(inputToMoney(moneyToInput(decimal))).toBe(decimal);
  });
});

describe("groupThousands", () => {
  it.each([
    ["typed digits", "1250000", "", "1.250.000"],
    ["digits with decimals", "1250000,5", "", "1.250.000,5"],
    ["a comma not yet followed by decimals", "60000,", "", "60.000,"],
    ["dots already grouping", "1.250.000", "", "1.250.000"],
    ["a digit typed into grouped text", "1.2504", "1.250", "12.504"],
    ["a digit deleted from grouped text", "1.25", "1.250", "125"],
    ["dots before a comma, wherever they are", "12.50.00,1", "", "125.000,1"],
    ["fewer than four digits", "999", "", "999"],
  ])("groups %s", (_, typed, previous, grouped) => {
    expect(groupThousands(typed, previous)).toBe(grouped);
  });

  it.each([
    ["a dot as the decimal point", "60000.00", "60000.0"],
    ["a decimal point pasted over grouped text", "60000.00", "1.250.000"],
    ["text that is no number", "muito", ""],
    ["a number in scientific notation", "1e2", ""],
    ["nothing", "", "1"],
  ])("leaves %s as typed", (_, typed, previous) => {
    expect(groupThousands(typed, previous)).toBe(typed);
  });

  it.each([
    ["1250000,50", "1250000.50"],
    ["60000.00", "60000.00"],
    ["1250000", "1250000"],
  ])("keeps what %s sends the API", (typed, sent) => {
    expect(inputToMoney(groupThousands(typed))).toBe(sent);
  });
});
