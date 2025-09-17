"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2 } from "lucide-react";
import { DM_Sans } from "next/font/google";
import * as XLSX from "xlsx";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
});

type Activity = {
  id: number;
  user_email: string | null;
  user_role: string | null;
  action: string;
  details: any | null;
  created_at: string;
};

function formatPHDate(dateString: string): string {
  const d = new Date(dateString);
  d.setHours(d.getHours() + 8);
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}
function formatPHTime(dateString: string): string {
  const d = new Date(dateString);
  d.setHours(d.getHours() + 8);
  return d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

function accountTypeBadge(role: string | null) {
  let text = "";
  let color = "";

  if (!role || role.toLowerCase() === "authenticated") {
    text = "Admin";
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
  } else if (role.toLowerCase() === "admin") {
    text = "Admin";
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
  } else if (role.toLowerCase() === "customer") {
    text = "Customer";
    color = "bg-[#f0fdf4] text-green-800 border border-green-200";
  } else {
    text = role ?? "—";
    color = "bg-gray-100 text-gray-600 border border-gray-200";
  }
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${color}`}>
      {text}
    </span>
  );
}

function activityChip(action: string) {
  let color = "bg-gray-200 text-gray-800";
  const a = action.toLowerCase();
  if (a.includes("login") || a.includes("logout"))
    color = "bg-[#fff8db] text-yellow-800 border border-yellow-200";
  else if (a.includes("completed") || a.includes("complete"))
    color = "bg-[#dcfce7] text-green-800 border border-green-200";
  else if (a.includes("pending"))
    color = "bg-[#fef9c3] text-yellow-900 border border-yellow-200";
  else if (a.includes("update"))
    color = "bg-[#dbeafe] text-blue-800 border border-blue-200";
  else if (a.includes("add"))
    color = "bg-[#fef3c7] text-orange-800 border border-orange-200";
  else if (a.includes("reject"))
    color = "bg-[#fee2e2] text-red-800 border border-red-200";
  else if (a.includes("clear")) color = "bg-gray-100 text-gray-700";
  else if (a.includes("export"))
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";

  return (
    <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full ${color}`}>
      {action}
    </span>
  );
}

const ACTION_TABS = [
  { key: "all", label: "All" },
  { key: "login", label: "Login" },
  { key: "completed", label: "Completed" },
  { key: "update", label: "Update" },
  { key: "add", label: "Add" },
  { key: "reject", label: "Rejected" },
  { key: "export", label: "Exported" },
] as const;
type ActionTabKey = (typeof ACTION_TABS)[number]["key"];

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchQuery, setSearchQuery] = useState("");
  const [quick, setQuick] = useState<ActionTabKey>("all");

  // pagination & sorting
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, user_email, user_role, action, details, created_at")
        .order("created_at", { ascending: false }); // Newest first!
      if (!error) setActivities(data ?? []);
      setLoading(false);
    }
    initialLoad();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, quick]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let arr = activities.filter((a) => {
      if (quick === "all") return true;
      const act = (a.action || "").toLowerCase();
      switch (quick) {
        case "login":
          return act.includes("login") || act.includes("logout");
        case "completed":
          return act.includes("completed") || act.includes("complete");
        case "update":
          return act.includes("update");
        case "add":
          return act.includes("add");
        case "reject":
          return act.includes("reject");
        case "export":
          return act.includes("export");
        default:
          return true;
      }
    });

    arr = arr.map((a) => ({
      ...a,
      date: formatPHDate(a.created_at),
      time: formatPHTime(a.created_at),
    })) as any;

    if (q) {
      arr = arr.filter((a: any) => {
        const detailsText = a.details ? JSON.stringify(a.details).toLowerCase() : "";
        return (
          (a.user_email ?? "").toLowerCase().includes(q) ||
          (a.user_role ?? "").toLowerCase().includes(q) ||
          (a.action ?? "").toLowerCase().includes(q) ||
          detailsText.includes(q)
        );
      });
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      arr.sort((a: any, b: any) => {
        let av: any;
        let bv: any;
        if (key === "created_at") {
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
        } else {
          av = a[key];
          bv = b[key];
          if (typeof av === "string") av = av.toLowerCase();
          if (typeof bv === "string") bv = bv.toLowerCase();
          if (av == null) av = "";
          if (bv == null) bv = "";
        }
        const base = av < bv ? -1 : av > bv ? 1 : 0;
        return direction === "asc" ? base : -base;
      });
    }

    return arr;
  }, [activities, searchQuery, quick, sortConfig]);

  function toggleSort(key: string) {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = (currentPage - 1) * itemsPerPage;
  const paged = filtered.slice(pageStart, pageStart + itemsPerPage);

  // Export current page
  async function handleExport() {
    setShowExport(false);
    let allActivities: Activity[] = [];
    setLoading(true);
    try {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, user_email, user_role, action, details, created_at")
        .order("created_at", { ascending: false });
      allActivities = data ?? [];
    } catch {}
    setLoading(false);

    try {
      const { data } = await supabase.auth.getUser();
      const userEmail = data?.user?.email || "unknown";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          user_role: "admin",
          action: "Exported Activity Log (ALL)",
          details: {
            rows: allActivities.length,
            filter: "ALL",
          },
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {}

    const headerRow = ["User", "Account Type", "Activity", "Date", "Time"];
    const exportRows = allActivities.map((a) => [
      a.user_email,
      !a.user_role || a.user_role.toLowerCase() === "authenticated"
        ? "Admin"
        : a.user_role.charAt(0).toUpperCase() + a.user_role.slice(1),
      a.action,
      formatPHDate(a.created_at),
      formatPHTime(a.created_at),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activity Log");
    XLSX.writeFile(wb, `Activity_Log_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className={`${dmSans.className} px-4 pb-6 pt-1`}>
      {/* Header like Returns */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="pt-1 text-3xl font-bold mb-1">Activity Log</h1>
          <p className="text-sm text-gray-500 mb-2">
            Track and review system activities performed by users.
          </p>
        </div>
      </div>

      {/* Quick chips like Returns */}
      <div className="bg-white border rounded-2xl p-3 shadow-sm mb-3">
        <div className="flex flex-wrap gap-2">
          {ACTION_TABS.map((t) => {
            const active = quick === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setQuick(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "bg-[#ffba20] border-[#ffba20] text-black"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters card like Returns */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[22rem] max-w-full">
              <input
                className="border rounded-xl px-3 py-2 w-full bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#ffba20] transition"
                placeholder="Search by user / role / action / details"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="px-4 py-2 rounded-xl border bg-black text-white hover:opacity-90 shadow-sm text-sm"
              onClick={() => setShowExport(true)}
            >
              Export
            </button>
          </div>
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{filtered.length}</span>{" "}
            record{filtered.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#ffba20]/90 text-black">
              <tr className="[&>th]:py-2 [&>th]:px-3 text-left">
                <th>
                  <div className="flex items-center gap-1">
                    <span>User</span>
                    <button
                      onClick={() => toggleSort("user_email")}
                      className="text-xs px-1 rounded hover:bg-black/10"
                      title="Sort by User"
                      aria-label="Sort by User"
                    >
                      {sortConfig?.key === "user_email"
                        ? sortConfig.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </button>
                  </div>
                </th>
                <th>
                  <div className="flex items-center gap-1">
                    <span>Account Type</span>
                    <button
                      onClick={() => toggleSort("user_role")}
                      className="text-xs px-1 rounded hover:bg-black/10"
                      title="Sort by Account Type"
                      aria-label="Sort by Account Type"
                    >
                      {sortConfig?.key === "user_role"
                        ? sortConfig.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </button>
                  </div>
                </th>
                <th>
                  <div className="flex items-center gap-1">
                    <span>Activity</span>
                    <button
                      onClick={() => toggleSort("action")}
                      className="text-xs px-1 rounded hover:bg-black/10"
                      title="Sort by Activity"
                      aria-label="Sort by Activity"
                    >
                      {sortConfig?.key === "action"
                        ? sortConfig.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </button>
                  </div>
                </th>
                <th>
                  <div className="flex items-center gap-1">
                    <span>Date</span>
                    <button
                      onClick={() => toggleSort("created_at")}
                      className="text-xs px-1 rounded hover:bg-black/10"
                      title="Sort by Date"
                      aria-label="Sort by Date"
                    >
                      {sortConfig?.key === "created_at"
                        ? sortConfig.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </button>
                  </div>
                </th>
                <th>
                  <div className="flex items-center gap-1">
                    <span>Time</span>
                    <button
                      onClick={() => toggleSort("created_at")}
                      className="text-xs px-1 rounded hover:bg-black/10"
                      title="Sort by Time"
                      aria-label="Sort by Time"
                    >
                      {sortConfig?.key === "created_at"
                        ? sortConfig.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    <Loader2 className="mx-auto animate-spin" size={20} />
                    <div className="mt-2 text-sm">Loading…</div>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400 text-sm">
                    No activities found.
                  </td>
                </tr>
              ) : (
                paged.map((act) => (
                  <tr key={act.id} className="border-t hover:bg-gray-50">
                    <td className="py-2 px-3">{act.user_email ?? "—"}</td>
                    <td className="py-2 px-3">{accountTypeBadge(act.user_role)}</td>
                    <td className="py-2 px-3">{activityChip(act.action)}</td>
                    <td className="py-2 px-3">{formatPHDate(act.created_at)}</td>
                    <td className="py-2 px-3">{formatPHTime(act.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t bg-white text-sm">
          <div>
            Page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === currentPage;
              return (
                <button
                  key={n}
                  onClick={() => setCurrentPage(n)}
                  className={`px-2 py-1 rounded border text-xs ${
                    active
                      ? "bg-[#ffba20] border-[#ffba20] text-black"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <button
              className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      {/* Export modal */}
      {showExport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold mb-2 text-center">Export Activity Log?</h3>
            <p className="text-sm text-gray-700 text-center mb-5">
              This will export <b>ALL activity log records</b> in one file.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 rounded bg-black text-white hover:opacity-90 text-sm"
                onClick={handleExport}
              >
                Yes, Export
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={() => setShowExport(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
