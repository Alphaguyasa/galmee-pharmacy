import { getTranslations } from "next-intl/server";
import { addisToday, formatEthiopianDate } from "@/lib/ethiopian-date";
import { toCsv } from "@/lib/csv";
import { resolvePeriod } from "@/lib/report-period";
import { getSalesByDay } from "@/server/dal/reports";

/** The week or Ethiopian-month report as a CSV file, one line per day. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = resolvePeriod(params, addisToday());
  const [days, t] = await Promise.all([getSalesByDay(period.from, period.to), getTranslations("reports.csv")]);

  const csv = toCsv([
    [t("date"), t("ethiopianDate"), t("sales"), t("salesTotal"), t("takenIn"), t("cash"), t("repayments"), t("credit")],
    ...days.map((d) => [
      d.day,
      formatEthiopianDate(d.day, "en", { withEra: false }),
      d.salesCount,
      d.salesTotal,
      Math.round((d.collected + d.repayments) * 100) / 100,
      d.cashIn,
      d.repayments,
      d.creditGiven,
    ]),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="galmee-pharmacy-${period.from}-to-${period.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
