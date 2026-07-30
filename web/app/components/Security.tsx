"use client";

/* ─────────────────────────────────────────────────────────────
   SECURITY — trust section, global compliance signals
   UX laws applied (annotated inline):
   • Jakob's Law         — familiar security-section pattern
                           (badge, 4 pillars, trust bar)
   • Miller's Law        — 4 pillars, 5 trust chips (scannable)
   • Law of Similarity   — identical card anatomy, accent per pillar
   • Law of Common Region — trust chips share one container
   • Von Restorff        — single dark SOC2 card anchors the header
   • Serial Position     — RBAC first (control), SOC2 last (proof)
   • Aesthetic-Usability — icon lift, staggered chips, glow
   • Doherty Threshold   — sub-400ms transitions
   • Peak-End Rule       — section closes on the trust bar
   • Postel's Law        — reduced-motion respected
   ───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./shared/Reveal";

const POINTS = [
  { icon: "🔐", title: "Role-Based Access Control", desc: "Granular permissions so every team member sees only what they need.", accent: "#6366F1" },
  { icon: "🔒", title: "Data Encryption at Rest",   desc: "All data encrypted using AES-256 — at rest and in transit.",          accent: "#10B981" },
  { icon: "⚙️", title: "Secure API Architecture",   desc: "Every API endpoint authenticated, rate-limited, and monitored.",      accent: "#F59E0B" },
  { icon: "✦",  title: "SOC2 Roadmap",              desc: "SOC2 Type II certification in progress. Enterprise-ready by design.", accent: "#A855F7" },
];

/* Global trust signals — GDPR added for EU/UK buyers */
const TRUST_ITEMS = [
  "AES-256 Encryption", "HTTPS Everywhere", "GDPR-Ready", "Daily Backups", "99.9% Uptime SLA",
];

/* Trust chip — pops in with a stagger when scrolled into view */
function TrustChip({ item, delay }: { item: string; delay: number }) {
  const [visible, setVisible] = useState(() => {
    // Avoid calling matchMedia during SSR; initialize visible when user
    // prefers reduced motion so we don't call setState synchronously in an effect.
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If reduced-motion preference was detected during initialization,
    // visible is already true — skip creating the observer.
    if (visible) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 14, color: "var(--t-secondary)", fontWeight: 600,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 0.4s var(--ease) ${delay}ms, transform 0.4s var(--ease) ${delay}ms`,
      }}
    >
      <span aria-hidden="true" style={{
        width: 20, height: 20, borderRadius: "50%",
        background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, color: "#16A34A",
        transform: visible ? "scale(1)" : "scale(0.4)",
        transition: `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay + 120}ms`,
      }}>✓</span>
      {item}
    </div>
  );
}

export default function Security() {
  return (
    <section style={{
      padding: "var(--section-y) var(--gutter)",
      background: "var(--s-base)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
          width: 800, height: 400, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-end", flexWrap: "wrap", gap: 32, marginBottom: 72,
          }}>
            <div style={{ maxWidth: 500 }}>
              <div className="badge">Security</div>
              <h2 className="h-section" style={{ marginBottom: 18 }}>
                Enterprise-grade<br />
                <span className="gradient-text">by design</span>
              </h2>
              <p className="t-lead" style={{ fontSize: 17 }}>
                Built with security principles from day one.
                Your revenue data is sensitive — we treat it that way,
                wherever in the world your team operates.
              </p>
            </div>

            {/* SOC2 badge — Von Restorff: one dark anchor */}
            <div style={{
              background: "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)",
              borderRadius: "var(--r-lg)", padding: "22px 28px",
              display: "flex", alignItems: "center", gap: 16,
              boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
              position: "relative", overflow: "hidden",
              transition: "transform 0.35s var(--ease), box-shadow 0.35s var(--ease)",
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 24px 56px rgba(0,0,0,0.22)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.15)";
              }}
            >
              <div aria-hidden="true" style={{
                position: "absolute", top: -30, right: -30,
                width: 100, height: 100, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)",
              }} />
              <div aria-hidden="true" style={{
                width: 48, height: 48, borderRadius: "var(--r-md)",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, position: "relative",
              }}>
                🛡️
              </div>
              <div style={{ position: "relative" }}>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  letterSpacing: "-0.02em", color: "#fff", marginBottom: 3,
                }}>
                  SOC2 In Progress
                </div>
                <div style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>
                  Type II certification roadmap active
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Security cards ── */}
        <div className="four-col" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}>
          {POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 60}>
              <div
                className="card"
                style={{ padding: 28, height: "100%", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = `0 16px 40px ${p.accent}12`;
                  e.currentTarget.style.borderColor = `${p.accent}30`;
                  e.currentTarget.style.background = "#fff";
                  /* Icon lift — targeted via data attr to avoid re-render */
                  const icon = e.currentTarget.querySelector<HTMLElement>("[data-icon]");
                  if (icon) icon.style.transform = "scale(1.08) rotate(-3deg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "var(--s-border)";
                  e.currentTarget.style.background = "var(--s-raised)";
                  const icon = e.currentTarget.querySelector<HTMLElement>("[data-icon]");
                  if (icon) icon.style.transform = "scale(1) rotate(0deg)";
                }}
              >
                <div aria-hidden="true" style={{
                  position: "absolute", top: -40, right: -40,
                  width: 100, height: 100, borderRadius: "50%",
                  background: `radial-gradient(circle, ${p.accent}10 0%, transparent 70%)`,
                  pointerEvents: "none",
                }} />

                <div
                  aria-hidden="true"
                  data-icon
                  style={{
                    width: 46, height: 46,
                    background: `${p.accent}12`, border: `1px solid ${p.accent}25`,
                    borderRadius: "var(--r-md)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 20, marginBottom: 18,
                    position: "relative",
                    transition: "transform 0.3s cubic-bezier(.34,1.56,.64,1)",
                  }}
                >
                  {p.icon}
                </div>
                <h3 style={{
                  fontSize: 15, fontWeight: 700,
                  letterSpacing: "-0.025em", marginBottom: 8, color: "var(--t-primary)",
                  position: "relative",
                }}>
                  {p.title}
                </h3>
                <p className="t-body" style={{ position: "relative" }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ── Trust bar (Peak-End — close on proof) ── */}
        <Reveal delay={200}>
          <div style={{
            marginTop: 48,
            background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(16,185,129,0.04))",
            border: "1px solid rgba(99,102,241,0.1)",
            borderRadius: "var(--r-lg)", padding: "24px 32px",
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 40, flexWrap: "wrap",
          }}>
            {TRUST_ITEMS.map((item, i) => (
              <TrustChip key={item} item={item} delay={i * 80} />
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}