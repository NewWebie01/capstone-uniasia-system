"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2 } from "lucide-react";
import { DM_Sans } from "next/font/google";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

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

// --- Account Type badge (Admin/Customer)
function accountTypeBadge(role: string | null) {
  let text = "";
  let color = "";

  // Treat "authenticated" as "Admin" for display purposes
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
    <span
      className={`ml-0 px-3 py-1 text-xs font-bold rounded-full align-middle ${color}`}
    >
      {text}
    </span>
  );
}

// Color-coded activity chip
function activityChip(action: string) {
  let color = "bg-gray-200 text-gray-800";
  if (action.toLowerCase().includes("login"))
    color = "bg-[#fff8db] text-yellow-800 border border-yellow-200";
  else if (action.toLowerCase().includes("logout"))
    color = "bg-[#fff8db] text-yellow-800 border border-yellow-200";
  else if (
    action.toLowerCase().includes("completed") ||
    action.toLowerCase().includes("complete")
  )
    color = "bg-[#dcfce7] text-green-800 border border-green-200";
  else if (action.toLowerCase().includes("pending"))
    color = "bg-[#fef9c3] text-yellow-900 border border-yellow-200";
  else if (action.toLowerCase().includes("update"))
    color = "bg-[#dbeafe] text-blue-800 border border-blue-200";
  else if (action.toLowerCase().includes("add"))
    color = "bg-[#fef3c7] text-orange-800 border border-orange-200";
  else if (action.toLowerCase().includes("reject"))
    color = "bg-[#fee2e2] text-red-800 border border-red-200";
  else if (action.toLowerCase().includes("clear"))
    color = "bg-gray-100 text-gray-700";
  else if (action.toLowerCase().includes("export"))
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
  return (
    <span
      className={`inline-block px-4 py-1 text-base rounded-full font-medium ${color}`}
    >
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

  // Sorting
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Export modal
  const [showExport, setShowExport] = useState(false);

  // Real-time setup
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;

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

    // Real-time channel: handle INSERT/UPDATE/DELETE
    channel = supabase
      .channel("public:activity_logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_logs" },
        (payload) => {
          setActivities((prev) => {
            if (payload.eventType === "INSERT") {
              // Only add if not already present
              if (!prev.some((a) => a.id === payload.new.id)) {
                return [payload.new as Activity, ...prev];
              }
              return prev;
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((a) =>
                a.id === payload.new.id ? { ...a, ...payload.new } : a
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // ---- filter, sort, paginate ----
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let arr = activities.map((a) => ({
      ...a,
      date: formatPHDate(a.created_at),
      time: formatPHTime(a.created_at),
    }));
    if (q) {
      arr = arr.filter((a) => {
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
    }
    if (sortCol) {
      arr = arr.slice().sort((a, b) => {
        let av: any = a[sortCol as keyof typeof a];
        let bv: any = b[sortCol as keyof typeof b];
        // Sort by badge label, not the raw user_role
        if (sortCol === "user_role") {
          av = !av || av.toLowerCase() === "authenticated" ? "Admin" : av;
          bv = !bv || bv.toLowerCase() === "authenticated" ? "Admin" : bv;
        }
        if (av < bv) return sortAsc ? -1 : 1;
        if (av > bv) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return arr;
  }, [activities, searchQuery, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = (currentPage - 1) * itemsPerPage;
  const paged = filtered.slice(pageStart, pageStart + itemsPerPage);

  // --- Export as Excel (.xls) ---
  async function handleExport() {
    setShowExport(false);
    // Log the export!
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
            sort: { col: sortCol, asc: sortAsc },
          },
        },
      ]);
    } catch {}
    // --- Build xlsx ---
    const headerRow = [
      "User",
      "Account Type",
      "Activity",
      "Date",
      "Time",
    ];
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
    const xlsBlob = XLSX.write(wb, {
      type: "array",
      bookType: "xls",
    });
    saveAs(
      new Blob([xlsBlob], { type: "application/vnd.ms-excel" }),
      `Activity_Log_${new Date().toISOString().slice(0, 10)}.xls`
    );
  }

  // --- Modern Confirmation Modal ---
  function ExportModal() {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md flex flex-col items-center">
          <div className="text-xl font-bold text-center mb-2">
            Are you sure you want to{" "}
            <span className="text-[#22c55e] font-extrabold">EXPORT</span> the
            Activity Log?
          </div>
          <div className="text-gray-700 text-center mb-6">
            This will export <b>only the currently displayed rows</b>
            <br />
            (
            <b>
              {paged.length} row{paged.length !== 1 && "s"}
            </b>{" "}
            on page {currentPage}) to Excel for printing.
          </div>
          <div className="flex gap-4 w-full justify-center">
            <button
              className="px-7 py-3 rounded-xl text-white font-semibold text-base bg-[#22c55e] hover:bg-[#19a94a] shadow"
              onClick={handleExport}
            >
              Yes, Export
            </button>
            <button
              className="px-7 py-3 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 font-semibold text-base shadow"
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
    <div
      className={`${dmSans.className} min-h-screen bg-gradient-to-b from-[#e8e6dd] to-[#ffd670]/60`}
    >
      <div className="w-full py-12 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-[#181918] mb-8 tracking-tight">
          Activity Log
        </h1>
        {/* Search bar - half width, centered */}
        <div className="w-1/2 max-w-[900px] min-w-[320px] mb-8 flex flex-row justify-between items-center gap-3">
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
          <button
            className="ml-4 px-6 py-2 rounded-xl bg-black hover:bg-[#22c55e] hover:text-white text-white text-base font-bold shadow transition"
            onClick={() => setShowExport(true)}
          >
            Export
          </button>
        </div>

        {/* Table */}
        <div className="rounded-3xl shadow-2xl border border-gray-100 bg-white/95 overflow-x-auto mb-10 w-full max-w-[1400px] xl:w-[1400px]">
          <table className="w-full text-lg">
            <thead className="bg-[#ffba20] text-[#181918]">
              <tr>
                <th
                  className="px-8 py-2 text-left font-bold rounded-tl-3xl text-lg cursor-pointer select-none"
                  onClick={() => {
                    setSortCol("user_email");
                    setSortAsc((asc) =>
                      sortCol === "user_email" ? !asc : true
                    );
                  }}
                >
                  User
                </th>
                <th
                  className="px-8 py-2 text-left font-bold text-lg cursor-pointer select-none"
                  onClick={() => {
                    setSortCol("user_role");
                    setSortAsc((asc) =>
                      sortCol === "user_role" ? !asc : true
                    );
                  }}
                >
                  Account Type
                </th>
                <th
                  className="px-8 py-2 text-left font-bold text-lg cursor-pointer select-none"
                  onClick={() => {
                    setSortCol("action");
                    setSortAsc((asc) =>
                      sortCol === "action" ? !asc : true
                    );
                  }}
                >
                  Activity
                </th>
                <th
                  className="px-8 py-2 text-left font-bold text-lg cursor-pointer select-none"
                  onClick={() => {
                    setSortCol("date");
                    setSortAsc((asc) =>
                      sortCol === "date" ? !asc : true
                    );
                  }}
                >
                  Date
                </th>
                <th
                  className="px-8 py-2 text-left font-bold rounded-tr-3xl text-lg cursor-pointer select-none"
                  onClick={() => {
                    setSortCol("time");
                    setSortAsc((asc) =>
                      sortCol === "time" ? !asc : true
                    );
                  }}
                >
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-7 py-8 text-center text-gray-500"
                  >
                    <Loader2 className="mx-auto animate-spin" size={28} />
                    <div className="mt-3 text-lg">Loading…</div>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                      {act.user_email ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-8 py-1">
                      {accountTypeBadge(act.user_role)}
                    </td>
                    <td className="px-8 py-1">{activityChip(act.action)}</td>
                    <td className="px-8 py-1 whitespace-nowrap text-[#222] font-bold tracking-wide">
                      <span className="block leading-tight font-medium">
                        {formatPHDate(act.created_at)}
                      </span>
                    </td>
                    <td className="px-8 py-1 whitespace-nowrap text-[#222] font-bold tracking-wide">
                      <span className="block leading-tight font-medium">
                        {formatPHTime(act.created_at)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
      {showExport && <ExportModal />}
    </div>
  );
}
