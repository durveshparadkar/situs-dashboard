import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { Reveal } from "../../components/shared/Reveal";
import { FEATURE_DETAILS, getFeatureBySlug } from "../../components/shared/feature-details";
import { DEMO_URL, SIGNUP_URL, GLOBAL_STYLES } from "../../components/shared/constants";

/* ─────────────────────────────────────────────────────────────
   FEATURE DETAIL PAGE — /features/[slug]
   UX laws applied (annotated inline):
   • Jakob's Law         — hero → proof → two-column detail →
                           next-step, the pattern every reader
                           already expects from a docs/feature page
   • Serial Position     — stat highlight leads (primacy), "Next
                           module" card closes (recency) before Footer
   • Von Restorff        — the stat highlight is the one gradient
                           callout on an otherwise clean page
   • Miller's Law        — capabilities and steps chunked into two
                           short columns, never one long list
   • Goal-Gradient       — numbered 1-2-3 "How it works" steps read
                           as a short, near-complete process
   • Aesthetic-Usability — staggered Reveal entrances reuse the same
                           motion language as the homepage
   • Fitts's Law         — full-width "Next module" card, generous
                           CTA padding
   • Peak-End Rule       — page closes on Footer, same as every
                           other page — no jarring dead end
   ───────────────────────────────────────────────────────────── */

type Params = Promise<{ slug: string }>;

/* Pre-render all 8 feature pages at build time */
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

  return (
    <>
      {/* Fix: this page never loaded the design system before — every
          .badge/.btn/.h-display class and --var() token resolved to
          nothing, hence the black/unstyled screen. Same injection the
          homepage uses. */}
      <style>{GLOBAL_STYLES}</style>

      <Nav />

      <main style={{ paddingTop: 168, paddingBottom: 0, position: "relative", overflow: "hidden" }}>

        {/* Ambient mesh — same visual language as every other section */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: -160, right: -160,
            width: 600, height: 600, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
            filter: "blur(60px)",
          }} />
          <div style={{
            position: "absolute", top: 300, left: -160,
            width: 500, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)",
            filter: "blur(60px)",
          }} />
        </div>

        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--gutter)", position: "relative" }}>

          {/* Breadcrumb */}
          <Reveal>
            <Link
              href="/#features"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, fontWeight: 600, color: "var(--t-tertiary)",
                textDecoration: "none", marginBottom: 32,
                transition: "gap 0.2s var(--ease), color 0.2s var(--ease)",
              }}
            >
              ← All modules
            </Link>
          </Reveal>

          {/* Hero */}
          <Reveal delay={60}>
            <div style={{ maxWidth: 720, marginBottom: 56 }}>
              <div aria-hidden="true" style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 56, fontSize: 26,
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: 14, marginBottom: 24,
                boxShadow: "0 8px 24px rgba(99,102,241,0.1)",
              }}>
                {feature.icon}
              </div>

              <div className="badge">Product · {feature.title}</div>

              <h1 className="h-display" style={{ marginBottom: 20, maxWidth: 680 }}>
                {feature.tagline}
              </h1>

              <p className="t-lead" style={{ fontSize: 19, maxWidth: 620 }}>
                {feature.overview}
              </p>
            </div>
          </Reveal>

          {/* CTAs */}
          <Reveal delay={110}>
            <div className="btn-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 56 }}>
              <a href={DEMO_URL} className="btn btn--primary">Book Demo →</a>
              <a href={SIGNUP_URL} className="btn btn--secondary">Join Beta</a>
            </div>
          </Reveal>

          {/* Stat highlight — Von Restorff: the one gradient callout on the page */}
          <Reveal delay={150}>
            <div style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(16,185,129,0.05))",
              border: "1px solid rgba(99,102,241,0.12)",
              borderRadius: "var(--r-xl)", padding: "32px 40px",
              display: "flex", alignItems: "center", gap: 24,
              marginBottom: 80, position: "relative", overflow: "hidden",
            }}>
              <div aria-hidden="true" style={{
                position: "absolute", top: -40, right: -40,
                width: 140, height: 140, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
              }} />
              <div style={{
                fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em",
                color: "var(--c-indigo)", position: "relative", flexShrink: 0,
              }}>
                {feature.stat.value}
              </div>
              <div style={{ fontSize: 15, color: "var(--t-secondary)", fontWeight: 500, maxWidth: 360, position: "relative" }}>
                {feature.stat.label}
              </div>
            </div>
          </Reveal>

          {/* Two-column: capabilities + how it works (Miller's Law chunking) */}
          <div className="two-col" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64,
            marginBottom: 96,
          }}>
            <Reveal direction="left" delay={100}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 24, color: "var(--t-primary)" }}>
                  What it does
                </h2>
                <ul style={{ display: "flex", flexDirection: "column", gap: 16, listStyle: "none" }}>
                  {feature.capabilities.map((c) => (
                    <li key={c} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <span aria-hidden="true" style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#16A34A", fontWeight: 700,
                      }}>✓</span>
                      <span style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.6 }}>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal direction="right" delay={150}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 24, color: "var(--t-primary)" }}>
                  How it works
                </h2>
                {/* Goal-Gradient: numbered 1-2-3 reads as an almost-finished process */}
                <ol style={{ display: "flex", flexDirection: "column", gap: 20, listStyle: "none" }}>
                  {feature.howItWorks.map((step, i) => (
                    <li key={step} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                        background: "var(--c-ink)", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.6, paddingTop: 3 }}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          </div>

          {/* Next module nav — Serial Position: last thing read before Footer */}
          <Reveal delay={200}>
            <Link
              href={`/features/${next.slug}`}
              className="next-module-card"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "28px 32px", marginBottom: 100,
                background: "var(--s-raised)", border: "1px solid var(--s-border)",
                borderRadius: "var(--r-xl)", textDecoration: "none",
                transition: "border-color 0.25s var(--ease), background 0.25s var(--ease), transform 0.25s var(--ease)",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  Next module
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--t-primary)" }}>
                  {next.icon} {next.title}
                </div>
              </div>
              <span aria-hidden="true" style={{ fontSize: 20, color: "var(--c-indigo)" }}>→</span>
            </Link>
          </Reveal>

        </div>
      </main>

      {/* Hover polish for the next-module card — plain CSS since this
          is a server component and can't use onMouseEnter handlers */}
      <style>{`
        .next-module-card:hover {
          border-color: rgba(99,102,241,0.3) !important;
          background: #fff !important;
          transform: translateY(-2px);
        }
        @media (max-width: 900px) {
          .two-col { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>

      <Footer />
    </>
  );
}