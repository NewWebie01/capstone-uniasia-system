// /src/app/(admin)/activity-log/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";

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

  // keep a ref to avoid overlapping loads when polling
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

    // 1) Initial fetch
    loadOnce();

    // 2) Optional realtime (safe to keep even if Realtime is off)
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
        .subscribe((status) => {
          // If realtime isn't enabled, we still have polling below.
          if (status === "SUBSCRIBED") {
            // console.log("Realtime subscribed to activity_logs");
          }
        });
    } catch (e) {
      // ignore; polling will handle updates
    }

    // 3) Poll every 10s as a fallback (works without Realtime)
    timer = setInterval(loadOnce, 10_000);

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Activity Log</h1>

        <button
          onClick={loadOnce}
          className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          title="Refresh now"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search by user, action, or details…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="border rounded px-4 py-2 w-full max-w-md"
        />
      </div>

      <div className="overflow-x-auto rounded-lg shadow mb-4">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center">
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No activities found.
                </td>
              </tr>
            ) : (
              paged.map((act) => (
                <tr
                  key={act.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2">{act.user_email ?? "—"}</td>
                  <td className="px-4 py-2">{act.action}</td>
                  <td className="px-4 py-2 max-w-[480px]">
                    {act.details ? (
                      <details>
                        <summary className="cursor-pointer underline decoration-dotted">
                          view
                        </summary>
                        <pre className="whitespace-pre-wrap break-words bg-gray-100 p-2 rounded mt-1">
                          {JSON.stringify(act.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
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
      <div className="flex justify-between items-center">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
