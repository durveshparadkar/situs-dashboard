"use client";

import { Reveal } from "./shared/Reveal";

const METRICS = [
  { label: "Active Deals",        value: "47",   change: "+6 this week",    up: true,  accent: "#6366F1" },
  { label: "At Risk",             value: "8",    change: "Needs attention", up: false, accent: "#EF4444" },
  { label: "Avg Deal Size",       value: "₹18L", change: "+22% QoQ",        up: true,  accent: "#10B981" },
  { label: "Pipeline Coverage",   value: "3.2x", change: "Healthy",         up: true,  accent: "#10B981" },
  { label: "Deals Closing Soon",  value: "12",   change: "Next 14 days",    up: null,  accent: "#F59E0B" },
  { label: "Forecast Confidence", value: "84%",  change: "High",            up: true,  accent: "#22C55E" },
];

const AI_INSIGHTS = [
  { text: "Deal \"Reliance Infra\" silent for 12 days — follow up with economic buyer before Thursday.", priority: "High",   color: "#EF4444" },
  { text: "Pipeline coverage dropped to 3.1x — add 4 qualified opportunities to stay on track.",          priority: "Medium", color: "#F59E0B" },
  { text: "Q3 forecast revised upward by ₹22L based on new deal signals detected this week.",             priority: "Info",   color: "#6366F1" },
];

export default function DashboardPreview() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--c-ink)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Glows */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-10%", left: "20%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", right: "15%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", inset: 0, opacity: 0.12,
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }} />
      </div>

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 56,
          }}>
            <div style={{ maxWidth: 540 }}>
              <div className="badge badge--dark">Product Preview</div>
              <h2 className="h-section" style={{ color: "#fff", marginBottom: 16 }}>
                Feel like you&apos;re already<br />
                <span style={{
                  background: "linear-gradient(135deg, #818CF8, #34D399)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  inside the product
                </span>
              </h2>
              <p className="t-lead" style={{ fontSize: 17, color: "#888" }}>
                Real-time intelligence. Deal risk alerts. Pipeline health. Revenue forecast.
              </p>
            </div>

            {/* Live indicator */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 100, padding: "8px 16px",
            }}>
              <div aria-hidden="true" style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--c-green)", boxShadow: "0 0 8px #22C55E",
                animation: "pulse 2s infinite",
              }} />
              <span style={{ fontSize: 13, color: "var(--c-green)", fontWeight: 600 }}>
                Live Intelligence
              </span>
            </div>
          </div>
        </Reveal>

        {/* ── Metrics grid ── */}
        <Reveal delay={100}>
          <div className="three-col" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12,
          }}>
            {METRICS.map((m, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "var(--r-lg)", padding: 24,
                  position: "relative", overflow: "hidden",
                  transition: "all var(--speed-base) var(--ease)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${m.accent}40`;
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }}
              >
                {/* Accent line */}
                <div aria-hidden="true" style={{
                  position: "absolute", top: 0, left: 24, right: 24, height: 2,
                  background: `linear-gradient(90deg, ${m.accent}, transparent)`,
                  borderRadius: 100,
                }} />

                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#555",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
                }}>
                  {m.label}
                </div>
                <div style={{
                  fontSize: 36, fontWeight: 900, color: "#fff",
                  letterSpacing: "-0.045em", marginBottom: 8,
                }}>
                  {m.value}
                </div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600,
                  color: m.up === true ? "var(--c-green)" : m.up === false ? "var(--c-red)" : "#888",
                  background: m.up === true ? "rgba(34,197,94,0.1)" : m.up === false ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                  padding: "3px 10px", borderRadius: 100,
                }}>
                  {m.change}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── AI Insights panel ── */}
        <Reveal delay={200}>
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
            position: "relative",
          }}>
            {/* Gradient top accent */}
            <div aria-hidden="true" style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 2,
              background: "linear-gradient(90deg, #6366F1, #8B5CF6, #10B981)",
            }} />

            {/* Header */}
            <div style={{
              padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
                }}>
                  ✦
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                    AI Intelligence
                  </h3>
                  <div style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>
                    3 active recommendations
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 11, color: "var(--c-green)", fontWeight: 700,
                background: "rgba(34,197,94,0.1)", padding: "5px 12px", borderRadius: 100,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span aria-hidden="true" style={{
                  width: 5, height: 5, borderRadius: "50%", background: "var(--c-green)",
                  boxShadow: "0 0 6px #22C55E", animation: "pulse 2s infinite",
                }} />
                Updated now
              </span>
            </div>

            {/* Rows */}
            {AI_INSIGHTS.map((insight, i) => (
              <div
                key={i}
                style={{
                  padding: "18px 24px",
                  borderBottom: i < AI_INSIGHTS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  display: "flex", alignItems: "flex-start", gap: 16,
                  transition: "background var(--speed-fast) var(--ease)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div aria-hidden="true" style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: `${insight.color}15`, border: `1px solid ${insight.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: `${11}px`, color: insight.color, fontWeight: 800, flexShrink: 0, marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <span style={{
                  fontSize: 14, color: "#AAA", lineHeight: 1.65,
                  letterSpacing: "-0.01em", flex: 1,
                }}>
                  {insight.text}
                </span>
                <span style={{
                  fontSize: 10, color: insight.color, fontWeight: 700,
                  background: `${insight.color}12`, padding: "4px 10px", borderRadius: 100,
                  letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0,
                }}>
                  {insight.priority}
                </span>
              </div>
            ))}

            {/* Footer */}
            <div style={{
              padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.01)",
            }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#818CF8",
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                View all 12 recommendations →
              </span>
            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}