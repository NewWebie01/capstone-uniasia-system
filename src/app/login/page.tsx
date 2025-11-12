"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import splashImage from "@/assets/tools-log-in-splash.jpg";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import MenuIcon from "@/assets/menu.svg";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Filter out Supabase PKCE noise we don't want to show to users */
const isNoisyPkceError = (m?: string) =>
  !!m &&
  /(both auth code and code verifier should be non-empty|invalid flow state)/i.test(
    m ?? ""
  );

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const didNavigate = useRef(false);
  const [checking, setChecking] = useState(true);

  // Read URL ?error / ?error_description once and clean them
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const raw =
      url.searchParams.get("error") ||
      url.searchParams.get("error_description");
    if (raw) {
      const msg = decodeURIComponent(raw);
      if (!isNoisyPkceError(msg)) {
        toast.error(msg);
      }
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Prefill remembered email & warm up session
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedEmail = localStorage.getItem("rememberedEmail");
        if (savedEmail && mounted) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch {}
      await supabase.auth.getSession();
      if (!mounted) return;
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function shouldBypassOtp(email: string): boolean {
    const otpVerified = localStorage.getItem("otpVerified") === "true";
    const otpVerifiedEmail = localStorage.getItem("otpVerifiedEmail");
    const otpVerifiedExpiry = parseInt(
      localStorage.getItem("otpVerifiedExpiry") || "0",
      10
    );
    return (
      otpVerified &&
      otpVerifiedEmail === email.trim() &&
      Date.now() < otpVerifiedExpiry
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || didNavigate.current) return;

    setIsLoading(true);
    setErrorMessage("");

    // 1) Password login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const msg = error.message ?? "";

      // Quiet the PKCE noise; show clear messages for real auth errors
      if (!isNoisyPkceError(msg)) {
        if (/email not confirmed/i.test(msg)) {
          setErrorMessage("Please verify your email first, then try again.");
        } else if (/invalid login credentials/i.test(msg)) {
          // We can’t 100% tell “not registered” on client without service role,
          // so present the most helpful guidance:
          setErrorMessage("Account not registered or wrong password.");
        } else {
          setErrorMessage(msg);
        }
      }
      setPassword("");
      setIsLoading(false);
      return;
    }

    try {
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email.trim());
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    } catch {}

    await supabase.auth.getSession();
    const user = data?.user;
    const role = (user?.user_metadata?.role as string | undefined) ?? undefined;

    // 2) Skip-OTP window (1hr)
    if (shouldBypassOtp(email)) {
      didNavigate.current = true;
      supabase
        .from("activity_logs")
        .insert([
          {
            user_email: user?.email ?? null,
            user_role: role ?? null,
            action: "Login",
            details: {},
            created_at: new Date().toISOString(),
          },
        ])
        .then(({ error: logError }) => {
          if (logError)
            console.error("Failed to insert activity log:", logError);
        });

      if (role === "admin") router.replace("/dashboard");
      else if (role === "customer") router.replace("/customer/product-catalog");
      else {
        setErrorMessage("Access denied: No role found for this account.");
        await supabase.auth.signOut();
        didNavigate.current = false;
        setIsLoading(false);
      }
      return;
    }

    // 3) OTP required
    const newOtp = generateOTP();
    const otpExpiry = Date.now() + 60 * 60 * 1000; // 1 hour trusted session

    localStorage.setItem("otpCode", newOtp);
    localStorage.setItem("otpExpiry", (Date.now() + 5 * 60 * 1000).toString());
    localStorage.setItem("otpEmail", email.trim());
    localStorage.setItem("otpVerified", "false");
    localStorage.setItem("otpVerifiedEmail", email.trim());
    localStorage.setItem("otpVerifiedExpiry", otpExpiry.toString());

    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), otp: newOtp }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setErrorMessage("Failed to send OTP. Please try again.");
        setIsLoading(false);
        return;
      }
    } catch {
      setErrorMessage("Failed to send OTP. Please try again.");
      setIsLoading(false);
      return;
    }

    router.replace(
      `/otp-verification?email=${encodeURIComponent(email.trim())}`
    );
  };

  if (checking) return null;

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden relative ${dmSans.className}`}
    >
      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="loader"
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl px-8 py-6 flex items-center gap-3"
            >
              <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
              <span className="text-sm font-medium text-gray-700">
                Signing in…
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 backdrop-blur-sm z-20">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <div className="inline-flex gap-1 items-center">
            <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
          </div>
        </div>
        <div className="py-5">
          <div className="container">
            <div className="flex items-center justify-between relative">
              <motion.button
                onClick={() => router.push("/")}
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 300 }}
                aria-label="Go to Home"
              >
                <Image
                  src={Logo}
                  alt="UniAsia Logo"
                  height={50}
                  width={50}
                  className="cursor-pointer"
                />
              </motion.button>
              <MenuIcon
                className="h-5 w-5 md:hidden cursor-pointer"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              />
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-10 w-48 bg-white rounded-lg shadow-lg z-50 md:hidden"
                  >
                    <Link
                      href="/"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-[#ffba20] transition"
                    >
                      ← Back to Home
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Login Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-grow flex items-center justify-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4"
      >
        <div className="w-full max-w-4xl flex flex-col lg:flex-row bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Form Box */}
          <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 lg:p-16 gap-8 w-full lg:w-1/2">
            <h1 className="section-title text-4xl sm:text-5xl font-bold">
              Welcome
            </h1>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6 w-full max-w-sm"
            >
              {/* Email */}
              <div className="flex flex-col text-left">
                <label
                  htmlFor="username"
                  className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]"
                >
                  Email Address
                </label>
                <input
                  id="username"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Password */}
              <div className="flex flex-col text-left">
                <label
                  htmlFor="password"
                  className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
                  required
                  disabled={isLoading}
                />
              </div>

              {errorMessage && (
                <p className="text-red-600 text-sm -mt-3">{errorMessage}</p>
              )}

              <div className="flex gap-2 items-center">
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                />
                <label htmlFor="remember" className="text-base cursor-pointer">
                  Remember Password
                </label>
              </div>

              <motion.button
                type="submit"
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: isLoading ? 1 : 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="px-10 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  "Login"
                )}
              </motion.button>
            </form>

            <p className="text-sm text-gray-600">
              Don’t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/account_creation")}
                className="text-[#181918] font-medium hover:text-[#ffba20] transition-colors"
              >
                Sign Up
              </button>
            </p>

            <button
              type="button"
              onClick={() => router.push("/reset")}
              className="text-xs text-gray-500 underline hover:text-[#ffba20] transition-colors mb-1"
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-xs text-gray-500 underline hover:text-[#ffba20] transition-colors mt-2"
            >
              Privacy Policy
            </button>
          </div>

          <Image
            src={splashImage}
            alt="Splash Image"
            className="w-full lg:w-[450px] object-cover hidden lg:block"
            priority
          />
        </div>

        {/* Privacy modal */}
        <AnimatePresence>
          {showPrivacy && (
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowPrivacy(false);
              }}
            >
              <motion.div
                initial={{ scale: 0.98, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.98, y: 40, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl relative"
                role="dialog"
                aria-modal="true"
              >
                <button
                  onClick={() => setShowPrivacy(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors"
                  aria-label="Close"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    width={20}
                    height={20}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                <h2 className="text-2xl font-bold mb-2 text-[#181918]">
                  Privacy Policy
                </h2>
                <div className="text-gray-700 text-sm leading-relaxed space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  <p>
                    <b>UniAsia Hardware & Electrical Marketing Corp</b> values
                    your privacy. We collect only the necessary information
                    (such as email and password) to authenticate your account
                    and provide access to our services.
                  </p>
                  <p>
                    Your credentials are never shared or sold. We may use your
                    email to communicate important account information or
                    security alerts.
                  </p>
                  <p>
                    For support or more details, contact{" "}
                    <a
                      href="mailto:support@uniasia.com"
                      className="underline text-[#ffba20]"
                    >
                      support@uniasia.com
                    </a>
                    .
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    Last updated: September 2025
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
