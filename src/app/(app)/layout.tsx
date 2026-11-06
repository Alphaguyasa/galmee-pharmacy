import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { getSessionContext } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, tenant } = await getSessionContext();
  const tRoles = await getTranslations("roles");
  return (
    <AppShell
      tenantName={tenant.name}
      logoUrl={tenant.logo_url}
      userName={profile.full_name}
      roleLabel={tRoles(profile.role)}
    >
      {children}
    </AppShell>
  );
}
