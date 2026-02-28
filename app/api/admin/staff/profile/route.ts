import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { upsertAdminProfileByUsername } from "@/lib/adminUsers";
import { logAdminAction } from "@/lib/auditLog";

type PatchBody = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string | null;
};

export async function PATCH(req: Request) {
  const auth = await requireAdminRole(["owner", "operator", "courier"]);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const firstName = body?.firstName ?? "";
  const lastName = body?.lastName ?? "";
  const phone = body?.phone ?? "";

  try {
    const profile = await upsertAdminProfileByUsername(auth.session.user, {
      firstName,
      lastName,
      phone,
      avatarUrl: body?.avatarUrl
    });

    await logAdminAction({
      action: "admin_staff_profile_update",
      actor: auth.session.user,
      actorRole: auth.session.role,
      meta: { user: auth.session.user }
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c" }, { status: 500 });
  }
}