"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This reset link is invalid or missing a token.");
    }
  }, [token]);

  const handleSubmit = async () => {
    if (!token) {
      setError("This reset link is invalid.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await apiFetch<{ success: boolean; message?: string }>(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({ token, password }),
        }
      );

      setSuccess(true);

      /* Redirect to login after a short pause */
      setTimeout(() => router.push("/login"), 2500);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. The link may have expired.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* LEFT — GRADIENT PANEL */}
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
            &ldquo;Almost there. Set a new password and get back to your
            pipeline.&rdquo;
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

          {!success ? (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                  Set a new password
                </h2>
                <p className="text-sm text-slate-500">
                  Choose a strong password for your account.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    New password
                  </p>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Minimum 8 characters
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    Confirm password
                  </p>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !token}
                className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </>
          ) : (
            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                Password reset ✓
              </h2>
              <p className="text-sm text-slate-500">
                Redirecting you to login...
              </p>
            </div>
          )}

          <p className="text-sm text-center text-slate-500">
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

/* Suspense boundary required since useSearchParams needs one in Next.js App Router */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}