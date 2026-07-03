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

  return (
    <>
      <style>{GLOBAL_STYLES}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "var(--s-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 460 }}>

          <Link
            href="/"
            style={{
              fontSize: 14,
              color: "var(--t-tertiary)",
              textDecoration: "none",
              display: "inline-block",
              marginBottom: 32,
            }}
          >
            ← Back to Situs
          </Link>

          {!submitted ? (
            <>
              <div className="badge">Book a demo</div>
              <h1 className="h-section" style={{ marginBottom: 12 }}>
                Let&apos;s show you Situs.
              </h1>
              <p className="t-lead" style={{ marginBottom: 36 }}>
                Tell us a bit about you, and we&apos;ll reach out within 24 hours to set up a time.
              </p>

              {error && (
                <div
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

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-secondary)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Full name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-secondary)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Work email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-secondary)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Company{" "}
                    <span style={{ fontWeight: 400, color: "var(--t-faint)" }}>
                      (optional)
                    </span>
                  </label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Company name"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--t-secondary)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    What are you hoping to get from the demo?{" "}
                    <span style={{ fontWeight: 400, color: "var(--t-faint)" }}>
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. I want to see how deal risk scoring works"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn btn--primary"
                  style={{ width: "100%", marginTop: 8, opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? "Sending..." : "Request demo"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(16,185,129,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <span style={{ fontSize: 24 }}>✓</span>
              </div>
              <h2 className="h-section" style={{ fontSize: 28, marginBottom: 12 }}>
                Thanks, {name.split(" ")[0]}.
              </h2>
              <p className="t-lead">
                We&apos;ll reach out to <strong>{email}</strong> within 24 hours to
                schedule your demo.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 15,
  border: "1px solid var(--s-border-2)",
  borderRadius: "var(--r-md)",
  outline: "none",
  transition: "border-color 0.15s ease",
  background: "var(--s-base)",
  color: "var(--t-primary)",
};