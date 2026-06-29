"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { apiFetch } from "@/lib/api";

/* ================= QUOTES (left panel rotation) ================= */

const QUOTES = [
  {
    text: "We stopped guessing which leads to call first. The system just tells us now.",
    name: "Early Beta User",
    role: "Sales Lead",
  },
  {
    text: "Not another CRM to feed. A reason to act.",
    name: "Situs",
    role: "Product principle",
  },
  {
    text: "Situs told us which three deals would make or break the quarter — before we asked.",
    name: "Early Beta User",
    role: "Founder, SaaS startup",
  },
];

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(0);

  /* Rotate quote every 5s */
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  /* ================= SIGNUP ================= */

  const handleSignup = async () => {
    /* Validate */
    if (!fullName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email.trim() || !password) {
      setError("Please fill all required fields");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      setLoading(true);
      setError("");

      /* Build request body — only include organizationName if user typed one.
         Backend treats it as optional. */
      const body: {
        email:             string;
        password:          string;
        fullName:          string;
        organizationName?: string;
      } = {
        email:    email.trim().toLowerCase(),
        password: password,
        fullName: fullName.trim(),
      };

      const trimmedOrg = organizationName.trim();
      if (trimmedOrg) {
        body.organizationName = trimmedOrg;
      }

      /* Backend sets httpOnly accessToken + refreshToken cookies on success */
      const data = await apiFetch<{
        success: boolean;
        message?: string;
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!data?.success) {
        setError(data?.message || "Signup failed");
        return;
      }

      router.push("/dashboard");
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

  const handleGoogle = () => {
    setError("Google auth not implemented yet");
  };

  /* ================= UI ================= */

  return (
    <div className="min-h-screen flex">

      {/* LEFT — GRADIENT + QUOTE (matches dashboard hero cards) */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-950 to-slate-800 text-white p-12 flex-col justify-between relative overflow-hidden">

        {/* Subtle background texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* LOGO */}
        <div className="relative z-10">
          <p className="text-sm font-semibold tracking-[0.2em]">SITUS</p>
          <p className="text-[11px] text-white/40 mt-1">Revenue OS</p>
        </div>

        {/* QUOTE */}
        <div className="relative z-10 max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={quoteIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-2xl leading-relaxed font-medium">
                &ldquo;{QUOTES[quoteIndex].text}&rdquo;
              </p>
              <div className="mt-6">
                <p className="text-sm font-medium">{QUOTES[quoteIndex].name}</p>
                <p className="text-xs text-white/50">{QUOTES[quoteIndex].role}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer note */}
        <p className="relative z-10 text-[11px] text-white/30">
          AI-powered decision intelligence for revenue teams
        </p>
      </div>

      {/* RIGHT — FORM (matches dashboard card style) */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6"
        >

          {/* Mobile-only logo */}
          <div className="lg:hidden text-center">
            <p className="text-sm font-semibold tracking-[0.2em] text-slate-900">
              SITUS
            </p>
          </div>

          {/* HEADING */}
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-slate-900">
              Create account
            </h2>
            <p className="text-sm text-slate-500">
              Start closing deals smarter
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* GOOGLE */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 border border-slate-300 text-slate-700 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-50 active:scale-[0.98] transition"
          >
            <Image
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              width={18}
              height={18}
            />
            Sign up with Google
          </button>

          {/* DIVIDER */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* INPUTS */}
          <div className="space-y-4">

            <div>
              <p className="text-xs text-slate-500 mb-1">Full name</p>
              <input
                type="text"
                placeholder="Your name"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-400"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                autoComplete="name"
              />
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Email</p>
              <input
                type="email"
                placeholder="you@company.com"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                autoComplete="email"
              />
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Password</p>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                autoComplete="new-password"
              />
              <p className="text-xs text-slate-400 mt-1">
                Minimum 8 characters
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">
                Company name (optional)
              </p>
              <input
                type="text"
                placeholder="Acme Inc."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-400"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                autoComplete="organization"
              />
            </div>

          </div>

          {/* BUTTON — matches dashboard's solid black CTA pattern */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition"
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          {/* FOOTER */}
          <p className="text-sm text-center text-slate-500">
            Already have an account?{" "}
            <span
              onClick={() => router.push("/login")}
              className="text-slate-900 font-medium cursor-pointer hover:underline"
            >
              Login
            </span>
          </p>

        </motion.div>

      </div>
    </div>
  );
}