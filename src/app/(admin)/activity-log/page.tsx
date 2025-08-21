"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2, RefreshCcw } from "lucide-react";

type Activity = {
  id: number;
  user_email: string | null;
  action: string;
  details: any | null;
  created_at: string;
};

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const isLoadingRef = useRef(false);

  async function loadOnce() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_logs")
      .select("id, user_email, action, details, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error loading activity logs:", error);
    } else {
      setActivities(data ?? []);
    }
    setLoading(false);
    isLoadingRef.current = false;
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    loadOnce();
    try {
      channel = supabase
        .channel("public:activity_logs")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "activity_logs" },
          (payload) => {
            const newRow = payload.new as Activity;
            setActivities((prev) => [newRow, ...prev]);
          }
        )
        .subscribe();
    } catch (e) {}
    timer = setInterval(loadOnce, 10000);
    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- filter + paginate ----
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((a) => {
      const detailsText = a.details
        ? JSON.stringify(a.details).toLowerCase()
        : "";
      return (
        (a.user_email ?? "").toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        detailsText.includes(q)
      );
    });
  }, [activities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = (currentPage - 1) * itemsPerPage;
  const paged = filtered.slice(pageStart, pageStart + itemsPerPage);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold text-[#181918] tracking-tight">
          Activity Log
        </h1>

        <button
          onClick={loadOnce}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#181918] text-white hover:bg-[#ffba20] hover:text-[#181918] transition"
          title="Refresh"
        >
          <RefreshCcw className={loading ? "animate-spin" : ""} size={18} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by user, action, or details…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="border border-gray-300 rounded-xl px-4 py-2 w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ffba20]"
        />
      </div>

      <div className="rounded-2xl shadow-xl border border-gray-100 bg-white overflow-x-auto mb-8">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-gradient-to-r from-[#ffba20] to-yellow-200 text-[#181918] sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-left font-bold rounded-tl-2xl">
                User
              </th>
              <th className="px-6 py-4 text-left font-bold">Activity</th>
              <th className="px-6 py-4 text-left font-bold rounded-tr-2xl">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  <Loader2 className="mx-auto animate-spin" size={28} />
                  <div className="mt-2">Loading…</div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-10 text-center text-gray-400"
                >
                  No activities found.
                </td>
              </tr>
            ) : (
              paged.map((act) => (
                <tr
                  key={act.id}
                  className="hover:bg-[#ffba20]/10 border-b last:border-0 transition"
                >
                  <td className="px-6 py-3 font-medium">
                    {act.user_email ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-3">{act.action}</td>
                  <td className="px-6 py-3 whitespace-nowrap text-gray-700">
                    {new Date(act.created_at).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-600">
          Page <span className="font-bold">{currentPage}</span> of{" "}
          <span className="font-bold">{totalPages}</span>
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
