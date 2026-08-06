import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { Reveal } from "../../components/shared/Reveal";
import { FEATURE_DETAILS, getFeatureBySlug } from "../../components/shared/feature-details";
import { DEMO_URL, SIGNUP_URL, GLOBAL_STYLES } from "../../components/shared/constants";

/* ─────────────────────────────────────────────────────────────
   FEATURE DETAIL PAGE — radical simplicity pass
   "When in doubt, remove." One idea per screen. Hairlines instead
   of boxes. One accent color. Type does the work, not decoration.

   21 UX laws, applied to real decisions on THIS page:
    1. Law of Prägnanz (Simplicity) — governing principle: every
       card/border/icon from the previous version was cut unless
       it carried information a hairline or whitespace couldn't
    2. Hick's Law         — exactly ONE primary CTA in the hero;
                            "Join Beta" demoted to a quiet text link
    3. Fitts's Law         — the one CTA and the next-module band
                            are oversized, unmissable targets
    4. Jakob's Law         — familiar top-to-bottom narrative
                            (claim -> proof -> detail -> next), just
                            with the chrome stripped out
    5. Miller's Law        — capabilities/steps stay at 3-4 items,
                            never a long scroll of bullets
    6. Von Restorff Effect — the stat is the ONLY oversized,
                            centered, full-bleed moment on the page
    7. Serial Position     — the giant stat leads (primacy), the
                            next-module band closes (recency)
    8. Peak-End Rule       — the page's single most dramatic
                            typographic moment (the stat) sits near
                            the top; it closes calm, on Footer
    9. Goal-Gradient Effect — "How it works" numbered 1-2-3 reads
                            as a short, nearly-finished sequence
   10. Zeigarnik Effect     — "Next module" is stated but not shown
                            in full until clicked — open loop
   11. Law of Proximity     — capabilities and steps are two
                            visually separated groups, not one list
   12. Law of Similarity    — every numbered marker (stat index,
                            capability index, step index) uses the
                            identical thin-mono treatment
   13. Law of Common Region — hairline rules substitute for card
                            borders — a region without a box
   14. Law of Continuity    — the thin vertical rule connecting the
                            hero to breadcrumb leads the eye down
   15. Uniform Connectedness — the 3-step process shares one
                            connecting hairline, reading as one flow
   16. Doherty Threshold    — Reveal transitions stay under 400ms;
                            nothing makes the reader wait
   17. Postel's Law         — reduced-motion is respected throughout
                            (inherited from Reveal)
   18. Tesler's Law         — complexity (8 modules, dozens of
                            facts) is absorbed by the layout, not
                            pushed onto the reader as more UI
   19. Chunking             — long feature descriptions never run
                            past 2 lines before a break
   20. Progressive Disclosure — capabilities and steps are the
                            only detail shown; deeper detail lives
                            behind "Book Demo," not on this page
   21. Anchoring            — the stat number anchors the reader's
                            sense of scale before any prose is read
   ───────────────────────────────────────────────────────────── */

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return FEATURE_DETAILS.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return {};
  return {
    title: `${feature.title} — Situs Revenue`,
    description: feature.desc,
  };
}

export default async function FeaturePage({ params }: { params: Params }) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) notFound();

  const currentIndex = FEATURE_DETAILS.findIndex((f) => f.slug === feature.slug);
  const next = FEATURE_DETAILS[(currentIndex + 1) % FEATURE_DETAILS.length];
  const moduleNumber = String(currentIndex + 1).padStart(2, "0");

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <Nav />

      <main style={{ background: "#fff" }}>

        {/* ── HERO — one claim, one CTA, generous air ── */}
        <section style={{
          maxWidth: 900, margin: "0 auto", padding: "200px var(--gutter) 100px",
        }}>

          <Reveal>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 56,
            }}>
              <Link
                href="/#features"
                style={{
                  fontSize: 13, fontWeight: 600, color: "var(--t-faint)",
                  textDecoration: "none", letterSpacing: "-0.01em",
                }}
              >
                ← All modules
              </Link>
              {/* Module index — mono editorial marker, sets scale before anything else (Anchoring) */}
              <span style={{
                fontSize: 13, fontWeight: 700, color: "var(--t-faint)",
                fontFamily: "monospace", letterSpacing: "0.02em",
              }}>
                {moduleNumber} / 08
              </span>
            </div>
          </Reveal>

          <Reveal delay={70}>
            <div style={{ fontSize: 40, marginBottom: 28, lineHeight: 1 }}>
              {feature.icon}
            </div>
          </Reveal>

          <Reveal delay={110}>
            <h1 style={{
              fontSize: "clamp(40px, 6vw, 76px)",
              fontWeight: 900, lineHeight: 1.02,
              letterSpacing: "-0.045em", color: "var(--t-primary)",
              marginBottom: 28, maxWidth: 780,
            }}>
              {feature.tagline}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p style={{
              fontSize: 19, lineHeight: 1.65, color: "var(--t-tertiary)",
              maxWidth: 560, marginBottom: 40, fontWeight: 400,
            }}>
              {feature.overview}
            </p>
          </Reveal>

          {/* Hick's Law — exactly one real CTA; the second option is a
              quiet inline link, not a competing button */}
          <Reveal delay={200}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <a href={DEMO_URL} className="btn btn--primary" style={{ padding: "14px 32px" }}>
                Book Demo →
              </a>
              <a
                href={SIGNUP_URL}
                style={{
                  fontSize: 14, fontWeight: 600, color: "var(--t-tertiary)",
                  textDecoration: "underline", textUnderlineOffset: 4,
                }}
              >
                or join the beta
              </a>
            </div>
          </Reveal>
        </section>

        {/* ── THE NUMBER — full-bleed, no card, no border (Von Restorff) ── */}
        <Reveal delay={60}>
          <section style={{
            padding: "100px var(--gutter) 120px",
            textAlign: "center",
            borderTop: "1px solid var(--s-border)",
            borderBottom: "1px solid var(--s-border)",
          }}>
            <div style={{
              fontSize: "clamp(72px, 14vw, 160px)",
              fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1,
              background: "linear-gradient(135deg, var(--c-indigo), var(--c-emerald))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", marginBottom: 20,
            }}>
              {feature.stat.value}
            </div>
            <div style={{
              fontSize: 15, fontWeight: 600, color: "var(--t-tertiary)",
              maxWidth: 420, margin: "0 auto", letterSpacing: "-0.01em",
            }}>
              {feature.stat.label}
            </div>
          </section>
        </Reveal>

        {/* ── CAPABILITIES + PROCESS — hairlines, not cards ── */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "120px var(--gutter)" }}>

          <div className="two-col-simple" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}>

            {/* What it does — editorial numbered list, no icons */}
            <div>
              <Reveal direction="left">
                <div style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--t-faint)", marginBottom: 32,
                }}>
                  What it does
                </div>
              </Reveal>
              <div>
                {feature.capabilities.map((c, i) => (
                  <Reveal key={c} direction="left" delay={i * 60}>
                    <div style={{
                      display: "flex", gap: 20, alignItems: "baseline",
                      padding: "20px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--s-border)",
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: "var(--t-faint)",
                        fontFamily: "monospace", flexShrink: 0, width: 20,
                      }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 16, lineHeight: 1.55, color: "var(--t-secondary)" }}>
                        {c}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* How it works — same numbered treatment, Goal-Gradient sequence */}
            <div>
              <Reveal direction="right">
                <div style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--t-faint)", marginBottom: 32,
                }}>
                  How it works
                </div>
              </Reveal>
              <div>
                {feature.howItWorks.map((step, i) => (
                  <Reveal key={step} direction="right" delay={i * 60}>
                    <div style={{
                      display: "flex", gap: 20, alignItems: "baseline",
                      padding: "20px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--s-border)",
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: "var(--c-indigo)",
                        fontFamily: "monospace", flexShrink: 0, width: 20,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 16, lineHeight: 1.55, color: "var(--t-secondary)" }}>
                        {step}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ── NEXT MODULE — one bold band, nothing else competing ── */}
        <Reveal delay={80}>
          <Link
            href={`/features/${next.slug}`}
            className="next-band"
            style={{
              display: "block", textDecoration: "none",
              background: "var(--c-ink)", padding: "72px var(--gutter)",
            }}
          >
            <div style={{
              maxWidth: 900, margin: "0 auto",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 24,
            }}>
              <div>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "#666",
                  textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
                }}>
                  Next module
                </div>
                <div style={{
                  fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800,
                  letterSpacing: "-0.03em", color: "#fff",
                }}>
                  {next.icon} {next.title}
                </div>
              </div>
              <span aria-hidden="true" className="next-arrow" style={{
                fontSize: 28, color: "#fff", transition: "transform 0.3s var(--ease)",
              }}>
                →
              </span>
            </div>
          </Link>
        </Reveal>

      </main>

      <style>{`
        .next-band:hover .next-arrow { transform: translateX(8px); }
        @media (max-width: 900px) {
          .two-col-simple { grid-template-columns: 1fr !important; gap: 56px !important; }
        }
      `}</style>

      <Footer />
    </>
  );
}