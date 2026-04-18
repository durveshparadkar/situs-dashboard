"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";

export default function LoginPage() {
  <div className="bg-red-500 text-white p-10">
  TAILWIND WORKING
</div>
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");

    if (email === storedUser.email && password === storedUser.password) {
      localStorage.setItem("isLoggedIn", "true");
      router.push("/dashboard");
    } else {
      alert("Invalid credentials");
    }
  };

  const handleGoogle = () => {
    localStorage.setItem("isLoggedIn", "true");
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0B0B0F] px-4">

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
            Welcome back
          </h2>
          <p className="text-sm text-slate-400">
            Continue managing your pipeline
          </p>
        </div>

        {/* GOOGLE LOGIN */}
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 rounded-lg font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
        >
          <Image
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
            width={20}
            height={20}
          />
          Continue with Google
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
            type="email"
            placeholder="Email"
            className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none transition-all duration-200"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 rounded-lg bg-[#0F0F14] border border-white/10 text-white placeholder-slate-500 focus:border-white focus:ring-1 focus:ring-white/30 outline-none transition-all duration-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* BUTTON */}
        <button
          onClick={handleLogin}
          className="w-full bg-white text-black py-3 rounded-lg font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
        >
          Continue
        </button>

        {/* TRUST LINE */}
        <p className="text-xs text-center text-slate-500">
          Trusted by modern sales teams
        </p>

        {/* FOOTER */}
        <p className="text-sm text-center text-slate-500">
          Don’t have an account?{" "}
          <span
            onClick={() => router.push("/signup")}
            className="text-white cursor-pointer hover:underline"
          >
            Sign up
          </span>
        </p>
      

      </motion.div>
    </div>
  );
}