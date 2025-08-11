// app/activity-log/page.tsx
"use client";

import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";

type Activity = {
  id: number;
  user_email: string;
  action: string;
  created_at: string;
};

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading]       = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    async function fetchAndSubscribe() {
      setLoading(true);

      // 1) initial fetch
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, user_email, action, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading activity logs:", error);
      } else if (data) {
        setActivities(data);
      }
      setLoading(false);

      // 2) real-time inserts
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
    }

    fetchAndSubscribe();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // filter + paginate
  const filtered = activities.filter((a) =>
    `${a.user_email} ${a.action}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paged = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Activity Log</h1>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search by user or activity..."
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
              <th className="px-4 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center">
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center text-gray-500">
                  No activities found.
                </td>
              </tr>
            ) : (
              paged.map((act) => (
                <tr key={act.created_at + act.user_email} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{act.user_email}</td>
                  <td className="px-4 py-2">{act.action}</td>
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
