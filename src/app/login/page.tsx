"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import splashImage from "@/assets/tools-log-in-splash.jpg";
import Image from "next/image";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import MenuIcon from "@/assets/menu.svg";
import { motion } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabase = createClientComponentClient();

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(""); // Error state to display messages
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage("Login failed: " + error.message);
      return;
    }
    // On success, data.session now exists
    router.push("/dashboard");
  };

  return (
    <div
      className={`h-screen overflow-hidden flex flex-col ${dmSans.className}`}
    >
      {/* Header */}
      <header className="sticky top-0 backdrop-blur-sm z-20">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <div className="inline-flex gap-1 items-center">
            <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
          </div>
        </div>

        <div className="py-5">
          <div className="container">
            <div className="flex items-center justify-between">
              {/* Logo section */}
              <Image src={Logo} alt="UniAsia Logo" height={50} width={50} />

              {/* Mobile menu icon */}
              <MenuIcon className="h-5 w-5 md:hidden" />
            </div>
          </div>
        </div>
      </header>

      {/* Login Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-grow flex items-center justify-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)]"
      >
        <div className="flex shadow-2xl">
          {/* Form Box */}
          <div className="flex flex-col items-center justify-center text-center p-20 gap-8 bg-white rounded-2xl xl:rounded-tr-none xl:rounded-br-none">
            <h1 className="section-title text-5xl font-bold">Welcome</h1>

            {/* Show error message if login fails */}
            {errorMessage && (
              <div className="text-red-500 mb-4">{errorMessage}</div>
            )}

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6 w-full max-w-sm"
            >
              <div className="flex flex-col text-left">
                <label className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50"
                  required
                />
              </div>

              <div className="flex flex-col text-left">
                <label className="text-[22px] leading-[30px] tracking-tight text-[#010D3E]">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md p-1 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50"
                  required
                />
              </div>

              <div className="flex gap-1 items-center">
                <input type="checkbox" />
                <span className="text-base">Remember Password</span>
              </div>

              <button
                type="submit"
                className="px-10 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
              >
                Login
              </button>
            </form>
          </div>

          {/* Splash Image */}
          <Image
            src={splashImage}
            alt="Splash Image"
            className="w-[450px] object-cover lg:rounded-tr-2xl lg:rounded-br-2xl lg:block hidden"
          />
        </div>
      </motion.section>
    </div>
  );
}
