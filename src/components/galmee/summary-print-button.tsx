"use client";

import { useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PickedPeriod } from "@/lib/galmee/period-picker";
import type { ReceiptData } from "@/lib/galmee/receipt";
import type { ReportDef, ReportRow } from "@/lib/galmee/report";
import { reportSummaryReceipt } from "@/lib/galmee/report-summary";
import { printReceipt } from "./print-receipt-button";
import { Receipt } from "./receipt";

const noop = () => () => {};

const LABEL: Record<string, string> = { en: "Print 80 mm", am: "በ80 ሚሜ አትም", om: "80 mm maxxansi" };

/**
 * Prints the report's tiles on an 80 mm thermal printer. The receipt is rendered straight under
 * <body> (outside the report, which does not print) and stays hidden on screen; the receipt
 * kit's print rules show only it on paper. Use in ReportScreen's `actions`.
 */
export function SummaryPrintButton({
  def,
  period,
  rows,
  lang,
  tenant,
}: {
  def: ReportDef;
  period: PickedPeriod;
  rows: ReportRow[];
  lang: string;
  tenant: ReceiptData["tenant"];
}) {
  const id = `summary-${useId().replace(/:/g, "")}`;
  const client = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => printReceipt(document.getElementById(id))}>
        <ReceiptText aria-hidden />
        {LABEL[lang] ?? LABEL.en}
      </Button>
      {client
        ? createPortal(
            <div className="hidden print:has-[[data-printing]]:block">
              <Receipt id={id} data={reportSummaryReceipt(def, period, rows, tenant, lang)} width={80} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
