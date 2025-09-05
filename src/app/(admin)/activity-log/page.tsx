// src/app/admin/activity-log/page.tsx
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
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function formatPHTime(dateString: string): string {
  const d = new Date(dateString);
  d.setHours(d.getHours() + 8);
  return d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    text = role;
    color = "bg-gray-100 text-gray-600 border border-gray-200";
  }
  return (
    <span className={`ml-0 px-2 py-0.5 text-xs rounded-full align-middle ${color}`}>
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

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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
        .order("created_at", { ascending: false });
      if (!error) setActivities(data ?? []);
      setLoading(false);
    }
    initialLoad();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let arr = activities.map((a) => ({
      ...a,
      date: formatPHDate(a.created_at),
      time: formatPHTime(a.created_at),
    }));

    if (q) {
      arr = arr.filter((a) => {
        const detailsText = a.details ? JSON.stringify(a.details).toLowerCase() : "";
        return (
          (a.user_email ?? "").toLowerCase().includes(q) ||
          (a.user_role ?? "").toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q) ||
          detailsText.includes(q)
        );
      });
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      const cmp = (av: any, bv: any) => (av < bv ? -1 : av > bv ? 1 : 0);
      arr.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        if (key === "created_at") {
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
        } else {
          aVal = (a as any)[key];
          bVal = (b as any)[key];
          if (typeof aVal === "string") aVal = aVal.toLowerCase();
          if (typeof bVal === "string") bVal = bVal.toLowerCase();
          if (aVal == null) aVal = "";
          if (bVal == null) bVal = "";
        }

        const base = cmp(aVal, bVal);
        return direction === "asc" ? base : -base;
      });
    }

    return arr;
  }, [activities, searchQuery, sortConfig]);

  function handleSort(key: string) {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
    setCurrentPage(1); // reset to first page on sort
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = (currentPage - 1) * itemsPerPage;
  const paged = filtered.slice(pageStart, pageStart + itemsPerPage);

  // --- Export as Excel (.xlsx) using XLSX.writeFile (no file-saver) ---
  async function handleExport() {
    setShowExport(false);

    // Log the export (non-blocking)
    try {
      const { data } = await supabase.auth.getUser();
      const userEmail = data?.user?.email || "unknown";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          user_role: "admin",
          action: "Exported Activity Log",
          details: {
            rows: paged.length,
            page: currentPage,
            query: searchQuery,
          },
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.error("Export log failed:", e);
    }

    // Build export
    const headerRow = ["User", "Account Type", "Activity", "Date", "Time"];
    const exportRows = paged.map((a) => [
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

    const filename = `Activity_Log_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename, { bookType: "xlsx" });
  }

  function ExportModal() {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
          <h3 className="text-base font-semibold mb-2 text-center">Export Activity Log?</h3>
          <p className="text-sm text-gray-700 text-center mb-5">
            This will export <b>only the rows on this page</b> (<b>{paged.length}</b> item
            {paged.length !== 1 && "s"}).
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
    );
  }

  return (
    <div className={`${dmSans.className} px-4 pb-4 pt-1`}>
      {/* Header aligned like other pages */}
      <h1 className="pt-2 text-3xl font-bold tracking-tight text-neutral-800 mb-1">Activity Log</h1>

      <p className="text-sm text-gray-500 mb-4">
        See who did what and when. Search by user, action, or details, and export the current view.
      </p>

      {/* Search & Export (left-aligned) */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by user, action, or details…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="border px-4 py-2 w-full max-w-md rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-black text-sm"
        />
        <button
          className="bg-black text-white px-4 py-2 rounded hover:text-[#22c55e] transition text-sm"
          onClick={() => setShowExport(true)}
        >
          Export
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg shadow bg-white/95 mb-6">
        <table className="w-full text-sm">
          <thead className="bg-[#ffba20] text-[#181918]">
            <tr>
              <th
                onClick={() => handleSort("user_email")}
                className="px-4 py-2 text-left font-semibold cursor-pointer select-none"
                aria-label="Sort by User"
                title="Sort by User"
              >
                User {sortConfig?.key === "user_email" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>

              <th
                onClick={() => handleSort("user_role")}
                className="px-4 py-2 text-left font-semibold cursor-pointer select-none"
                aria-label="Sort by Account Type"
                title="Sort by Account Type"
              >
                Account Type{" "}
                {sortConfig?.key === "user_role" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>

              <th
                onClick={() => handleSort("action")}
                className="px-4 py-2 text-left font-semibold cursor-pointer select-none"
                aria-label="Sort by Activity"
                title="Sort by Activity"
              >
                Activity {sortConfig?.key === "action" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>

              {/* Sort Date/Time by the same field: created_at */}
              <th
                onClick={() => handleSort("created_at")}
                className="px-4 py-2 text-left font-semibold cursor-pointer select-none"
                aria-label="Sort by Date"
                title="Sort by Date"
              >
                Date {sortConfig?.key === "created_at" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>

              <th
                onClick={() => handleSort("created_at")}
                className="px-4 py-2 text-left font-semibold cursor-pointer select-none"
                aria-label="Sort by Time"
                title="Sort by Time"
              >
                Time {sortConfig?.key === "created_at" && (sortConfig.direction === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  <Loader2 className="mx-auto animate-spin" size={20} />
                  <div className="mt-2 text-sm">Loading…</div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">
                  No activities found.
                </td>
              </tr>
            ) : (
              paged.map((act) => (
                <tr key={act.id} className="hover:bg-[#fff8db] border-b last:border-0 transition">
                  <td className="px-4 py-2">{act.user_email ?? "—"}</td>
                  <td className="px-4 py-2">{accountTypeBadge(act.user_role)}</td>
                  <td className="px-4 py-2">{activityChip(act.action)}</td>
                  <td className="px-4 py-2">{formatPHDate(act.created_at)}</td>
                  <td className="px-4 py-2">{formatPHTime(act.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center gap-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60 text-sm"
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
          className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 transition disabled:opacity-60 text-sm"
        >
          Next →
        </button>
      </div>

      {showExport && <ExportModal />}
    </div>
  );
}
