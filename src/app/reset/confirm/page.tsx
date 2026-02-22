"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import "@/styles/globals.css";

export default function ResetConfirmPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const token = useMemo(() => sp.get("token") || "", [sp]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return toast.error("Reset token is missing.");
    if (password.length < 8)
      return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(payload?.message || "Reset failed.");
        return;
      }

      toast.success("Password updated! Please login.");
      router.replace("/login");
    } catch {
      toast.error("Server error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)]">
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8"
      >
        <h1 className="text-2xl font-bold text-[#181918]">Set New Password</h1>
        <p className="text-sm text-gray-600 mt-2">
          Enter your new password below.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <input
            type="password"
            className="rounded-md p-2 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
            placeholder="New password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />

          <input
            type="password"
            className="rounded-md p-2 border-2 outline-none focus:border-[#ffba20] focus:bg-slate-50 disabled:opacity-60"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={isLoading}
            required
          />

          <button
            disabled={isLoading || !token}
            className="bg-[#ffba20] hover:bg-[#ffd36f] text-black py-2 rounded font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <button
          type="button"
          className="mt-5 text-xs underline text-gray-600 hover:text-[#ffba20] transition"
          onClick={() => router.push("/login")}
        >
          Back to login
        </button>
      </motion.div>
    </div>
  );
}
