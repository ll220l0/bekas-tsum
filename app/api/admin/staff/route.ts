import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { listAdminAccounts, type AdminRole } from "@/lib/adminSession";
import {
  createDatabaseAdminUser,
  isUniqueViolation,
  listAdminProfilesByUsernames,
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
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
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

  const envAccounts = listAdminAccounts();
  const envProfiles = await listAdminProfilesByUsernames(envAccounts.map((account) => account.user));

  const envStaff: StaffMember[] = envAccounts.map((account) => {
    const profile = envProfiles.get(account.user);
    return {
      id: `env:${account.user}`,
      user: account.user,
      role: account.role,
      source: "env",
      readonly: true,
      createdAt: null,
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      phone: profile?.phone ?? "",
      avatarUrl: profile?.avatarUrl ?? null
    };
  });

  const dbStaffRaw = await listDatabaseAdminUsers();
  const dbStaff: StaffMember[] = dbStaffRaw.map((account) => ({
    id: account.id,
    user: account.user,
    role: account.role,
    source: "db",
    readonly: false,
    createdAt: account.createdAt,
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    avatarUrl: account.avatarUrl
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
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdminRole(["owner"]);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  const username = body?.username ?? "";
  const password = body?.password ?? "";
  const role = body?.role ?? "";
  const firstName = body?.firstName ?? "";
  const lastName = body?.lastName ?? "";
  const phone = body?.phone ?? "";

  const validation = validateManagedAdminInput({
    username,
    password,
    role,
    firstName,
    lastName,
    phone
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const reservedByEnv = listAdminAccounts().some((x) => x.user === validation.user);
  if (reservedByEnv) {
    return NextResponse.json({ error: "\u041b\u043e\u0433\u0438\u043d \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442" }, { status: 409 });
  }

  try {
    const created = await createDatabaseAdminUser({
      username: validation.user,
      password,
      role: validation.role,
      firstName: validation.firstName,
      lastName: validation.lastName,
      phone: validation.phone
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
        createdAt: created.createdAt,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone,
        avatarUrl: created.avatarUrl
      }
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "\u041b\u043e\u0433\u0438\u043d \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442" }, { status: 409 });
    }
    return NextResponse.json({ error: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f" }, { status: 500 });
  }
}