"use client";

import { Reveal } from "./shared/Reveal";
import { DEMO_URL } from "./shared/constants";

const REPORT_ROWS = [
  { label: "Pipeline Health",     value: "Good",      color: "#22C55E" },
  { label: "Revenue Risk",        value: "Medium",    color: "#F59E0B" },
  { label: "Forecast Accuracy",   value: "84%",       color: "#22C55E" },
  { label: "Deals at Risk",       value: "8 flagged", color: "#EF4444" },
  { label: "Recommended Actions", value: "6 items",   color: "#6366F1" },
];

const BENEFITS = [
  "Revenue risk summary with deal-level breakdown",
  "Forecast accuracy score and confidence rating",
  "Prioritized action list for your sales team",
  "Pipeline health snapshot with trend data",
];

const AI_SUMMARY = [
  "3 enterprise deals require executive intervention",
  "Forecast revised upward by ₹22L based on new signals",
  "Recommended: compress Q3 pipeline review cycle",
];

export default function PdfReports() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--c-ink)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Glows */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "10%", left: "10%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", bottom: "0%", right: "10%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", inset: 0, opacity: 0.1,
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }} />
      </div>

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
          <div className="badge badge--amber" style={{
            background: "rgba(245,158,11,0.1)",
            borderColor: "rgba(245,158,11,0.2)",
            color: "#FBBF24",
          }}>
            PDF Intelligence Reports
          </div>

          <h2 className="h-section" style={{ color: "#fff", marginBottom: 24 }}>
            Start with intelligence.<br />
            <span className="gradient-text-warm">Before full automation.</span>
          </h2>

          <p className="t-lead" style={{ fontSize: 17, color: "#888", marginBottom: 36 }}>
            During beta, Situs generates structured intelligence reports —
            surfacing revenue risks, deal opportunities, and performance trends
            so your team can act with confidence.
          </p>

          {/* Benefits */}
          <ul style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40, listStyle: "none" }}>
            {BENEFITS.map((b) => (
              <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span aria-hidden="true" style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, color: "var(--c-green)", flexShrink: 0, marginTop: 1,
                }}>
                  ✓
                </span>
                <span style={{ fontSize: 15, color: "#999", lineHeight: 1.6 }}>{b}</span>
              </li>
            ))}
          </ul>

          <a href={DEMO_URL} className="btn btn--white">
            Request a Sample Report →
          </a>
        </Reveal>

        {/* ── Right — Report mockup ── */}
        <Reveal direction="right" delay={100}>
          <div style={{ position: "relative" }}>
            <div aria-hidden="true" style={{
              position: "absolute", inset: -20, pointerEvents: "none",
              background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(99,102,241,0.12) 0%, transparent 70%)",
              filter: "blur(20px)",
            }} />

            <div style={{
              background: "linear-gradient(180deg, #141414 0%, #0F0F0F 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "var(--r-xl)", overflow: "hidden",
              boxShadow: "0 48px 96px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
              position: "relative",
            }}>

              {/* Gradient top accent */}
              <div aria-hidden="true" style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: "linear-gradient(90deg, #6366F1, #F59E0B)",
              }} />

              {/* Header */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "22px 28px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div aria-hidden="true" style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, color: "#fff",
                    boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
                  }}>
                    S
                  </div>
                  <div>
                    <div style={{
                      fontSize: 10, color: "#555", fontWeight: 700,
                      letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3,
                    }}>
                      Situs Intelligence Report
                    </div>
                    <h3 style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>
                      Q3 2026 — Revenue Analysis
                    </h3>
                  </div>
                </div>
                <span style={{
                  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 100, padding: "5px 12px",
                  fontSize: 11, color: "var(--c-green)", fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span aria-hidden="true" style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "var(--c-green)", boxShadow: "0 0 6px #22C55E",
                  }} />
                  Generated
                </span>
              </div>

              {/* Rows */}
              <div style={{ padding: "10px 0" }}>
                {REPORT_ROWS.map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "15px 28px",
                      borderBottom: i < REPORT_ROWS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      transition: "background var(--speed-fast) var(--ease)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>
                      {row.label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: row.color,
                      background: `${row.color}18`, border: `1px solid ${row.color}25`,
                      padding: "4px 12px", borderRadius: 100,
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* AI summary */}
              <div style={{
                margin: "0 20px 20px",
                background: "linear-gradient(135deg, rgba(99,102,241,0.08), transparent)",
                border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: "var(--r-md)", padding: "18px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span aria-hidden="true" style={{
                    width: 18, height: 18, borderRadius: 6,
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#fff",
                  }}>✦</span>
                  <span style={{
                    fontSize: 10, color: "#818CF8", fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    AI Summary
                  </span>
                </div>
                {AI_SUMMARY.map((line, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: "#999", lineHeight: 1.8,
                    display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    <span aria-hidden="true" style={{ color: "var(--c-indigo)", flexShrink: 0 }}>→</span>
                    {line}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{
                padding: "14px 28px", borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 11, color: "#555", fontWeight: 500 }}>
                  Generated in 1.2s · 4 pages
                </span>
                <span style={{
                  fontSize: 12, color: "#818CF8", fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}>
                  ↓ Download PDF
                </span>
              </div>

            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}