/** One CSV field: quoted when needed, and text that a spreadsheet would run as a formula is made inert. */
export function csvField(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text with CRLF line ends and a UTF-8 BOM, so Excel shows Amharic correctly. */
export function toCsv(rows: (string | number)[][]): string {
  return "﻿" + rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
