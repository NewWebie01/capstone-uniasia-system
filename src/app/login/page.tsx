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

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

const isNoisyPkceError = (m?: string) =>
  !!m &&
  /(both auth code and code verifier should be non-empty|invalid flow state)/i.test(
    m ?? "",
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const raw =
      url.searchParams.get("error") ||
      url.searchParams.get("error_description");
    if (raw) {
      const msg = decodeURIComponent(raw);
      if (!isNoisyPkceError(msg)) toast.error(msg);
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    try {
      const savedEmail = localStorage.getItem("rememberedEmail");
      if (savedEmail && mounted) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {}

    if (mounted) setChecking(false);

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || didNavigate.current) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(payload?.message || "Login failed.");
        setPassword("");
        setIsLoading(false);
        return;
      }

      const role = payload?.role as string | undefined;

      if (!role) {
        setErrorMessage("Access denied: No role found for this account.");
        setIsLoading(false);
        return;
      }

      if (rememberMe) localStorage.setItem("rememberedEmail", email.trim());
      else localStorage.removeItem("rememberedEmail");

      // routing
      if (role === "admin") router.replace("/dashboard");
      else if (role === "customer") router.replace("/customer/product-catalog");
      else if (role === "cashier") router.replace("/sales");
      else if (role === "warehouse") router.replace("/inventory");
      else if (role === "trucker") router.replace("/logistics");
      else setErrorMessage("Access denied: Role not recognized.");
    } catch (err) {
      setErrorMessage("Server error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

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

            {/* <p className="text-sm text-gray-600">
              Don’t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/account_creation")}
                className="text-[#181918] font-medium hover:text-[#ffba20] transition-colors"
              >
                Sign Up
              </button>
            </p> */}

            <button
              type="button"
              onClick={() => router.push("/auth/reset")}
              className="text-xs text-gray-500 underline hover:text-[#ffba20] transition-colors mb-1"
            >
              Forgot password?
            </button>

            {/* <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-xs text-gray-500 underline hover:text-[#ffba20] transition-colors mt-2"
            >
              Privacy Policy
            </button> */}
          </div>

          <Image
            src={splashImage}
            alt="Splash Image"
            className="w-full lg:w-[450px] object-cover hidden lg:block"
            priority
          />
        </div>

        {/* Privacy modal (keep your existing block here) */}
      </motion.section>
    </div>
  );
}
