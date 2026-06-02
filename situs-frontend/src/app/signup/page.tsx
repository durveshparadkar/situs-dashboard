"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { apiFetch } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    <div className="min-h-screen bg-[#0B0B0F]">

      <div className="flex items-center justify-center px-4 py-16">

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md bg-[#111116] border border-white/10 rounded-2xl p-8 space-y-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >

          {/* LOGO */}
          <div className="text-center">
            <h1 className="text-white text-xs tracking-[0.35em] font-semibold">
              SITUS
            </h1>
          </div>

          {/* HEADING */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-semibold text-white">
              Create account
            </h2>
            <p className="text-sm text-slate-400">
              Start closing deals smarter
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* GOOGLE */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 rounded-lg font-medium hover:opacity-90 active:scale-[0.98]"
          >
            <Image
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              width={20}
              height={20}
            />
            Sign up with Google
          </button>

          {/* DIVIDER */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* INPUTS */}
          <div className="space-y-4">

            <input
              type="text"
              placeholder="Full name"
              className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              autoComplete="name"
            />

            <input
              type="email"
              placeholder="Email"
              className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              autoComplete="email"
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              autoComplete="new-password"
            />

            <input
              type="text"
              placeholder="Company name (optional)"
              className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              autoComplete="organization"
            />

            {/* PASSWORD HINT */}
            <p className="text-xs text-slate-500">
              Minimum 8 characters
            </p>

          </div>

          {/* BUTTON */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full bg-white text-black py-3 rounded-lg font-medium hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          {/* FOOTER */}
          <p className="text-sm text-center text-slate-500">
            Already have an account?{" "}
            <span
              onClick={() => router.push("/login")}
              className="text-white cursor-pointer hover:underline"
            >
              Login
            </span>
          </p>

        </motion.div>

      </div>
    </div>
  );
}