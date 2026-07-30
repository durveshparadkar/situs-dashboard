"use client";

/* ─────────────────────────────────────────────────────────────
   INTEGRATIONS — marquee + benefits
   UX laws applied (annotated inline):
   • Jakob's Law         — familiar logo-marquee pattern signals
                           "established ecosystem" instantly
   • Tesler's Law        — "no rip & replace" copy absorbs the
                           complexity of integration for the user
   • Law of Continuity   — opposing marquee directions imply an
                           always-moving, living data flow
   • Miller's Law        — 3 benefits, chunked
   • Law of Similarity   — benefit cards share Product/Security
                           interaction language (lift + icon tilt)
   • Fitts's Law         — whole marquee row is the pause target
   • Aesthetic-Usability — pause-on-hover, chip lift, edge fades
   • Doherty Threshold   — sub-400ms transitions
   • Zeigarnik Effect    — "Planned integrations" pulse keeps an
                           open loop → return visits
   • Postel's Law        — reduced-motion: marquee stops
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Reveal } from "./shared/Reveal";
import { INTEGRATIONS } from "./shared/constants";

const BENEFITS = [
  { icon: "⚡", title: "Real-Time Sync",    desc: "Data flows automatically — no manual exports or uploads required.", accent: "#F59E0B" },
  { icon: "🔒", title: "Secure by Default", desc: "Enterprise-grade encryption on every connection, every time.",      accent: "#10B981" },
  { icon: "◎",  title: "No Rip & Replace",  desc: "Works on top of your existing CRM — not a replacement for it.",      accent: "#6366F1" },
];

/* One marquee row. Second copy of the list is aria-hidden (screen readers hear it once). */
function MarqueeRow({ reverse = false, raised = false }: { reverse?: boolean; raised?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(() => {
    return typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      style={{ position: "relative", marginBottom: 16, overflow: "hidden" }}
      onMouseEnter={(e) => {
        const track = e.currentTarget.querySelector<HTMLElement>("[data-track]");
        if (track) track.style.animationPlayState = "paused";
      }}
      onMouseLeave={(e) => {
        const track = e.currentTarget.querySelector<HTMLElement>("[data-track]");
        if (track) track.style.animationPlayState = "running";
      }}
    >
      {/* Fade edges */}
      <div aria-hidden="true" style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 160, zIndex: 2,
        background: "linear-gradient(90deg, var(--s-base), transparent)", pointerEvents: "none",
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 160, zIndex: 2,
        background: "linear-gradient(270deg, var(--s-base), transparent)", pointerEvents: "none",
      }} />

      <div
        data-track
        style={{
          display: "flex", gap: 16, width: "max-content",
          /* Postel — reduced motion: marquee simply doesn't run */
          animation: reducedMotion
            ? "none"
            : `marquee ${reverse ? "35s" : "30s"} linear infinite${reverse ? " reverse" : ""}`,
        }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1 ? "true" : undefined}
            style={{ display: "flex", gap: 16 }}
          >
            {INTEGRATIONS.map((name) => (
              <div
                key={`${copy}-${name}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: raised ? "var(--s-raised)" : "#fff",
                  border: "1px solid var(--s-border)",
                  borderRadius: 14, padding: "16px 28px",
                  boxShadow: raised ? "none" : "var(--shadow-sm)",
                  whiteSpace: "nowrap",
                  transition: "transform 0.25s var(--ease), border-color 0.25s var(--ease), box-shadow 0.25s var(--ease)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(99,102,241,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "var(--s-border)";
                  e.currentTarget.style.boxShadow = raised ? "none" : "var(--shadow-sm)";
                }}
              >
                <div aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: raised ? "#fff" : "var(--s-sunken)",
                  border: "1px solid var(--s-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: "var(--t-tertiary)",
                }}>
                  {name[0]}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#444", letterSpacing: "-0.01em" }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Integrations() {
  return (
    <section
      id="integrations"
      style={{
        padding: "var(--section-y) 0",
        background: "var(--s-base)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
          width: 800, height: 500, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--gutter)", position: "relative" }}>
        {/* ── Header ── */}
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 580, margin: "0 auto 56px" }}>
            <div className="badge">Integrations</div>
            <h2 className="h-section" style={{ marginBottom: 18 }}>
              Connects with your<br />
              <span className="gradient-text">entire revenue stack</span>
            </h2>
            <p className="t-lead" style={{ fontSize: 17 }}>
              Situs sits on top of the tools your team already uses —
              wherever you run revenue. No ripping and replacing,
              just intelligence on top.
            </p>
          </div>
        </Reveal>
      </div>

      {/* ── Marquees (pause on hover, opposing directions = Continuity) ── */}
      <Reveal delay={100}>
        <MarqueeRow />
      </Reveal>
      <Reveal delay={150}>
        <MarqueeRow reverse raised />
      </Reveal>

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--gutter)", position: "relative" }}>

        {/* Coming soon — Zeigarnik: open loop invites return visits */}
        <Reveal delay={150}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, margin: "40px 0 56px",
          }}>
            <div aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--c-amber)", boxShadow: "0 0 6px #F59E0B",
              animation: "pulse 2s infinite",
            }} />
            <span style={{ fontSize: 13, color: "var(--t-tertiary)", fontWeight: 500 }}>
              Planned integrations — rolling out after beta
            </span>
          </div>
        </Reveal>

        {/* ── Benefits ── */}
        <Reveal delay={200}>
          <div className="three-col" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
          }}>
            {BENEFITS.map((item) => (
              <div
                key={`item.title}`}
                className="card"
                style={{ padding: "32px 28px", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = `${item.accent}30`;
                  e.currentTarget.style.boxShadow = `0 16px 40px ${item.accent}12`;
                  const icon = e.currentTarget.querySelector<HTMLElement>("[data-icon]");
                  if (icon) icon.style.transform = "scale(1.08) rotate(-3deg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "var(--s-border)";
                  e.currentTarget.style.boxShadow = "none";
                  const icon = e.currentTarget.querySelector<HTMLElement>("[data-icon]");
                  if (icon) icon.style.transform = "scale(1) rotate(0deg)";
                }}
              >
                <div
                  aria-hidden="true"
                  data-icon
                  style={{
                    width: `46px`, height: `46px`,
                    background: `${item.accent}12`, border: "1px solid " + `${item.accent}25`,
                    borderRadius: "var(--r-md)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 20, marginBottom: 18,
                    transition: "transform 0.3s cubic-bezier(.34,1.56,.64,1)",
                  }}
                >
                  {item.icon}
                </div>
                <h3 style={{
                  fontSize: 16, fontWeight: 700,
                  letterSpacing: "-0.025em", marginBottom: 8, color: "var(--t-primary)",
                }}>
                  {item.title}
                </h3>
                <p className="t-body">{item.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}