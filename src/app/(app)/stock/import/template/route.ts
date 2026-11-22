import { itemImportTemplate } from "@/lib/item-import";
import { getSession } from "@/server/dal/session";

/** The blank item sheet (CSV, opens in Excel) with two example rows. */
export async function GET() {
  await getSession();
  return new Response(itemImportTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="galmee-pharmacy-items-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
