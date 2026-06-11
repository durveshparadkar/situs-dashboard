"use client";

import { Reveal } from "./shared/Reveal";

const STEPS = [
  {
    num: "01", tag: "Ingest", accent: "#6366F1",
    title: "Revenue Signals",
    desc: "Ingest data from your CRM, pipeline, and revenue tools into a single unified layer.",
  },
  {
    num: "02", tag: "Analyze", accent: "#8B5CF6",
    title: "AI Intelligence",
    desc: "Our AI engine processes signals, detects patterns, and surfaces what matters most.",
  },
  {
    num: "03", tag: "Decide", accent: "#10B981",
    title: "Revenue Decisions",
    desc: "Get clear, prioritized recommendations so your team knows exactly what to do next.",
  },
  {
    num: "04", tag: "Win", accent: "#22C55E",
    title: "Revenue Outcomes",
    desc: "Close more deals, hit forecast, and build a predictable revenue engine.",
  },
];

const RESULTS = [
  { value: "↑ 22%", label: "Faster decisions"   },
  { value: "↓ 40%", label: "Less manual work"   },
  { value: "84%",   label: "Forecast accuracy"  },
];

export default function Approach() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--s-base)",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
          width: 900, height: 400, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 80px" }}>
            <div className="badge">The Approach</div>
            <h2 className="h-section" style={{ marginBottom: 18 }}>
              From signal to <span className="gradient-text">outcome</span>
            </h2>
            <p className="t-lead">
              Situs transforms raw revenue signals into confident decisions in four steps.
            </p>
          </div>
        </Reveal>

        {/* ── Steps ── */}
        <div style={{ position: "relative" }}>

          {/* Flow line (Uniform Connectedness — steps belong to one process) */}
          <div className="hide-mobile" aria-hidden="true" style={{
            position: "absolute", top: "50%", left: "8%", right: "8%",
            height: 2, transform: "translateY(-50%)",
            background: "linear-gradient(90deg, #6366F1, #8B5CF6, #10B981, #22C55E)",
            opacity: 0.2, zIndex: 0,
          }} />

          <div className="four-col" style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20, position: "relative", zIndex: 1,
          }}>
            {STEPS.map((step, i) => {
              const isLast = i === 3; // Von Restorff: outcome card stands out
              return (
                <Reveal key={step.num} delay={i * 100}>
                  <div
                    style={{
                      background: isLast
                        ? "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)"
                        : "#fff",
                      border: `1px solid ${isLast ? "transparent" : "var(--s-border)"}`,
                      borderRadius: 18,
                      padding: "32px 28px",
                      height: "100%",
                      position: "relative", overflow: "hidden",
                      boxShadow: isLast ? "0 16px 48px rgba(0,0,0,0.2)" : "var(--shadow-sm)",
                      transition: "transform var(--speed-base) var(--ease), box-shadow var(--speed-base) var(--ease)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-6px)";
                      e.currentTarget.style.boxShadow = isLast
                        ? "0 24px 64px rgba(0,0,0,0.3)"
                        : `0 16px 40px ${step.accent}20`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = isLast
                        ? "0 16px 48px rgba(0,0,0,0.2)"
                        : "var(--shadow-sm)";
                    }}
                  >
                    {/* Corner glow */}
                    <div aria-hidden="true" style={{
                      position: "absolute", top: -30, right: -30,
                      width: 100, height: 100, borderRadius: "50%",
                      background: `radial-gradient(circle, ${step.accent}${isLast ? "30" : "12"} 0%, transparent 70%)`,
                      pointerEvents: "none",
                    }} />

                    {/* Tag + number */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 24, position: "relative",
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "#fff", background: step.accent,
                        padding: "4px 10px", borderRadius: 100,
                        boxShadow: `0 2px 8px ${step.accent}40`,
                      }}>
                        {step.tag}
                      </span>
                      <span aria-hidden="true" style={{
                        fontSize: 48, fontWeight: 900,
                        letterSpacing: "-0.05em", lineHeight: 1,
                        color: isLast ? "rgba(255,255,255,0.1)" : `${step.accent}20`,
                      }}>
                        {step.num}
                      </span>
                    </div>

                    {/* Icon dot */}
                    <div style={{
                      width: 40, height: 40, borderRadius: "var(--r-md)",
                      background: isLast ? "rgba(255,255,255,0.08)" : `${step.accent}12`,
                      border: `1px solid ${isLast ? "rgba(255,255,255,0.1)" : `${step.accent}25`}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 20, position: "relative",
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: step.accent,
                        boxShadow: `0 0 10px ${step.accent}`,
                        animation: isLast ? "pulse 2s infinite" : "none",
                      }} />
                    </div>

                    <h3 style={{
                      fontSize: 17, fontWeight: 700,
                      letterSpacing: "-0.025em", marginBottom: 10,
                      color: isLast ? "#fff" : "var(--t-primary)",
                      position: "relative",
                    }}>
                      {step.title}
                    </h3>

                    <p style={{
                      fontSize: 14, lineHeight: 1.7,
                      color: isLast ? "#888" : "#777",
                      position: "relative",
                    }}>
                      {step.desc}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* ── Results banner ── */}
        <Reveal delay={400}>
          <div style={{
            marginTop: 32,
            background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(34,197,94,0.05))",
            border: "1px solid rgba(99,102,241,0.12)",
            borderRadius: "var(--r-lg)", padding: "24px 32px",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 40, flexWrap: "wrap",
          }}>
            {RESULTS.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="gradient-text" style={{
                  fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em",
                }}>
                  {r.value}
                </span>
                <span style={{ fontSize: 14, color: "var(--t-secondary)", fontWeight: 500 }}>
                  {r.label}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}