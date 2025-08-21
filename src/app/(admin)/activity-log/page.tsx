"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2 } from "lucide-react";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
});

type Activity = {
  id: number;
  user_email: string | null;
  user_role: string | null; // <-- Use the DB role!
  action: string;
  details: any | null;
  created_at: string;
};

// PH time helper (+8 hours from UTC)
function add8HoursToUTC(dateString: string): string {
  const d = new Date(dateString);
  d.setHours(d.getHours() + 8);
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// --- Use role column for badge color ---
function accountLabel(role: string | null) {
  if (!role) return null;
  let color = "";
  let text = "";
  if (role === "admin") {
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
    text = "Admin";
  } else if (role === "customer") {
    color = "bg-[#f0fdf4] text-green-800 border border-green-200";
    text = "Customer";
  } else {
    color = "bg-gray-100 text-gray-600 border border-gray-200";
    text = role;
  }
  return (
    <span className={`ml-2 px-3 py-1 text-xs font-bold rounded-full align-middle ${color}`}>
      {text}
    </span>
  );
}

// Color-coded activity chip
function activityChip(action: string) {
  let color = "bg-gray-200 text-gray-800";
  if (action.toLowerCase().includes("login")) color = "bg-[#fff8db] text-yellow-800 border border-yellow-200";
  else if (action.toLowerCase().includes("logout")) color = "bg-[#fff8db] text-yellow-800 border border-yellow-200";
  else if (action.toLowerCase().includes("completed") || action.toLowerCase().includes("complete")) color = "bg-[#dcfce7] text-green-800 border border-green-200";
  else if (action.toLowerCase().includes("pending")) color = "bg-[#fef9c3] text-yellow-900 border border-yellow-200";
  else if (action.toLowerCase().includes("update")) color = "bg-[#dbeafe] text-blue-800 border border-blue-200";
  else if (action.toLowerCase().includes("add")) color = "bg-[#fef3c7] text-orange-800 border border-orange-200";
  else if (action.toLowerCase().includes("reject")) color = "bg-[#fee2e2] text-red-800 border border-red-200";
  else if (action.toLowerCase().includes("clear")) color = "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-4 py-1 text-base rounded-full font-medium ${color}`}>
      {action}
    </span>
  );
}

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;
  const isLoadingRef = useRef(false);

  async function loadOnce() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_logs")
      .select("id, user_email, user_role, action, details, created_at")
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
        (a.user_role ?? "").toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        detailsText.includes(q)
      );
    });
  }, [activities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = (currentPage - 1) * itemsPerPage;
  const paged = filtered.slice(pageStart, pageStart + itemsPerPage);

  return (
    <div className={`${dmSans.className} min-h-screen bg-gradient-to-b from-[#e8e6dd] to-[#ffd670]/60`}>
      <div className="w-full py-12 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-[#181918] mb-8 tracking-tight">Activity Log</h1>
        {/* Search bar - half width, centered */}
        <div className="w-1/2 max-w-[900px] min-w-[320px] mb-8">
          <input
            type="text"
            placeholder="Search by user, action, or details…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-xl px-6 py-2 w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ffba20] text-base"
          />
        </div>

        {/* Table - now 1400px wide */}
        <div className="rounded-3xl shadow-2xl border border-gray-100 bg-white/95 overflow-x-auto mb-10 w-full max-w-[1400px] xl:w-[1400px]">
          <table className="w-full text-lg">
            <thead className="bg-[#ffba20] text-[#181918]">
              <tr>
                <th className="px-8 py-2 text-left font-bold rounded-tl-3xl text-lg">User</th>
                <th className="px-8 py-2 text-left font-bold text-lg">Activity</th>
                <th className="px-8 py-2 text-left font-bold rounded-tr-3xl text-lg">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-7 py-8 text-center text-gray-500"
                  >
                    <Loader2 className="mx-auto animate-spin" size={28} />
                    <div className="mt-3 text-lg">Loading…</div>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-7 py-8 text-center text-gray-400 text-lg"
                  >
                    No activities found.
                  </td>
                </tr>
              ) : (
                paged.map((act) => (
                  <tr
                    key={act.id}
                    className="hover:bg-[#fff8db] border-b last:border-0 transition text-lg"
                  >
                    <td className="px-8 py-1 font-medium">
                      {act.user_email ?? <span className="text-gray-400">—</span>}
                      {accountLabel(act.user_role)}
                    </td>
                    <td className="px-8 py-1">{activityChip(act.action)}</td>
                    <td className="px-8 py-1 whitespace-nowrap text-[#222] font-bold tracking-wide">
                      <span className="block leading-tight font-medium">
                        {add8HoursToUTC(act.created_at)}
                        <span className="ml-2 text-base text-gray-400 font-normal">PH Time</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - now 1400px wide */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full max-w-[1400px] xl:w-[1400px]">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60 text-base"
          >
            ← Prev
          </button>
          <span className="text-base text-gray-600">
            Page <span className="font-bold">{currentPage}</span> of{" "}
            <span className="font-bold">{totalPages}</span>
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60 text-base"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
