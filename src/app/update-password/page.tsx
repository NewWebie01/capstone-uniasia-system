"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import { motion } from "framer-motion";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import { DM_Sans } from "next/font/google";
import Image from "next/image";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) setMessage("Failed to update password. " + error.message);
    else {
      setMessage("Password updated! Redirecting to login...");
      setTimeout(() => router.replace("/login"), 2000);
    }
    setIsUpdating(false);
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4 ${dmSans.className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl flex flex-col items-center py-10 px-7"
      >
        <Image
          src={Logo}
          alt="UNIASIA Logo"
          width={60}
          height={60}
          className="mb-2"
        />
        <h2 className="text-2xl font-bold mb-6 text-center text-[#181918]">
          Set New Password
        </h2>
        <form onSubmit={handleUpdate} className="flex flex-col gap-5 w-full">
          <input
            type="password"
            placeholder="Enter new password"
            className="rounded-md p-2 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            disabled={isUpdating}
            autoFocus
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            className="bg-[#ffba20] hover:bg-[#ffd84b] text-black font-semibold py-2 rounded transition-colors"
            disabled={isUpdating}
          >
            {isUpdating ? "Updating..." : "Update Password"}
          </motion.button>
        </form>
        {message && (
          <p
            className={`mt-4 text-center text-sm ${
              message.includes("updated") ? "text-green-600" : "text-red-600"
            }`}
          >
            {message}
          </p>
        )}
      </motion.div>
    </div>
  );
}
