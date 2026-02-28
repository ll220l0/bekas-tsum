import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { isAdminRole } from "@/lib/adminSession";
import { updateDatabaseAdminUserRole } from "@/lib/adminUsers";
import { logAdminAction } from "@/lib/auditLog";

type Params = { params: Promise<{ id: string }> };

type PatchBody = {
  role?: string;
};

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdminRole(["owner"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!id || id.startsWith("env:")) {
    return NextResponse.json({ error: "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!isAdminRole(body?.role)) {
    return NextResponse.json({ error: "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0440\u043e\u043b\u044c" }, { status: 400 });
  }

  try {
    const updated = await updateDatabaseAdminUserRole(id, body.role);
    if (!updated) {
      return NextResponse.json({ error: "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d" }, { status: 404 });
    }

    await logAdminAction({
      action: "admin_staff_update_role",
      actor: auth.session.user,
      actorRole: auth.session.role,
      meta: { user: updated.user, role: updated.role }
    });

    return NextResponse.json({
      member: {
        id: updated.id,
        user: updated.user,
        role: updated.role,
        source: "db",
        readonly: false,
        createdAt: updated.createdAt,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0440\u043e\u043b\u044c" }, { status: 500 });
  }
}