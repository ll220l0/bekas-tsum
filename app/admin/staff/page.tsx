"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Button, Card } from "@/components/ui";

type AdminRole = "owner" | "operator" | "courier";

type StaffMember = {
  id: string;
  user: string;
  role: AdminRole;
  source: "env" | "db";
  readonly: boolean;
  createdAt: string | null;
};

type StaffResponse = {
  role: AdminRole;
  user: string;
  staff: StaffMember[];
};

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446",
  operator: "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440",
  courier: "\u041a\u0443\u0440\u044c\u0435\u0440"
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "\u041e\u0448\u0438\u0431\u043a\u0430";
}

export default function AdminStaffPage() {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [roleDraft, setRoleDraft] = useState<Record<string, AdminRole>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  const canManage = data?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as StaffResponse | { error?: string } | null;
      if (!res.ok || !json || !("staff" in json)) {
        throw new Error((json as { error?: string } | null)?.error ?? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432");
      }
      setData(json);
      setRoleDraft({});
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser() {
    if (!canManage) return;
    if (!username.trim() || !password) {
      toast.error("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role })
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f");

      toast.success("\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u0441\u043e\u0437\u0434\u0430\u043d");
      setUsername("");
      setPassword("");
      setRole("operator");
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRole(member: StaffMember) {
    if (!canManage || member.readonly) return;
    const nextRole = roleDraft[member.id] ?? member.role;
    if (nextRole === member.role) return;

    setSavingRoleId(member.id);
    try {
      const res = await fetch("/api/admin/staff/" + member.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole })
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0440\u043e\u043b\u044c");

      toast.success("\u0420\u043e\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430");
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingRoleId(null);
    }
  }

  const members = useMemo(() => data?.staff ?? [], [data?.staff]);

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">{"\u0410\u0434\u043c\u0438\u043d\u043a\u0430"}</div>
            <div className="text-3xl font-extrabold">{"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438"}</div>
            <div className="mt-1 text-sm text-black/55">{"\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u0430\u043c\u0438 \u0438 \u0440\u043e\u043b\u044f\u043c\u0438."}</div>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm text-black/60 underline" href="/admin">
              {"\u041d\u0430\u0437\u0430\u0434"}
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        {canManage ? (
          <Card className="mt-5 p-4">
            <div className="text-sm font-semibold">{"\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430"}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder={"\u041b\u043e\u0433\u0438\u043d"}
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                type="password"
                placeholder={"\u041f\u0430\u0440\u043e\u043b\u044c"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <select className="rounded-xl border border-black/10 bg-white px-3 py-3" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                <option value="owner">{"\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446"}</option>
                <option value="operator">{"\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440"}</option>
                <option value="courier">{"\u041a\u0443\u0440\u044c\u0435\u0440"}</option>
              </select>
            </div>
            <Button className="mt-3 w-full sm:w-auto" disabled={submitting} onClick={() => void createUser()}>
              {submitting ? "\u0421\u043e\u0437\u0434\u0430\u0435\u043c..." : "\u0421\u043e\u0437\u0434\u0430\u0442\u044c"}
            </Button>
          </Card>
        ) : null}

        <Card className="mt-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{"\u0412\u0441\u0435 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438"}</div>
            <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => void load()} disabled={loading}>
              {"\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c"}
            </Button>
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-black/60">{"\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..."}</div>
          ) : members.length === 0 ? (
            <div className="mt-3 text-sm text-black/60">{"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b."}</div>
          ) : (
            <div className="mt-3 grid gap-3">
              {members.map((member) => {
                const selectedRole = roleDraft[member.id] ?? member.role;
                const changed = selectedRole !== member.role;
                const canEditRole = Boolean(canManage && !member.readonly);

                return (
                  <div key={member.id} className="rounded-2xl border border-black/10 bg-white/75 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-extrabold text-black/90">{member.user}</div>
                        <div className="text-xs text-black/55">
                          {member.source === "env" ? "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ENV" : "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: \u0431\u0430\u0437\u0430 \u0434\u0430\u043d\u043d\u044b\u0445"}
                        </div>
                      </div>

                      <div className="inline-flex rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/70">
                        {ROLE_LABEL[member.role]}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canEditRole ? (
                        <>
                          <select
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            value={selectedRole}
                            onChange={(e) => setRoleDraft((prev) => ({ ...prev, [member.id]: e.target.value as AdminRole }))}
                          >
                            <option value="owner">{"\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446"}</option>
                            <option value="operator">{"\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440"}</option>
                            <option value="courier">{"\u041a\u0443\u0440\u044c\u0435\u0440"}</option>
                          </select>
                          <Button
                            className="px-3 py-2 text-sm"
                            disabled={!changed || savingRoleId === member.id}
                            onClick={() => void saveRole(member)}
                          >
                            {savingRoleId === member.id ? "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c..." : "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0440\u043e\u043b\u044c"}
                          </Button>
                        </>
                      ) : (
                        <div className="text-xs text-black/55">
                          {member.readonly
                            ? "\u0420\u043e\u043b\u044c \u044d\u0442\u043e\u0433\u043e \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430 \u0437\u0430\u0434\u0430\u0435\u0442\u0441\u044f \u0447\u0435\u0440\u0435\u0437 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435 \u043e\u043a\u0440\u0443\u0436\u0435\u043d\u0438\u044f"
                            : "\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432 \u0434\u043b\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0440\u043e\u043b\u0438"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
