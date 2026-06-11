"use client";

import { Reveal } from "./shared/Reveal";

const POINTS = [
  { icon: "🔐", title: "Role-Based Access Control", desc: "Granular permissions so every team member sees only what they need.", accent: "#6366F1" },
  { icon: "🔒", title: "Data Encryption at Rest",   desc: "All data encrypted using AES-256 — at rest and in transit.",          accent: "#10B981" },
  { icon: "⚙️", title: "Secure API Architecture",   desc: "Every API endpoint authenticated, rate-limited, and monitored.",      accent: "#F59E0B" },
  { icon: "✦",  title: "SOC2 Roadmap",              desc: "SOC2 Type II certification in progress. Enterprise-ready by design.", accent: "#A855F7" },
];

const TRUST_ITEMS = [
  "AES-256 Encryption", "HTTPS Everywhere", "Daily Backups", "99.9% Uptime SLA",
];

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
                Your revenue data is sensitive — we treat it that way.
              </p>
            </div>

            {/* SOC2 badge */}
            <div style={{
              background: "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)",
              borderRadius: "var(--r-lg)", padding: "22px 28px",
              display: "flex", alignItems: "center", gap: 16,
              boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
              position: "relative", overflow: "hidden",
            }}>
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
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "var(--s-border)";
                  e.currentTarget.style.background = "var(--s-raised)";
                }}
              >
                <div aria-hidden="true" style={{
                  position: "absolute", top: -40, right: -40,
                  width: 100, height: 100, borderRadius: "50%",
                  background: `radial-gradient(circle, ${p.accent}10 0%, transparent 70%)`,
                  pointerEvents: "none",
                }} />

                <div aria-hidden="true" style={{
                  width: 46, height: 46,
                  background: `${p.accent}12`, border: `1px solid ${p.accent}25`,
                  borderRadius: "var(--r-md)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20, marginBottom: 18,
                  position: "relative",
                }}>
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

        {/* ── Trust bar ── */}
        <Reveal delay={200}>
          <div style={{
            marginTop: 48,
            background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(16,185,129,0.04))",
            border: "1px solid rgba(99,102,241,0.1)",
            borderRadius: "var(--r-lg)", padding: "24px 32px",
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 40, flexWrap: "wrap",
          }}>
            {TRUST_ITEMS.map((item) => (
              <div key={item} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 14, color: "var(--t-secondary)", fontWeight: 600,
              }}>
                <span aria-hidden="true" style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, color: "#16A34A",
                }}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}