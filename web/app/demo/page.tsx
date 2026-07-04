"use client";

import { useState } from "react";
import Link from "next/link";
import { GLOBAL_STYLES } from "../components/shared/constants";

const API_BASE = "https://api.situsrevenue.com";

export default function DemoRequestPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE}/api/public/demo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Something went wrong. Please try again.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = (fieldName: string): React.CSSProperties => ({
    width: "100%",
    padding: "13px 16px",
    fontSize: 15,
    border: `1.5px solid ${focused === fieldName ? "#10B981" : "var(--s-border-2)"}`,
    borderRadius: "var(--r-md)",
    outline: "none",
    boxShadow: focused === fieldName ? "0 0 0 4px rgba(16,185,129,0.1)" : "none",
    transition: "all 0.15s ease",
    background: "var(--s-base)",
    color: "var(--t-primary)",
    fontFamily: "inherit",
  });

  return (
    <>
      <style>{GLOBAL_STYLES}</style>

      <div style={{ minHeight: "100vh", display: "flex" }}>

        {/* LEFT — VALUE PROP (hidden on mobile, matches app's split-screen pattern) */}
        <div
  className="hide-mobile demo-left-panel"
  style={{
    width: "44%",
            background: "linear-gradient(160deg, #0A0A0A 0%, #1A1A1A 100%)",
            color: "#fff",
            padding: "56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.04,
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <Link
              href="/"
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "rgba(255,255,255,0.9)",
                textDecoration: "none",
              }}
            >
              Situs
            </Link>
          </div>

          <div style={{ position: "relative", zIndex: 1, maxWidth: 380 }}>
            <p style={{ fontSize: 22, lineHeight: 1.5, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 28 }}>
              &ldquo;Situs told us which deals would make or break the quarter — before we asked.&rdquo;
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(16,185,129,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "#34D399",
                }}
              >
                B
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Early Beta User</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Founder, SaaS startup</p>
              </div>
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 24, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            <span>44 deals tracked</span>
            <span>•</span>
            <span>₹3.8Cr+ pipeline managed</span>
          </div>
        </div>

        {/* RIGHT — FORM */}
        <div
          className="demo-right-panel"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            background: "var(--s-base)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 440 }}>

            <Link
              href="/"
              className="hide-desktop"
              style={{
                fontSize: 13,
                color: "var(--t-tertiary)",
                textDecoration: "none",
                display: "inline-block",
                marginBottom: 24,
              }}
            >
              ← Back to Situs
            </Link>

            {!submitted ? (
              <>
                <h1 className="h-section" style={{ fontSize: 32, marginBottom: 10, letterSpacing: "-0.03em" }}>
                  Let&apos;s show you Situs.
                </h1>
                <p className="t-lead" style={{ fontSize: 15, marginBottom: 32, color: "var(--t-secondary)" }}>
                  Tell us a bit about you — we&apos;ll reach out within 24 hours to set up a time.
                </p>

                {error && (
                  <div
                    role="alert"
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: "var(--r-md)",
                      padding: "12px 16px",
                      marginBottom: 20,
                      fontSize: 14,
                      color: "#DC2626",
                    }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Full name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onFocus={() => setFocused("name")}
                        onBlur={() => setFocused(null)}
                        placeholder="Jane Doe"
                        style={fieldStyle("name")}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Company</label>
                      <input
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        onFocus={() => setFocused("company")}
                        onBlur={() => setFocused(null)}
                        placeholder="Optional"
                        style={fieldStyle("company")}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Work email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocused("email")}
                      onBlur={() => setFocused(null)}
                      placeholder="you@company.com"
                      style={fieldStyle("email")}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>
                      What are you hoping to get from the demo?{" "}
                      <span style={{ fontWeight: 400, color: "var(--t-faint)" }}>(optional)</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onFocus={() => setFocused("message")}
                      onBlur={() => setFocused(null)}
                      placeholder="e.g. I want to see how deal risk scoring works"
                      rows={3}
                      style={{ ...fieldStyle("message"), resize: "vertical" }}
                    />
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn btn--primary"
                    style={{ width: "100%", marginTop: 4, opacity: loading ? 0.6 : 1 }}
                  >
                    {loading ? "Sending…" : "Request demo →"}
                  </button>

                  <p style={{ fontSize: 12, color: "var(--t-faint)", textAlign: "center", marginTop: -6 }}>
                    🔒 We&apos;ll never share your information. No spam, ever.
                  </p>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div
                  style={{
                    width: 60, height: 60, borderRadius: "50%",
                    background: "rgba(16,185,129,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 24px",
                  }}
                >
                  <span style={{ fontSize: 26 }}>✓</span>
                </div>
                <h2 className="h-section" style={{ fontSize: 28, marginBottom: 12 }}>
                  Thanks, {name.split(" ")[0]}.
                </h2>
                <p className="t-lead" style={{ marginBottom: 28 }}>
                  We&apos;ll reach out to <strong>{email}</strong> within 24 hours to schedule your demo.
                </p>
                <Link href="/" className="btn btn--secondary" style={{ display: "inline-flex" }}>
                  ← Back to homepage
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
  @media (max-width: 900px) {
    .hide-desktop { display: inline-block !important; }
    .demo-left-panel { display: none !important; }
    .demo-right-panel { padding: 32px 20px !important; }
  }
  @media (min-width: 901px) {
    .hide-desktop { display: none !important; }
  }
`}</style>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--t-secondary)",
  display: "block",
  marginBottom: 7,
};