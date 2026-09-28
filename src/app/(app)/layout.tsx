import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { parseTheme, THEME_COOKIE } from "@/components/theme";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { requireSessionUser } from "@/modules/auth/session";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";
import { countPendingApprovals } from "@/modules/approvals/service";
import { can } from "@/modules/permissions/check";
import { countIncomingTransfers } from "@/modules/transfers/service";
import { idleLogoutAction, logoutAction } from "../(auth)/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireSessionUser();
  const items = NAV_ITEMS.filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((p) => can(user, p)),
  );
  const [approvals, transfers, branding] = await Promise.all([
    can(user, "approvals.decide")
      ? countPendingApprovals(user)
      : Promise.resolve({ pending: 0, urgent: 0 }),
    can(user, "transfers.decide") ? countIncomingTransfers(user) : Promise.resolve(0),
    getBranding(),
  ]);

  return (
    <AppShell
      items={items}
      badges={{ approvals, transfers }}
      user={{ fullName: user.fullName, roleName: user.roleName }}
      logout={logoutAction}
      idleLogout={idleLogoutAction}
      idleMinutes={user.idleMinutes}
      logoUrl={logoUrl(branding)}
      theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  );
}
