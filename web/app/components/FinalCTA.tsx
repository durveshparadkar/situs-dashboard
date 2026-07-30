"use client";

/* ─────────────────────────────────────────────────────────────
   FINAL CTA — the closing argument
   UX laws applied (annotated inline):
   • Peak-End Rule       — strongest visual on the page; the last
                           big moment before the footer
   • Hick's Law          — exactly two CTAs
   • Von Restorff        — the only ink-black rounded mega-card
   • Scarcity (Cialdini) — "limited spots" badge, honest urgency
   • Fitts's Law         — oversized CTA hit areas (15px × 36px+)
   • Serial Position     — trust row is the final line users read
   • Aesthetic-Usability — orbs, grain, gradient headline
   • Goal-Gradient       — "Setup in minutes" = near-zero distance
                           to value
   • Doherty Threshold   — sub-400ms interactions
   • Postel's Law        — reduced-motion respected
   ───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./shared/Reveal";
import { DEMO_URL, APP_URL } from "./shared/constants";

const TRUST = ["No credit card required", "Setup in minutes", "Cancel anytime"];

/* Trust item — staggered pop-in (Serial Position: last thing read, made memorable) */
function TrustItem({ item, delay }: { item: string; delay: number }) {
  const [visible, setVisible] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        fontSize: 13, color: "#888", fontWeight: 500,
        opacity: visible ? 1 : 0,
        transform: `visible ? "translateY(0)" : "translateY(6px)"`,
        transition: `opacity 0.4s var(--ease) ${delay}ms, transform 0.4s var(--ease) ${delay}ms`,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--c-green)" }}>✓</span>
      {item}
    </div>
  );
}

export default function FinalCta() {
  return (
    <section style={{
      padding: "60px var(--gutter) 120px",
      background: "var(--s-base)",
      position: "relative",
    }}>
      <div style={{ maxWidth: "var(--container)", margin: "0 auto" }}>

        <Reveal>
          <div style={{
            background: "linear-gradient(135deg, var(--c-ink) 0%, #16161E 100%)",
            borderRadius: "var(--r-2xl)",
            padding: "100px 80px",
            position: "relative",
            overflow: "hidden",
            textAlign: "center",
          }}>

            {/* ── Gradient orbs (Peak-End: strongest visual on the page) ── */}
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <div style={{
                position: "absolute", top: "-20%", left: "15%",
                width: 500, height: 500, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
                filter: "blur(60px)",
              }} />
              <div style={{
                position: "absolute", bottom: "-20%", right: "15%",
                width: 500, height: 500, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)",
                filter: "blur(60px)",
              }} />
              <div style={{
                position: "absolute", top: "40%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 400, height: 400, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)",
                filter: "blur(60px)",
              }} />
              <div style={{
                position: "absolute", inset: 0, opacity: 0.1,
                backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
                backgroundSize: "32px 32px",
                maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%)",
              }} />
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 400, height: 2,
                background: "linear-gradient(90deg, transparent, #6366F1, #10B981, transparent)",
              }} />
            </div>

            {/* ── Content ── */}
            <div style={{ position: "relative" }}>

              {/* Badge — scarcity + urgency */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: 100, padding: "7px 16px",
                marginBottom: 32,
              }}>
                <div aria-hidden="true" style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--c-green)", boxShadow: "0 0 8px #22C55E",
                  animation: "pulse 2s infinite",
                }} />
                <span style={{ fontSize: 12, color: "var(--c-green)", fontWeight: 700, letterSpacing: "0.06em" }}>
                  BETA ACCESS OPEN — LIMITED SPOTS
                </span>
              </div>

              <h2 style={{
                fontSize: "clamp(38px, 5vw, 68px)",
                fontWeight: 900,
                lineHeight: 1.04,
                letterSpacing: "-0.045em",
                color: "#fff",
                maxWidth: 680,
                margin: "0 auto 24px",
              }}>
                Turn revenue signals into{" "}
                <span style={{
                  background: "linear-gradient(135deg, #818CF8, #34D399, #FBBF24)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  revenue decisions
                </span>
              </h2>

              <p style={{
                fontSize: 18, color: "#888",
                maxWidth: 440, margin: "0 auto 48px",
                lineHeight: 1.7, letterSpacing: "-0.015em",
              }}>
                Join revenue teams around the world building with Situs
                during beta. Early access is limited.
              </p>

              {/* CTAs — exactly two (Hick's Law), arrow nudges (Fitts-scale targets) */}
              <div className="btn-row" style={{
                display: "flex", justifyContent: "center",
                gap: 12, flexWrap: "wrap", marginBottom: 48,
              }}>
                <a
                  href={DEMO_URL}
                  className="btn btn--white"
                  style={{ padding: "15px 36px" }}
                  onMouseEnter={(e) => {
                    const arrow = e.currentTarget.querySelector<HTMLElement>("[data-arrow]");
                    if (arrow) arrow.style.transform = "translateX(4px)";
                  }}
                  onMouseLeave={(e) => {
                    const arrow = e.currentTarget.querySelector<HTMLElement>("[data-arrow]");
                    if (arrow) arrow.style.transform = "translateX(0)";
                  }}
                >
                  Book Demo{" "}
                  <span data-arrow style={{ display: "inline-block", transition: "transform 0.25s var(--ease)" }}>
                    →
                  </span>
                </a>
                <a href={`${APP_URL}/signup`} className="btn btn--gradient" style={{ padding: "15px 36px" }}>
                  Join Beta
                </a>
              </div>

              {/* Trust row — staggered (Serial Position: memorable close) */}
              <div style={{
                display: "flex", justifyContent: "center",
                alignItems: "center", gap: 32, flexWrap: "wrap",
              }}>
                {TRUST.map((item, i) => (
                  <TrustItem key={item} item={item} delay={i * 100} />
                ))}
              </div>

            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}