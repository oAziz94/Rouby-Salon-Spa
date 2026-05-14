"use client";

import {
  ApiClientError,
  deleteDashboardStaffException,
  deleteDashboardStaffProfile,
  getDashboardBranches,
  getDashboardServiceCategories,
  getDashboardServices,
  getDashboardStaffExceptions,
  getDashboardStaffList,
  getDashboardStaffSchedule,
  getDashboardStaffServices,
  patchDashboardStaffException,
  patchDashboardStaffProfile,
  postDashboardStaffException,
  postDashboardStaffProfile,
  putDashboardStaffSchedule,
  putDashboardStaffServices,
  type DashboardService,
  type DashboardServiceCategory,
  type DashboardStaffScheduleDayInput,
  type DashboardStaffScheduleException,
  type DashboardStaffScheduleRow,
  type DashboardStaffServiceCapability,
  type DashboardBranch,
} from "@rouby/api-client";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Loader2,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useSystemDialog } from "@/components/system-dialog-provider";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "idle" | "loading" | "loaded" | "error";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function utcTimeFromIso(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function utc1970Time(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "1970-01-01T10:00:00.000Z";
  }
  return `1970-01-01T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

type DayDraft = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
};

function defaultWeekDraft(): DayDraft[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    isWorking: dayOfWeek !== 5,
    startTime: "10:00",
    endTime: "19:00",
    breakStartTime: "14:00",
    breakEndTime: "15:00",
  }));
}

function draftFromScheduleRows(rows: DashboardStaffScheduleRow[]): DayDraft[] {
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
  return DAY_LABELS.map((_, dayOfWeek) => {
    const r = byDay.get(dayOfWeek);
    if (!r) {
      return {
        dayOfWeek,
        isWorking: true,
        startTime: "10:00",
        endTime: "19:00",
        breakStartTime: "14:00",
        breakEndTime: "15:00",
      };
    }
    return {
      dayOfWeek,
      isWorking: r.isWorking,
      startTime: utcTimeFromIso(r.startTime),
      endTime: utcTimeFromIso(r.endTime),
      breakStartTime: r.breakStartTime ? utcTimeFromIso(r.breakStartTime) : "",
      breakEndTime: r.breakEndTime ? utcTimeFromIso(r.breakEndTime) : "",
    };
  });
}

function draftToPayload(days: DayDraft[]): { days: DashboardStaffScheduleDayInput[] } {
  return {
    days: days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isWorking: d.isWorking,
      startTime: d.isWorking ? utc1970Time(d.startTime) : undefined,
      endTime: d.isWorking ? utc1970Time(d.endTime) : undefined,
      breakStartTime:
        d.isWorking && d.breakStartTime && d.breakEndTime ? utc1970Time(d.breakStartTime) : null,
      breakEndTime:
        d.isWorking && d.breakStartTime && d.breakEndTime ? utc1970Time(d.breakEndTime) : null,
    })),
  };
}

export default function StaffSchedulePage() {
  const { token, user, status, hasPermission } = useDashboardAuth();
  const { confirm } = useSystemDialog();

  const canReadStaff = hasPermission("staff.read");
  const canCreateStaff = hasPermission("staff.create");
  const canUpdateStaff = hasPermission("staff.update");
  const canDeleteStaff = hasPermission("staff.delete");
  const canReadStaffServices = hasPermission("staffServices.read");
  const canUpdateStaffServices = hasPermission("staffServices.update");
  const canReadServices = hasPermission("services.read");
  const canReadSchedule = hasPermission("staffSchedule.read");
  const canUpdateSchedule = hasPermission("staffSchedule.update");
  const canCreateException = hasPermission("staffSchedule.create");
  const canDeleteException = hasPermission("staffSchedule.delete");

  const canAccessMultipleBranches = hasPermission("branches.read") && user?.branchId === null;

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [staffPayload, setStaffPayload] = useState<Awaited<
    ReturnType<typeof getDashboardStaffList>
  > | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);

  const [catalogServices, setCatalogServices] = useState<DashboardService[]>([]);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [capabilities, setCapabilities] = useState<DashboardStaffServiceCapability[]>([]);
  const [capSelection, setCapSelection] = useState<Set<string>>(new Set());
  const [scheduleDraft, setScheduleDraft] = useState<DayDraft[]>(defaultWeekDraft);
  const [exceptions, setExceptions] = useState<DashboardStaffScheduleException[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [sectionBusy, setSectionBusy] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState("");

  const [exceptionForm, setExceptionForm] = useState({
    date: "",
    type: "DAY_OFF" as DashboardStaffScheduleException["type"],
    startTime: "10:00",
    endTime: "18:00",
    reason: "",
  });

  useEffect(() => {
    if (status !== "authenticated" || !token || !canReadStaff) return;
    void getDashboardBranches(token).then((b) => {
      setBranches(b);
      if (!branchId) {
        if (user?.branchId) setBranchId(user.branchId);
        else if (canAccessMultipleBranches && b[0]) setBranchId(b[0].id);
      }
    });
  }, [branchId, canAccessMultipleBranches, canReadStaff, status, token, user?.branchId]);

  const loadStaff = useCallback(async () => {
    if (!token || !branchId) return;
    setLoadState("loading");
    setErrorMessage("");
    try {
      const data = await getDashboardStaffList(token, branchId);
      setStaffPayload(data);
      setLoadState("loaded");
    } catch (e) {
      setLoadState("error");
      setErrorMessage(formatApiError(e));
    }
  }, [branchId, token]);

  useEffect(() => {
    if (!token || !branchId || !canReadStaff) return;
    void loadStaff();
  }, [branchId, canReadStaff, loadStaff, token]);

  const staffUsers = staffPayload?.staffUsers ?? [];

  const selectedRow = useMemo(
    () => staffUsers.find((r) => r.user.id === selectedUserId) ?? null,
    [selectedUserId, staffUsers],
  );

  useEffect(() => {
    if (!staffUsers.length) {
      setSelectedUserId("");
      setProfileId(null);
      return;
    }
    if (!selectedUserId || !staffUsers.some((s) => s.user.id === selectedUserId)) {
      setSelectedUserId(staffUsers[0].user.id);
    }
  }, [selectedUserId, staffUsers]);

  useEffect(() => {
    setProfileId(selectedRow?.profile?.id ?? null);
    setLocalNotice("");
  }, [selectedRow]);

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    setCatalogLoading(true);
    setCatalogError("");
    const pageSize = 100;
    try {
      const [catRes, firstSvc] = await Promise.all([
        getDashboardServiceCategories(token, { isActive: true }),
        getDashboardServices(token, { page: 1, pageSize, isActive: true }),
      ]);
      setCategories(catRes.data);
      const merged: DashboardService[] = [...firstSvc.data];
      const maxPages = Math.min(firstSvc.meta.totalPages, 50);
      for (let p = 2; p <= maxPages; p++) {
        const r = await getDashboardServices(token, { page: p, pageSize, isActive: true });
        merged.push(...r.data);
      }
      setCatalogServices(merged);
    } catch (e) {
      setCatalogServices([]);
      setCategories([]);
      setCatalogError(formatApiError(e));
    } finally {
      setCatalogLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !canReadServices) {
      setCatalogServices([]);
      setCategories([]);
      setCatalogError("");
      return;
    }
    void loadCatalog();
  }, [canReadServices, loadCatalog, token]);

  const loadProfileDetails = useCallback(async () => {
    if (!token || !profileId) {
      setCapabilities([]);
      setCapSelection(new Set());
      setScheduleDraft(defaultWeekDraft());
      setExceptions([]);
      return;
    }
    setSectionBusy("profile");
    setLocalNotice("");
    try {
      const ops: Promise<unknown>[] = [];
      if (canReadStaffServices) {
        ops.push(
          getDashboardStaffServices(token, profileId).then((rows) => {
            setCapabilities(rows);
            setCapSelection(new Set(rows.map((r) => r.serviceId)));
          }),
        );
      }
      if (canReadSchedule) {
        ops.push(
          getDashboardStaffSchedule(token, profileId).then((rows) => {
            if (rows.length === 0) {
              setScheduleDraft(defaultWeekDraft());
            } else {
              setScheduleDraft(draftFromScheduleRows(rows));
            }
          }),
        );
        ops.push(
          getDashboardStaffExceptions(token, profileId).then((rows) => {
            setExceptions(rows);
          }),
        );
      }
      await Promise.all(ops);
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }, [canReadSchedule, canReadStaffServices, profileId, token]);

  useEffect(() => {
    void loadProfileDetails();
  }, [loadProfileDetails]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) {
      m.set(c.id, c.name);
    }
    return m;
  }, [categories]);

  const servicesForBranch = useMemo(() => {
    if (!branchId) return catalogServices;
    return catalogServices.filter((s) => (s.branchIds ?? []).includes(branchId));
  }, [branchId, catalogServices]);

  const servicesByCategory = useMemo(() => {
    const groups = new Map<string, DashboardService[]>();
    for (const s of servicesForBranch) {
      const arr = groups.get(s.categoryId) ?? [];
      arr.push(s);
      groups.set(s.categoryId, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [servicesForBranch]);

  const emptyStaffRole = staffUsers.length === 0 && loadState === "loaded";

  async function submitCreateProfile() {
    if (!token || !branchId || !selectedRow || !createDisplayName.trim()) return;
    setCreateBusy(true);
    setLocalNotice("");
    try {
      const created = await postDashboardStaffProfile(token, {
        userId: selectedRow.user.id,
        branchId,
        displayName: createDisplayName.trim(),
      });
      setCreateOpen(false);
      setCreateDisplayName("");
      await loadStaff();
      const id = typeof created.id === "string" ? created.id : "";
      if (id) {
        setProfileId(id);
      }
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveCapabilities() {
    if (!token || !profileId || !canUpdateStaffServices) return;
    setSectionBusy("services");
    setLocalNotice("");
    try {
      const rows = await putDashboardStaffServices(token, profileId, {
        serviceIds: [...capSelection],
      });
      setCapabilities(rows);
      setLocalNotice("Service capabilities saved.");
      await loadStaff();
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }

  async function saveSchedule() {
    if (!token || !profileId || !canUpdateSchedule) return;
    setSectionBusy("schedule");
    setLocalNotice("");
    try {
      const rows = await putDashboardStaffSchedule(token, profileId, draftToPayload(scheduleDraft));
      setScheduleDraft(draftFromScheduleRows(rows));
      setLocalNotice("Weekly schedule saved.");
      await loadStaff();
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }

  async function submitException() {
    if (!token || !profileId || !exceptionForm.date) return;
    setSectionBusy("exception");
    setLocalNotice("");
    try {
      const body: Parameters<typeof postDashboardStaffException>[2] = {
        date: `${exceptionForm.date}T00:00:00.000Z`,
        type: exceptionForm.type,
        reason: exceptionForm.reason.trim() || null,
      };
      if (exceptionForm.type !== "DAY_OFF") {
        body.startTime = utc1970Time(exceptionForm.startTime);
        body.endTime = utc1970Time(exceptionForm.endTime);
      }
      await postDashboardStaffException(token, profileId, body);
      const next = await getDashboardStaffExceptions(token, profileId);
      setExceptions(next);
      setExceptionForm((prev) => ({ ...prev, reason: "" }));
      setLocalNotice("Exception added.");
      await loadStaff();
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }

  async function removeException(id: string) {
    if (!token || !profileId) return;
    const ok = await confirm({
      title: "Remove exception?",
      message: "This removes the scheduled exception for this staff member.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setSectionBusy("exception");
    try {
      await deleteDashboardStaffException(token, profileId, id);
      setExceptions((prev) => prev.filter((x) => x.id !== id));
      await loadStaff();
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }

  async function deactivateProfile() {
    if (!token || !profileId || !selectedRow?.profile) return;
    const ok = await confirm({
      title: "Deactivate staff profile?",
      message:
        `${selectedRow.profile.displayName} will be marked inactive and not bookable. Historical assignments stay intact.`,
      confirmLabel: "Deactivate",
      tone: "danger",
    });
    if (!ok) return;
    setSectionBusy("deactivate");
    try {
      await deleteDashboardStaffProfile(token, profileId);
      await loadStaff();
      setLocalNotice("Profile deactivated.");
    } catch (e) {
      setLocalNotice(formatApiError(e));
    } finally {
      setSectionBusy(null);
    }
  }

  function openCreateModal() {
    if (!selectedRow) return;
    setCreateDisplayName(selectedRow.user.name?.trim() || "");
    setCreateOpen(true);
  }

  return (
    <PermissionGuard permission="staff.read">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-2 border-b border-[#F0EBE3] pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#B9974A]">
            <CalendarClock className="h-4 w-4" aria-hidden />
            Scheduling setup
          </div>
          <h1 className="text-2xl font-semibold text-[#1F2420] md:text-3xl">Staff schedule</h1>
          <p className="max-w-2xl text-sm text-[#7A6A58]">
            Staff use the <span className="font-medium text-[#1F2420]">Staff</span> dashboard role. Link salon
            profiles, weekly hours, capabilities, and exceptions per branch.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-[#5C5348]">
            Branch
            <select
              className="ml-2 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420]"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadStaff()}
            className="rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-4 py-2 text-sm font-medium text-[#5C4A18] hover:bg-[#FBF6E8]"
          >
            Refresh
          </button>
          <Link
            href="/dashboard/users-roles"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#B9974A] hover:underline"
          >
            Users &amp; roles
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>

        {loadState === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading staff…
          </div>
        ) : null}

        {errorMessage ? (
          <p className="rounded-xl border border-[#E7B9A4]/60 bg-[#FFF1EC] px-4 py-3 text-sm text-[#5C2E20]">
            {errorMessage}
          </p>
        ) : null}

        {localNotice ? (
          <p className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-4 py-3 text-sm text-[#4A3C2F]">
            {localNotice}
          </p>
        ) : null}

        {emptyStaffRole ? (
          <article className="rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
            <h2 className="text-lg font-semibold text-[#1F2420]">No staff users for this branch</h2>
            <p className="mt-2 text-sm text-[#7A6A58]">
              Create dashboard users with the <span className="font-medium">Staff</span> role, then return here to
              attach profiles and schedules.
            </p>
            <Link
              href="/dashboard/users-roles"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#B9974A] hover:underline"
            >
              Open Users &amp; roles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ) : null}

        {!emptyStaffRole && staffUsers.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">Team</h2>
              <div className="space-y-2">
                {staffUsers.map((row) => {
                  const active = row.user.id === selectedUserId;
                  const p = row.profile;
                  return (
                    <button
                      key={row.user.id}
                      type="button"
                      onClick={() => setSelectedUserId(row.user.id)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition ${
                        active
                          ? "border-[#B9974A]/50 bg-[#FFFCF7] ring-1 ring-[#E8D4A0]/60"
                          : "border-[#E8E0D4]/80 bg-white ring-1 ring-[#F7F4EE]/80 hover:border-[#B9974A]/35"
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FBF6E8] text-[#5C4A18]">
                        <UserRound className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#1F2420]">{row.user.name}</p>
                        <p className="truncate text-xs text-[#7A6A58]">{row.user.email}</p>
                        {p ? (
                          <p className="mt-1 text-xs text-[#5C5348]">
                            {p.displayName} · {p.isActive ? "Active" : "Inactive"} ·{" "}
                            {p.isBookable ? "Bookable" : "Hidden"}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs font-medium text-[#B26A2A]">No profile for this branch</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {selectedRow ? (
                <>
                  <section className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-5 shadow-sm ring-1 ring-[#F7F4EE]/80">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-[#1F2420]">{selectedRow.user.name}</h3>
                        <p className="text-sm text-[#7A6A58]">{selectedRow.user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!selectedRow.profile && canCreateStaff ? (
                          <button
                            type="button"
                            onClick={openCreateModal}
                            className="rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35]"
                          >
                            Create staff profile
                          </button>
                        ) : null}
                        {selectedRow.profile && canDeleteStaff ? (
                          <button
                            type="button"
                            onClick={() => void deactivateProfile()}
                            disabled={sectionBusy === "deactivate"}
                            className="rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] hover:bg-[#FFF1EC] disabled:opacity-50"
                          >
                            Deactivate profile
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {selectedRow.profile && canUpdateStaff ? (
                      <div className="mt-4 grid gap-3 border-t border-[#F0EBE3] pt-4 md:grid-cols-2">
                        <label className="block text-xs font-medium text-[#7A6A58]">
                          Display name
                          <input
                            className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                            defaultValue={selectedRow.profile.displayName}
                            key={selectedRow.profile.id}
                            id={`dn-${selectedRow.profile.id}`}
                            onBlur={async (e) => {
                              const v = e.target.value.trim();
                              if (!v || !token || !profileId) return;
                              if (v === selectedRow.profile?.displayName) return;
                              try {
                                await patchDashboardStaffProfile(token, profileId, { displayName: v });
                                await loadStaff();
                                setLocalNotice("Profile updated.");
                              } catch (err) {
                                setLocalNotice(formatApiError(err));
                              }
                            }}
                          />
                        </label>
                        <div className="flex flex-col gap-2 text-xs text-[#5C5348]">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              defaultChecked={selectedRow.profile.isActive}
                              onChange={async (e) => {
                                if (!token || !profileId) return;
                                try {
                                  await patchDashboardStaffProfile(token, profileId, {
                                    isActive: e.target.checked,
                                  });
                                  await loadStaff();
                                } catch (err) {
                                  setLocalNotice(formatApiError(err));
                                }
                              }}
                            />
                            Active
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              defaultChecked={selectedRow.profile.isBookable}
                              onChange={async (e) => {
                                if (!token || !profileId) return;
                                try {
                                  await patchDashboardStaffProfile(token, profileId, {
                                    isBookable: e.target.checked,
                                  });
                                  await loadStaff();
                                } catch (err) {
                                  setLocalNotice(formatApiError(err));
                                }
                              }}
                            />
                            Bookable online / reception
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  {selectedRow.profile ? (
                    <>
                      {selectedRow.profile.servicesCount === 0 && canReadStaffServices ? (
                        <div className="flex gap-2 rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] px-4 py-3 text-sm text-[#6B5420]">
                          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                          <p>No services linked — assign capabilities so this staff member can be chosen when visits start.</p>
                        </div>
                      ) : null}
                      {selectedRow.profile.schedulesCount === 0 && canReadSchedule ? (
                        <div className="flex gap-2 rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] px-4 py-3 text-sm text-[#6B5420]">
                          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                          <p>No weekly schedule saved yet — set working hours below and save.</p>
                        </div>
                      ) : null}

                      {canReadSchedule ? (
                        <section className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-5 shadow-sm ring-1 ring-[#F7F4EE]/80">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                              Weekly hours (Cairo week: Sun–Sat)
                            </h3>
                            {sectionBusy === "schedule" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#B9974A]" aria-hidden />
                            ) : null}
                          </div>
                          <div className="mt-4 space-y-3">
                            {scheduleDraft.map((d, idx) => (
                              <div
                                key={d.dayOfWeek}
                                className="flex flex-col gap-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3 md:flex-row md:flex-wrap md:items-center"
                              >
                                <label className="flex min-w-[140px] items-center gap-2 text-sm font-medium text-[#1F2420]">
                                  <input
                                    type="checkbox"
                                    checked={d.isWorking}
                                    disabled={!canUpdateSchedule}
                                    onChange={(e) => {
                                      const next = [...scheduleDraft];
                                      next[idx] = { ...d, isWorking: e.target.checked };
                                      setScheduleDraft(next);
                                    }}
                                  />
                                  {DAY_LABELS[d.dayOfWeek]}
                                </label>
                                {d.isWorking ? (
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C5348]">
                                    <label>
                                      Start
                                      <input
                                        type="time"
                                        className="ml-1 rounded-lg border border-[#E8E0D4] px-2 py-1"
                                        value={d.startTime}
                                        disabled={!canUpdateSchedule}
                                        onChange={(e) => {
                                          const next = [...scheduleDraft];
                                          next[idx] = { ...d, startTime: e.target.value };
                                          setScheduleDraft(next);
                                        }}
                                      />
                                    </label>
                                    <label>
                                      End
                                      <input
                                        type="time"
                                        className="ml-1 rounded-lg border border-[#E8E0D4] px-2 py-1"
                                        value={d.endTime}
                                        disabled={!canUpdateSchedule}
                                        onChange={(e) => {
                                          const next = [...scheduleDraft];
                                          next[idx] = { ...d, endTime: e.target.value };
                                          setScheduleDraft(next);
                                        }}
                                      />
                                    </label>
                                    <span className="text-[#B5A896]">Break</span>
                                    <input
                                      type="time"
                                      className="rounded-lg border border-[#E8E0D4] px-2 py-1"
                                      value={d.breakStartTime}
                                      disabled={!canUpdateSchedule}
                                      onChange={(e) => {
                                        const next = [...scheduleDraft];
                                        next[idx] = { ...d, breakStartTime: e.target.value };
                                        setScheduleDraft(next);
                                      }}
                                    />
                                    <input
                                      type="time"
                                      className="rounded-lg border border-[#E8E0D4] px-2 py-1"
                                      value={d.breakEndTime}
                                      disabled={!canUpdateSchedule}
                                      onChange={(e) => {
                                        const next = [...scheduleDraft];
                                        next[idx] = { ...d, breakEndTime: e.target.value };
                                        setScheduleDraft(next);
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-xs text-[#9A8B7A]">Off this weekday</p>
                                )}
                              </div>
                            ))}
                          </div>
                          {canUpdateSchedule ? (
                            <button
                              type="button"
                              onClick={() => void saveSchedule()}
                              disabled={!profileId || sectionBusy === "schedule"}
                              className="mt-4 rounded-xl bg-[#062A2D] px-4 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
                            >
                              Save weekly schedule
                            </button>
                          ) : null}
                        </section>
                      ) : null}

                      {canReadStaffServices ? (
                        <section className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-5 shadow-sm ring-1 ring-[#F7F4EE]/80">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                              Service capabilities ({capSelection.size} selected)
                            </h3>
                            {sectionBusy === "services" || catalogLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#B9974A]" aria-hidden />
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#7A6A58]">
                            Capabilities are <span className="font-medium text-[#5C5348]">catalog services</span> this
                            branch offers. Per-booking add-ons (enhancements) are not assigned here — they stay on the
                            booking line.
                          </p>
                          {!canReadServices ? (
                            <div className="mt-4 flex gap-2 rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] px-4 py-3 text-sm text-[#6B5420]">
                              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                              <p>
                                Your account needs the <span className="font-semibold">services.read</span> permission
                                to load the service list. Ask an admin under{" "}
                                <Link href="/dashboard/users-roles" className="font-semibold text-[#B9974A] underline">
                                  Users &amp; roles
                                </Link>
                                .
                              </p>
                            </div>
                          ) : null}
                          {catalogError ? (
                            <p className="mt-4 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428]">
                              {catalogError}
                            </p>
                          ) : null}
                          {canReadServices && !catalogLoading && catalogServices.length === 0 && !catalogError ? (
                            <p className="mt-4 text-sm text-[#7A6A58]">
                              There are no active services in the catalog. Create services under{" "}
                              <Link href="/dashboard/services" className="font-semibold text-[#B9974A] underline">
                                Services
                              </Link>
                              .
                            </p>
                          ) : null}
                          {canReadServices &&
                          !catalogLoading &&
                          catalogServices.length > 0 &&
                          servicesForBranch.length === 0 &&
                          branchId ? (
                            <div className="mt-4 flex gap-2 rounded-xl border border-[#E8D4A0]/80 bg-[#FFF9ED] px-4 py-3 text-sm text-[#6B5420]">
                              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                              <p>
                                No services are linked to <span className="font-semibold">this branch</span> yet, so
                                nothing can be assigned. Open{" "}
                                <Link href="/dashboard/services" className="font-semibold text-[#B9974A] underline">
                                  Services
                                </Link>{" "}
                                and ensure each bookable service includes this branch in its branch list.
                              </p>
                            </div>
                          ) : null}
                          <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
                            {[...servicesByCategory.entries()].map(([catId, list]) => (
                              <div key={catId}>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                                  {categoryNameById.get(catId) ?? "Services"}
                                </p>
                                <ul className="mt-2 space-y-1">
                                  {list.map((s) => (
                                    <li key={s.id}>
                                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#FBF6E8]">
                                        <input
                                          type="checkbox"
                                          checked={capSelection.has(s.id)}
                                          disabled={!canUpdateStaffServices}
                                          onChange={(e) => {
                                            setCapSelection((prev) => {
                                              const n = new Set(prev);
                                              if (e.target.checked) n.add(s.id);
                                              else n.delete(s.id);
                                              return n;
                                            });
                                          }}
                                        />
                                        <span className="text-[#1F2420]">{s.name}</span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                          {canUpdateStaffServices ? (
                            <button
                              type="button"
                              onClick={() => void saveCapabilities()}
                              disabled={!profileId || sectionBusy === "services"}
                              className="mt-4 rounded-xl bg-[#062A2D] px-4 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
                            >
                              Save capabilities
                            </button>
                          ) : null}
                        </section>
                      ) : null}

                      {canReadSchedule ? (
                        <section className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-5 shadow-sm ring-1 ring-[#F7F4EE]/80">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                            Schedule exceptions
                          </h3>
                          <div className="mt-4 space-y-2">
                            {exceptions.length === 0 ? (
                              <p className="text-sm text-[#7A6A58]">No exceptions yet.</p>
                            ) : (
                              exceptions.map((ex) => (
                                <div
                                  key={ex.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2 text-xs text-[#4A3C2F]"
                                >
                                  <div>
                                    <span className="font-semibold">{ex.type.replace(/_/g, " ")}</span> ·{" "}
                                    {ex.date.slice(0, 10)}
                                    {ex.startTime && ex.endTime
                                      ? ` · ${utcTimeFromIso(ex.startTime)}–${utcTimeFromIso(ex.endTime)}`
                                      : ""}
                                    {ex.reason ? ` · ${ex.reason}` : ""}
                                  </div>
                                  {canDeleteException ? (
                                    <button
                                      type="button"
                                      onClick={() => void removeException(ex.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#E7B9A4]/70 px-2 py-1 text-[11px] font-semibold text-[#8B4428] hover:bg-[#FFF1EC]"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>

                          {canCreateException ? (
                            <div className="mt-4 space-y-3 border-t border-[#F0EBE3] pt-4">
                              <p className="text-xs font-semibold text-[#7A6A58]">Add exception</p>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="text-xs text-[#5C5348]">
                                  Date
                                  <input
                                    type="date"
                                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                                    value={exceptionForm.date}
                                    onChange={(e) =>
                                      setExceptionForm((p) => ({ ...p, date: e.target.value }))
                                    }
                                  />
                                </label>
                                <label className="text-xs text-[#5C5348]">
                                  Type
                                  <select
                                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                                    value={exceptionForm.type}
                                    onChange={(e) =>
                                      setExceptionForm((p) => ({
                                        ...p,
                                        type: e.target.value as DashboardStaffScheduleException["type"],
                                      }))
                                    }
                                  >
                                    <option value="DAY_OFF">Day off</option>
                                    <option value="CUSTOM_HOURS">Custom hours</option>
                                    <option value="EXTRA_SHIFT">Extra shift</option>
                                  </select>
                                </label>
                              </div>
                              {exceptionForm.type !== "DAY_OFF" ? (
                                <div className="flex flex-wrap gap-3">
                                  <label className="text-xs text-[#5C5348]">
                                    Start
                                    <input
                                      type="time"
                                      className="mt-1 block rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                                      value={exceptionForm.startTime}
                                      onChange={(e) =>
                                        setExceptionForm((p) => ({ ...p, startTime: e.target.value }))
                                      }
                                    />
                                  </label>
                                  <label className="text-xs text-[#5C5348]">
                                    End
                                    <input
                                      type="time"
                                      className="mt-1 block rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                                      value={exceptionForm.endTime}
                                      onChange={(e) =>
                                        setExceptionForm((p) => ({ ...p, endTime: e.target.value }))
                                      }
                                    />
                                  </label>
                                </div>
                              ) : null}
                              <label className="block text-xs text-[#5C5348]">
                                Reason (optional)
                                <input
                                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                                  value={exceptionForm.reason}
                                  onChange={(e) =>
                                    setExceptionForm((p) => ({ ...p, reason: e.target.value }))
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void submitException()}
                                disabled={!profileId || !exceptionForm.date || sectionBusy === "exception"}
                                className="rounded-xl bg-[#062A2D] px-4 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
                              >
                                Add exception
                              </button>
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#E8E0D4]">
              <h3 className="text-lg font-semibold text-[#1F2420]">Create staff profile</h3>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Links salon data to {selectedRow?.user.email}. You can adjust schedule and services after creation.
              </p>
              <label className="mt-4 block text-sm text-[#5C5348]">
                Display name
                <input
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm"
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm font-medium text-[#1F2420]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreateProfile()}
                  disabled={createBusy || !createDisplayName.trim()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                >
                  {createBusy ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}
