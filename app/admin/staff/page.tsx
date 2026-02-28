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
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
};

type StaffResponse = {
  role: AdminRole;
  user: string;
  staff: StaffMember[];
};

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Владелец",
  operator: "Оператор",
  courier: "Курьер"
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

function toPhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}

function formatPhoneInput(value: string) {
  const digits = toPhoneDigits(value);
  if (!digits) return "";

  let out = digits.slice(0, 3);
  if (digits.length > 3) out += ` (${digits.slice(3, 6)}`;
  if (digits.length >= 6) out += ")";
  if (digits.length > 6) out += ` ${digits.slice(6, 9)}`;
  if (digits.length > 9) out += ` - ${digits.slice(9, 12)}`;

  return out;
}

function formatPhoneDisplay(value: string) {
  const digits = toPhoneDigits(value);
  if (!/^996\d{9}$/.test(digits)) return value || "Не указан";

  return `+${digits.slice(0, 3)} (${digits.slice(3, 6)}) ${digits.slice(6, 9)}-${digits.slice(9, 12)}`;
}

function profileName(member: StaffMember) {
  const full = `${member.firstName} ${member.lastName}`.trim();
  return full || "Имя не заполнено";
}

function profileInitials(member: StaffMember) {
  const f = member.firstName.trim().charAt(0);
  const l = member.lastName.trim().charAt(0);
  const fallback = member.user.trim().charAt(0);
  const value = `${f}${l}`.trim() || fallback || "?";
  return value.toUpperCase();
}

function Avatar({ member }: { member: StaffMember }) {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-white to-slate-100 text-sm font-black text-black/70 shadow-[0_8px_20px_rgba(15,23,42,0.12)]">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatarUrl} alt={profileName(member)} className="h-full w-full object-cover" />
      ) : (
        <span>{profileInitials(member)}</span>
      )}
    </div>
  );
}

export default function AdminStaffPage() {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("996");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profilePhone, setProfilePhone] = useState("996");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");

  const [roleDraft, setRoleDraft] = useState<Record<string, AdminRole>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  const canManage = data?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as StaffResponse | { error?: string } | null;
      if (!res.ok || !json || !("staff" in json)) {
        throw new Error((json as { error?: string } | null)?.error ?? "Не удалось загрузить сотрудников");
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

  const members = useMemo(() => data?.staff ?? [], [data?.staff]);
  const currentUserMember = useMemo(() => {
    if (!data) return null;
    return data.staff.find((member) => member.user === data.user) ?? null;
  }, [data]);

  useEffect(() => {
    if (!currentUserMember) return;
    setProfileFirstName(currentUserMember.firstName || "");
    setProfileLastName(currentUserMember.lastName || "");
    setProfilePhone(formatPhoneInput(currentUserMember.phone || "996"));
    setProfileAvatarUrl(currentUserMember.avatarUrl || "");
  }, [currentUserMember]);

  useEffect(() => {
    const anyModalOpen = createModalOpen || profileModalOpen;
    if (!anyModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateModalOpen(false);
        setProfileModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, profileModalOpen]);

  function openCreateModal() {
    setUsername("");
    setPassword("");
    setPasswordConfirm("");
    setRole("operator");
    setFirstName("");
    setLastName("");
    setPhone("996");
    setCreateModalOpen(true);
  }

  async function createUser() {
    if (!canManage) return;
    if (!username.trim() || !password || !passwordConfirm) {
      toast.error("Укажите логин и оба поля пароля");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error("Заполните имя, фамилию и номер");
      return;
    }

    if (password !== passwordConfirm) {
      toast.error("Пароли не совпадают");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          role,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone
        })
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Не удалось создать пользователя");

      toast.success("Сотрудник создан");
      setCreateModalOpen(false);
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProfile() {
    if (!data) return;

    setProfileSaving(true);
    try {
      const res = await fetch("/api/admin/staff/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: profileFirstName.trim(),
          lastName: profileLastName.trim(),
          phone: profilePhone,
          avatarUrl: profileAvatarUrl.trim() || null
        })
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? "Не удалось сохранить профиль");
      }

      toast.success("Профиль обновлен");
      setProfileModalOpen(false);
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setProfileSaving(false);
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
      if (!res.ok) throw new Error(json?.error ?? "Не удалось обновить роль");

      toast.success("Роль обновлена");
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingRoleId(null);
    }
  }

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Сотрудники</div>
            <div className="mt-1 text-sm text-black/55">Профили, роли и доступы</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="text-sm text-black/60 underline" href="/admin">
              Назад
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        <Card className="mt-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button className="h-11 px-5" onClick={openCreateModal}>
                + Новый сотрудник
              </Button>
            ) : null}
            <Button className="h-11 px-5" variant="secondary" onClick={() => setProfileModalOpen(true)}>
              Мой профиль
            </Button>
            <Button variant="secondary" className="ml-auto h-11 px-4 text-sm" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
          </div>
        </Card>

        <Card className="mt-4 p-4">
          {loading ? (
            <div className="text-sm text-black/60">Загрузка...</div>
          ) : members.length === 0 ? (
            <div className="text-sm text-black/60">Сотрудники не найдены.</div>
          ) : (
            <div className="grid gap-3">
              {members.map((member) => {
                const selectedRole = roleDraft[member.id] ?? member.role;
                const changed = selectedRole !== member.role;
                const canEditRole = Boolean(canManage && !member.readonly);
                const isCurrent = member.user === data?.user;

                return (
                  <div
                    key={member.id}
                    className="rounded-3xl border border-black/10 bg-white/80 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar member={member} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-lg font-black text-black/90">{profileName(member)}</div>
                            {isCurrent ? <span className="rounded-full bg-black px-2 py-0.5 text-[11px] font-bold text-white">Вы</span> : null}
                          </div>
                          <div className="text-sm text-black/55">@{member.user}</div>
                          <div className="mt-1 text-sm font-medium text-black/80">{formatPhoneDisplay(member.phone)}</div>
                        </div>
                      </div>

                      <div className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/75">
                        {ROLE_LABEL[member.role]}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-black/55">
                      <span className="rounded-full border border-black/10 bg-white px-2 py-1">
                        {member.source === "env" ? "Источник: ENV" : "Источник: База"}
                      </span>
                      {member.createdAt ? (
                        <span className="rounded-full border border-black/10 bg-white px-2 py-1">
                          Создан: {new Date(member.createdAt).toLocaleString("ru-RU")}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canEditRole ? (
                        <>
                          <select
                            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
                            value={selectedRole}
                            onChange={(e) => setRoleDraft((prev) => ({ ...prev, [member.id]: e.target.value as AdminRole }))}
                          >
                            <option value="owner">Владелец</option>
                            <option value="operator">Оператор</option>
                            <option value="courier">Курьер</option>
                          </select>
                          <Button className="h-11 px-4 text-sm" disabled={!changed || savingRoleId === member.id} onClick={() => void saveRole(member)}>
                            {savingRoleId === member.id ? "Сохраняем..." : "Сохранить роль"}
                          </Button>
                        </>
                      ) : (
                        <div className="text-xs text-black/55">
                          {member.readonly
                            ? "Роль этого аккаунта задается через переменные окружения"
                            : "Недостаточно прав для изменения роли"}
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

      {createModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button className="absolute inset-0 bg-black/35 backdrop-blur-sm" aria-label="Закрыть окно создания сотрудника" onClick={() => setCreateModalOpen(false)} />

          <Card className="motion-pop relative z-10 w-full max-w-3xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-extrabold">Новый сотрудник</div>
                <div className="mt-1 text-sm text-black/55">Заполните данные. Аватар сотрудник поставит сам в своем профиле.</div>
              </div>
              <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/65" onClick={() => setCreateModalOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Логин"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <select className="rounded-xl border border-black/10 bg-white px-3 py-3" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                <option value="owner">Владелец</option>
                <option value="operator">Оператор</option>
                <option value="courier">Курьер</option>
              </select>

              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Имя"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Фамилия"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />

              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3 sm:col-span-2"
                inputMode="tel"
                placeholder="996 (___) ___ - ___"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              />

              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                type="password"
                placeholder="Пароль"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                type="password"
                placeholder="Подтвердите пароль"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="h-11 px-4" onClick={() => setCreateModalOpen(false)}>
                Отмена
              </Button>
              <Button className="h-11 px-5" disabled={submitting} onClick={() => void createUser()}>
                {submitting ? "Создаем..." : "Создать сотрудника"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {profileModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button className="absolute inset-0 bg-black/35 backdrop-blur-sm" aria-label="Закрыть окно профиля" onClick={() => setProfileModalOpen(false)} />

          <Card className="motion-pop relative z-10 w-full max-w-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-extrabold">Мой профиль</div>
                <div className="mt-1 text-sm text-black/55">Здесь сотрудник сам устанавливает имя, номер и аватар.</div>
              </div>
              <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/65" onClick={() => setProfileModalOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Имя"
                value={profileFirstName}
                onChange={(e) => setProfileFirstName(e.target.value)}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Фамилия"
                value={profileLastName}
                onChange={(e) => setProfileLastName(e.target.value)}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                inputMode="tel"
                placeholder="996 (___) ___ - ___"
                value={profilePhone}
                onChange={(e) => setProfilePhone(formatPhoneInput(e.target.value))}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Ссылка на аватар (https://...)"
                value={profileAvatarUrl}
                onChange={(e) => setProfileAvatarUrl(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="h-11 px-4" onClick={() => setProfileModalOpen(false)}>
                Отмена
              </Button>
              <Button className="h-11 px-5" disabled={profileSaving} onClick={() => void saveProfile()}>
                {profileSaving ? "Сохраняем..." : "Сохранить профиль"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}