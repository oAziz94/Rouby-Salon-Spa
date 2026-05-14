"use client";

import {
  activateDashboardUser,
  ApiClientError,
  createDashboardUser,
  deactivateDashboardUser,
  getDashboardRbacMatrix,
  getDashboardUser,
  listDashboardBranches,
  listDashboardRoles,
  listDashboardUsers,
  postDashboardOwnerSetUserPassword,
  type DashboardRbacMatrix,
  type DashboardRole,
  type DashboardUser,
  type DashboardUserDetail,
  updateDashboardUser,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { Loader2, Plus, Search, ShieldAlert, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useSystemDialog } from "@/components/system-dialog-provider";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type TabKey = "users" | "matrix";
type LoadState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function branchAccessLabel(user: DashboardUser): string {
  if (user.branchAccessLabel) return user.branchAccessLabel;
  if (!user.branchAccess.length) return "No branch";
  if (user.branchAccess.length === 1) return user.branchAccess[0].branchName;
  return `${user.branchAccess[0].branchName} +${user.branchAccess.length - 1} more`;
}

const DEFAULT_NEW_USER_PASSWORD = "12345678";

export default function UsersRolesPage() {
  const { token, user: currentUser } = useDashboardAuth();
  const { confirm } = useSystemDialog();
  const canManageUserPasswords =
    currentUser?.roleName === "Owner" || currentUser?.roleName === "Admin";
  const [tab, setTab] = useState<TabKey>("users");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [roles, setRoles] = useState<DashboardRole[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; address?: string }>>([]);
  const [matrix, setMatrix] = useState<DashboardRbacMatrix | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [summary, setSummary] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminManagerUsers: 0,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardUser | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<DashboardUserDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [ownerResetPw, setOwnerResetPw] = useState("");
  const [ownerResetSaving, setOwnerResetSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const [userRes, roleRes, branchRes, matrixRes] = await Promise.all([
        listDashboardUsers(token, { search, roleId: roleId || undefined, branchId: branchId || undefined, status }),
        listDashboardRoles(token),
        listDashboardBranches(token),
        getDashboardRbacMatrix(token),
      ]);
      setUsers(userRes.data);
      setSummary(userRes.summary);
      setRoles(roleRes);
      setBranches(branchRes.map((b) => ({ id: b.id, name: b.name, address: b.address })));
      setMatrix(matrixRes);
      setSelectedRoleId((prev) => prev || matrixRes.roles[0]?.id || "");
      setState(userRes.data.length ? "loaded" : "empty");
    } catch (e) {
      setError(formatApiError(e));
      setState("error");
    }
  }, [branchId, roleId, search, status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!detailsOpen) {
      setOwnerResetPw("");
    }
  }, [detailsOpen]);

  useEffect(() => {
    setOwnerResetPw("");
  }, [details?.id]);

  async function openDetails(userId: string) {
    if (!token) return;
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const d = await getDashboardUser(token, userId);
      setDetails(d);
    } catch (e) {
      setToast({ tone: "error", message: formatApiError(e) });
    } finally {
      setDetailsLoading(false);
    }
  }

  async function toggleActive(user: DashboardUser) {
    if (!token) return;
    try {
      if (user.isActive) {
        await deactivateDashboardUser(token, user.id);
        setToast({ tone: "success", message: "User deactivated." });
      } else {
        await activateDashboardUser(token, user.id);
        setToast({ tone: "success", message: "User activated." });
      }
      await load();
      if (details?.id === user.id) {
        await openDetails(user.id);
      }
    } catch (e) {
      setToast({ tone: "error", message: formatApiError(e) });
    }
  }

  async function submitOwnerPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !details || !canManageUserPasswords) return;
    if (ownerResetPw.length < 8) {
      setToast({ tone: "error", message: "Password must be at least 8 characters." });
      return;
    }
    setOwnerResetSaving(true);
    try {
      await postDashboardOwnerSetUserPassword(token, details.id, ownerResetPw);
      setOwnerResetPw("");
      setToast({ tone: "success", message: "Password updated for this user." });
      await load();
      await openDetails(details.id);
    } catch (e) {
      setToast({ tone: "error", message: formatApiError(e) });
    } finally {
      setOwnerResetSaving(false);
    }
  }

  async function resetUserPasswordToDefault(target: { id: string; fullName: string }) {
    if (!token || !canManageUserPasswords) return;
    const accepted = await confirm({
      title: "Reset to default password",
      message: `Set ${target.fullName}'s login password to the default (${DEFAULT_NEW_USER_PASSWORD})? Ask them to change it again under My profile after they sign in.`,
      confirmLabel: "Reset password",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await postDashboardOwnerSetUserPassword(token, target.id, DEFAULT_NEW_USER_PASSWORD);
      setToast({
        tone: "success",
        message: `Password reset to ${DEFAULT_NEW_USER_PASSWORD}.`,
      });
      await load();
      if (details?.id === target.id) {
        await openDetails(target.id);
      }
    } catch (e) {
      setToast({ tone: "error", message: formatApiError(e) });
    }
  }

  const selectedMatrixRole = useMemo(
    () => matrix?.roles.find((r) => r.id === selectedRoleId) ?? null,
    [matrix, selectedRoleId],
  );

  return (
    <PermissionGuard permission="users.read">
      <section className="space-y-6">
        <header className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Users & Roles</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage dashboard users, existing roles, and branch access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              New user
            </button>
          </div>
          <div className="mt-5 inline-flex rounded-xl border border-border bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("users")}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === "users" ? "bg-[#FBF6E8] text-foreground" : "text-muted-foreground"}`}
            >
              Users
            </button>
            <button
              type="button"
              onClick={() => setTab("matrix")}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === "matrix" ? "bg-[#FBF6E8] text-foreground" : "text-muted-foreground"}`}
            >
              RBAC Matrix
            </button>
          </div>
        </header>

        {tab === "users" ? (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Search users</span>
                  <div className="flex items-center rounded-xl border border-border bg-white px-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input className="w-full bg-transparent px-2 py-2 outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Role</span>
                  <select className="w-full rounded-xl border border-border bg-white px-3 py-2" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    <option value="">All roles</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Branch</span>
                  <select className="w-full rounded-xl border border-border bg-white px-3 py-2" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Status</span>
                  <select className="w-full rounded-xl border border-border bg-white px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "inactive")}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Total users" value={summary.totalUsers} />
                <Stat label="Active users" value={summary.activeUsers} />
                <Stat label="Inactive users" value={summary.inactiveUsers} />
                <Stat label="Admin/manager users" value={summary.adminManagerUsers} />
              </div>
            </section>

            {state === "loading" ? <LoadingBlock text="Loading users..." /> : null}
            {state === "error" ? <ErrorBlock message={error} onRetry={() => void load()} /> : null}
            {state === "empty" ? (
              <EmptyBlock
                title="No users yet"
                text="Add dashboard users and assign them one of the existing system roles."
                action={<button onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">New user</button>}
              />
            ) : null}

            {state === "loaded" ? (
              <section className="rounded-2xl border border-border bg-card shadow-sm">
                {canManageUserPasswords ? (
                  <p className="border-b border-border bg-[#FFFCF7] px-4 py-3 text-xs leading-relaxed text-[#5C5348]">
                    <span className="font-semibold text-[#1F2420]">Password reset:</span> use{" "}
                    <span className="font-medium">Reset password</span> in the Actions column, or open{" "}
                    <span className="font-medium">View</span> and scroll to <span className="font-medium">Sign-in password</span>.
                  </p>
                ) : null}
                <div className="overflow-x-auto">
                  <table className={`w-full border-collapse text-sm ${canManageUserPasswords ? "min-w-[1120px]" : "min-w-[980px]"}`}>
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">User</th>
                        {canManageUserPasswords ? (
                          <th className="px-4 py-3">Sign-in password</th>
                        ) : null}
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Branch access</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last login</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-t border-border/70">
                          <td className="px-4 py-3">
                            <button type="button" className="flex items-center gap-3 text-left" onClick={() => void openDetails(u.id)}>
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9974A]/35 bg-[#FBF6E8] text-xs font-semibold text-[#5C4A18]">
                                {initials(u.fullName)}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{u.fullName}</p>
                                <p className="text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                              </div>
                            </button>
                          </td>
                          {canManageUserPasswords ? (
                            <td className="px-4 py-3 align-top">
                              {u.ownerPasswordPlaintext != null ? (
                                <span className="rounded-md border border-[#E8D4A0]/80 bg-[#FFF9ED] px-2 py-1 font-mono text-xs text-[#6B5420]">
                                  {u.ownerPasswordPlaintext}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Custom password</span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-4 py-3"><span className="rounded-full border border-border bg-[#FBF6E8] px-2 py-0.5 text-xs">{u.role.name}</span></td>
                          <td className="px-4 py-3 text-muted-foreground">{branchAccessLabel(u)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${u.isActive ? "border border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]" : "border border-[#E7B9A4]/80 bg-[#FFF1EC] text-danger"}`}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? formatDateTimeAmPm(u.lastLoginAt) : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs" onClick={() => void openDetails(u.id)}>View</button>
                              <button className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs" onClick={() => { setEditing(u); setFormOpen(true); }}>Edit</button>
                              {canManageUserPasswords ? (
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#C45C4A]/40 bg-[#FFF8F6] px-2.5 py-1 text-xs font-medium text-[#8B2E2E]"
                                  onClick={() => void resetUserPasswordToDefault({ id: u.id, fullName: u.fullName })}
                                >
                                  Reset password
                                </button>
                              ) : null}
                              <button className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs" onClick={() => void toggleActive(u)}>{u.isActive ? "Deactivate" : "Activate"}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[280px,1fr]">
            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">System roles</p>
              <div className="space-y-1">
                {matrix?.roles.map((r) => (
                  <button key={r.id} onClick={() => setSelectedRoleId(r.id)} className={`w-full rounded-lg px-3 py-2 text-left ${selectedRoleId === r.id ? "bg-[#FBF6E8]" : "hover:bg-[#FFF9EE]"}`}>
                    <p className="text-sm font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.userCount ?? 0} users · System role</p>
                  </button>
                ))}
              </div>
            </aside>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              {!selectedMatrixRole ? (
                <EmptyBlock title="No RBAC matrix found" text="The system roles and permissions matrix could not be loaded." />
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-foreground">{selectedMatrixRole.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedMatrixRole.description ?? "System role permissions."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedMatrixRole.userCount ?? 0} assigned users</p>
                  <div className="mt-4 space-y-4">
                    {selectedMatrixRole.groups.filter((g) => g.modules.length > 0).map((g) => (
                      <div key={g.key} className="rounded-xl border border-border bg-[#FFFCF7] p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.key.replace(/_/g, " ")}</p>
                        <div className="mt-2 space-y-2">
                          {g.modules.map((m) => (
                            <div key={m.moduleKey} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2">
                              <span className="text-sm font-medium text-foreground">{m.moduleKey.replace(/_/g, " ")}</span>
                              <div className="flex flex-wrap gap-1">
                                {["read", "create", "update", "deleteDeactivate", "print", "export", "closeFinalize"].map((op) => (
                                  <span key={op} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${m.operations[op as keyof typeof m.operations] ? "bg-[#E8F2EE] text-[#0E342B]" : "bg-[#F3F0EA] text-[#8A7D68]"}`}>
                                    {op}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] px-3 py-2 text-xs text-[#6B5420]">
                    {matrix?.note}
                  </p>
                </>
              )}
            </section>
          </section>
        )}

        <UserFormModal
          open={formOpen}
          editing={editing}
          roles={roles}
          branches={branches}
          currentUserId={currentUser?.id ?? null}
          onClose={() => setFormOpen(false)}
          onSaved={async (opts) => {
            setFormOpen(false);
            await load();
            if (opts?.created) {
              setToast({
                tone: "success",
                message: `User created. They can sign in with the initial password ${DEFAULT_NEW_USER_PASSWORD} until they change it.`,
              });
            }
          }}
        />

        {detailsOpen ? (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button className="absolute inset-0 bg-black/20" onClick={() => setDetailsOpen(false)} />
            <aside className="relative flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-border bg-card shadow-2xl">
              <button className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-white p-1.5" onClick={() => setDetailsOpen(false)}><X className="h-4 w-4" /></button>
              <div className="flex-1 overflow-y-auto p-5 pt-14">
              {detailsLoading ? <LoadingBlock text="Loading user details..." /> : details ? (
                <div className="space-y-4">
                  <header className="rounded-xl border border-border bg-[#FFFCF7] p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#B9974A]/35 bg-[#FBF6E8] text-sm font-semibold text-[#5C4A18]">{initials(details.fullName)}</div>
                      <div>
                        <p className="font-semibold text-foreground">{details.fullName}</p>
                        <p className="text-xs text-muted-foreground">{details.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <span className="rounded-full border border-border bg-[#FBF6E8] px-2 py-0.5 text-xs">{details.role.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${details.isActive ? "border border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]" : "border border-[#E7B9A4]/80 bg-[#FFF1EC] text-danger"}`}>{details.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </header>
                  {canManageUserPasswords ? (
                    <section className="rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] p-4 text-sm">
                      <h3 className="font-semibold text-[#1F2420]">Sign-in password (Admin / Owner)</h3>
                      <p className="mt-2 text-xs leading-relaxed text-[#6B5420]">
                        The readable password is shown only while this account still uses the standard initial password (
                        <span className="font-mono font-semibold">{DEFAULT_NEW_USER_PASSWORD}</span>
                        ). After they change it, you can reset it back to that default or set a new custom password below.
                      </p>
                      <p className="mt-3 text-xs text-[#5C5348]">
                        Readable password:{" "}
                        <span className="font-mono font-semibold text-[#1F2420]">
                          {details.ownerPasswordPlaintext ?? "— (not the initial password)"}
                        </span>
                      </p>
                      <div className="mt-4">
                        <button
                          type="button"
                          className="rounded-lg border border-[#C45C4A]/45 bg-white px-3 py-2 text-xs font-medium text-[#8B2E2E] shadow-sm hover:bg-[#FFF5F5]"
                          onClick={() =>
                            void resetUserPasswordToDefault({
                              id: details.id,
                              fullName: details.fullName,
                            })
                          }
                        >
                          Reset to default password ({DEFAULT_NEW_USER_PASSWORD})
                        </button>
                      </div>
                      <p className="mt-4 text-xs font-medium text-[#5C5348]">Or set a custom password</p>
                      <form className="mt-2 space-y-2" onSubmit={(e) => void submitOwnerPasswordReset(e)}>
                        <label className="block text-xs font-medium text-[#5C5348]">
                          New password for this user
                          <input
                            type="password"
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                            value={ownerResetPw}
                            onChange={(e) => setOwnerResetPw(e.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={ownerResetSaving}
                          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {ownerResetSaving ? "Saving…" : "Set password"}
                        </button>
                      </form>
                    </section>
                  ) : null}
                  {details.safetyWarning ? <div className="rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] p-3 text-xs text-[#6B5420]"><ShieldAlert className="mr-1 inline h-4 w-4" />{details.safetyWarning}</div> : null}
                  <Info title="Contact" rows={[["Email", details.email], ["Phone", details.phone ?? "—"]]} />
                  <Info title="Role" rows={[["Role", details.role.name], ["Description", details.role.description ?? "—"]]} />
                  <Info
                    title="Branch access"
                    rows={[
                      [
                        "Branches",
                        details.branchAccess.length
                          ? details.branchAccess
                              .map((b) => `${b.branchName}${b.isDefault ? " (default)" : ""}`)
                              .join(", ")
                          : "—",
                      ],
                      ["Default branch", details.defaultBranch?.branchName ?? "—"],
                    ]}
                  />
                  <Info title="Activity" rows={[["Last login", details.lastLoginAt ? formatDateTimeAmPm(details.lastLoginAt) : "—"], ["Created", formatDateTimeAmPm(details.createdAt)], ["Updated", formatDateTimeAmPm(details.updatedAt)]]} />
                </div>
              ) : null}
              </div>
            </aside>
          </div>
        ) : null}

        {toast ? <div className={`fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border px-4 py-2 text-sm ${toast.tone === "success" ? "border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]" : "border-[#E7B9A4]/80 bg-[#FFF1EC] text-danger"}`}>{toast.message}</div> : null}
      </section>
    </PermissionGuard>
  );
}

function UserFormModal({
  open,
  editing,
  roles,
  branches,
  currentUserId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: DashboardUser | null;
  roles: DashboardRole[];
  branches: Array<{ id: string; name: string; address?: string }>;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: (opts?: { created?: boolean }) => Promise<void>;
}) {
  const { token } = useDashboardAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [defaultBranchId, setDefaultBranchId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editing) {
      setFullName(editing.fullName);
      setEmail(editing.email);
      setPhone(editing.phone ?? "");
      setSelectedRoleId(editing.role.id);
      setSelectedBranchIds(editing.branchAccess.map((b) => b.branchId));
      setDefaultBranchId(editing.defaultBranch?.branchId ?? "");
      setIsActive(editing.isActive);
    } else {
      setFullName("");
      setEmail("");
      setPhone("");
      setSelectedRoleId(roles[0]?.id ?? "");
      if (branches.length === 1) {
        setSelectedBranchIds([branches[0].id]);
        setDefaultBranchId(branches[0].id);
      } else {
        setSelectedBranchIds([]);
        setDefaultBranchId("");
      }
      setIsActive(true);
    }
  }, [branches, editing, open, roles]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setSaving(true);
    try {
      if (editing && editing.id === currentUserId && !isActive) {
        throw new Error("You cannot deactivate yourself.");
      }
      const isCreate = !editing;
      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        roleId: selectedRoleId,
        branchIds: selectedBranchIds,
        defaultBranchId,
        isActive,
      };
      if (!payload.fullName || !payload.email || !payload.roleId) {
        throw new Error("Name, email, and role are required.");
      }
      if (!payload.branchIds.length) {
        throw new Error("Select at least one branch.");
      }
      if (!payload.defaultBranchId || !payload.branchIds.includes(payload.defaultBranchId)) {
        throw new Error("Pick a default branch from the branches you selected.");
      }
      if (editing) {
        await updateDashboardUser(token, editing.id, payload);
      } else {
        await createDashboardUser(token, payload);
      }
      await onSaved(isCreate ? { created: true } : {});
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2A1722]/45 p-4">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{editing ? "Edit user" : "New user"}</h2>
          <button onClick={onClose} className="rounded-lg border border-border bg-white p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
          <input className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <select className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="rounded-xl border border-border bg-[#FFFCF7] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch access</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-start gap-2 rounded-lg border border-border bg-white px-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedBranchIds.includes(b.id)}
                    onChange={(e) => {
                      setSelectedBranchIds((prev) => e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id));
                    }}
                  />
                  <span>{b.name}{b.address ? <span className="block text-xs text-muted-foreground">{b.address}</span> : null}</span>
                </label>
              ))}
            </div>
          </div>
          <select
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={defaultBranchId}
            onChange={(e) => setDefaultBranchId(e.target.value)}
            required={branches.length > 0}
          >
            <option value="">{branches.length > 1 ? "Select default branch (required)" : "Default branch"}</option>
            {branches.filter((b) => selectedBranchIds.includes(b.id)).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />Active</label>
          {error ? <p className="rounded-xl border border-[#E7B9A4]/80 bg-[#FFF1EC] px-3 py-2 text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-border bg-white px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{saving ? "Saving..." : "Save"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-[#FFFCF7] px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold text-foreground">{value}</p></div>;
}

function LoadingBlock({ text }: { text: string }) {
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{text}</div></section>;
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="rounded-2xl border border-[#E7B9A4]/80 bg-[#FFF1EC] p-5 shadow-sm"><p className="text-sm text-danger">{message}</p><button onClick={onRetry} className="mt-3 rounded-xl border border-border bg-white px-3 py-2 text-sm">Retry</button></section>;
}

function EmptyBlock({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <section className="rounded-2xl border border-dashed border-border bg-[#FFFCF7] px-6 py-14 text-center shadow-sm"><UserRound className="mx-auto h-10 w-10 text-[#C4B59A]" /><h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>{action ? <div className="mt-5">{action}</div> : null}</section>;
}

function Info({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="rounded-xl border border-border bg-[#FFFCF7] p-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
