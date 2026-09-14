import { PhotoTile, ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import { formatDay, type Submission } from "@/lib/showcase/client";

/* ============================================================================
 * What I've filed, and what came of it — the stop and each of my photos.
 *
 * Read-only on purpose: a filed stop can't be edited or removed from here. If
 * it's wrong, file it again and marketing declines the old one.
 *
 * Every decline reason is shown in full, for the stop and for each photo. A
 * photo marketing turned down on a stop that's already live used to leave the
 * stop reading "On the site" with no sign anything was wrong; now the photo
 * carries its own status and reason.
 * ==========================================================================*/

export default function MySubmissions({ submissions }: { submissions: Submission[] }) {
  if (!submissions.length) {
    return (
      <p className="text-sm text-[var(--anchor-gray)]">
        Nothing yet. Stops you add show up here with what marketing decided.
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {submissions.map((s) => {
          const declinedPhotos = s.photos.filter((p) => p.status === "declined" && p.reviewNote);
          return (
            <li key={s.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--anchor-deep)]">{s.city}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-0.5 text-sm text-[var(--anchor-gray)]">
                {s.event} · {formatDay(s.date)}
              </div>
              {s.note && <div className="mt-1 text-sm text-[var(--anchor-gray)]">{s.note}</div>}
              {s.status === "declined" && s.reviewNote && <ReviewNote note={s.reviewNote} />}

              {s.photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {s.photos.map((p) => (
                    <PhotoTile key={p.id} photo={p} />
                  ))}
                </div>
              )}
              {declinedPhotos.map((p) => (
                <ReviewNote key={p.id} label="Photo declined" note={p.reviewNote ?? ""} />
              ))}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-[var(--anchor-gray)]">
        You can&rsquo;t change a stop after filing it. If something&rsquo;s wrong, file it again and
        marketing will decline the old one.
      </p>
    </>
  );
}
