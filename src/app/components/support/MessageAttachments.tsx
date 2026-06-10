"use client";

export type SupportAttachmentView = {
  path: string;
  filename: string;
  content_type?: string;
  size?: number;
  url: string | null;
};

// Thumbnail grid for a support message's image attachments. Click opens the
// full image (short-lived signed URL) in a new tab.
export default function MessageAttachments({
  attachments,
}: {
  attachments?: SupportAttachmentView[] | null;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a, i) =>
        a.url ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" title={a.filename}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              className="h-28 w-28 rounded-lg border border-black/10 object-cover transition hover:opacity-90"
            />
          </a>
        ) : (
          <span key={i} className="text-xs text-[var(--anchor-gray)]">
            {a.filename} (unavailable)
          </span>
        )
      )}
    </div>
  );
}
