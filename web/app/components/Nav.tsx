"use client";

import { useEffect, useState } from "react";
import { DEMO_URL, SIGNUP_URL } from "./shared/constants";

const NAV_LINKS = [
  { label: "Product",      href: "#product"      },
  { label: "Features",     href: "#features"     },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing",      href: "#pricing"      },
  { label: "FAQ",          href: "#faq"          },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active,   setActive]   = useState("");

  // Scroll state + progress (Goal-Gradient: visible progress increases completion)
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active section tracking
  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.href.slice(1));
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { threshold: 0.25 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* A11y: keyboard users skip straight to content */}
      <a
        href="#product"
        style={{
          position: "absolute", left: -9999, top: 16, zIndex: 200,
          background: "#0A0A0A", color: "#fff", padding: "10px 20px",
          borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.left = "16px"; }}
        onBlur={(e)  => { e.currentTarget.style.left = "-9999px"; }}
      >
        Skip to content
      </a>

      {/* Scroll progress bar */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", top: 0, left: 0, height: 2, zIndex: 102,
          width: `${progress}%`,
          background: "linear-gradient(90deg, #6366F1, #10B981)",
          transition: "width 0.1s linear",
          borderRadius: "0 2px 2px 0",
        }}
      />

      <nav
        aria-label="Main navigation"
        style={{
          position: "fixed", top: 2, left: 0, right: 0, zIndex: 100,
          padding: scrolled ? "10px var(--gutter)" : "16px var(--gutter)",
          transition: "padding 0.4s var(--ease)",
        }}
      >
        <div style={{
          maxWidth: "var(--container)", margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: scrolled ? "rgba(255,255,255,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
          border: scrolled ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent",
          borderRadius: scrolled ? 16 : 0,
          padding: scrolled ? "8px 20px" : "0",
          boxShadow: scrolled ? "0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" : "none",
          transition: "all 0.4s var(--ease)",
          height: 56,
        }}>

          {/* Wordmark */}
          <a
            href="#"
            aria-label="Situs — home"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{
              width: 30, height: 30,
              background: "linear-gradient(135deg, #0A0A0A 0%, #333 100%)",
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: "-0.05em" }}>
                S
              </span>
            </span>
            <span style={{ fontSize: 17, fontWeight: 800, color: "var(--t-primary)", letterSpacing: "-0.04em" }}>
              Situs
            </span>
          </a>

          {/* Links */}
          <div className="nav-links" style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {NAV_LINKS.map((l) => {
              const isActive = active === l.href.slice(1);
              return (
                <a
                  key={l.label}
                  href={l.href}
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--t-primary)" : "#666",
                    textDecoration: "none",
                    padding: "10px 14px",          /* Fitts: ≥44px effective target */
                    borderRadius: 8,
                    background: isActive ? "rgba(0,0,0,0.06)" : "transparent",
                    transition: "all var(--speed-fast) var(--ease)",
                    letterSpacing: "-0.01em",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--t-primary)";
                      e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "#666";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {l.label}
                </a>
              );
            })}
          </div>

          {/* CTAs — exactly two (Hick's Law) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={DEMO_URL} className="btn btn--secondary btn--sm hide-mobile">
              Book Demo
            </a>
            <a href={SIGNUP_URL} className="btn btn--primary btn--sm">
              Join Beta →
            </a>
          </div>

        </div>
      </nav>
    </>
  );
}
