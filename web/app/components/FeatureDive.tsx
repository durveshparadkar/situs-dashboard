"use client";

/* ─────────────────────────────────────────────────────────────
   FEATURE DIVE — interactive module explorer
   UX laws applied (annotated inline):
   • Jakob's Law         — proper ARIA tabs pattern, incl.
                           arrow-key navigation (real tab UX)
   • Hick's Law          — one panel visible at a time
   • Fitts's Law         — 64px min-height tab targets
   • Miller's Law        — 8 modules, 3 points per panel
   • Von Restorff        — active tab is the only white card
   • Law of Similarity   — accent color = module identity,
                           mesh glow follows the active accent
   • Serial Position     — Dashboard first, AI Intelligence last
   • Goal-Gradient       — numbered 01–08 tabs imply progress
   • Aesthetic-Usability — panel crossfade on switch
   • Doherty Threshold   — instant tab response, 350ms fade
   • Peak-End Rule       — closes on dark demo CTA strip
   ───────────────────────────────────────────────────────────── */

import { useRef, useState } from "react";
import { Reveal } from "./shared/Reveal";
import { FEATURES, DEMO_URL } from "./shared/constants";

const DETAILS = [
  { metric: "$520K", metricLabel: "Total pipeline tracked",  accent: "#6366F1", points: ["Real-time pipeline value", "Stage-by-stage breakdown", "Team & rep performance"] },
  { metric: "47",    metricLabel: "Active deals monitored",  accent: "#8B5CF6", points: ["Deal health scoring", "Progression tracking", "Win probability per deal"] },
  { metric: "320+",  metricLabel: "Leads scored this month", accent: "#10B981", points: ["Intelligent lead scoring", "Priority ranking", "Engagement signals"] },
  { metric: "3.2x",  metricLabel: "Pipeline coverage ratio", accent: "#F59E0B", points: ["Bottleneck detection", "Stage velocity", "Flow visualization"] },
  { metric: "84%",   metricLabel: "Forecast accuracy",       accent: "#22C55E", points: ["AI-driven predictions", "Confidence scoring", "Scenario modeling"] },
  { metric: "12",    metricLabel: "Alerts triggered today",  accent: "#EF4444", points: ["Real-time notifications", "Risk thresholds", "Custom triggers"] },
  { metric: "∞",     metricLabel: "Data points analyzed",    accent: "#3B82F6", points: ["Trend analysis", "Custom dashboards", "Exportable reports"] },
  { metric: "6",     metricLabel: "AI actions recommended",  accent: "#A855F7", points: ["Next-best-action", "Auto-prioritization", "Smart recommendations"] },
];

export default function FeatureDive() {
  const [active, setActive] = useState(0);
  const [panelKey, setPanelKey] = useState(0); // retrigger crossfade
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = FEATURES[active];
  const detail = DETAILS[active];

  const selectTab = (i: number) => {
    setActive(i);
    setPanelKey((k) => k + 1);
  };

  /* Arrow-key navigation — completes the ARIA tabs pattern (Jakob) */
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % FEATURES.length;
    if (e.key === "ArrowUp"   || e.key === "ArrowLeft")  next = (i - 1 + FEATURES.length) % FEATURES.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End")  next = FEATURES.length - 1;
    if (next !== null) {
      e.preventDefault();
      selectTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--s-raised)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Mesh — accent follows active tab (Similarity: color = identity) */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", right: "0%",
          width: `500px`, height: `500px`, borderRadius: "50%",
          background: `radial-gradient(circle, ${detail.accent}0A 0%, transparent 70%)`,
          filter: "blur(60px)", transition: "background 0.5s var(--ease)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div className="two-col" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 64, alignItems: "flex-end", marginBottom: 64,
          }}>
            <div>
              <div className="badge">Features</div>
              <h2 className="h-section">
                Built for every layer<br />of the revenue org
              </h2>
            </div>
            <div>
              <p className="t-lead" style={{ fontSize: 17 }}>
                Each module is purpose-built for a specific revenue challenge —
                and they all work together as one unified intelligence system.{" "}
                <strong style={{ color: "var(--t-primary)", fontWeight: 600 }}>Click to explore.</strong>
              </p>
            </div>
          </div>
        </Reveal>

        {/* ── Interactive explorer ── */}
        <Reveal delay={100}>
          <div className="two-col" style={{
            display: "grid", gridTemplateColumns: "1fr 1.2fr",
            gap: 24, alignItems: "stretch",
          }}>

            {/* Tab list (proper ARIA tabs pattern — Jakob's Law) */}
            <div role="tablist" aria-label="Feature modules" aria-orientation="vertical" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FEATURES.map((f, i) => {
                const isActive = active === i;
                const d = DETAILS[i];
                return (
                  <button
                    key={f.title}
                    ref={(el) => { tabRefs.current[i] = el; }}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="feature-panel"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => selectTab(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 18px", borderRadius: "var(--r-md)",
                      minHeight: 64, /* Fitts */
                      background: isActive ? "#fff" : "transparent",
                      border: `1px solid ${isActive ? d.accent + "30" : "transparent"}`,
                      cursor: "pointer", textAlign: "left", width: "100%",
                      fontFamily: "inherit",
                      boxShadow: isActive ? `0 8px 24px ${d.accent}15` : "none",
                      transition: "all var(--speed-base) var(--ease)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.6)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div aria-hidden="true" style={{
                      width: 40, height: 40, flexShrink: 0,
                      background: isActive ? `${d.accent}15` : "#F0F0F0",
                      border: `1px solid ${isActive ? d.accent + "30" : "var(--s-border-2)"}`,
                      borderRadius: 10, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 17,
                      transition: "all var(--speed-base) var(--ease)",
                    }}>
                      {f.icon}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em",
                        color: isActive ? "var(--t-primary)" : "#666", marginBottom: 2,
                      }}>
                        {f.title}
                      </div>
                      {isActive ? (
                        <div style={{ fontSize: 12, color: d.accent, fontWeight: 600 }}>Active →</div>
                      ) : (
                        <div style={{
                          fontSize: 12, color: "var(--t-faint)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {f.desc}
                        </div>
                      )}
                    </div>

                    <span aria-hidden="true" style={{
                      fontSize: 11, fontWeight: 800,
                      color: isActive ? d.accent : "#DDD", letterSpacing: "0.06em",
                    }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Detail panel — content crossfades on tab switch */}
            <div
              id="feature-panel"
              role="tabpanel"
              style={{
                background: "#fff",
                border: `1px solid ${detail.accent}20`,
                borderRadius: "var(--r-xl)", padding: 40,
                position: "relative", overflow: "hidden",
                boxShadow: `0 24px 64px ${detail.accent}10, var(--shadow-sm)`,
                transition: "all var(--speed-slow) var(--ease)",
              }}
            >
              <div aria-hidden="true" style={{
                position: "absolute", top: -60, right: -60,
                width: 200, height: 200, borderRadius: "50%",
                background: `radial-gradient(circle, ${detail.accent}15 0%, transparent 70%)`,
                pointerEvents: "none", transition: "background var(--speed-slow) var(--ease)",
              }} />

              {/* keyed wrapper re-mounts on tab change → CSS animation replays */}
              <div key={panelKey} style={{ animation: "featureFadeIn 0.35s var(--ease)", position: "relative" }}>
                <style>{`
                  @keyframes featureFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                <div aria-hidden="true" style={{
                  width: 56, height: 56,
                  background: `${detail.accent}15`, border: `1px solid ${detail.accent}30`,
                  borderRadius: 14, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 26, marginBottom: 24,
                  boxShadow: `0 8px 24px ${detail.accent}20`, position: "relative",
                }}>
                  {current.icon}
                </div>

                <h3 style={{
                  fontSize: 26, fontWeight: 800, color: "var(--t-primary)",
                  letterSpacing: "-0.035em", marginBottom: 12, position: "relative",
                }}>
                  {current.title}
                </h3>

                <p className="t-lead" style={{
                  fontSize: 16, marginBottom: 32, maxWidth: 420, position: "relative",
                }}>
                  {current.desc}
                </p>

                <ul style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  marginBottom: 32, position: "relative", listStyle: "none",
                }}>
                  {detail.points.map((point) => (
                    <li key={point} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span aria-hidden="true" style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: `${detail.accent}15`, border: `1px solid ${detail.accent}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: `10`, color: detail.accent, flexShrink: 0,
                      }}>✓</span>
                      <span style={{ fontSize: 14, color: "var(--t-secondary)", fontWeight: 500 }}>
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Metric highlight */}
                <div style={{
                  background: `linear-gradient(135deg, ${detail.accent}08, transparent)`,
                  border: `1px solid ${detail.accent}20`,
                  borderRadius: 14, padding: "20px 24px",
                  display: "flex", alignItems: "center", gap: 16, position: "relative",
                }}>
                  <div style={{
                    fontSize: 38, fontWeight: 900, letterSpacing: "-0.045em", color: detail.accent,
                  }}>
                    {detail.metric}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--t-tertiary)", fontWeight: 500, lineHeight: 1.4 }}>
                    {detail.metricLabel}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Reveal>

        {/* ── CTA strip (Peak-End) ── */}
        <Reveal delay={200}>
          <div style={{
            marginTop: 32,
            background: "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)",
            borderRadius: "var(--r-lg)", padding: "32px 40px",
            display: "flex", alignItems: "center",
            justifyContent: "space-between", flexWrap: "wrap", gap: 24,
            position: "relative", overflow: "hidden",
          }}>
            <div aria-hidden="true" style={{
              position: "absolute", top: -40, right: 100,
              width: 200, height: 200, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ position: "relative" }}>
              <h3 style={{
                fontSize: 20, fontWeight: 700,
                letterSpacing: "-0.025em", marginBottom: 6, color: "#fff",
              }}>
                Ready to see it in action?
              </h3>
              <p style={{ fontSize: 14, color: "#888" }}>
                Book a live demo and see all 8 modules working together.
              </p>
            </div>
            <a href={DEMO_URL} className="btn btn--white" style={{ position: "relative" }}>
              Book Demo →
            </a>
          </div>
        </Reveal>

      </div>
    </section>
  );
}