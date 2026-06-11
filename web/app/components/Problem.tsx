"use client";

import { Reveal } from "./shared/Reveal";

const TOOLS = [
  { name: "Salesforce", note: "CRM data"      },
  { name: "HubSpot",    note: "Marketing"     },
  { name: "Slack",      note: "Conversations" },
  { name: "Zoom",       note: "Call notes"    },
  { name: "Gmail",      note: "Email threads" },
];

const PAIN_POINTS = [
  { title: "Hours wasted collecting data",   desc: "Manual exports across 5+ disconnected tools, every single week." },
  { title: "Decisions without full context", desc: "By the time you piece it together, the moment has passed." },
  { title: "Deals lost to invisible risks",  desc: "The warning signs were there — scattered across tools no one checks." },
];

export default function Problem() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--s-raised)",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Mesh — red bleeding into emerald (problem → solution) */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", left: "-5%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", right: "-5%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)",
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
          <div className="badge badge--red">The Problem</div>

          <h2 className="h-section" style={{ marginBottom: 24 }}>
            Revenue data is<br />everywhere.<br />
            <span style={{ color: "var(--c-red)" }}>Decisions are not.</span>
          </h2>

          <p className="t-lead" style={{ marginBottom: 40 }}>
            Your team spends hours collecting information from disconnected tools —
            and minutes actually deciding what to do next. That gap is where deals die.
          </p>

          {/* Pain point cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PAIN_POINTS.map((p) => (
              <div
                key={p.title}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "16px 18px", borderRadius: "var(--r-md)",
                  background: "#fff", border: "1px solid #F0F0F0",
                  transition: "all var(--speed-fast) var(--ease)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#FECACA";
                  e.currentTarget.style.background = "rgba(239,68,68,0.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#F0F0F0";
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <span aria-hidden="true" style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#FEF2F2", border: "1px solid #FECACA",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "var(--c-red)", flexShrink: 0, marginTop: 1,
                  fontWeight: 700,
                }}>✕</span>
                <div>
                  <h3 style={{
                    fontSize: 14, fontWeight: 700, color: "var(--t-primary)",
                    letterSpacing: "-0.02em", marginBottom: 3,
                  }}>
                    {p.title}
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--t-tertiary)", lineHeight: 1.5 }}>
                    {p.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── Right visual — chaos → unity flow ── */}
        <Reveal direction="right" delay={100}>
          <div>

            {/* Siloed tools */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
              {TOOLS.map((tool, i) => (
                <div
                  key={tool.name}
                  style={{
                    background: "#fff", border: "1px solid var(--s-border)",
                    borderRadius: "var(--r-md)", padding: "14px 18px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    boxShadow: "var(--shadow-sm)",
                    opacity: 0.5 + i * 0.1,
                    transform: `translateX(${(2 - Math.abs(2 - i)) * 8}px)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: "var(--s-sunken)", border: "1px solid var(--s-border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: "var(--t-tertiary)",
                    }}>
                      {tool.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t-primary)", letterSpacing: "-0.01em" }}>
                        {tool.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t-faint)", fontWeight: 500 }}>
                        {tool.note}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, color: "var(--c-red)", fontWeight: 700,
                    background: "#FEF2F2", padding: "4px 10px", borderRadius: 100,
                    letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--c-red)" }} />
                    Siloed
                  </span>
                </div>
              ))}
            </div>

            {/* Flow connector */}
            <div aria-hidden="true" style={{
              display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0",
            }}>
              <div style={{ width: 2, height: 24, background: "linear-gradient(to bottom, #E5E5E5, var(--c-indigo))" }} />
              <div style={{
                background: "linear-gradient(135deg, var(--c-indigo), var(--c-emerald))",
                color: "#fff", fontSize: 11, fontWeight: 700,
                padding: "5px 14px", borderRadius: 100, letterSpacing: "0.04em",
                boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 12 }}>⚡</span> Unified by Situs
              </div>
              <div style={{ width: 2, height: 24, background: "linear-gradient(to bottom, var(--c-emerald), var(--c-ink))" }} />
            </div>

            {/* Situs layer */}
            <div style={{
              background: "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)",
              borderRadius: "var(--r-lg)", padding: 24,
              boxShadow: "0 16px 48px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
              position: "relative", overflow: "hidden",
            }}>
              <div aria-hidden="true" style={{
                position: "absolute", top: -30, right: -30,
                width: 120, height: 120, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)",
              }} />

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 16, position: "relative",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "linear-gradient(135deg, var(--c-indigo), var(--c-emerald))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, color: "#fff",
                    boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
                  }}>
                    S
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
                      Situs Intelligence Layer
                    </div>
                    <div style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>
                      All signals, one decision engine
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, color: "var(--c-green)", fontWeight: 700,
                  background: "rgba(34,197,94,0.12)", padding: "4px 12px", borderRadius: 100,
                  letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", background: "var(--c-green)",
                    boxShadow: "0 0 6px #22C55E", animation: "pulse 2s infinite",
                  }} />
                  Connected
                </span>
              </div>

              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "12px 14px", position: "relative",
              }}>
                <div style={{ fontSize: 12, color: "#AAA", lineHeight: 1.6 }}>
                  → 3 deals at risk · ₹22L forecast upside detected · 6 actions recommended
                </div>
              </div>
            </div>

          </div>
        </Reveal>

      </div>
    </section>
  );
}