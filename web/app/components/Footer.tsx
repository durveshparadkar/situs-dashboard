"use client";

import { DEMO_URL } from "./shared/constants";

const LINKS = {
  Product: ["Dashboard", "Deals", "Pipeline", "Forecasting", "Analytics", "AI Intelligence"],
  Company: ["About", "Beta Program", "Security", "FAQ"],
  Connect: ["Book Demo", "Join Beta", "Request Access"],
};

export default function Footer() {
  return (
    <footer style={{
      background: "linear-gradient(180deg, var(--s-raised) 0%, var(--s-sunken) 100%)",
      borderTop: "1px solid var(--s-border)",
      padding: "80px var(--gutter) 40px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Accent line + glow */}
      <div aria-hidden="true" style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 600, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), rgba(16,185,129,0.3), transparent)",
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", bottom: "-30%", left: "20%",
        width: 600, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        {/* ── Top grid ── */}
        <div className="four-col" style={{
          display: "grid",
          gridTemplateColumns: "1.8fr 1fr 1fr 1fr",
          gap: 64, marginBottom: 56,
        }}>

          {/* Brand */}
          <div>
            <a
              href="#"
              aria-label="Situs — back to top"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 20 }}
            >
              <span aria-hidden="true" style={{
                width: 34, height: 34,
                background: "linear-gradient(135deg, var(--c-ink) 0%, #333 100%)",
                borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}>
                <span style={{ color: "#fff", fontSize: 16, fontWeight: 900, letterSpacing: "-0.05em" }}>S</span>
              </span>
              <span style={{ fontSize: 19, fontWeight: 800, color: "var(--t-primary)", letterSpacing: "-0.04em" }}>
                Situs
              </span>
            </a>

            <p style={{
              fontSize: 14, color: "var(--t-tertiary)", lineHeight: 1.75,
              maxWidth: 280, marginBottom: 28,
            }}>
              AI Decision &amp; Revenue Intelligence for modern revenue teams.
              Built for founders, sales leaders, and RevOps.
            </p>

            {/* Newsletter — real form (Postel: forgiving input) */}
            <form
              onSubmit={(e) => { e.preventDefault(); window.location.href = DEMO_URL; }}
              style={{ marginBottom: 8 }}
            >
              <label
                htmlFor="footer-email"
                style={{
                  display: "block", fontSize: 12, fontWeight: 700,
                  color: "var(--t-secondary)", letterSpacing: "0.04em", marginBottom: 10,
                }}
              >
                Get product updates
              </label>
              <div style={{ display: "flex", gap: 8, maxWidth: 320 }}>
                <input
                  id="footer-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  style={{
                    flex: 1, minHeight: 44, /* Fitts */
                    background: "#fff", border: "1px solid var(--s-border-2)",
                    borderRadius: 9, padding: "10px 14px", fontSize: 13,
                    color: "var(--t-primary)", fontFamily: "inherit",
                    transition: "border-color var(--speed-fast) var(--ease)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--c-indigo)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--s-border-2)")}
                />
                <button type="submit" className="btn btn--primary btn--sm" style={{ whiteSpace: "nowrap" }}>
                  Subscribe
                </button>
              </div>
            </form>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([title, items]) => (
            <nav key={title} aria-label={`${title} links`}>
              <h3 style={{
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.07em", textTransform: "uppercase",
                color: "var(--t-primary)", marginBottom: 20,
              }}>
                {title}
              </h3>
              <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none" }}>
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href={DEMO_URL}
                      style={{
                        fontSize: 14, color: "var(--t-tertiary)", textDecoration: "none",
                        transition: "color var(--speed-fast) var(--ease), padding-left var(--speed-fast) var(--ease)",
                        letterSpacing: "-0.01em",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--t-primary)";
                        e.currentTarget.style.paddingLeft = "4px";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--t-tertiary)";
                        e.currentTarget.style.paddingLeft = "0px";
                      }}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

        </div>

        {/* Divider */}
        <div aria-hidden="true" style={{ height: 1, background: "var(--s-border)", marginBottom: 32 }} />

        {/* ── Bottom row ── */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 16,
        }}>
          <div style={{ fontSize: 13, color: "var(--t-faint)" }}>
            © 2026 Situs. AI Decision &amp; Revenue Intelligence. All rights reserved.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {["Privacy Policy", "Terms of Service"].map((item) => (
              <a
                key={item}
                href="#"
                style={{
                  fontSize: 13, color: "var(--t-faint)", textDecoration: "none",
                  transition: "color var(--speed-fast) var(--ease)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
              >
                {item}
              </a>
            ))}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "var(--t-tertiary)", fontWeight: 500,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
            borderRadius: 100, padding: "5px 14px",
          }}>
            <div aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--c-green)", boxShadow: "0 0 6px #22C55E",
              animation: "pulse 2s infinite",
            }} />
            Beta — India 🇮🇳
          </div>
        </div>

      </div>
    </footer>
  );
}