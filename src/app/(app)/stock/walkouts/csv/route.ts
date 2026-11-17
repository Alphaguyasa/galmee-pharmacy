import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { toCsv } from "@/lib/csv";
import { addisToday, formatEthiopianDate } from "@/lib/ethiopian-date";
import { itemName } from "@/lib/format";
import { walkoutRanking } from "@/server/dal/walkouts";

/** The walk-out restock list as a CSV file, ready to send to a supplier or open in Excel. */
export async function GET(request: Request) {
  const days = new URL(request.url).searchParams.get("days") === "30" ? 30 : 7;
  const [rows, t, locale] = await Promise.all([walkoutRanking(days), getTranslations("walkouts.csv"), getLocale() as Promise<Locale>]);

  const csv = toCsv([
    [t("rank"), t("medicine"), t("asks"), t("qtyAsked"), t("inStock"), t("price"), t("missed"), t("lastAsked")],
    ...rows.map((r, i) => [
      i + 1,
      itemName(r.names, locale),
      r.asks,
      r.qtyAsked,
      r.qtyOnHand ?? "",
      r.price ?? "",
      r.lostValue ?? "",
      formatEthiopianDate(r.lastAsked, locale, { withEra: false }),
    ]),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="galmee-pharmacy-restock-${days}d-${addisToday()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
