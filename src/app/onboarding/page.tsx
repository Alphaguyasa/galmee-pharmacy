import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { logout } from "@/actions/auth";
import { createPharmacy } from "@/actions/onboarding";
import { AuthForm } from "@/components/auth-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (profile) redirect("/");

  const t = await getTranslations("onboarding");
  const tAuth = await getTranslations("auth");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 py-6">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm
            namespace="onboarding"
            action={createPharmacy}
            submitLabel={t("submit")}
            fields={[
              { name: "pharmacyName", label: t("pharmacyName"), autoComplete: "organization" },
              { name: "fullName", label: t("fullName"), autoComplete: "name" },
              { name: "phone", label: t("phone"), type: "tel", autoComplete: "tel", inputMode: "tel" },
            ]}
          />
        </CardContent>
      </Card>
      <form action={logout}>
        <Button variant="ghost" className="w-full">
          {tAuth("logout")}
        </Button>
      </form>
    </main>
  );
}
