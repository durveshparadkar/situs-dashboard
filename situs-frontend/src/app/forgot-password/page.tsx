"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    try {
      setLoading(true);
      setError("");

      /* Backend always responds success (even if email doesn't exist)
         to avoid leaking which emails are registered. */
      await apiFetch<{ success: boolean; message?: string }>(
        "/api/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }
      );

      setSubmitted(true);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* LEFT — GRADIENT PANEL (matches login/signup) */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10">
          <p className="text-sm font-semibold tracking-[0.2em]">SITUS</p>
          <p className="text-[11px] text-white/40 mt-1">Revenue OS</p>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-xl leading-relaxed font-medium">
            &ldquo;Forgot your password? It happens. Let&apos;s get you back
            into your pipeline.&rdquo;
          </p>
        </div>

        <p className="relative z-10 text-[11px] text-white/30">
          AI-powered decision intelligence for revenue teams
        </p>
      </div>

      {/* RIGHT — FORM */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6"
        >
          <div className="lg:hidden text-center">
            <p className="text-sm font-semibold tracking-[0.2em] text-slate-900">
              SITUS
            </p>
          </div>

          {!submitted ? (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                  Forgot password?
                </h2>
                <p className="text-sm text-slate-500">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <p className="text-xs text-slate-500 mb-1.5">Email</p>
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                  Check your email
                </h2>
                <p className="text-sm text-slate-500">
                  If an account exists for <strong>{email}</strong>, a
                  password reset link has been sent.
                </p>
              </div>

              <p className="text-xs text-slate-400">
                Didn&apos;t get it? Check your spam folder, or try again in a
                few minutes.
              </p>
            </>
          )}

          <p className="text-sm text-center text-slate-500">
            Remembered your password?{" "}
            <span
              onClick={() => router.push("/login")}
              className="text-slate-900 font-medium cursor-pointer hover:underline"
            >
              Back to login
            </span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}