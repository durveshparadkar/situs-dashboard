"use client";

/* ─────────────────────────────────────────────────────────────
   PRODUCT — bento feature grid, enterprise polish
   UX laws applied (annotated inline):
   • Miller's Law        — 8 modules in a scannable bento, chunked
   • Von Restorff        — 2 large hero cards break the grid rhythm
   • Fitts's Law         — whole card is the hover/hit/click target
   • Law of Similarity   — consistent card anatomy, accent = identity
   • Law of Common Region — bordered cards, metrics in one strip
   • Serial Position     — strongest modules first & last
   • Aesthetic-Usability — micro-motion, corner glow, icon lift
   • Doherty Threshold   — all transitions < 400ms
   • Goal-Gradient       — numbered 01–08 implies a guided tour
   • Peak-End Rule       — closes on a confident metrics strip
   • Postel's Law        — prefers-reduced-motion respected
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "./shared/Reveal";
import { FEATURE_DETAILS } from "./shared/feature-details";

// Accent colors per feature — intentional, not random
const ACCENTS = [
  { bg: "rgba(99,102,241,0.06)",  border: "rgba(99,102,241,0.15)",  icon: "#6366F1" },
  { bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.15)",  icon: "#10B981" },
  { bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.15)",  icon: "#F59E0B" },
  { bg: "rgba(239,68,68,0.06)",   border: "rgba(239,68,68,0.15)",   icon: "#EF4444" },
  { bg: "rgba(59,130,246,0.06)",  border: "rgba(59,130,246,0.15)",  icon: "#3B82F6" },
  { bg: "rgba(168,85,247,0.06)",  border: "rgba(168,85,247,0.15)",  icon: "#A855F7" },
  { bg: "rgba(20,184,166,0.06)",  border: "rgba(20,184,166,0.15)",  icon: "#14B8A6" },
  { bg: "rgba(249,115,22,0.06)",  border: "rgba(249,115,22,0.15)",  icon: "#F97316" },
];

export default function Product() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      const h = handler as unknown as EventListener;
      if (mq.removeEventListener) mq.removeEventListener("change", h);
      else mq.removeListener(h as unknown as (this: MediaQueryList, ev: MediaQueryListEvent) => unknown);
    };
  }, []);

  return (
    <section
      id="features"
      style={{
        padding: "140px 48px",
        background: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Gradient mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "10%", right: "-10%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", left: "-5%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      {/* Top border line */}
      <div aria-hidden="true" style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 800, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), rgba(16,185,129,0.3), transparent)",
      }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-end", flexWrap: "wrap", gap: 32,
            marginBottom: 80,
          }}>
            <div style={{ maxWidth: 520 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.08))",
                border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: 100, padding: "5px 14px",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: "#6366F1", marginBottom: 20,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366F1, #10B981)",
                }} />
                Product
              </div>

              <h2 style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "clamp(32px, 3.5vw, 52px)",
                fontWeight: 900, lineHeight: 1.08,
                letterSpacing: "-0.04em", color: "#0A0A0A",
                marginBottom: 0,
              }}>
                Everything you need to<br />
                <span style={{
                  background: "linear-gradient(135deg, #6366F1, #10B981)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  understand revenue
                </span>
              </h2>
            </div>

            <div style={{ maxWidth: 380 }}>
              <p style={{
                fontSize: 17, color: "#666", lineHeight: 1.75,
                fontWeight: 400, letterSpacing: "-0.01em", marginBottom: 24,
              }}>
                Eight purpose-built modules. One unified intelligence layer.
                No switching tabs. No lost context.
              </p>
              <a
                href="#features"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: "#6366F1",
                  textDecoration: "none", letterSpacing: "-0.01em",
                  transition: "gap 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.gap = "10px")}
                onMouseLeave={(e) => (e.currentTarget.style.gap = "6px")}
              >
                Explore all features →
              </a>
            </div>
          </div>
        </Reveal>

        {/* ── Bento grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "auto auto",
          gap: 12,
        }}>
          {FEATURE_DETAILS.map((f, i) => {
            const accent = ACCENTS[i];
            const isHovered = hovered === i;
            // Von Restorff — first two cards break the rhythm at 2x width
            const isLarge = i < 2;

            return (
              <Reveal key={f.title} delay={i * 45}>
                <Link
                  href={`/features/${f.slug}`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  style={{
                    background: isHovered ? accent.bg : "#FAFAFA",
                    border: `1px solid ${isHovered ? accent.border : "#EBEBEB"}`,
                    borderRadius: 16,
                    padding: isLarge ? "36px 32px" : "28px 26px",
                    height: "100%",
                    cursor: "pointer",
                    textDecoration: "none",
                    /* Doherty — sub-400ms spring curve */
                    transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
                    transform: isHovered && !reducedMotion ? "translateY(-4px)" : "translateY(0)",
                    boxShadow: isHovered
                      ? `0 16px 40px ${accent.bg}, 0 4px 12px rgba(0,0,0,0.06)`
                      : "0 1px 3px rgba(0,0,0,0.04)",
                    position: "relative",
                    overflow: "hidden",
                    gridColumn: isLarge ? "span 2" : "span 1",
                    outline: "none",
                    display: "block",
                    /* Similarity — non-hovered cards recede slightly,
                       spotlighting one module at a time */
                    opacity: hovered !== null && !isHovered ? 0.75 : 1,
                  }}
                >
                  {/* Corner glow on hover */}
                  {isHovered && (
                    <div aria-hidden="true" style={{
                      position: "absolute", top: -40, right: -40,
                      width: 120, height: 120, borderRadius: "50%",
                      background: `radial-gradient(circle, ${accent.icon}20 0%, transparent 70%)`,
                      pointerEvents: "none",
                    }} />
                  )}

                  {/* Icon — lifts and tilts subtly on hover */}
                  <div style={{
                    width: 46, height: 46,
                    background: isHovered ? `${accent.icon}15` : "#F0F0F0",
                    border: `1px solid ${isHovered ? accent.border : "#E8E8E8"}`,
                    borderRadius: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, marginBottom: 20,
                    transition: "all 0.3s cubic-bezier(.34,1.56,.64,1)",
                    transform: isHovered && !reducedMotion
                      ? "scale(1.08) rotate(-3deg)"
                      : "scale(1) rotate(0deg)",
                    boxShadow: isHovered ? `0 4px 12px ${accent.icon}20` : "none",
                  }}>
                    <span style={{ filter: isHovered ? "none" : "grayscale(0.3)" }}>
                      {f.icon}
                    </span>
                  </div>

                  {/* Feature number — Goal-Gradient: 01–08 reads as a guided tour */}
                  <div style={{
                    fontSize: 10, fontWeight: 800,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    color: isHovered ? accent.icon : "#CCC",
                    marginBottom: 8, transition: "color 0.3s",
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  <div style={{
                    fontSize: isLarge ? 18 : 15, fontWeight: 700,
                    letterSpacing: "-0.025em", marginBottom: 8,
                    color: "#0A0A0A",
                  }}>
                    {f.title}
                  </div>

                  <div style={{
                    fontSize: 14, color: "#777", lineHeight: 1.7,
                    fontWeight: 400,
                  }}>
                    {f.desc}
                  </div>

                  {/* Arrow on hover — now a real navigation cue */}
                  <div style={{
                    marginTop: 16,
                    fontSize: 12, fontWeight: 700,
                    color: accent.icon,
                    opacity: isHovered ? 1 : 0,
                    transform: isHovered ? "translateX(0)" : "translateX(-8px)",
                    transition: "all 0.3s",
                  }}>
                    Learn more →
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        {/* ── Bottom metrics strip (Peak-End — close confident) ── */}
        <Reveal delay={300}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 1, marginTop: 48,
            background: "linear-gradient(90deg, rgba(99,102,241,0.1), rgba(16,185,129,0.1))",
            borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(99,102,241,0.1)",
          }}>
            {[
              { value: "8",      label: "Core Modules",       color: "#6366F1" },
              { value: "1",      label: "Unified Platform",   color: "#10B981" },
              { value: "∞",      label: "Revenue Signals",    color: "#F59E0B" },
              { value: "Beta",   label: "Early Access Open",  color: "#EF4444" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "#fff", padding: "32px 24px", textAlign: "center",
                  transition: "background 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#FAFAFA";
                  if (!reducedMotion) e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <div style={{
                  fontSize: 38, fontWeight: 900,
                  letterSpacing: "-0.045em", color: s.color,
                  marginBottom: 6, fontFamily: "Inter, sans-serif",
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: "#AAA", fontWeight: 600, letterSpacing: "0.01em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}