"use client";

/* ─────────────────────────────────────────────────────────────
   FOOTER — global positioning
   UX laws applied (annotated inline):
   • Jakob's Law         — brand left, link columns, legal bottom
   • Law of Common Region — link groups under labeled headings
   • Fitts's Law         — ≥44px input, link hover targets
   • Postel's Law        — forgiving email input, autoComplete
   • Serial Position     — footer is the last impression:
                           closes on a live global-status chip
   • Peak-End Rule       — "Beta — Live Worldwide" ends the page
                           on momentum, not legalese
   ───────────────────────────────────────────────────────────── */

import { DEMO_URL, SIGNUP_URL, APP_URL } from "./shared/constants";
import Image from "next/image";

/* Each link now has a real destination instead of every item
   pointing at DEMO_URL. Product items are in-page anchors to
   sections that already exist on this page; Company items go to
   their actual sections/pages; Connect items go to the right
   conversion action for what they say. */
const LINKS: Record<string, Array<{ label: string; href: string }>> = {
  Product: [
    { label: "Dashboard",      href: "#product" },
    { label: "Deals",          href: "#features" },
    { label: "Pipeline",       href: "#features" },
    { label: "Forecasting",    href: "#features" },
    { label: "Analytics",      href: "#features" },
    { label: "AI Intelligence", href: "#features" },
  ],
  Company: [
    { label: "About",         href: "#product" },
    { label: "Beta Program",  href: "#pricing" },
    { label: "Security",      href: "#security" },
    { label: "FAQ",           href: "#faq" },
  ],
  Connect: [
    { label: "Book Demo",       href: DEMO_URL },
    { label: "Join Beta",       href: SIGNUP_URL },
    { label: "Request Access",  href: `${APP_URL}/signup` },
  ],
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
              style={{ textDecoration: "none", display: "inline-flex", marginBottom: 20 }}
            >
              <Image
                src="/situs-logo.png"
                alt="Situs Revenue"
                width={82}
                height={46}
                style={{ height: 46, width: "auto", display: "block" }}
              />
            </a>

            <p style={{
              fontSize: 14, color: "var(--t-tertiary)", lineHeight: 1.75,
              maxWidth: 280, marginBottom: 28,
            }}>
              AI Decision &amp; Revenue Intelligence for modern revenue teams
              worldwide. Built for founders, sales leaders, and RevOps.
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

            {/* Currency support signal */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 20,
              fontSize: 12, color: "var(--t-faint)", fontWeight: 500,
            }}>
              <span>Billing in</span>
              {["USD", "EUR", "GBP", "INR"].map((c, i) => (
                <span key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--t-tertiary)", fontWeight: 600 }}>{c}</span>
                  {i < 3 && <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Link columns — each item now has its own real href */}
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
                  <li key={item.label}>
                    <a
                      href={item.href}
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
                      {item.label}
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
            ©️ 2026 Situs. AI Decision &amp; Revenue Intelligence. All rights reserved.
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

          {/* Peak-End — page closes on global momentum */}
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
            Beta — Live Worldwide 🌍
          </div>
        </div>

      </div>
    </footer>
  );
}