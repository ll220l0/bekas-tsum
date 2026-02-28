import Link from "next/link";
import { cookies } from "next/headers";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/adminSession";

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  operator: "Оператор",
  courier: "Курьер"
};

export default async function AdminHome() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifyAdminSessionToken(token) : null;
  const roleLabel = ROLE_LABEL[session?.role ?? ""] ?? "Админ";

  const isOwner = session?.role === "owner";
  const isOperator = session?.role === "operator";
  const isCourier = session?.role === "courier";

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold">Админка</div>
            <div className="mt-1 text-sm text-black/55">Панель управления.</div>
            <div className="mt-2 inline-flex rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/70">Роль: {roleLabel}</div>
          </div>
          <AdminLogoutButton className="px-3 py-2 text-sm" />
        </div>

        <div className="mt-6 grid gap-3">
          <Link className="rounded-xl bg-black py-3 text-center font-semibold text-white" href="/admin/orders">
            Заказы
          </Link>

          {(isOwner || isOperator) && (
            <Link className="rounded-xl border border-black/10 bg-white py-3 text-center font-semibold" href="/admin/menu">
              Меню
            </Link>
          )}

          {isOwner && (
            <Link className="rounded-xl border border-black/10 bg-white py-3 text-center font-semibold" href="/admin/banks">
              Реквизиты
            </Link>
          )}

          {(isOwner || isOperator) && !isCourier && (
            <Link className="rounded-xl border border-black/10 bg-white py-3 text-center font-semibold" href="/admin/reports">
              Отчеты
            </Link>
          )}

          {(isOwner || isOperator) && (
            <Link className="rounded-xl border border-black/10 bg-white py-3 text-center font-semibold" href="/admin/staff">
              {"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438"}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

