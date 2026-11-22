import { describe, expect, it } from "vitest";
import { IMPORT_MAX_ROWS, itemImportTemplate, parseCsv, previewItemImport } from "./item-import";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("picks semicolons when the header uses them and skips blank lines", () => {
    expect(parseCsv("a;b\n\n1,5;2\n")).toEqual([["a", "b"], ["1,5", "2"]]);
  });
});

describe("previewItemImport", () => {
  it("turns the template into two items", () => {
    const p = previewItemImport(itemImportTemplate());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.problems).toEqual([]);
    expect(p.items.map((r) => r.item)).toEqual([
      { nameEn: "Paracetamol 500 mg", nameAm: "ፓራሲታሞል 500 ሚ.ግ", nameOm: "Paarasitaamoolii 500 mg", sku: undefined, unit: "strip", price: 25, cost: 18, reorderLevel: 20, tracksExpiry: true },
      { nameEn: "Gauze roll", nameAm: undefined, nameOm: undefined, sku: undefined, unit: "roll", price: 40, cost: 30, reorderLevel: 5, tracksExpiry: false },
    ]);
  });

  it("accepts Amharic headers, plural units, Br prices and comma decimals", () => {
    const p = previewItemImport("ስም;መለኪያ;ዋጋ;የግዢ ዋጋ\nORS;sachets;Br 12,50;9\n");
    expect(p.ok && p.items[0].item).toMatchObject({ nameEn: "ORS", unit: "sachet", price: 12.5, cost: 9, reorderLevel: 0, tracksExpiry: true });
  });

  it("reports bad rows by line and keeps the good ones", () => {
    const csv = 'name,unit,price,cost,sku\nAmoxicillin,strip,"1,200.50",30,A1\nX,strip,5,3,\nCough syrup,litre,50,40,\nZinc,tablet,abc,1,\namoxicillin,strip,30,20,\nVit C,strip,10,8,a1\nIron,strip,10,8,OLD\nIron tablets,strip,10,8,NEW\n';
    const p = previewItemImport(csv, new Set(["old"]));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.items.map((r) => [r.line, r.item.nameEn, r.item.price])).toEqual([[2, "Amoxicillin", 1200.5], [9, "Iron tablets", 10]]);
    expect(p.problems.map((r) => [r.line, r.problem])).toEqual([
      [3, "name"], [4, "unit"], [5, "numbers"], [6, "duplicate"], [7, "duplicate"], [8, "duplicate"],
    ]);
  });

  it("refuses files without the needed columns or with too many rows", () => {
    expect(previewItemImport("")).toEqual({ ok: false, error: "empty" });
    expect(previewItemImport("foo,bar\n1,2\n")).toEqual({ ok: false, error: "noHeader" });
    expect(previewItemImport("name,unit,price\nA,strip,1\n")).toEqual({ ok: false, error: "missingColumns", missing: ["cost"] });
    const big = "name,unit,price,cost\n" + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `Item ${i},strip,1,1`).join("\n");
    expect(previewItemImport(big)).toEqual({ ok: false, error: "tooManyRows" });
    expect(previewItemImport("name,unit,price,cost\n")).toEqual({ ok: false, error: "empty" });
  });
});
