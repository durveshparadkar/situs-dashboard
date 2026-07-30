"use client";

/* ─────────────────────────────────────────────────────────────
   PRICING — enterprise-grade section
   UX laws applied (annotated inline):
   • Von Restorff       — exactly one highlighted card
   • Hick's Law         — one CTA per card, no choice overload
   • Miller's Law       — 3 tiers, includes list chunked
   • Jakob's Law        — familiar 3-column pricing pattern
   • Fitts's Law        — full-width CTAs, large hit areas
   • Law of Proximity   — features grouped under one shared block
   • Law of Similarity  — consistent card anatomy across tiers
   • Law of Common Region — bordered cards + includes container
   • Serial Position    — Growth (hero tier) placed center,
                          Enterprise last (recency)
   • Aesthetic-Usability — motion, texture, deliberate typography
   • Peak-End Rule      — section ends on a reassurance strip
   • Goal-Gradient      — "3 steps to onboard" progress hint
   • Doherty Threshold  — all transitions < 400ms
   • Tesler's Law       — "custom pricing" complexity absorbed by
                          "we'll find the fit" copy, not the user
   • Postel's Law       — reduced-motion respected
   ───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./shared/Reveal";
import { DEMO_URL } from "./shared/constants";

const TIERS = [
  {
    name: "Starter",
    desc: "For early-stage founders and small revenue teams getting started with intelligence.",
    highlight: false,
    cta: "Book Demo",
    accent: "#6366F1",
    meta: "Up to 5 seats",
  },
  {
    name: "Growth",
    desc: "For scaling teams that need deeper pipeline visibility and AI-driven decisions.",
    highlight: true, // Von Restorff — exactly one card stands out
    cta: "Talk to Us",
    accent: "#10B981",
    meta: "Most teams start here",
  },
  {
    name: "Enterprise",
    desc: "For large revenue orgs that need custom integrations, SLAs, and dedicated support.",
    highlight: false,
    cta: "Contact Sales",
    accent: "#A855F7",
    meta: "Custom integrations & SLAs",
  },
];

/* Miller's Law — chunked into two scannable groups of four */
const INCLUDES_CORE = [
  "Full dashboard access",
  "Deals & pipeline intelligence",
  "AI-powered recommendations",
  "Revenue forecasting engine",
];
const INCLUDES_SUPPORT = [
  "PDF intelligence reports",
  "Alerts & risk detection",
  "Dedicated onboarding support",
  "Custom implementation",
];

/* Staggered check item — checkmark draws in when visible */
function CheckItem({ item, delay }: { item: string; delay: number }) {
  const [visible, setVisible] = useState(() => {
    // initialize respecting prefers-reduced-motion (guard window for SSR)
    try {
      return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (visible) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  return (
    <li
      ref={ref}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 14, color: "var(--t-secondary)", fontWeight: 500,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-8px)",
        transition: `opacity 0.4s var(--ease) ${delay}ms, transform 0.4s var(--ease) ${delay}ms`,
      }}
    >
      <span aria-hidden="true" style={{
        width: 22, height: 22, borderRadius: "50%",
        background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: "#16A34A", flexShrink: 0,
        transform: visible ? "scale(1)" : "scale(0.5)",
        transition: `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay + 100}ms`,
      }}>
        ✓
      </span>
      {item}
    </li>
  );
}

export default function Pricing() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section
      id="pricing"
      style={{
        padding: "var(--section-y) var(--gutter)",
        background: "var(--s-base)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
          width: 900, height: 500, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(16,185,129,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 580, margin: "0 auto 24px" }}>
            <div className="badge">Pricing</div>
            <h2 className="h-section" style={{ marginBottom: 18 }}>
              Priced for your stage.<br />
              <span className="gradient-text">Built for your scale.</span>
            </h2>
            <p className="t-lead" style={{ fontSize: 17 }}>
              We don&apos;t believe in one-size-fits-all pricing.
              Every team is different — let&apos;s find the right fit together.
            </p>
          </div>
        </Reveal>

        {/* ── Global currency strip (Tesler: complexity absorbed, stated simply) ── */}
        <Reveal delay={80}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10, marginBottom: 64, flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: "var(--t-tertiary)",
              letterSpacing: "0.02em",
            }}>
              Billed in your currency
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {["$ USD", "€ EUR", "£ GBP", "₹ INR"].map((c, i) => (
                <span key={c} style={{
                  fontSize: 11, fontWeight: 700,
                  padding: "4px 10px", borderRadius: 100,
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid var(--s-border)",
                  color: "var(--t-secondary)",
                  transition: `all 0.3s var(--ease) ${i * 40}ms`,
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── Tier cards ── */}
        <div className="three-col" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16, marginBottom: 48,
        }}>
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 80}>
              <div
                style={{
                  background: tier.highlight
                    ? "linear-gradient(135deg, var(--c-ink) 0%, #16161E 100%)"
                    : "#fff",
                  border: `1px solid ${tier.highlight ? "transparent" : "var(--s-border)"}`,
                  borderRadius: "var(--r-xl)",
                  padding: "40px 36px",
                  position: "relative",
                  height: "100%",
                  display: "flex", flexDirection: "column",
                  overflow: "hidden",
                  boxShadow: tier.highlight
                    ? "0 24px 64px rgba(0,0,0,0.25)"
                    : "var(--shadow-sm)",
                  /* Doherty — snappy, sub-400ms transitions */
                  transition: "transform 0.35s var(--ease), box-shadow 0.35s var(--ease)",
                  transform: hovered === i ? "translateY(-6px)" : "translateY(0)",
                  /* Law of Similarity — non-hovered cards dim slightly,
                     guiding attention without hiding options */
                  opacity: hovered !== null && hovered !== i ? 0.85 : 1,
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Accent top border — Law of Common Region + identity per tier */}
                <div aria-hidden="true" style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, transparent, ${tier.accent}, transparent)`,
                  opacity: hovered === i || tier.highlight ? 1 : 0,
                  transition: "opacity 0.35s var(--ease)",
                }} />

                {/* Glow on highlight card */}
                {tier.highlight && (
                  <div aria-hidden="true" style={{
                    position: "absolute", top: -60, right: -60,
                    width: 200, height: 200, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)",
                  }} />
                )}

                {/* Popular badge */}
                {tier.highlight && (
                  <div style={{
                    position: "absolute", top: 20, right: 20,
                    background: "linear-gradient(135deg, #10B981, #34D399)",
                    color: "#fff", fontSize: 10, fontWeight: 800,
                    letterSpacing: "0.07em", textTransform: "uppercase",
                    padding: "5px 12px", borderRadius: 100,
                    boxShadow: "0 4px 12px rgba(16,185,129,0.4)",
                  }}>
                    Most Popular
                  </div>
                )}

                <div style={{
                  fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  color: tier.highlight ? "#888" : "var(--t-tertiary)",
                  marginBottom: 16, position: "relative",
                }}>
                  {tier.name}
                </div>

                <div style={{
                  fontSize: 36, fontWeight: 900,
                  letterSpacing: "-0.045em",
                  color: tier.highlight ? "#fff" : "var(--t-primary)",
                  marginBottom: 4, position: "relative",
                }}>
                  Custom
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: tier.highlight ? "#666" : "var(--t-faint)",
                    marginLeft: 6,
                  }}>
                    pricing
                  </span>
                </div>

                {/* Tier meta — anchoring detail (Serial Position support) */}
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: tier.highlight ? tier.accent : "var(--t-faint)",
                  marginBottom: 16, position: "relative",
                }}>
                  {tier.meta}
                </div>

                <p style={{
                  fontSize: 14, color: tier.highlight ? "#888" : "#777",
                  lineHeight: 1.7, marginBottom: 32, flexGrow: 1, position: "relative",
                }}>
                  {tier.desc}
                </p>

                {/* Fitts — full-width CTA, generous hit area, one per card (Hick) */}
                <a
                  href={DEMO_URL}
                  className={tier.highlight ? "btn btn--white" : "btn btn--primary"}
                  style={{ width: "100%", position: "relative" }}
                >
                  {tier.cta} →
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ── Everything included ── */}
        <Reveal delay={250}>
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(16,185,129,0.04))",
            border: "1px solid rgba(99,102,241,0.1)",
            borderRadius: "var(--r-xl)", padding: 48,
          }}>
            <h3 style={{
              fontSize: 13, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              color: "var(--t-tertiary)", marginBottom: 32, textAlign: "center",
            }}>
              Everything included across all plans
            </h3>
            {/* Law of Proximity — two chunked columns instead of one flat list */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}>
              <ul style={{ display: "grid", gap: 16, listStyle: "none" }}>
                {INCLUDES_CORE.map((item, i) => (
                  <CheckItem key={item} item={item} delay={i * 70} />
                ))}
              </ul>
              <ul style={{ display: "grid", gap: 16, listStyle: "none" }}>
                {INCLUDES_SUPPORT.map((item, i) => (
                  <CheckItem key={item} item={item} delay={i * 70 + 140} />
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        {/* ── Reassurance strip (Peak-End Rule — close on trust) ── */}
        <Reveal delay={350}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 28, marginTop: 48, flexWrap: "wrap",
          }}>
            {[
              "No credit card to start",
              "Onboarding in 3 steps",       /* Goal-Gradient — near-finish framing */
              "Cancel anytime",
            ].map((t) => (
              <span key={t} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, fontWeight: 500, color: "var(--t-tertiary)",
              }}>
                <span aria-hidden="true" style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "var(--c-green, #22C55E)",
                }} />
                {t}
              </span>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}