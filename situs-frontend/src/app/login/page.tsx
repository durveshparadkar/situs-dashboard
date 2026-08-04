"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { apiFetch } from "@/lib/api";

const QUOTES = [
  {
    text: "Situs didn't just show us our pipeline — it told us which three deals would make or break the quarter.",
    name: "Early Beta User",
    role: "Founder, SaaS startup",
  },
  {
    text: "We stopped guessing which leads to call first. The system just tells us now.",
    name: "Early Beta User",
    role: "Sales Lead",
  },
  {
    text: "The deal closes in the decision, not the data.",
    name: "Situs",
    role: "Product principle",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4 },
  }),
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    /* Wake up the backend immediately on page load — Render's free tier
       spins down on inactivity, so the first real request (login) would
       otherwise wait through a 30-50s cold start. Pinging /health here
       means the server is already warming up while the user types. */
    fetch("https://api.situsrevenue.com/health").catch(() => {
      /* best-effort — ignore failures, this is just a warm-up ping */
    });
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill all fields");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await apiFetch<{
        success?: boolean;
        message?: string;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      if (!data?.success) {
        setError(data?.message || "Invalid credentials");
        return;
      }

      window.location.href = "/dashboard";
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
    window.location.href = "https://api.situsrevenue.com/api/auth/google";
  };

  return (
    <div className="min-h-screen flex">

      {/* LEFT — ANIMATED GRADIENT + QUOTE */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 text-white p-12 flex-col justify-between relative overflow-hidden">

        {/* Animated mesh blobs */}
        <motion.div
          className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-emerald-500/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-slate-700/40 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* LOGO */}
        <motion.div
          className="relative z-10"
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <Image
            src="/situs-logo-light.png"
            alt="Situs Revenue"
            width={96}
            height={54}
            priority
            className="h-[54px] w-auto"
          />
        </motion.div>

        {/* QUOTE CARD */}
        <div className="relative z-10 max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={quoteIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <p className="text-xl leading-relaxed font-medium">
                &ldquo;{QUOTES[quoteIndex].text}&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-semibold text-emerald-300">
                  {QUOTES[quoteIndex].name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{QUOTES[quoteIndex].name}</p>
                  <p className="text-xs text-white/50">{QUOTES[quoteIndex].role}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Quote indicator dots */}
          <div className="flex gap-1.5 mt-4">
            {QUOTES.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === quoteIndex ? "w-6 bg-emerald-400" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>

        {/* STATS STRIP */}
        <motion.div
          className="relative z-10 flex items-center gap-6 text-[11px] text-white/40"
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <span>44 deals tracked</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>$460K+ pipeline managed</span>
        </motion.div>
      </div>

      {/* RIGHT — FORM */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6"
        >

          <motion.div
            className="lg:hidden flex justify-center"
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <Image
              src="/situs-logo.png"
              alt="Situs Revenue"
              width={71}
              height={40}
              className="h-10 w-auto"
            />
          </motion.div>

          <motion.div
            className="space-y-1"
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-slate-500">
              Continue managing your pipeline
            </p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            onClick={handleGoogle}
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="w-full flex items-center justify-center gap-3 border border-slate-300 text-slate-700 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] transition"
          >
            <Image
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              width={18}
              height={18}
            />
            Continue with Google
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <motion.div
            className="space-y-4"
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <div>
              <p className="text-xs text-slate-500 mb-1">Email</p>
              <input
                type="email"
                placeholder="you@company.com"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="email"
              />
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Password</p>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="current-password"
              />
              <div className="text-right mt-1.5">
                <span
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer hover:underline"
                >
                  Forgot password?
                </span>
              </div>
            </div>
          </motion.div>

          <motion.button
            onClick={handleLogin}
            disabled={loading}
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="w-full group bg-black text-white py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? "Logging in..." : "Continue"}
            {!loading && (
              <span className="inline-block transition-transform group-hover:translate-x-0.5">
                →
              </span>
            )}
          </motion.button>

          <motion.p
            className="text-[11px] text-center text-slate-400"
            custom={5}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            🔒 Secured with industry-standard encryption
          </motion.p>

          <p className="text-sm text-center text-slate-500">
            Don&apos;t have an account?{" "}
            <span
              onClick={() => router.push("/signup")}
              className="text-slate-900 font-medium cursor-pointer hover:underline"
            >
              Sign up
            </span>
          </p>

        </motion.div>
      </div>
    </div>
  );
}