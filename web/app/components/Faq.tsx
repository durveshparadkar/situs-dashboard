"use client";

import { useState } from "react";
import { Reveal } from "./shared/Reveal";
import { FAQS, DEMO_URL } from "./shared/constants";

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      style={{
        padding: "var(--section-y) var(--gutter)",
        background: "var(--s-raised)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Mesh */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", left: "-5%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
      </div>

      <div className="section-line" aria-hidden="true" />

      <div style={{ maxWidth: "var(--container)", margin: "0 auto", position: "relative" }}>

        <div className="two-col" style={{
          display: "grid", gridTemplateColumns: "1fr 1.6fr",
          gap: 96, alignItems: "flex-start",
        }}>

          {/* ── Left — sticky header ── */}
          <Reveal direction="left">
            <div style={{ position: "sticky", top: 110 }}>
              <div className="badge">FAQ</div>

              <h2 className="h-section" style={{ marginBottom: 20 }}>
                Questions<br />
                <span className="gradient-text">answered</span>
              </h2>

              <p className="t-lead" style={{ fontSize: 16, color: "var(--t-tertiary)", marginBottom: 32 }}>
                Everything you need to know about Situs, beta access, and how it works.
              </p>

              {/* Contact nudge */}
              <div style={{
                background: "linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%)",
                borderRadius: "var(--r-lg)", padding: 24,
                position: "relative", overflow: "hidden",
              }}>
                <div aria-hidden="true" style={{
                  position: "absolute", top: -30, right: -30,
                  width: 120, height: 120, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)",
                }} />
                <h3 style={{
                  fontSize: 15, fontWeight: 700,
                  letterSpacing: "-0.02em", color: "#fff", marginBottom: 6,
                  position: "relative",
                }}>
                  Still have questions?
                </h3>
                <p style={{
                  fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 18,
                  position: "relative",
                }}>
                  Book a demo and we&apos;ll walk you through everything live.
                </p>
                <a
                  href={DEMO_URL}
                  className="btn btn--white btn--sm"
                  style={{ position: "relative" }}
                >
                  Book Demo →
                </a>
              </div>
            </div>
          </Reveal>

          {/* ── Right — accordion (proper disclosure pattern) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FAQS.map((faq, i) => {
              const isOpen = open === i;
              return (
                <Reveal key={i} delay={i * 40}>
                  <div
                    style={{
                      background: "#fff",
                      border: `1px solid ${isOpen ? "rgba(99,102,241,0.25)" : "var(--s-border)"}`,
                      borderRadius: "var(--r-lg)",
                      transition: "all var(--speed-base) var(--ease)",
                      boxShadow: isOpen ? "0 12px 32px rgba(99,102,241,0.08)" : "var(--shadow-sm)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Question is a real button (keyboard + screen reader) */}
                    <button
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        width: "100%", padding: "22px 24px",
                        background: "transparent", border: "none",
                        cursor: "pointer", textAlign: "left",
                        fontFamily: "inherit", minHeight: 64, /* Fitts */
                      }}
                      onMouseEnter={(e) => {
                        if (!isOpen) (e.currentTarget.parentElement as HTMLElement).style.borderColor = "#D8D8D8";
                      }}
                      onMouseLeave={(e) => {
                        if (!isOpen) (e.currentTarget.parentElement as HTMLElement).style.borderColor = "var(--s-border)";
                      }}
                    >
                      <span style={{
                        fontSize: 16, fontWeight: 700, color: "var(--t-primary)",
                        letterSpacing: "-0.02em", paddingRight: 24,
                      }}>
                        {faq.q}
                      </span>
                     <span aria-hidden="true" style={{
  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
  background: isOpen
    ? "linear-gradient(135deg, var(--c-indigo), var(--c-violet))"
    : "var(--s-sunken)",
  border: `1px solid ${isOpen ? "transparent" : "var(--s-border-2)"}`,
  display: "flex", alignItems: "center", justifyContent: "center",
  transition: "all var(--speed-base) var(--ease)",
  boxShadow: isOpen ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
}}>
  <svg
    width="12" height="12" viewBox="0 0 12 12"
    style={{
      transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
      transition: "transform var(--speed-base) var(--ease)",
      display: "block",
    }}
  >
    <path
      d="M6 1 V11 M1 6 H11"
      stroke={isOpen ? "#fff" : "#999"}
      strokeWidth="1.5"
      strokeLinecap="round"
      style={{ transition: "stroke var(--speed-base) var(--ease)" }}
    />
  </svg>
</span>
                    </button>

                    {/* Answer region */}
                    <div
                      id={`faq-answer-${i}`}
                      role="region"
                      hidden={!isOpen}
                      style={{
                        maxHeight: isOpen ? 300 : 0,
                        opacity: isOpen ? 1 : 0,
                        overflow: "hidden",
                        transition: "max-height var(--speed-slow) var(--ease), opacity var(--speed-slow) var(--ease)",
                      }}
                    >
                      <p style={{
                        fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.75,
                        padding: "0 24px 24px", maxWidth: 600,
                      }}>
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}