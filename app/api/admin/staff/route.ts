import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { listAdminAccounts, type AdminRole } from "@/lib/adminSession";
import {
  createDatabaseAdminUser,
  isUniqueViolation,
  listDatabaseAdminUsers,
  validateManagedAdminInput
} from "@/lib/adminUsers";
import { logAdminAction } from "@/lib/auditLog";

type StaffMember = {
  id: string;
  user: string;
  role: AdminRole;
  source: "env" | "db";
  readonly: boolean;
  createdAt: string | null;
};

const ROLE_ORDER: Record<AdminRole, number> = {
  owner: 0,
  operator: 1,
  courier: 2
};

function sortStaff(items: StaffMember[]) {
  return items.slice().sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.user.localeCompare(b.user);
  });
}

export async function GET() {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  const envStaff: StaffMember[] = listAdminAccounts().map((account) => ({
    id: `env:${account.user}`,
    user: account.user,
    role: account.role,
    source: "env",
    readonly: true,
    createdAt: null
  }));

  const dbStaffRaw = await listDatabaseAdminUsers();
  const dbStaff: StaffMember[] = dbStaffRaw.map((account) => ({
    id: account.id,
    user: account.user,
    role: account.role,
    source: "db",
    readonly: false,
    createdAt: account.createdAt
  }));

  return NextResponse.json({
    role: auth.session.role,
    user: auth.session.user,
    staff: sortStaff([...envStaff, ...dbStaff])
  });
}

type CreateBody = {
  username?: string;
  password?: string;
  role?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdminRole(["owner"]);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  const username = body?.username ?? "";
  const password = body?.password ?? "";
  const role = body?.role ?? "";

  const validation = validateManagedAdminInput(username, password, role);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const reservedByEnv = listAdminAccounts().some((x) => x.user === validation.user);
  if (reservedByEnv) {
    return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
  }

  try {
    const created = await createDatabaseAdminUser({
      username: validation.user,
      password,
      role: validation.role
    });

    await logAdminAction({
      action: "admin_staff_create",
      actor: auth.session.user,
      actorRole: auth.session.role,
      meta: { user: created.user, role: created.role }
    });

    return NextResponse.json({
      member: {
        id: created.id,
        user: created.user,
        role: created.role,
        source: "db",
        readonly: false,
        createdAt: created.createdAt
      }
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
    }
    return NextResponse.json({ error: "Не удалось создать пользователя" }, { status: 500 });
  }
}
