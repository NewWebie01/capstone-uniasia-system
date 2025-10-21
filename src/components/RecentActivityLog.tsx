"use client";

import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2, RefreshCcw, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import {
  getPHISOString,
  formatPHISODate,
  formatPHDate,
  formatPHTime,
} from "@/lib/datetimePH";

type Activity = {
  id: number;
  user_email: string | null;
  user_role: string | null;
  action: string;
  created_at: string;
};

function activityLabel(action: string) {
  if (!action) return "";
  if (action.toLowerCase().includes("login"))
    return "bg-yellow-100 text-yellow-800";
  if (action.toLowerCase().includes("logout"))
    return "bg-yellow-100 text-yellow-800";
  if (action.toLowerCase().includes("complete"))
    return "bg-green-100 text-green-800";
  if (action.toLowerCase().includes("pending"))
    return "bg-yellow-50 text-yellow-900";
  if (action.toLowerCase().includes("update"))
    return "bg-blue-100 text-blue-800";
  if (action.toLowerCase().includes("add"))
    return "bg-orange-100 text-orange-800";
  if (action.toLowerCase().includes("reject")) return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-800";
}

export default function RecentActivityLog() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [topTen, setTopTen] = useState<Activity[]>([]);
  const [loadingTen, setLoadingTen] = useState(false);

  // Fetch latest 3 activities for card
  async function fetchActivities() {
    setLoading(true);
    const { data } = await supabase
      .from("activity_logs")
      .select("id, user_email, user_role, action, created_at")
      .order("created_at", { ascending: false })
      .limit(3);
    setActivities(data || []);
    setLoading(false);
  }

  // Fetch latest 10 activities for modal
  async function fetchTopTen() {
    setLoadingTen(true);
    const { data } = await supabase
      .from("activity_logs")
      .select("id, user_email, user_role, action, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setTopTen(data || []);
    setLoadingTen(false);
  }

  useEffect(() => {
    fetchActivities();
    const channel = supabase
      .channel("public:activity_logs_dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        (payload) => {
          const newRow = payload.new as Activity;
          setActivities((prev) => {
            const updated = [newRow, ...prev];
            return updated.slice(0, 3);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Modal open handler: load 10 logs
  const handleOpenModal = () => {
    setModalOpen(true);
    fetchTopTen();
  };

  // Optional: ESC key closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen]);

  return (
    <>
      {/* CARD */}
      <div
        className="bg-white rounded-2xl shadow-lg h-full flex flex-col min-w-[320px] cursor-pointer transition"
        title="Click to view full activity log"
        onClick={handleOpenModal}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleOpenModal();
        }}
        role="button"
      >
        {/* Header: Yellow Bar */}
        <div className="flex items-center px-4 py-3 rounded-t-2xl bg-[#FFBA20]">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-yellow-100 text-yellow-700 mr-2">
            <Clock size={18} />
          </span>
          <span className="font-bold text-lg text-[#181918]">Activity Log</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchActivities();
            }}
            className="ml-auto text-gray-500 hover:text-yellow-700 transition"
            title="Refresh"
            tabIndex={-1}
          >
            <RefreshCcw size={18} />
          </button>
        </div>
        {/* Card Body */}
        <div className="flex-1 px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[100px]">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-gray-400 text-sm mt-2">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-gray-100 pointer-events-none">
              {activities.map((act) => (
                <li
                  key={act.id}
                  className="py-3 px-2 hover:bg-gray-50 rounded-xl transition flex flex-col gap-0.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[16px] text-[#222]">
                      {act.user_email || (
                        <span className="italic text-gray-400">unknown</span>
                      )}
                    </span>
                    <span className="ml-2 px-2 py-0.5 text-[14px] rounded-full border bg-gray-50 text-gray-600 font-bold capitalize">
                      {act.user_role || "User"}
                    </span>
                  </div>
                  <span
                    className={`inline-block font-medium ${activityLabel(
                      act.action
                    )} px-2 py-1 text-[15px] rounded-full mt-1 mb-0.5`}
                  >
                    {act.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatPHDate(act.created_at)},{" "}
                    {formatPHTime(act.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <span className="text-xs text-center text-gray-400 mt-3 pointer-events-none">
            Click card to view more
          </span>
        </div>
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-0 relative"
              initial={{ y: 60, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.33 }}
            >
              {/* Modal Header: Yellow Bar */}
              <div className="flex items-center px-5 py-4 rounded-t-2xl bg-[#FFBA20]">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-yellow-100 text-yellow-700 mr-2">
                  <Clock size={20} />
                </span>
                <span className="font-bold text-lg text-[#181918]">
                  Recent Activity Log
                </span>
                <button
                  className="ml-auto text-gray-500 hover:text-yellow-600 transition"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  <X size={22} />
                </button>
              </div>
              {/* Modal Body */}
              <div className="px-6 py-5">
                {loadingTen ? (
                  <div className="flex flex-col items-center justify-center h-[80px]">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : topTen.length === 0 ? (
                  <p className="text-gray-400 text-sm mt-2">
                    No recent activity.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {topTen.map((act) => (
                      <li
                        key={act.id}
                        className="py-3 px-2 hover:bg-gray-50 rounded-xl transition flex flex-col gap-0.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#222]">
                            {act.user_email || (
                              <span className="italic text-gray-400">
                                unknown
                              </span>
                            )}
                          </span>
                          <span className="ml-2 px-2 py-0.5 text-xs rounded-full border bg-gray-50 text-gray-600 font-bold capitalize">
                            {act.user_role || "User"}
                          </span>
                        </div>
                        <span
                          className={`inline-block font-medium ${activityLabel(
                            act.action
                          )} px-2 py-0.5 text-xs rounded-full mt-1 mb-0.5`}
                        >
                          {act.action}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatPHDate(act.created_at)},{" "}
                          {formatPHTime(act.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
