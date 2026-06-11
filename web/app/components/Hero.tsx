"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./shared/Reveal";
import { DEMO_URL } from "./shared/constants";

/* Animated counter — counts 0 → target over 2s with ease-out */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // defer setting state to avoid synchronous state update inside effect
      // which can cause cascading renders. Use rAF to schedule safely.
      const id = requestAnimationFrame(() => setCount(target));
      return () => cancelAnimationFrame(id);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const duration = 2000; // 2 seconds
        const start = performance.now();

        const tick = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutExpo — fast start, slow landing
          const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          setCount(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

const STATS = [
  { value: 84, suffix: "%", label: "Forecast Accuracy"    },
  { value: 3,  suffix: "x", label: "Pipeline Coverage"    },
  { value: 47, suffix: "",  label: "Deals Tracked Live"   },
  { value: 12, suffix: "",  label: "Risks Detected Today" },
];

export default function Hero() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const enter = (delay: number) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(20px)",
    transition: `opacity 0.7s var(--ease) ${delay}ms, transform 0.7s var(--ease) ${delay}ms`,
  });

  return (
    <section
      id="product"
      style={{
        position: "relative",
        paddingTop: 168,
        paddingBottom: "var(--section-y)",
        overflow: "hidden",
        background: "var(--s-base)",
      }}
    >
      {/* ── Gradient mesh + texture ── */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: -200, left: -200,
          width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", top: -100, right: -100,
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: "40%",
          width: 500, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0, opacity: 0.025,
          backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E')",
          backgroundRepeat: "repeat", backgroundSize: "128px 128px",
        }} />
      </div>

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--gutter)", position: "relative" }}>

        {/* ── Beta pill ── */}
        <div style={{ ...enter(0), marginBottom: 36 }}>
          <a
            href={DEMO_URL}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 100, padding: "7px 16px 7px 8px",
              textDecoration: "none",
              boxShadow: "0 2px 12px rgba(99,102,241,0.1)",
              backdropFilter: "blur(8px)",
              transition: "all var(--speed-base) var(--ease)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(99,102,241,0.1)"; }}
          >
            <span style={{
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              color: "#fff", fontSize: 10, fontWeight: 800,
              letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "3px 10px", borderRadius: 100,
              boxShadow: "0 2px 6px rgba(99,102,241,0.4)",
            }}>
              Beta
            </span>
            <span style={{ fontSize: 13, color: "#444", fontWeight: 500 }}>
              Now accepting early access — limited spots
            </span>
            <span aria-hidden="true" style={{ fontSize: 12, color: "var(--c-indigo)", fontWeight: 700 }}>→</span>
          </a>
        </div>

        {/* ── Headline ── */}
        <div style={{ ...enter(100), marginBottom: 28 }}>
          <h1 className="h-display" style={{ maxWidth: 900 }}>
            AI Decision &amp; Revenue<br />
            Intelligence for{" "}
            <span style={{ position: "relative", display: "inline-block" }}>
              <span className="gradient-text" style={{ fontStyle: "italic" }}>Modern</span>
              <span aria-hidden="true" style={{
                position: "absolute", bottom: -4, left: 0, right: 0, height: 3,
                background: "linear-gradient(90deg, #6366F1, #10B981, #F59E0B)",
                borderRadius: 100, opacity: 0.4,
              }} />
            </span>
            {" "}Revenue Teams
          </h1>
        </div>

        {/* ── Subheadline ── */}
        <div style={{ ...enter(180), marginBottom: 44 }}>
          <p className="t-lead" style={{ fontSize: 19, maxWidth: 560 }}>
            Monitor pipeline health, forecast revenue, detect risks, and uncover
            growth opportunities — from a single intelligence platform built for
            the Indian market.
          </p>
        </div>

        {/* ── CTAs — exactly two (Hick's Law) ── */}
        <div
          className="btn-row"
          style={{ ...enter(260), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 40 }}
        >
          <a href={DEMO_URL} className="btn btn--primary">
            Book Demo
            <span style={{
              background: "rgba(255,255,255,0.15)", borderRadius: 6,
              padding: "2px 8px", fontSize: 12,
            }}>
              Free
            </span>
          </a>
          <a href={DEMO_URL} className="btn btn--secondary">
            Join Beta →
          </a>
        </div>

        {/* ── Social proof strip (Jakob: expected pattern below hero CTAs) ── */}
        <div style={{ ...enter(320), display: "flex", alignItems: "center", gap: 14, marginBottom: 96, flexWrap: "wrap" }}>
          {/* Avatar stack */}
          <div style={{ display: "flex" }}>
            {["#6366F1", "#10B981", "#F59E0B", "#EF4444"].map((c, i) => (
              <div key={c} style={{
                width: 30, height: 30, borderRadius: "50%",
                background: `linear-gradient(135deg, ${c}, ${c}99)`,
                border: "2px solid #fff",
                marginLeft: i === 0 ? 0 : -10,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "#fff",
              }}>
                {["R", "S", "A", "P"][i]}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 13, color: "var(--t-tertiary)", fontWeight: 500 }}>
            Trusted by early revenue teams across India ·{" "}
            <span style={{ color: "var(--t-secondary)", fontWeight: 600 }}>Beta cohort filling fast</span>
          </span>
        </div>

        {/* ── Dashboard mockup ── */}
        <Reveal delay={150}>
          <div style={{ maxWidth: 980, position: "relative" }}>
            <div aria-hidden="true" style={{
              position: "absolute", inset: -40, pointerEvents: "none",
              background: "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(99,102,241,0.08) 0%, transparent 70%)",
              filter: "blur(20px)",
            }} />

            <div style={{
              borderRadius: "var(--r-xl)", overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.07)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.06), 0 32px 64px rgba(0,0,0,0.08)",
              background: "#fff", position: "relative",
            }}>

              {/* Browser chrome */}
              <div style={{
                background: "linear-gradient(180deg, #F8F8F8 0%, #F2F2F2 100%)",
                borderBottom: "1px solid var(--s-border)",
                padding: "12px 20px", display: "flex", alignItems: "center", gap: 8,
              }}>
                {["#FF5F57", "#FFBD2E", "#28C840"].map((c) => (
                  <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
                ))}
                <div style={{
                  marginLeft: 16, flex: 1, maxWidth: 280,
                  background: "rgba(0,0,0,0.05)", borderRadius: 6,
                  padding: "5px 12px", fontSize: 12, color: "#999", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 10 }}>🔒</span> app.situs.ai
                </div>
              </div>

              {/* Dashboard body */}
              <div style={{ padding: 24, background: "#F7F7F8" }}>

                {/* Tab bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {["Dashboard", "Deals", "Pipeline", "Forecast"].map((tab, i) => (
                      <div key={tab} style={{
                        padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                        background: i === 0 ? "var(--c-ink)" : "transparent",
                        color: i === 0 ? "#fff" : "#999",
                      }}>
                        {tab}
                      </div>
                    ))}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(34,197,94,0.1)", borderRadius: 100, padding: "4px 10px",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-green)", animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>Live</span>
                  </div>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  {[
                    { label: "Pipeline Value", value: "₹4.2Cr", delta: "↑ 12%",    up: true  },
                    { label: "Win Rate",        value: "38%",    delta: "↓ -3pts",  up: false },
                    { label: "Forecast Q3",     value: "₹1.8Cr", delta: "On track", up: true  },
                  ].map((m) => (
                    <div key={m.label} style={{
                      background: "#fff", borderRadius: "var(--r-md)",
                      border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px",
                      boxShadow: "var(--shadow-sm)",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--c-ink)", letterSpacing: "-0.04em", marginBottom: 4 }}>
                        {m.value}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: m.up ? "#16A34A" : "#DC2626",
                        background: m.up ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                        padding: "2px 8px", borderRadius: 100,
                      }}>
                        {m.delta}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Chart + AI */}
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 }}>
                  <div style={{
                    background: "#fff", borderRadius: "var(--r-md)",
                    border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px",
                    boxShadow: "var(--shadow-sm)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Revenue Trend
                      </span>
                      <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, background: "rgba(22,163,74,0.08)", padding: "2px 8px", borderRadius: 100 }}>
                        +18% MoM
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
                      {[28, 44, 36, 58, 48, 72, 68, 85].map((h, i) => (
                        <div key={i} style={{
                          flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0",
                          background: i >= 5 ? "linear-gradient(180deg, #6366F1, #8B5CF6)" : "rgba(0,0,0,0.06)",
                        }} />
                      ))}
                    </div>
                  </div>

                  <div style={{
                    background: "linear-gradient(135deg, #0A0A0A 0%, #111 100%)",
                    borderRadius: "var(--r-md)", padding: "16px 18px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-green)", boxShadow: "0 0 6px #22C55E", animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        AI Insight
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#CCC", lineHeight: 1.65, marginBottom: 12 }}>
                      3 deals at risk — action needed before Friday close.
                    </p>
                    <span style={{ fontSize: 11, color: "#818CF8", fontWeight: 700 }}>
                      View all insights →
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Stats row ── */}
        <Reveal delay={300}>
          <div className="four-col" style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1, marginTop: 64,
            background: "var(--s-sunken)", borderRadius: "var(--r-lg)",
            overflow: "hidden", border: "1px solid var(--s-border)",
          }}>
            {STATS.map((s, i) => (
              <div key={i} style={{
                background: "#fff", padding: "28px 24px", textAlign: "center",
                transition: "background var(--speed-fast) var(--ease)",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--s-raised)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--c-ink)", marginBottom: 4 }}>
                  <Counter target={s.value} suffix={s.suffix} />
                </div>
                <div style={{ fontSize: 12, color: "var(--t-faint)", fontWeight: 500 }}>
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