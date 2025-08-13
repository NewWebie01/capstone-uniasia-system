"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useNavPending } from "@/stores/useNavPending";

export default function GlobalRouteLoader() {
  const pathname = usePathname();
  const { isNavigating, setNavigating } = useNavPending();

  // When the path actually changes, hide the loader (with a tiny delay to avoid flash)
  useEffect(() => {
    if (isNavigating) {
      const t = setTimeout(() => setNavigating(false), 150);
      return () => clearTimeout(t);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {isNavigating && (
        <motion.div
          key="route-loader"
          className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm flex items-center justify-center"
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
            <span className="text-sm font-medium text-gray-700">Loading…</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
