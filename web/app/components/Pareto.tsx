"use client";

import { Reveal } from "./shared/Reveal";

const SIGNALS = [
  { label: "Deal Risk Score",   desc: "Flags deals likely to slip before they do.",   accent: "#EF4444", weight: 92 },
  { label: "Pipeline Velocity", desc: "Tracks how fast deals move through stages.",    accent: "#6366F1", weight: 87 },
  { label: "Forecast Drift",    desc: "Detects when forecast accuracy is declining.",  accent: "#F59E0B", weight: 78 },
  { label: "Engagement Gaps",   desc: "Surfaces deals gone silent too long.",          accent: "#10B981", weight: 71 },
];

export default function Pareto() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--s-raised)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", right: "-5%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div
        className="two-col"
        style={{
          maxWidth: "var(--container)", margin: "0 auto", position: "relative",
          display: "grid", gridTemplateColumns: "1fr 1.1fr",
          gap: 96, alignItems: "center",
        }}
      >

        {/* ── Left copy ── */}
        <Reveal direction="left">
          <div className="badge">80/20 Framework</div>

          <h2 className="h-section" style={{ marginBottom: 24 }}>
            Focus on the signals<br />
            <span className="gradient-text">that matter</span>
          </h2>

          <p className="t-lead" style={{ marginBottom: 28 }}>
            Most revenue outcomes come from a small number of critical signals.
            Situs helps teams identify and act on those signals faster —
            before they become problems.
          </p>

          {/* Highlight quote (Von Restorff — the one bold claim) */}
          <div style={{
            background: "#fff", border: "1px solid var(--s-border)",
            borderLeft: "3px solid var(--c-indigo)",
            borderRadius: "var(--r-md)", padding: "20px 24px",
          }}>
            <p style={{
              fontSize: 17, fontWeight: 700, color: "var(--t-primary)",
              letterSpacing: "-0.02em", marginBottom: 4,
            }}>
              20% of signals drive 80% of outcomes.
            </p>
            <p style={{ fontSize: 14, color: "var(--t-tertiary)" }}>
              We show you exactly which 20% to act on.
            </p>
          </div>
        </Reveal>

        {/* ── Right visual ── */}
        <Reveal direction="right" delay={100}>
          <div>

            {/* Pareto bar */}
            <div style={{
              display: "flex", alignItems: "stretch",
              height: 84, borderRadius: 14, overflow: "hidden",
              border: "1px solid var(--s-border)", marginBottom: 12,
              boxShadow: "var(--shadow-md)",
            }}>
              <div style={{
                background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet))",
                width: "20%",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: "#fff", gap: 2,
              }}>
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em" }}>20%</span>
                <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 600, letterSpacing: "0.06em" }}>SIGNALS</span>
              </div>
              <div style={{
                background: "#fff", flex: 1,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2, position: "relative",
              }}>
                <div aria-hidden="true" style={{
                  position: "absolute", inset: 0, opacity: 0.4,
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #F5F5F5 10px, #F5F5F5 20px)",
                }} />
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--t-primary)", position: "relative" }}>80%</span>
                <span style={{ fontSize: 11, color: "var(--t-tertiary)", fontWeight: 500, position: "relative" }}>of revenue outcomes</span>
              </div>
            </div>

            <p aria-hidden="true" style={{
              fontSize: 12, color: "var(--t-faint)", textAlign: "center",
              marginBottom: 32, fontWeight: 500,
            }}>
              Pareto Principle applied to revenue intelligence
            </p>

            {/* Signal cards with weight bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SIGNALS.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    background: "#fff", border: "1px solid var(--s-border)",
                    borderRadius: 14, padding: "18px 20px",
                    transition: "all var(--speed-base) var(--ease)",
                    position: "relative", overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${s.accent}30`;
                    e.currentTarget.style.boxShadow = `0 8px 24px ${s.accent}12`;
                    e.currentTarget.style.transform = "translateX(4px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--s-border)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateX(0)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                    <div aria-hidden="true" style={{
                      width: 30, height: 30, borderRadius: 9,
                      background: `${s.accent}15`, border: `1px solid ${s.accent}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: s.accent, fontWeight: 800, flexShrink: 0,
                    }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{
                          fontSize: 14, fontWeight: 700,
                          letterSpacing: "-0.02em", color: "var(--t-primary)",
                        }}>
                          {s.label}
                        </h3>
                        <span style={{ fontSize: 13, fontWeight: 800, color: s.accent }}>
                          {s.weight}%
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--t-tertiary)", lineHeight: 1.5, marginTop: 2 }}>
                        {s.desc}
                      </p>
                    </div>
                  </div>

                  {/* Impact weight bar */}
                  <div
                    role="progressbar"
                    aria-valuenow={s.weight}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${s.label} impact weight`}
                    style={{
                      height: 4, borderRadius: 100,
                      background: "#F0F0F0", overflow: "hidden",
                    }}
                  >
                    <div style={{
                      height: "100%", width: `${s.weight}%`,
                      background: `linear-gradient(90deg, ${s.accent}, ${s.accent}99)`,
                      borderRadius: 100,
                    }} />
                  </div>
                </div>
              ))}
            </div>

          </div>
        </Reveal>

      </div>
    </section>
  );
}