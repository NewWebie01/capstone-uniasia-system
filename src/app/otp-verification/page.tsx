"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import splashImage from "@/assets/tools-log-in-splash.jpg";
import Image from "next/image";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import MenuIcon from "@/assets/menu.svg";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export const dynamic = "force-dynamic";

export default function OtpVerificationPage() {
  const router = useRouter();
  const [otpEmail, setOtpEmail] = useState("");
  const [inputOtp, setInputOtp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const email = localStorage.getItem("otpEmail") || "";
    setOtpEmail(email);
  }, []);

  // Timer logic
  const [expiryDisplay, setExpiryDisplay] = useState("");
  useEffect(() => {
    const expiry = parseInt(localStorage.getItem("otpExpiry") || "0", 10);
    function update() {
      if (!expiry) return setExpiryDisplay("");
      const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      const min = Math.floor(diff / 60);
      const sec = diff % 60;
      setExpiryDisplay(diff > 0 ? `${min}:${sec.toString().padStart(2, "0")}` : "Expired");
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const expiry = parseInt(localStorage.getItem("otpExpiry") || "0", 10);
    if (!expiry || Date.now() > expiry) {
      setErrorMessage("OTP expired. Please login again.");
      setIsLoading(false);
      setTimeout(() => router.replace("/login"), 1800);
      return;
    }
    const code = localStorage.getItem("otpCode") || "";
    if (inputOtp.trim() !== code) {
      setErrorMessage("Incorrect OTP. Please try again.");
      setIsLoading(false);
      return;
    }
    // Set verified flag with 1 hour expiry
    const verifiedExpiry = Date.now() + 3600_000;
    localStorage.setItem("otpVerified", "true");
    localStorage.setItem("otpVerifiedEmail", otpEmail);
    localStorage.setItem("otpVerifiedExpiry", verifiedExpiry.toString());
    localStorage.removeItem("otpCode");
    localStorage.removeItem("otpExpiry");
    localStorage.removeItem("otpEmail");

    // --- Check user_metadata and raw_user_meta_data for role ---
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    const role =
      user?.user_metadata?.role ||
      (user && (user as any).raw_user_meta_data?.role) ||
      undefined;
      console.log("OTP login user:", user);
      console.log("Resolved role:", role);


    // Log login activity
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
        if (logError) console.error("Failed to insert activity log:", logError);
      });

    // Route users based on their role
    if (!role) {
      setErrorMessage("Access denied: No role found for this account.");
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }

    switch (role) {
      case "admin":
        router.replace("/dashboard");
        break;
      case "cashier":
        router.replace("/sales");
        break;
      case "customer":
        router.replace("/customer/product-catalog");
        break;
      case "warehouse":
        router.replace("/inventory");
        break;
      case "trucker":
        router.replace("/logistics");
        break;
      default:
        setErrorMessage("Access denied: Role not recognized.");
        await supabase.auth.signOut();
        setIsLoading(false);
        break;
    }
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden relative ${dmSans.className}`}>
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
                onClick={() => router.push("/")}
              />
            </div>
          </div>
        </div>
      </header>
      {/* OTP Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-grow flex items-center justify-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4"
      >
        <div className="w-full max-w-4xl flex flex-col lg:flex-row bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 lg:p-16 gap-8 w-full lg:w-1/2">
            <h1 className="section-title text-4xl sm:text-5xl font-bold mb-1">
              OTP Verification
            </h1>
            <div className="text-gray-700 text-base mb-4">
              Enter the 6-digit code sent to <b>{otpEmail}</b>
            </div>
            <form
              onSubmit={handleVerifyOtp}
              className="flex flex-col gap-6 w-full max-w-sm"
            >
              <input
                type="text"
                pattern="\d{6}"
                value={inputOtp}
                onChange={e => setInputOtp(e.target.value.replace(/\D/g, ""))}
                className="w-full border p-2 mb-2 rounded text-xl tracking-widest text-center"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                disabled={isLoading}
                required
              />
              <div className="flex justify-between w-full text-xs text-gray-400">
                <span>Code expires in: {expiryDisplay}</span>
                <button
                  type="button"
                  onClick={() => router.replace("/login")}
                  className="underline hover:text-[#ffba20] ml-2"
                  disabled={isLoading}
                >Cancel</button>
              </div>
              {errorMessage && <div className="text-xs text-red-500 mt-1">{errorMessage}</div>}
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
                    <span>Verifying…</span>
                  </>
                ) : (
                  "Verify OTP"
                )}
              </motion.button>
            </form>
          </div>
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
