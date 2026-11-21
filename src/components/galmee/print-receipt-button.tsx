"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Prints one receipt: marks it, opens the browser print dialog (the global
 * print rules then hide everything else), and clears the mark afterwards.
 */
export function printReceipt(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  el.setAttribute("data-printing", "");
  const clear = () => {
    el.removeAttribute("data-printing");
    window.removeEventListener("afterprint", clear);
  };
  window.addEventListener("afterprint", clear);
  window.print();
}

/** Print button for the receipt with the given element id. */
export function PrintReceiptButton({ targetId, label }: { targetId: string; label: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => printReceipt(document.getElementById(targetId))}>
      <Printer aria-hidden="true" />
      {label}
    </Button>
  );
}
