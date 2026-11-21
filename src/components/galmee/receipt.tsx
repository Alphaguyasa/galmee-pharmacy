import { cn } from "@/lib/utils";
import { ReceiptQr } from "./receipt-qr";
import { receiptModel, type ReceiptData, type ReceiptWidth } from "@/lib/galmee/receipt";

/**
 * The printed Galmee receipt, 58 or 80 mm wide, from one `ReceiptData`.
 * Text and rules only (prints fast on cheap thermals); the tenant name is the brand.
 * Same model as the Telegram text, so the paper and the message always agree.
 * Print with `printReceipt` (components/galmee/print-receipt-button.tsx);
 * the global print rules hide everything but the receipt.
 */
export function Receipt({
  data,
  width = 58,
  id,
  className,
}: {
  data: ReceiptData;
  width?: ReceiptWidth;
  /** Lets a PrintReceiptButton find this receipt. */
  id?: string;
  className?: string;
}) {
  const m = receiptModel(data);
  const wide = width === 80;
  return (
    <div
      id={id}
      className={cn(
        "galmee-receipt mx-auto max-w-full border bg-white p-3 text-black",
        wide ? "receipt-80 w-[80mm] text-sm" : "receipt-58 w-[58mm] text-[0.8125rem]",
        className,
      )}
      lang={data.lang}
      data-width={width}
    >
      <div className="grid justify-items-center gap-0.5 text-center">
        <p className="text-base font-bold break-words">{m.header[0]}</p>
        {m.header.slice(1).map((h, i) => (
          <p key={i} className="break-words">{h}</p>
        ))}
        <p className="font-semibold">{m.title}</p>
      </div>
      <hr className="my-2 border-t border-dashed border-black" />
      <dl className="grid gap-0.5">
        {m.meta.map((x, i) => (
          <div key={i} className="flex justify-between gap-2">
            <dt className="break-words">{x.label}</dt>
            <dd className="num text-right break-words">{x.value}</dd>
          </div>
        ))}
      </dl>
      <hr className="my-2 border-t border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {m.lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="pr-1 break-words">
                {l.name}
                {l.detail && !wide ? <span className="num block pl-2">{l.detail}</span> : null}
              </td>
              {wide ? <td className="num pr-2 text-right whitespace-nowrap">{l.detail}</td> : null}
              <td className="num text-right whitespace-nowrap">{l.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-t border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {m.totals.map((x, i) => (
            <tr key={i} className={x.strong ? "font-bold" : undefined}>
              <td className="pr-1">{x.label}</td>
              <td className="num text-right">{x.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-t border-dashed border-black" />
      <div className="grid justify-items-center gap-0.5 text-center">
        {m.qr ? <ReceiptQr value={m.qr} size={wide ? 120 : 96} /> : null}
        {m.footer.map((f, i) => (
          <p key={i} className={cn("break-words", i === m.footer.length - 1 && "num text-xs")}>{f}</p>
        ))}
      </div>
    </div>
  );
}
