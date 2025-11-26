// src/app/reset/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DM_Sans } from "next/font/google";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import { motion } from "framer-motion";
import Image from "next/image";
import supabase from "@/config/supabaseClient";
import "@/styles/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Figure out the correct origin:
    // - on browser: use window.location.origin (localhost or production)
    // - on server: fall back to NEXT_PUBLIC_SITE_URL or your live domain
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "https://www.uniasia.shop";

    const trimmedEmail = email.trim();

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${origin}/update-password`,
    });

    if (error) {
      console.error("resetPasswordForEmail error:", error);
      setError(
        "Could not send reset email. Please check your email address and try again."
      );
      setSent(false);
    } else {
      setSent(true);
    }

    setIsLoading(false);
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4 ${dmSans.className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl flex flex-col items-center py-10 px-7"
      >
        <Image
          src={Logo}
          alt="UNIASIA Logo"
          width={60}
          height={60}
          className="mb-2"
        />
        <h1 className="text-2xl font-bold mb-6 text-[#181918] text-center">
          Reset Password
        </h1>

        {sent ? (
          <div className="text-green-600 text-center">
            If this email is registered, a reset link was sent!
            <br />
            Please check your inbox (and spam folder).
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-5 w-full">
            <input
              type="email"
              placeholder="Enter your email"
              className="rounded-md p-2 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoFocus
            />
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: isLoading ? 1 : 1.04 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="bg-[#ffba20] hover:bg-[#ffd36f] text-black py-2 rounded font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send Reset Email"}
            </motion.button>
          </form>
        )}

        <button
          className="mt-5 text-xs underline text-gray-600 hover:text-[#ffba20] transition"
          onClick={() => router.push("/login")}
          type="button"
        >
          Back to login
        </button>
      </motion.div>
    </div>
  );
}
