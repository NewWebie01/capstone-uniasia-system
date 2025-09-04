// app/dashboard/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Cards from "@/components/Cards";
import BottomCards from "@/components/BottomCards";
import Bargraph from "@/components/Bargraph";
import supabase from "@/config/supabaseClient";
import RecentActivityLog from "@/components/RecentActivityLog";

const DashboardPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session) {
        router.replace("/login");
        return;
      }

      const role = session.user.user_metadata?.role;
      if (role !== "admin") {
        router.replace("/customer");
        return;
      }

      setLoading(false);
    })();
  }, [router]);

  if (loading)
    return <p className="text-center mt-10">Checking permissions...</p>;

  return (
    <>
      {/* Title + subtitle (match other pages like Invoice) */}
      <motion.h1
        className="pt-2 text-3xl font-bold tracking-tight text-neutral-800"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Dashboard
      </motion.h1>
      <p className="text-neutral-500 mb-6 text-sm">
        Overview of sales performance, inventory status, and recent activity
        logs.
      </p>

      {/* Top summary cards */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Cards />
      </motion.div>

      {/* Bar graph wrapped in a card to align with other cards */}
      <motion.div
        className="mt-4"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="bg-white rounded-xl shadow p-4">
          <Bargraph />
        </div>
      </motion.div>

      {/* Bottom row: recent orders + activity log */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BottomCards />
          <RecentActivityLog />
        </div>
      </motion.div>
    </>
  );
};

export default DashboardPage;
