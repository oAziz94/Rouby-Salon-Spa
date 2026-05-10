"use client";

import {
  createDashboardSlot,
  deleteDashboardSlot,
  generateWeekSlots,
  getDashboardBranches,
  getDashboardSlotById,
  getDashboardSlots,
  getSlotGenerationSettings,
  patchDashboardSlot,
  patchDashboardSlotCapacity,
  patchDashboardSlotOnlineBookable,
  patchDashboardSlotStatus,
  type CreateDashboardSlotInput,
  type DashboardBranch,
  type DashboardSlot,
  type DashboardSlotStatus,
  type GenerateWeekSlotsResponse,
  type SlotGenerationDefaults,
} from "@rouby/api-client";
import { formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type SlotsState = "loading" | "loaded" | "empty" | "error";
type SlotModalMode = "create" | "edit";

const SLOT_STATUSES: DashboardSlotStatus[] = [
  "AVAILABLE",
  "PENDING",
  "FILLED",
  "BLOCKED",
  "CLOSED",
];

const SLOT_STATUS_STYLES: Record<DashboardSlotStatus, string> = {
  AVAILABLE: "bg-[#EAF7EE] text-[#1E6A3A]",
  PENDING: "bg-[#FFF6E6] text-[#8B6A1D]",
  FILLED: "bg-[#EDE7F1] text-[#4D3D63]",
  BLOCKED: "bg-[#FBECEA] text-[#8B4428]",
  CLOSED: "bg-[#F3F0EF] text-[#6A615A]",
};

function todayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusBadge(status: DashboardSlotStatus): string {
  return SLOT_STATUS_STYLES[status];
}

type SlotFormState = {
  date: string;
  startTime: string;
  endTime: string;
  capacity: string;
  status: DashboardSlotStatus;
  isOnlineBookable: boolean;
  notes: string;
};

const GEN_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function cloneSlotGen(d: SlotGenerationDefaults): SlotGenerationDefaults {
  return {
    ...d,
    workingDays: [...d.workingDays],
    breakPeriods: d.breakPeriods.map((b) => ({ ...b })),
  };
}

function summarizeDefaults(d: SlotGenerationDefaults): string {
  const days = d.workingDays.map((n) => GEN_WEEKDAY_LABELS[n]).join(", ");
  const breaks =
    d.breakPeriods.length === 0
      ? "None"
      : d.breakPeriods
          .map((b) => `${formatWallClock12h(b.startTime)}–${formatWallClock12h(b.endTime)}`)
          .join("; ");
  return `${days} · ${formatWallClockRange12h(d.startTime, d.endTime, "–")} · ${d.slotDurationMinutes} min · cap ${d.defaultCapacity} · online ${d.defaultOnlineBookable ? "yes" : "no"} · breaks: ${breaks}`;
}

function buildInitialSlotForm(date: string): SlotFormState {
  return {
    date,
    startTime: "10:00",
    endTime: "11:00",
    capacity: "1",
    status: "AVAILABLE",
    isOnlineBookable: true,
    notes: "",
  };
}

export default function DashboardSlotsPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [rows, setRows] = useState<DashboardSlot[]>([]);
  const [state, setState] = useState<SlotsState>("loading");
  const [error, setError] = useState<string>("");
  const [mutationError, setMutationError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<SlotModalMode>("create");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string>("");
  const [slotForm, setSlotForm] = useState<SlotFormState>(() => buildInitialSlotForm(""));

  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genWeekStart, setGenWeekStart] = useState("");
  const [genBranchId, setGenBranchId] = useState("");
  const [genDefaults, setGenDefaults] = useState<SlotGenerationDefaults | null>(null);
  const [genCustomize, setGenCustomize] = useState(false);
  const [genForm, setGenForm] = useState<SlotGenerationDefaults | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genSubmitting, setGenSubmitting] = useState(false);
  const [genError, setGenError] = useState("");
  const [genResult, setGenResult] = useState<GenerateWeekSlotsResponse | null>(null);

  const canRead = hasPermission("slots.read");
  const canCreate = hasPermission("slots.create");
  const canUpdate = hasPermission("slots.update");
  const canCapacity = hasPermission("slots.capacity.configure");
  const canStatus = hasPermission("slots.status.manage");
  const canDelete = hasPermission("slots.delete");
  const canReadBranches = hasPermission("branches.read");

  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  useEffect(() => {
    if (!date) {
      setDate(todayDateInput());
    }
  }, [date]);

  const refreshSlots = useMemo(
    () => async () => {
      if (!token || !canRead || !date || (!branchId && canAccessMultipleBranches)) {
        return;
      }
      setState("loading");
      setError("");
      try {
        const res = await getDashboardSlots(token, branchId, {
          page: 1,
          pageSize: 100,
          dateFrom: date,
          dateTo: date,
          status: (statusFilter || undefined) as DashboardSlotStatus | undefined,
        });
        setRows(Array.isArray(res.data) ? res.data : []);
        setState(res.data.length > 0 ? "loaded" : "empty");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load slots.",
        );
        setState("error");
      }
    },
    [branchId, canAccessMultipleBranches, canRead, date, statusFilter, token],
  );

  useEffect(() => {
    if (!token || !canRead) {
      return;
    }

    if (canReadBranches) {
      getDashboardBranches(token)
        .then((list) => {
          setBranches(list);
          if (!branchId) {
            setBranchId(user?.branchId ?? list[0]?.id ?? "");
          }
        })
        .catch((fetchError) => {
          setBranches([]);
          if (user?.branchId) {
            setBranchId(user.branchId);
            return;
          }
          setState("error");
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load branches.",
          );
        });
      return;
    }

    if (!branchId && user?.branchId) {
      setBranchId(user.branchId);
    }
  }, [branchId, canRead, canReadBranches, token, user?.branchId]);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);

  useEffect(() => {
    if (!modalOpen && !genModalOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalOpen(false);
        setGenModalOpen(false);
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [modalOpen, genModalOpen]);

  async function openGenerateWeekModal() {
    if (!token || !branchId) {
      return;
    }
    setGenModalOpen(true);
    setGenError("");
    setGenResult(null);
    setGenCustomize(false);
    setGenWeekStart(date);
    setGenBranchId(branchId);
    setGenDefaults(null);
    setGenForm(null);
    setGenLoading(true);
    try {
      const loaded = await getSlotGenerationSettings(token);
      setGenDefaults(loaded);
      setGenForm(cloneSlotGen(loaded));
    } catch (loadError) {
      setGenError(
        loadError instanceof Error ? loadError.message : "Failed to load slot generation defaults.",
      );
    } finally {
      setGenLoading(false);
    }
  }

  function closeGenerateWeekModal() {
    setGenModalOpen(false);
    setGenResult(null);
    setGenError("");
  }

  function toggleGenWorkingDay(day: number) {
    setGenForm((prev) => {
      if (!prev) {
        return prev;
      }
      const has = prev.workingDays.includes(day);
      const workingDays = has
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort((a, b) => a - b);
      return { ...prev, workingDays };
    });
  }

  function setGenBreakPeriods(
    updater: (rows: SlotGenerationDefaults["breakPeriods"]) => SlotGenerationDefaults["breakPeriods"],
  ) {
    setGenForm((prev) => (prev ? { ...prev, breakPeriods: updater(prev.breakPeriods) } : prev));
  }

  async function submitGenerateWeek(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !genBranchId) {
      return;
    }
    setGenSubmitting(true);
    setGenError("");
    if (genCustomize && genForm && genForm.workingDays.length === 0) {
      setGenError("Select at least one working day, or turn off customization.");
      setGenSubmitting(false);
      return;
    }
    try {
      const toTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const payload =
        genCustomize && genForm
          ? {
              weekStartDate: genWeekStart,
              workingDays: genForm.workingDays,
              startTime: toTime(genForm.startTime),
              endTime: toTime(genForm.endTime),
              slotDurationMinutes: genForm.slotDurationMinutes,
              defaultCapacity: genForm.defaultCapacity,
              defaultOnlineBookable: genForm.defaultOnlineBookable,
              breakPeriods: genForm.breakPeriods.map((b) => ({
                startTime: toTime(b.startTime),
                endTime: toTime(b.endTime),
              })),
            }
          : { weekStartDate: genWeekStart };
      const res = await generateWeekSlots(token, genBranchId, payload);
      setGenResult(res);
      await refreshSlots();
    } catch (submitError) {
      setGenError(
        submitError instanceof Error ? submitError.message : "Failed to generate week slots.",
      );
    } finally {
      setGenSubmitting(false);
    }
  }

  function openCreateModal() {
    setModalMode("create");
    setEditingSlotId("");
    setSlotForm(buildInitialSlotForm(date));
    setMutationError("");
    setModalOpen(true);
  }

  async function openEditModal(slotId: string) {
    if (!token || !branchId) {
      return;
    }
    setMutationError("");
    try {
      const slot = await getDashboardSlotById(token, branchId, slotId);
      setModalMode("edit");
      setEditingSlotId(slot.id);
      setSlotForm({
        date: slot.date,
        startTime: slot.startTime.slice(0, 5),
        endTime: slot.endTime.slice(0, 5),
        capacity: String(slot.capacity),
        status: slot.status,
        isOnlineBookable: slot.isOnlineBookable,
        notes: slot.notes ?? "",
      });
      setModalOpen(true);
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load slot details.",
      );
    }
  }

  async function submitSlotForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !branchId) {
      return;
    }
    setIsSubmitting(true);
    setMutationError("");
    try {
      const capacityNumber = Number(slotForm.capacity);
      const createPayload: CreateDashboardSlotInput = {
        date: slotForm.date,
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
        capacity: capacityNumber,
        status: slotForm.status,
        isOnlineBookable: slotForm.isOnlineBookable,
        notes: slotForm.notes || undefined,
      };

      if (modalMode === "create") {
        await createDashboardSlot(token, branchId, createPayload);
      } else if (editingSlotId) {
        await patchDashboardSlot(token, branchId, editingSlotId, {
          date: slotForm.date,
          startTime: slotForm.startTime,
          endTime: slotForm.endTime,
          notes: slotForm.notes || undefined,
        });

        if (canCapacity) {
          await patchDashboardSlotCapacity(
            token,
            branchId,
            editingSlotId,
            capacityNumber,
          );
        }
        if (canStatus) {
          await patchDashboardSlotStatus(
            token,
            branchId,
            editingSlotId,
            slotForm.status,
          );
        }
        if (canUpdate) {
          await patchDashboardSlotOnlineBookable(
            token,
            branchId,
            editingSlotId,
            slotForm.isOnlineBookable,
          );
        }
      }

      setModalOpen(false);
      await refreshSlots();
    } catch (submitError) {
      setMutationError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save slot changes.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCapacityUpdate(slot: DashboardSlot, nextCapacity: number) {
    if (!token || !branchId || !canCapacity) {
      return;
    }
    try {
      await patchDashboardSlotCapacity(token, branchId, slot.id, nextCapacity);
      await refreshSlots();
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update slot capacity.",
      );
    }
  }

  async function handleOnlineToggle(slot: DashboardSlot, nextValue: boolean) {
    if (!token || !branchId || !canUpdate) {
      return;
    }
    try {
      await patchDashboardSlotOnlineBookable(token, branchId, slot.id, nextValue);
      await refreshSlots();
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update online bookable value.",
      );
    }
  }

  async function handleStatusChange(slot: DashboardSlot, nextStatus: DashboardSlotStatus) {
    if (!token || !branchId || !canStatus) {
      return;
    }
    try {
      await patchDashboardSlotStatus(token, branchId, slot.id, nextStatus);
      await refreshSlots();
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to change slot status.",
      );
    }
  }

  async function handleDelete(slot: DashboardSlot) {
    if (!token || !branchId || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Soft delete slot ${slot.date} ${formatWallClockRange12h(slot.startTime, slot.endTime, "-")}?`,
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteDashboardSlot(token, branchId, slot.id);
      await refreshSlots();
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to delete slot.",
      );
    }
  }

  return (
    <PermissionGuard permission="slots.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Slot Management</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Configure slot capacity, online availability, and statuses.
              </p>
            </div>
            {canCreate ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openGenerateWeekModal()}
                  className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
                >
                  Generate week slots
                </button>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Create slot
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A]"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A]"
              >
                <option value="">All statuses</option>
                {SLOT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
              <select
                value={branchId}
                disabled={!canAccessMultipleBranches}
                onChange={(event) => setBranchId(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A] disabled:bg-[#F5F1EA] disabled:text-[#7A6A58]"
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {mutationError ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-4 shadow-sm">
            <p className="text-sm text-danger">{mutationError}</p>
          </section>
        ) : null}

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-[#7A6A58]">Loading slots...</p>
          </section>
        ) : null}

        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm">
            <p className="text-sm text-danger">{error}</p>
          </section>
        ) : null}

        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-[#7A6A58]">
              No slots found for the selected branch/date filters.
            </p>
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Capacity</th>
                    <th className="py-2 pr-3 font-medium">Booked</th>
                    <th className="py-2 pr-3 font-medium">Online</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((slot) => (
                    <tr key={slot.id} className="border-b border-border/60">
                      <td className="py-3 pr-3 text-[#1F2420]">{slot.date}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">
                        {formatWallClockRange12h(slot.startTime, slot.endTime, " - ")}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                            slot.status,
                          )}`}
                        >
                          {slot.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#1F2420]">
                        {canCapacity ? (
                          <input
                            type="number"
                            min={1}
                            defaultValue={slot.capacity}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isInteger(value) && value > 0 && value !== slot.capacity) {
                                void handleCapacityUpdate(slot, value);
                              }
                            }}
                            className="w-20 rounded border border-border px-2 py-1"
                          />
                        ) : (
                          slot.capacity
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{slot.liveBookingsCount}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">
                        {canUpdate ? (
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={slot.isOnlineBookable}
                              onChange={(event) =>
                                void handleOnlineToggle(slot, event.target.checked)
                              }
                            />
                            <span>{slot.isOnlineBookable ? "Yes" : "No"}</span>
                          </label>
                        ) : slot.isOnlineBookable ? (
                          "Yes"
                        ) : (
                          "No"
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          {canUpdate ? (
                            <button
                              type="button"
                              onClick={() => void openEditModal(slot.id)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs font-medium"
                            >
                              Edit
                            </button>
                          ) : null}
                          {canStatus ? (
                            <select
                              value={slot.status}
                              onChange={(event) =>
                                void handleStatusChange(
                                  slot,
                                  event.target.value as DashboardSlotStatus,
                                )
                              }
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              {SLOT_STATUSES.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(slot)}
                              className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-2 py-1 text-xs font-medium text-danger"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((slot) => (
                <article
                  key={slot.id}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1F2420]">
                      {slot.date} {formatWallClockRange12h(slot.startTime, slot.endTime, " – ")}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                        slot.status,
                      )}`}
                    >
                      {slot.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#7A6A58]">
                    Capacity: {slot.capacity} | Booked: {slot.liveBookingsCount}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    Online: {slot.isOnlineBookable ? "Yes" : "No"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => void openEditModal(slot.id)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs font-medium"
                      >
                        Edit
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(slot)}
                        className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-2 py-1 text-xs font-medium text-danger"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {genModalOpen ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#2A1722]/45 p-0 sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Close generate week dialog"
              className="absolute inset-0 cursor-default"
              onClick={closeGenerateWeekModal}
            />
            <section
              className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card p-5 shadow-lg sm:max-w-lg sm:rounded-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Generate week slots"
            >
              <h2 className="text-lg font-semibold text-[#1F2420]">Generate week slots</h2>
              <p className="mt-1 text-sm text-[#7A6A58]">
                Creates 7 days of slots from saved defaults. Existing slots for the same times are
                skipped.
              </p>
              {canRead && (
                <p className="mt-2 text-xs text-[#7A6A58]">
                  <Link href="/dashboard/settings/slots" className="underline">
                    Edit default slot generation settings
                  </Link>
                </p>
              )}
              <form className="mt-4 space-y-4" onSubmit={submitGenerateWeek}>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                  <select
                    value={genBranchId}
                    disabled={!canAccessMultipleBranches}
                    onChange={(e) => setGenBranchId(e.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A] disabled:bg-[#F5F1EA]"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Week start date</span>
                  <input
                    type="date"
                    required
                    value={genWeekStart}
                    onChange={(e) => setGenWeekStart(e.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {genLoading ? (
                  <p className="text-sm text-[#7A6A58]">Loading defaults…</p>
                ) : genDefaults ? (
                  <div className="rounded-md border border-border bg-[#F9F7F4] p-3 text-sm text-[#1F2420]">
                    <p className="font-medium text-[#7A6A58]">Saved defaults</p>
                    <p className="mt-1 break-words">{summarizeDefaults(genDefaults)}</p>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={genCustomize}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setGenCustomize(next);
                      if (next && genDefaults) {
                        setGenForm(cloneSlotGen(genDefaults));
                      }
                    }}
                  />
                  Customize for this generation
                </label>
                {genCustomize && genForm ? (
                  <div className="space-y-3 rounded-md border border-border p-3">
                    <p className="text-xs font-medium text-[#7A6A58]">Overrides (this run only)</p>
                    <div className="flex flex-wrap gap-2">
                      {GEN_WEEKDAY_LABELS.map((label, day) => (
                        <label key={label} className="flex items-center gap-1 text-xs text-[#1F2420]">
                          <input
                            type="checkbox"
                            checked={genForm.workingDays.includes(day)}
                            onChange={() => toggleGenWorkingDay(day)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        <span className="mb-1 block text-[#7A6A58]">Start</span>
                        <input
                          type="time"
                          value={genForm.startTime.slice(0, 5)}
                          onChange={(e) =>
                            setGenForm((p) => (p ? { ...p, startTime: e.target.value } : p))
                          }
                          className="w-full rounded border border-border px-1 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block text-[#7A6A58]">End</span>
                        <input
                          type="time"
                          value={genForm.endTime.slice(0, 5)}
                          onChange={(e) =>
                            setGenForm((p) => (p ? { ...p, endTime: e.target.value } : p))
                          }
                          className="w-full rounded border border-border px-1 py-1"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        <span className="mb-1 block text-[#7A6A58]">Duration (min)</span>
                        <input
                          type="number"
                          min={5}
                          max={480}
                          value={genForm.slotDurationMinutes}
                          onChange={(e) =>
                            setGenForm((p) =>
                              p ? { ...p, slotDurationMinutes: Number(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-border px-1 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block text-[#7A6A58]">Capacity</span>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={genForm.defaultCapacity}
                          onChange={(e) =>
                            setGenForm((p) =>
                              p ? { ...p, defaultCapacity: Number(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-border px-1 py-1"
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[#1F2420]">
                      <input
                        type="checkbox"
                        checked={genForm.defaultOnlineBookable}
                        onChange={(e) =>
                          setGenForm((p) =>
                            p ? { ...p, defaultOnlineBookable: e.target.checked } : p,
                          )
                        }
                      />
                      Online bookable
                    </label>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#7A6A58]">Breaks</span>
                        <button
                          type="button"
                          onClick={() =>
                            setGenBreakPeriods((rows) => [
                              ...rows,
                              { startTime: "12:00", endTime: "13:00" },
                            ])
                          }
                          className="text-xs underline"
                        >
                          Add break
                        </button>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {genForm.breakPeriods.map((row, index) => (
                          <li key={`g-${index}`} className="flex flex-wrap items-center gap-1">
                            <input
                              type="time"
                              value={row.startTime.slice(0, 5)}
                              onChange={(e) =>
                                setGenBreakPeriods((rows) =>
                                  rows.map((r, i) =>
                                    i === index ? { ...r, startTime: e.target.value } : r,
                                  ),
                                )
                              }
                              className="rounded border px-1"
                            />
                            <span className="text-xs">–</span>
                            <input
                              type="time"
                              value={row.endTime.slice(0, 5)}
                              onChange={(e) =>
                                setGenBreakPeriods((rows) =>
                                  rows.map((r, i) =>
                                    i === index ? { ...r, endTime: e.target.value } : r,
                                  ),
                                )
                              }
                              className="rounded border px-1"
                            />
                            <button
                              type="button"
                              className="text-xs text-danger"
                              onClick={() =>
                                setGenBreakPeriods((rows) => rows.filter((_, i) => i !== index))
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
                {genError ? (
                  <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {genError}
                  </p>
                ) : null}
                {genResult ? (
                  <p className="rounded-md border border-[#E7B9A4] bg-[#EAF7EE] px-3 py-2 text-sm text-[#1E6A3A]">
                    Created {genResult.createdCount}, skipped {genResult.skippedCount} (duplicates).
                    Updated {genResult.alignedDefaultsCount} overlapping empty slot
                    {genResult.alignedDefaultsCount === 1 ? "" : "s"} to match current generation defaults
                    (capacity and online booking). Range {genResult.dateFrom} → {genResult.dateTo}.
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeGenerateWeekModal}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-[#1F2420]"
                  >
                    {genResult ? "Close" : "Cancel"}
                  </button>
                  {!genResult ? (
                    <button
                      type="submit"
                      disabled={genSubmitting || !genBranchId || genLoading}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {genSubmitting ? "Generating…" : "Generate"}
                    </button>
                  ) : null}
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {modalOpen ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#2A1722]/45 p-0 sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Close slot dialog"
              className="absolute inset-0 cursor-default"
              onClick={() => setModalOpen(false)}
            />
            <section
              className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card p-5 shadow-lg sm:max-w-lg sm:rounded-xl"
              role="dialog"
              aria-modal="true"
              aria-label={modalMode === "create" ? "Create slot" : "Edit slot"}
            >
              <h2 className="text-lg font-semibold text-[#1F2420]">
                {modalMode === "create" ? "Create slot" : "Edit slot"}
              </h2>
              <p className="mt-1 text-sm text-[#7A6A58]">
                The slots table “Booked” column counts active bookings on each slot (including
                pending). Capacity limits for confirmations still follow booking engine rules.
              </p>
              <form className="mt-4 space-y-3" onSubmit={submitSlotForm}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Date</span>
                    <input
                      type="date"
                      required
                      value={slotForm.date}
                      onChange={(event) =>
                        setSlotForm((prev) => ({ ...prev, date: event.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Capacity</span>
                    <input
                      type="number"
                      min={1}
                      required
                      value={slotForm.capacity}
                      onChange={(event) =>
                        setSlotForm((prev) => ({ ...prev, capacity: event.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                      disabled={modalMode === "edit" && !canCapacity}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Start</span>
                    <input
                      type="time"
                      required
                      value={slotForm.startTime}
                      onChange={(event) =>
                        setSlotForm((prev) => ({ ...prev, startTime: event.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">End</span>
                    <input
                      type="time"
                      required
                      value={slotForm.endTime}
                      onChange={(event) =>
                        setSlotForm((prev) => ({ ...prev, endTime: event.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                    />
                  </label>
                </div>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                  <select
                    value={slotForm.status}
                    onChange={(event) =>
                      setSlotForm((prev) => ({
                        ...prev,
                        status: event.target.value as DashboardSlotStatus,
                      }))
                    }
                    disabled={modalMode === "edit" && !canStatus}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    {SLOT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={slotForm.isOnlineBookable}
                    onChange={(event) =>
                      setSlotForm((prev) => ({
                        ...prev,
                        isOnlineBookable: event.target.checked,
                      }))
                    }
                    disabled={modalMode === "edit" && !canUpdate}
                  />
                  Online bookable
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Notes</span>
                  <textarea
                    rows={3}
                    value={slotForm.notes}
                    onChange={(event) =>
                      setSlotForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>

                {mutationError ? (
                  <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {mutationError}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-[#1F2420]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {isSubmitting ? "Saving..." : modalMode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
