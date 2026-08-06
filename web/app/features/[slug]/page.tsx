import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { FEATURE_DETAILS, getFeatureBySlug } from "../../components/shared/feature-details";
import { DEMO_URL, SIGNUP_URL } from "../../components/shared/constants";

/* Pre-render all 8 feature pages at build time */
export function generateStaticParams() {
  return FEATURE_DETAILS.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const feature = getFeatureBySlug(params.slug);
  if (!feature) return {};
  return {
    title: `${feature.title} — Situs Revenue`,
    description: feature.desc,
  };
}

export default function FeaturePage({ params }: { params: { slug: string } }) {
  const feature = getFeatureBySlug(params.slug);
  if (!feature) notFound();

  const currentIndex = FEATURE_DETAILS.findIndex((f) => f.slug === feature.slug);
  const next = FEATURE_DETAILS[(currentIndex + 1) % FEATURE_DETAILS.length];

  return (
    <>
      <Nav />

      <main style={{ paddingTop: 168, paddingBottom: 0 }}>
        <div style={{ maxWidth: "var(--container)", margin: "0 auto", padding: "0 var(--gutter)" }}>

          {/* Breadcrumb */}
          <Link
            href="/#features"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 600, color: "var(--t-tertiary)",
              textDecoration: "none", marginBottom: 32,
            }}
          >
            ← All modules
          </Link>

          {/* Hero */}
          <div style={{ maxWidth: 720, marginBottom: 64 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 56, height: 56, fontSize: 26,
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 14, marginBottom: 24,
            }}>
              {feature.icon}
            </div>

            <div className="badge">Product · {feature.title}</div>

            <h1 className="h-display" style={{ marginBottom: 20 }}>
              {feature.tagline}
            </h1>

            <p className="t-lead" style={{ fontSize: 19 }}>
              {feature.overview}
            </p>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 80 }}>
            <a href={DEMO_URL} className="btn btn--primary">Book Demo →</a>
            <a href={SIGNUP_URL} className="btn btn--secondary">Join Beta</a>
          </div>

          {/* Stat highlight */}
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(16,185,129,0.04))",
            border: "1px solid rgba(99,102,241,0.1)",
            borderRadius: "var(--r-xl)", padding: "32px 40px",
            display: "flex", alignItems: "center", gap: 20,
            marginBottom: 80,
          }}>
            <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--c-indigo)" }}>
              {feature.stat.value}
            </div>
            <div style={{ fontSize: 15, color: "var(--t-secondary)", fontWeight: 500, maxWidth: 320 }}>
              {feature.stat.label}
            </div>
          </div>

          {/* Two-column: capabilities + how it works */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64,
            marginBottom: 100,
          }}>
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

            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 24, color: "var(--t-primary)" }}>
                How it works
              </h2>
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
          </div>

          {/* Next module nav */}
          <Link
            href={`/features/${next.slug}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "28px 32px", marginBottom: 100,
              background: "var(--s-raised)", border: "1px solid var(--s-border)",
              borderRadius: "var(--r-xl)", textDecoration: "none",
              transition: "border-color 0.25s var(--ease), background 0.25s var(--ease)",
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
            <span style={{ fontSize: 20, color: "var(--c-indigo)" }}>→</span>
          </Link>

        </div>
      </main>

      <Footer />
    </>
  );
}