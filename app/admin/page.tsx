import Link from "next/link";
import { cookies } from "next/headers";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/adminSession";

const ROLE_LABEL: Record<string, string> = {
  owner: "\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446",
  operator: "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440",
  courier: "\u041a\u0443\u0440\u044c\u0435\u0440"
};

const ROLE_TONE: Record<string, string> = {
  owner: "border-amber-300/70 bg-amber-50 text-amber-700",
  operator: "border-cyan-300/70 bg-cyan-50 text-cyan-700",
  courier: "border-emerald-300/70 bg-emerald-50 text-emerald-700"
};

type IconKind = "orders" | "menu" | "banks" | "reports" | "staff";

type NavItem = {
  title: string;
  subtitle: string;
  href: string;
  icon: IconKind;
  iconTone: string;
  visible: boolean;
};

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionIcon({ kind }: { kind: IconKind }) {
  if (kind === "orders") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <rect x="6" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9H15M9 13H15M9 17H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "menu") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "banks") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10H21" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 14H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "reports") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <path d="M4 20H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="6" y="11" width="3" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="11" y="8" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="16" y="5" width="3" height="13" rx="1" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19C4.4 16.9 6.5 15.5 9 15.5C11.5 15.5 13.6 16.9 14.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.2 18.5C14.8 17.1 16.1 16.2 17.7 16.2C19.1 16.2 20.4 17 21 18.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function AdminHome() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifyAdminSessionToken(token) : null;

  const role = session?.role ?? "";
  const roleLabel = ROLE_LABEL[role] ?? "\u0410\u0434\u043c\u0438\u043d";
  const roleTone = ROLE_TONE[role] ?? "border-slate-300/70 bg-slate-50 text-slate-700";

  const isOwner = session?.role === "owner";
  const isOperator = session?.role === "operator";
  const isCourier = session?.role === "courier";

  const navItems: NavItem[] = [
    {
      title: "\u0417\u0430\u043a\u0430\u0437\u044b",
      subtitle: "\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0438 \u0438\u0441\u0442\u043e\u0440\u0438\u044f",
      href: "/admin/orders",
      icon: "orders",
      iconTone: "border-slate-300 bg-slate-50 text-slate-700 shadow-[0_0_0_1px_rgba(51,65,85,0.14),0_14px_24px_-14px_rgba(15,23,42,0.75)]",
      visible: true
    },
    {
      title: "\u041c\u0435\u043d\u044e",
      subtitle: "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0438 \u0431\u043b\u044e\u0434\u0430",
      href: "/admin/menu",
      icon: "menu",
      iconTone: "border-orange-200 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(249,115,22,0.2),0_14px_24px_-14px_rgba(249,115,22,0.65)]",
      visible: isOwner || isOperator
    },
    {
      title: "\u0420\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b",
      subtitle: "Mbank \u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043e\u043f\u043b\u0430\u0442",
      href: "/admin/banks",
      icon: "banks",
      iconTone: "border-violet-200 bg-violet-50 text-violet-700 shadow-[0_0_0_1px_rgba(139,92,246,0.2),0_14px_24px_-14px_rgba(99,102,241,0.65)]",
      visible: isOwner
    },
    {
      title: "\u041e\u0442\u0447\u0435\u0442\u044b",
      subtitle: "\u0412\u044b\u0440\u0443\u0447\u043a\u0430, \u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u044f, \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430",
      href: "/admin/reports",
      icon: "reports",
      iconTone: "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_0_0_1px_rgba(6,182,212,0.2),0_14px_24px_-14px_rgba(14,165,233,0.65)]",
      visible: (isOwner || isOperator) && !isCourier
    },
    {
      title: "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438",
      subtitle: "\u0414\u043e\u0441\u0442\u0443\u043f\u044b \u0438 \u0440\u043e\u043b\u0438",
      href: "/admin/staff",
      icon: "staff",
      iconTone: "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_14px_24px_-14px_rgba(20,184,166,0.65)]",
      visible: isOwner || isOperator
    }
  ];

  const visibleItems = navItems.filter((item) => item.visible);

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/80 to-transparent blur-3xl" />
        <div className="absolute -right-12 top-10 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-200/70 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-gradient-to-br from-orange-200/60 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <section className="rounded-[28px] border border-white/80 bg-white/72 p-4 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[30px] font-black leading-none text-slate-900">{"\u0410\u0434\u043c\u0438\u043d\u043a\u0430"}</div>
              <div className="mt-2 text-sm text-slate-600">{"\u041f\u0430\u043d\u0435\u043b\u044c \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f"}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className={"inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold " + roleTone}>
                  {"\u0420\u043e\u043b\u044c:\u0020" + roleLabel}
                </div>
              </div>
            </div>

            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </section>

        <section className="mt-4 grid gap-3">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-3xl border border-white/85 bg-white/80 px-4 py-4 text-slate-900 backdrop-blur-xl transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_24px_46px_-30px_rgba(15,23,42,0.45)] active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl border transition-transform duration-300 group-hover:scale-[1.04] " + item.iconTone}>
                  <SectionIcon kind={item.icon} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[22px] font-black leading-6">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
                </div>

                <div className="shrink-0 text-slate-500 transition-transform duration-300 group-hover:translate-x-1">
                  <ChevronIcon />
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
