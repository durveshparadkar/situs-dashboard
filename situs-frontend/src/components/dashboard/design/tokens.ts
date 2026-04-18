// Design tokens — single source of truth for the Revenue OS aesthetic.
// Change these and the whole system re-skins coherently.

export const motion = {
  // The easing curve used across Linear, Vercel, Stripe. Confident, not bouncy.
  ease: [0.16, 1, 0.3, 1] as const,
  easeSharp: [0.4, 0, 0.2, 1] as const,
  // Stagger used for on-mount choreography.
  stagger: 0.06,
  // Standard durations.
  fast: 0.2,
  base: 0.4,
  slow: 0.6,
};

export const palette = {
  canvas: "#FAFAF9",
  surface: "#FFFFFF",
  ink: "#0A0A0A",
  muted: "#71717A",
  subtle: "#A1A1AA",
  border: "rgba(9, 9, 11, 0.06)",
  borderStrong: "rgba(9, 9, 11, 0.10)",

  // Signal colors — used meaningfully, not decoratively.
  emerald: "#059669",
  emeraldSoft: "#D1FAE5",
  amber: "#D97706",
  amberSoft: "#FEF3C7",
  rose: "#E11D48",
  roseSoft: "#FFE4E6",
  indigo: "#4F46E5",
  indigoSoft: "#E0E7FF",
};