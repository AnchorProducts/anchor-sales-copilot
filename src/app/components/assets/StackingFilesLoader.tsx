"use client";

// Loading state for the Resource Library: sheets of paper drop one after
// another onto a pile, looping. Animation lives in globals.css
// (.anchor-stack-loader / @keyframes anchor-file-stack).

// Each sheet's resting offset, rotation, and drop delay in the pile.
const SHEETS = [
  { dx: -11, rot: -9, delay: 0 },
  { dx: 9, rot: 6, delay: 0.3 },
  { dx: -1, rot: -2, delay: 0.6 },
];

function FileGlyph() {
  return (
    <svg width="60" height="74" viewBox="0 0 60 74" fill="none" aria-hidden>
      {/* page */}
      <path
        d="M6 3.5h33L54 18v52.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z"
        fill="white"
        stroke="var(--border-default)"
        strokeWidth="1.5"
      />
      {/* folded corner */}
      <path d="M39 3.5V15a3 3 0 0 0 3 3h12" stroke="var(--border-default)" strokeWidth="1.5" fill="none" />
      {/* green title bar */}
      <rect x="12" y="30" width="36" height="5" rx="2.5" fill="var(--anchor-green)" />
      {/* text lines */}
      <rect x="12" y="42" width="34" height="3.5" rx="1.75" fill="var(--anchor-mint)" />
      <rect x="12" y="51" width="26" height="3.5" rx="1.75" fill="var(--anchor-mint)" />
    </svg>
  );
}

export function StackingFilesLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10" role="status" aria-live="polite">
      <div className="anchor-stack-loader">
        {SHEETS.map((s, i) => (
          <div
            key={i}
            className="anchor-stack-sheet"
            style={{ transform: `translateX(${s.dx}px) rotate(${s.rot}deg)`, zIndex: i + 1 }}
          >
            <span style={{ animationDelay: `${s.delay}s` }}>
              <FileGlyph />
            </span>
          </div>
        ))}
      </div>
      {label && <div className="text-sm text-[var(--anchor-gray)]">{label}</div>}
    </div>
  );
}
