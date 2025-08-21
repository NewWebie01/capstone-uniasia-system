// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Cards from "@/components/Cards";
import BottomCards from "@/components/BottomCards";
import Bargraph from "@/components/Bargraph";
import supabase from "@/config/supabaseClient";

const DashboardPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true); // Add loading state

  useEffect(() => {
    // On mount, check user session and role
    (async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session) {
        router.replace("/login"); // Not logged in, redirect to login
        return;
      }

      const role = session.user.user_metadata?.role;
      if (role !== "admin") {
        router.replace("/customer"); // Not an admin, redirect to customer page
        return;
      }

      setLoading(false); // User is admin
    })();
  }, [router]);

  if (loading)
    return <p className="text-center mt-10">Checking permissions...</p>;

  return (
    <>
      <motion.h1
        className="pt-2 text-3xl font-bold mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Dashboard
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Cards />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Bargraph />
      </motion.div>

      <motion.div
        className="mt-6"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <BottomCards />
      </motion.div>
    </>
  );
};

export default DashboardPage;
