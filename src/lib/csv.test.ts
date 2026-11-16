import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "./csv";

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("Cash")).toBe("Cash");
    expect(csvField(1250.5)).toBe("1250.5");
    expect(csvField(0)).toBe("0");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("ኅዳር 7, 2019")).toBe('"ኅዳር 7, 2019"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  it("makes formula-looking text inert", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+251911")).toBe("'+251911");
    expect(csvField("@cmd")).toBe("'@cmd");
  });

  it("drops non-finite numbers", () => {
    expect(csvField(Number.NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a BOM and ends rows with CRLF", () => {
    expect(toCsv([["a", 1], ["b", 2]])).toBe("﻿a,1\r\nb,2\r\n");
  });
});
