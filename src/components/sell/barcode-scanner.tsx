"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// The Barcode Detection API is not in TypeScript's DOM types yet.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorClass = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
};

// Formats printed on medicine boxes: retail EAN/UPC, Code 128/39 and GS1 DataMatrix on newer packs.
const WANTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "data_matrix", "qr_code"];

function getDetectorClass(): BarcodeDetectorClass | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const cls = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  return cls && typeof navigator.mediaDevices?.getUserMedia === "function" ? cls : null;
}

/**
 * Opens the back camera and reports the first barcode it reads. Hidden on browsers without
 * the Barcode Detection API (typing the code into the search box works everywhere).
 */
export function BarcodeScanner({ disabled, onCode }: { disabled?: boolean; onCode: (code: string) => void }) {
  const t = useTranslations("sell");
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<"scanDenied" | "scanFailed" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const cls = getDetectorClass();
    if (!cls) return;
    let alive = true;
    cls
      .getSupportedFormats()
      .then((formats) => {
        if (alive) setSupported(formats.some((f) => WANTED_FORMATS.includes(f)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const cls = getDetectorClass();
    if (!cls) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    cancelRef.current?.focus();

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      try {
        const formats = (await cls.getSupportedFormats()).filter((f) => WANTED_FORMATS.includes(f));
        const detector = new cls({ formats });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) {
          stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        let busy = false;
        const tick = async () => {
          if (stopped) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const codes = await detector.detect(video);
              const code = codes.find((c) => c.rawValue.trim() !== "")?.rawValue.trim();
              if (code && !stopped) {
                stop();
                setOpen(false);
                onCodeRef.current(code);
                return;
              }
            } catch {
              // A frame that cannot be read is skipped; the next one is tried.
            }
            busy = false;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (stopped) return;
        stop();
        setOpen(false);
        setError(e instanceof DOMException && e.name === "NotAllowedError" ? "scanDenied" : "scanFailed");
      }
    })();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, [open]);

  if (!supported) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <ScanBarcode className="size-5" aria-hidden />
        {t("scan")}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      ) : null}
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="scan-title" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex items-center justify-between gap-3 p-3">
            <h2 id="scan-title" className="font-semibold">
              {t("scanTitle")}
            </h2>
            <Button ref={cancelRef} type="button" variant="secondary" onClick={() => setOpen(false)}>
              <X className="size-5" aria-hidden />
              {t("scanCancel")}
            </Button>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline aria-hidden />
            <div aria-hidden className="absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-lg border-2 border-white/80" />
          </div>
        </div>
      ) : null}
    </>
  );
}
