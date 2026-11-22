import { ITEM_UNITS, itemSchema } from "@/server/validation";
import { toCsv } from "./csv";

/** Most rows one import may create; bigger lists go in several files. */
export const IMPORT_MAX_ROWS = 500;

export type ImportItem = {
  nameEn: string;
  nameAm?: string;
  nameOm?: string;
  sku?: string;
  unit: (typeof ITEM_UNITS)[number];
  price: number;
  cost: number;
  reorderLevel: number;
  tracksExpiry: boolean;
};

export type ImportError = "noHeader" | "missingColumns" | "tooManyRows" | "empty";
export type RowProblem = "name" | "unit" | "numbers" | "duplicate";

export type ImportPreview =
  | { ok: false; error: ImportError; missing?: string[] }
  | { ok: true; items: { line: number; item: ImportItem }[]; problems: { line: number; problem: RowProblem; text: string }[] };

type Field = keyof ImportItem;

/** Column names accepted in the header, in English, Amharic and Afaan Oromo (case and spaces ignored). */
const HEADERS: Record<Field, string[]> = {
  nameEn: ["name", "name_en", "name en", "english name", "item", "ስም", "maqaa"],
  nameAm: ["name_am", "name am", "amharic name", "የአማርኛ ስም", "maqaa amaariffaa"],
  nameOm: ["name_om", "name om", "oromo name", "afaan oromo name", "የኦሮምኛ ስም", "maqaa afaan oromoo"],
  sku: ["sku", "code", "barcode", "ኮድ", "koodii"],
  unit: ["unit", "መለኪያ", "safartuu"],
  price: ["price", "sell price", "selling price", "ዋጋ", "የመሸጫ ዋጋ", "gatii", "gatii gurgurtaa"],
  cost: ["cost", "buy price", "cost price", "የግዢ ዋጋ", "gatii bittaa"],
  reorderLevel: ["reorder", "reorder level", "reorder_level", "min stock", "ዝቅተኛ ክምችት", "sadarkaa ajajaa"],
  tracksExpiry: ["expiry", "tracks expiry", "tracks_expiry", "has expiry", "የሚያበቃበት ቀን", "guyyaa itti dhumu"],
};
const REQUIRED: Field[] = ["nameEn", "unit", "price", "cost"];

const norm = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_]+/g, " ");

/** RFC 4180 CSV (quotes, doubled quotes, CRLF or LF); "," or ";" picked from the header line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const YES = new Set(["yes", "y", "true", "1", "x", "አዎ", "eeyyee", "eeyye"]);
const NO = new Set(["", "no", "n", "false", "0", "አይ", "የለም", "lakki", "miti"]);
/** Units by their English code or a common plural ("strips", "bottles"). */
function toUnit(raw: string): ImportItem["unit"] | null {
  const v = norm(raw);
  const hit = ITEM_UNITS.find((u) => u === v || `${u}s` === v || (u === "pair" && v === "pairs"));
  return hit ?? null;
}
/** Spreadsheet number text: thousands commas or spaces, "Br"/"ETB", comma decimal. */
function toNumber(raw: string): number {
  let v = raw.trim().replace(/^(etb|br\.?|ብር)\s*/i, "").replace(/\s*(etb|br\.?|ብር)$/i, "").replace(/\s/g, "");
  if (v === "") return Number.NaN;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, "");
  else v = v.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN;
}

/**
 * Checks a whole file before anything is saved: every good row becomes an item to create, every
 * other row gets a reason and its line number, so the owner can fix the sheet and try again.
 * `existingSkus` are the codes already in the shop (lower-case), reported instead of failing the save.
 */
export function previewItemImport(text: string, existingSkus: ReadonlySet<string> = new Set()): ImportPreview {
  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, error: "empty" };
  const header = rows[0].map(norm);
  const index = {} as Record<Field, number>;
  for (const field of Object.keys(HEADERS) as Field[]) {
    index[field] = header.findIndex((h) => HEADERS[field].includes(h));
  }
  if (REQUIRED.every((f) => index[f] < 0)) return { ok: false, error: "noHeader" };
  const missing = REQUIRED.filter((f) => index[f] < 0);
  if (missing.length > 0) return { ok: false, error: "missingColumns", missing };
  const body = rows.slice(1);
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > IMPORT_MAX_ROWS) return { ok: false, error: "tooManyRows" };

  const items: { line: number; item: ImportItem }[] = [];
  const problems: { line: number; problem: RowProblem; text: string }[] = [];
  const seenNames = new Set<string>();
  const seenSkus = new Set(existingSkus);
  body.forEach((cells, i) => {
    const line = i + 2;
    const cell = (f: Field) => (index[f] >= 0 ? (cells[index[f]] ?? "").trim() : "");
    const label = cell("nameEn") || cells.join(" ").trim().slice(0, 60);
    const unit = toUnit(cell("unit"));
    if (!unit) return problems.push({ line, problem: "unit", text: label });
    const expiry = norm(cell("tracksExpiry"));
    const parsed = itemSchema.safeParse({
      nameEn: cell("nameEn"),
      nameAm: cell("nameAm"),
      nameOm: cell("nameOm"),
      sku: cell("sku"),
      unit,
      price: toNumber(cell("price")),
      cost: toNumber(cell("cost")),
      reorderLevel: cell("reorderLevel") === "" ? 0 : toNumber(cell("reorderLevel")),
      // Medicines expire: a blank column means yes; only a clear "no" turns it off.
      tracksExpiry: expiry === "" || YES.has(expiry) || !NO.has(expiry),
    });
    if (!parsed.success) {
      const nameBad = parsed.error.issues.some((issue) => issue.path[0] === "nameEn");
      return problems.push({ line, problem: nameBad ? "name" : "numbers", text: label });
    }
    const nameKey = norm(parsed.data.nameEn);
    const skuKey = parsed.data.sku?.toLowerCase();
    if (seenNames.has(nameKey) || (skuKey && seenSkus.has(skuKey))) {
      return problems.push({ line, problem: "duplicate", text: label });
    }
    seenNames.add(nameKey);
    if (skuKey) seenSkus.add(skuKey);
    items.push({ line, item: parsed.data as ImportItem });
  });
  return { ok: true, items, problems };
}

/** The blank sheet owners download: English column names (accepted in any language) and two example rows. */
export function itemImportTemplate(): string {
  return toCsv([
    ["name", "name_am", "name_om", "sku", "unit", "price", "cost", "reorder_level", "tracks_expiry"],
    ["Paracetamol 500 mg", "ፓራሲታሞል 500 ሚ.ግ", "Paarasitaamoolii 500 mg", "", "strip", 25, 18, 20, "yes"],
    ["Gauze roll", "", "", "", "roll", 40, 30, 5, "no"],
  ]);
}
