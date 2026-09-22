"use client";

// Amber banner shown when an order's status is "delayed". Surfaces the projected
// ship date and the reason for the holdup. Shared by the admin view and the
// rep-facing history. When `contactEmail` is set (rep view) it offers a mailto
// so the rep can reach the admin who flagged the delay.
export default function OrderDelayBanner({
  projectedShipDate,
  notes,
  byName,
  at,
  contactEmail,
}: {
  projectedShipDate: string | null;
  notes: string | null;
  byName?: string | null;
  at?: string | null;
  contactEmail?: string | null;
}) {
  const when = at ? formatDateTime(at) : null;

  return (
    <div className="rounded-[14px] bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-900">
      <div className="font-semibold">Delayed · this order is held up.</div>
      {projectedShipDate && (
        <div className="mt-1">
          <span className="font-semibold">Projected ship date:</span> {formatDate(projectedShipDate)}
        </div>
      )}
      {notes && <div className="mt-1 whitespace-pre-line">{notes}</div>}
      {(byName || when) && (
        <div className="mt-1 text-amber-800">
          Updated{byName ? ` by ${byName}` : ""}
          {when ? ` on ${when}` : ""}.
          {contactEmail && (
            <>
              {" "}
              Questions?{" "}
              <a href={`mailto:${contactEmail}`} className="font-semibold underline">
                {contactEmail}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(s: string) {
  try {
    // Plain calendar date (YYYY-MM-DD); render without a TZ shift.
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function formatDateTime(s: string) {
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}
