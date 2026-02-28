import Link from "next/link";
import { cookies } from "next/headers";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Card } from "@/components/ui";
import { ADMIN_SESSION_COOKIE, listAdminAccounts, verifyAdminSessionToken, type AdminRole } from "@/lib/adminSession";

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446",
  operator: "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440",
  courier: "\u041a\u0443\u0440\u044c\u0435\u0440"
};

const ROLE_ORDER: Record<AdminRole, number> = {
  owner: 0,
  operator: 1,
  courier: 2
};

export default async function AdminStaffPage() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifyAdminSessionToken(token) : null;

  const canView = session?.role === "owner" || session?.role === "operator";
  const accounts = listAdminAccounts()
    .slice()
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.user.localeCompare(b.user));

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">{"\u0410\u0434\u043c\u0438\u043d\u043a\u0430"}</div>
            <div className="text-3xl font-extrabold">{"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438"}</div>
            <div className="mt-1 text-sm text-black/55">{"\u0421\u043f\u0438\u0441\u043e\u043a \u0434\u043e\u0441\u0442\u0443\u043f\u043e\u0432 \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0443 (\u0431\u0435\u0437 \u043f\u0430\u0440\u043e\u043b\u0435\u0439)."}</div>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm text-black/60 underline" href="/admin">
              {"\u041d\u0430\u0437\u0430\u0434"}
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        {!canView ? (
          <Card className="mt-5 p-4 text-sm text-black/70">
            {"\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432 \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432."}
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="mt-5 p-4 text-sm text-black/70">{"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438 \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u044b."}</Card>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <Card key={account.user + account.role} className="p-4">
                <div className="text-xs uppercase tracking-[0.08em] text-black/45">{ROLE_LABEL[account.role]}</div>
                <div className="mt-1 text-lg font-extrabold text-black/90">{account.user}</div>
                <div className="mt-2 inline-flex rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/70">
                  {"\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f"}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
