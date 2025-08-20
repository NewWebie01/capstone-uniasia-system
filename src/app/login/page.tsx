"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import splashImage from "@/assets/tools-log-in-splash.jpg";
import Image from "next/image";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import MenuIcon from "@/assets/menu.svg";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import supabase from "@/config/supabaseClient";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage("Incorrect email or password.");
      setPassword("");
      setIsLoading(false);
      return;
    }

    const user = data?.user;
    const role = user?.user_metadata?.role;

    if (role === "admin") {
      router.push("/dashboard"); // Redirects admin to /dashboard (not /admin/dashboard)
    } else if (role === "customer") {
      router.push("/customer/product-catalog");
    } else {
      setErrorMessage("Access denied: No role found for this account.");
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col relative ${dmSans.className}`}>
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
              {/* Logo */}
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

              {/* Mobile Menu */}
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
                    <a
                      href="/"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-[#ffba20] transition"
                    >
                      ← Back to Home
                    </a>
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
        className="flex-grow flex items-center justify-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4 pt-16 pb-10"
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
              {/* Email Field */}
              <div className="flex flex-col text-left">
                <label
                  htmlFor="username"
                  className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Password Field */}
              <div className="flex flex-col text-left relative">
                <label
                  htmlFor="password"
                  className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]"
                >
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 pr-10 disabled:opacity-60"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-9"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff size={20} className="text-gray-600" />
                  ) : (
                    <Eye size={20} className="text-gray-600" />
                  )}
                </button>
              </div>

              {/* Error */}
              {errorMessage && (
                <p className="text-red-600 text-sm -mt-3">{errorMessage}</p>
              )}

              {/* Remember Me */}
              <div className="flex gap-1 items-center">
                <input type="checkbox" disabled={isLoading} />
                <span className="text-base">Remember Password</span>
              </div>

              {/* Submit */}
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
          </div>

          {/* Splash Image */}
          <Image
            src={splashImage}
            alt="Splash Image"
            className="w-full lg:w-[450px] object-cover hidden lg:block"
            priority
          />
        </div>
      </motion.section>
    </div>
  );
}
