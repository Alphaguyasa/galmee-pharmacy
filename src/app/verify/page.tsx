import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { GalmeeWordmark } from "@/components/galmee/brand";
import { VerifyScreen } from "@/components/galmee/verify-screen";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Check a receipt",
  // The signed code lives in the URL fragment; keep the page itself out of search results.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Public page opened by the code on a signed receipt. No login: anyone holding the receipt may check it. */
export default async function Page() {
  const locale = await getLocale();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <GalmeeWordmark />
        <LanguageSwitcher />
      </div>
      <VerifyScreen lang={locale} supabaseUrl={SUPABASE_URL} publishableKey={SUPABASE_PUBLISHABLE_KEY} />
    </main>
  );
}
