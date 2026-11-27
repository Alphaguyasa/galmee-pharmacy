"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BuyListPrintButton({ label }: { label: string }) {
  return (
    <Button type="button" size="lg" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
