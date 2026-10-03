type StaffOption = {
  staffProfileId: string;
  displayName: string;
  status: string;
  reason?: string;
};

/** Staff linked to the service — the normal choices. */
export function linkedStaff<T extends StaffOption>(staff: T[]): T[] {
  return staff.filter((s) => s.status !== "NOT_LINKED");
}

/**
 * <option>s for a "start service" staff picker: staff linked to the service first, then
 * everyone else under an "exception" group. Picking from that group makes the API ask for
 * a reason, which is saved in the audit log.
 */
export function StaffOptions({ staff }: { staff: StaffOption[] }) {
  const linked = linkedStaff(staff);
  const others = staff.filter((s) => s.status === "NOT_LINKED");
  return (
    <>
      {linked.map((s) => (
        <option key={s.staffProfileId} value={s.staffProfileId}>
          {s.displayName} ({s.status === "AVAILABLE" ? "available" : "unavailable"}
          {s.reason ? ` — ${s.reason}` : ""})
        </option>
      ))}
      {others.length > 0 ? (
        <optgroup label="Other staff (exception, reason needed)">
          {others.map((s) => (
            <option key={s.staffProfileId} value={s.staffProfileId}>
              {s.displayName}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
