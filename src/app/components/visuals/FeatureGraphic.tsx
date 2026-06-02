"use client";

// Animated per-tool icons, shared between the dashboard hero "green block"
// (mint-on-green palette) and the per-page loaders (Resource Library palette:
// green accent + mint fill on a light surface). Colors are passed in so the
// same animation reads correctly on either background.

export type FeatureKey = "chat" | "consults" | "commission" | "notable" | "admin" | "dashboard";

type Colors = {
  size?: number;
  accent: string; // strokes / solid accents
  soft: string;   // translucent fills
  ink: string;    // small details + text on accent shapes
};

export function FeatureGraphic({ feature, size = 96, accent, soft, ink }: { feature: FeatureKey } & Colors) {
  const wrap: React.CSSProperties = { width: size, height: size };

  switch (feature) {
    case "chat":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <path
            d="M22 30 H78 A6 6 0 0 1 84 36 V60 A6 6 0 0 1 78 66 H46 L34 76 V66 H22 A6 6 0 0 1 16 60 V36 A6 6 0 0 1 22 30 Z"
            fill={soft}
            stroke={accent}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <circle cx="36" cy="48" r="3.5" fill={accent}>
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="r" values="3;4;3" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="50" cy="48" r="3.5" fill={accent}>
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
            <animate attributeName="r" values="3;4;3" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="64" cy="48" r="3.5" fill={accent}>
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" begin="0.4s" repeatCount="indefinite" />
            <animate attributeName="r" values="3;4;3" dur="1.4s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          <g className="hero-sparkle" transform="translate(78 20)">
            <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill={accent} />
          </g>
        </svg>
      );

    case "consults":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <g fill="none" stroke={accent} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
            <rect x="26" y="26" width="48" height="56" rx="6" fill={soft} />
            <rect x="40" y="20" width="20" height="10" rx="2" fill={soft} />
            <line x1="36" y1="50" x2="64" y2="50" opacity="0.55" />
            <line x1="36" y1="60" x2="58" y2="60" opacity="0.4" />
          </g>
          <path
            d="M36 70 L46 78 L66 58"
            fill="none"
            stroke={accent}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hero-check"
          />
        </svg>
      );

    case "commission":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          {[
            { cx: 44, begin: "0s" },
            { cx: 50, begin: "0.6s" },
            { cx: 56, begin: "1.2s" },
          ].map((c, i) => (
            <g key={i}>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 -44;0 0;0 0"
                keyTimes="0;0.5;1"
                dur="1.8s"
                begin={c.begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.12;0.46;0.56;1"
                dur="1.8s"
                begin={c.begin}
                repeatCount="indefinite"
              />
              <circle cx={c.cx} cy="56" r="8" fill="var(--anchor-mint)" stroke={ink} strokeWidth="1.5" />
              <text x={c.cx} y="59.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={ink}>$</text>
            </g>
          ))}
          <g fill={soft} stroke={accent} strokeWidth="2.4" strokeLinejoin="round">
            <rect x="20" y="52" width="60" height="32" rx="7" />
          </g>
          <line x1="24" y1="62" x2="76" y2="62" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="67" cy="70" r="3.2" fill={accent} />
        </svg>
      );

    case "notable":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <circle cx="50" cy="50" r="22" fill={accent} opacity="0.45" className="hero-flash" />
          <g fill={soft} stroke={accent} strokeWidth="2.4" strokeLinejoin="round">
            <path d="M22 38 H38 L42 32 H58 L62 38 H78 A4 4 0 0 1 82 42 V70 A4 4 0 0 1 78 74 H22 A4 4 0 0 1 18 70 V42 A4 4 0 0 1 22 38 Z" />
            <circle cx="50" cy="56" r="10" fill={soft} />
            <circle cx="50" cy="56" r="5" fill={accent} />
          </g>
        </svg>
      );

    case "dashboard":
      // Four tiles pulsing in a pinwheel order — matches the bottom-nav grid.
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          {[
            { x: 20, y: 20, begin: "0s" },
            { x: 54, y: 20, begin: "0.15s" },
            { x: 54, y: 54, begin: "0.3s" },
            { x: 20, y: 54, begin: "0.45s" },
          ].map((s, i) => (
            <rect key={i} x={s.x} y={s.y} width="26" height="26" rx="6" fill={accent}>
              <animate attributeName="opacity" values="0.25;1;0.25" dur="1.4s" begin={s.begin} repeatCount="indefinite" />
            </rect>
          ))}
        </svg>
      );

    case "admin":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <line x1="14" y1="84" x2="86" y2="84" stroke={accent} strokeWidth="1.8" opacity="0.5" />
          <rect x="20" y="50" width="12" height="34" rx="2" fill={accent} opacity="0.85">
            <animate attributeName="height" values="34;52;28;46;34" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="y" values="50;32;56;38;50" dur="2.6s" repeatCount="indefinite" />
          </rect>
          <rect x="36" y="34" width="12" height="50" rx="2" fill={accent}>
            <animate attributeName="height" values="50;30;58;42;50" dur="2.2s" begin="0.2s" repeatCount="indefinite" />
            <animate attributeName="y" values="34;54;26;42;34" dur="2.2s" begin="0.2s" repeatCount="indefinite" />
          </rect>
          <rect x="52" y="42" width="12" height="42" rx="2" fill={accent} opacity="0.9">
            <animate attributeName="height" values="42;58;30;50;42" dur="2.8s" begin="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="42;26;54;34;42" dur="2.8s" begin="0.5s" repeatCount="indefinite" />
          </rect>
          <rect x="68" y="56" width="12" height="28" rx="2" fill={accent} opacity="0.75">
            <animate attributeName="height" values="28;46;36;52;28" dur="2.4s" begin="0.8s" repeatCount="indefinite" />
            <animate attributeName="y" values="56;38;48;32;56" dur="2.4s" begin="0.8s" repeatCount="indefinite" />
          </rect>
          <circle cx="42" cy="20" r="3" fill={accent}>
            <animate attributeName="r" values="3;5;3" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </svg>
      );
  }
}

// Per-page loading state: the tool's hero animation, recolored to the Resource
// Library loader palette (green accent + mint fill on a light surface).
export function ToolLoader({ feature, label }: { feature: FeatureKey; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10" role="status" aria-live="polite">
      <FeatureGraphic
        feature={feature}
        size={96}
        accent="var(--anchor-green)"
        soft="rgba(156,226,187,0.30)"
        ink="var(--anchor-deep)"
      />
      {label && <div className="text-sm text-[var(--anchor-gray)]">{label}</div>}
    </div>
  );
}
