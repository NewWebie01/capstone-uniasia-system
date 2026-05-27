"use client";

import { motion } from "framer-motion";

export default function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl shadow-2xl px-8 py-6 flex items-center gap-3"
      >
        <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </motion.div>
    </div>
  );
}
