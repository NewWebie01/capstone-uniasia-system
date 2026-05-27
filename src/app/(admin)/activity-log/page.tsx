"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Loader2 } from "lucide-react";
import { DM_Sans } from "next/font/google";
import * as XLSX from "xlsx";
import { parseDbDate, formatPHDate, formatPHTime } from "@/lib/datetimePH";

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

/* ------------------------------- UI helpers -------------------------------- */
function accountTypeBadge(role: string | null) {
  let text = "";
  let color = "";

  if (!role || role.toLowerCase() === "authenticated") {
    text = "Admin";
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
  } else if (role?.toLowerCase() === "admin") {
    text = "Admin";
    color = "bg-[#e0f2fe] text-blue-800 border border-blue-200";
  } else if (role?.toLowerCase() === "customer") {
    text = "Customer";
    color = "bg-[#f0fdf4] text-green-800 border border-green-200";
  } else {
    text = role ?? "—";
    color = "bg-gray-100 text-gray-600 border border-gray-200";
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded-full border ${color}`}
    >
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
    <span
      className={`inline-block px-2.5 py-0.5 text-xs rounded-full ${color}`}
    >
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

/* ----------------------------- PH time helpers ---------------------------- */
/** Philippines is UTC+8 all year (no DST). */
const PH_OFFSET_HOURS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Convert a UTC Date to the UTC instant representing PH local midnight of the same PH date. */
function startOfPHDay(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const dayLocal = new Date(Math.floor(msLocal / MS_PER_DAY) * MS_PER_DAY);
  return new Date(dayLocal.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHDay(dUTC: Date): Date {
  const start = startOfPHDay(dUTC);
  return new Date(start.getTime() + MS_PER_DAY - 1);
}
function startOfPHWeek(dUTC: Date): Date {
  const startDay = startOfPHDay(dUTC);
  const msLocal = startDay.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const local = new Date(msLocal);
  const day = local.getUTCDay(); // 0=Sun ... 6=Sat
  const mondayDelta = (day + 6) % 7;
  const localMonday = new Date(local.getTime() - mondayDelta * MS_PER_DAY);
  return new Date(localMonday.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHWeek(dUTC: Date): Date {
  const start = startOfPHWeek(dUTC);
  return new Date(start.getTime() + 7 * MS_PER_DAY - 1);
}
function startOfPHMonth(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const local = new Date(msLocal);
  const firstLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  );
  return new Date(firstLocal.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHMonth(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const local = new Date(msLocal);
  const firstNextLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)
  );
  return new Date(firstNextLocal.getTime() - PH_OFFSET_HOURS * 3600 * 1000 - 1);
}
function startOfPHYear(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const local = new Date(msLocal);
  const firstLocal = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return new Date(firstLocal.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHYear(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const local = new Date(msLocal);
  const firstNextLocal = new Date(Date.UTC(local.getUTCFullYear() + 1, 0, 1));
  return new Date(firstNextLocal.getTime() - PH_OFFSET_HOURS * 3600 * 1000 - 1);
}
/** PH-local midnight (YYYY-MM-DD) to UTC */
function startOfPHDateString(yyyy_mm_dd: string): Date {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const phMidnightUtc = new Date(Date.UTC(y, m - 1, d));
  return new Date(phMidnightUtc.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHDateString(yyyy_mm_dd: string): Date {
  const start = startOfPHDateString(yyyy_mm_dd);
  return new Date(start.getTime() + MS_PER_DAY - 1);
}

type ExportChoice =
  | "today"
  | "this_week"
  | "this_month"
  | "this_year"
  | "custom"
  | "all";

function describeRange(choice: ExportChoice, start?: Date, end?: Date) {
  const fmt = (d: Date) =>
    new Date(d.getTime() + PH_OFFSET_HOURS * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
  switch (choice) {
    case "today":
      return `TODAY: ${fmt(start!)} (${fmt(start!)} 00:00–${fmt(
        end!
      )} 23:59 PH)`;
    case "this_week":
      return `THIS_WEEK: ${fmt(start!)} — ${fmt(end!)}`;
    case "this_month":
      return `THIS_MONTH: ${fmt(start!)} — ${fmt(end!)}`;
    case "this_year":
      return `THIS_YEAR: ${fmt(start!)} — ${fmt(end!)}`;
    case "custom":
      return `CUSTOM: ${fmt(start!)} — ${fmt(end!)}`;
    default:
      return "ALL";
  }
}

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchQuery, setSearchQuery] = useState("");
  const [quick, setQuick] = useState<ActionTabKey>("all");

  // pagination & sorting
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  // Export modal & options
  const [showExport, setShowExport] = useState(false);
  const [exportChoice, setExportChoice] = useState<ExportChoice>("today");
  const [customStart, setCustomStart] = useState<string>(""); // YYYY-MM-DD (PH local)
  const [customEnd, setCustomEnd] = useState<string>(""); // YYYY-MM-DD (PH local)
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>("");

  // Re-auth states (security)
  const [showReauth, setShowReauth] = useState(false);
  const [reauthEmail, setReauthEmail] = useState<string>("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthing, setReauthing] = useState(false);
  const [reauthError, setReauthError] = useState("");
  const [lastReauthAt, setLastReauthAt] = useState<number | null>(null);
  const REAUTH_TTL_MS = 0.5 * 60 * 1000; // 30 seconds
  const needsReauth = () =>
    !lastReauthAt || Date.now() - lastReauthAt > REAUTH_TTL_MS;

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

    // Precompute PH display strings (optional)
    arr = arr.map((a) => ({
      ...a,
      date: formatPHDate(a.created_at),
      time: formatPHTime(a.created_at),
    })) as any;

    if (q) {
      arr = arr.filter((a: any) => {
        const detailsText = a.details
          ? JSON.stringify(a.details).toLowerCase()
          : "";
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
        if (key === "created_at") {
          const av = parseDbDate(a.created_at).getTime();
          const bv = parseDbDate(b.created_at).getTime();
          const base = av < bv ? -1 : av > bv ? 1 : 0;
          return direction === "asc" ? base : -base;
        } else {
          let av: any = a[key];
          let bv: any = b[key];
          if (typeof av === "string") av = av.toLowerCase();
          if (typeof bv === "string") bv = bv.toLowerCase();
          if (av == null) av = "";
          if (bv == null) bv = "";
          const base = av < bv ? -1 : av > bv ? 1 : 0;
          return direction === "asc" ? base : -base;
        }
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

  /** Resolve the UTC start/end based on selected exportChoice (PH-local windows). */
  function resolveRange(): { start?: Date; end?: Date; label: string } {
    const nowUTC = new Date();
    if (exportChoice === "all") return { label: "ALL" };

    if (exportChoice === "today") {
      const start = startOfPHDay(nowUTC);
      const end = endOfPHDay(nowUTC);
      return { start, end, label: describeRange("today", start, end) };
    }
    if (exportChoice === "this_week") {
      const start = startOfPHWeek(nowUTC);
      const end = endOfPHWeek(nowUTC);
      return { start, end, label: describeRange("this_week", start, end) };
    }
    if (exportChoice === "this_month") {
      const start = startOfPHMonth(nowUTC);
      const end = endOfPHMonth(nowUTC);
      return { start, end, label: describeRange("this_month", start, end) };
    }
    if (exportChoice === "this_year") {
      const start = startOfPHYear(nowUTC);
      const end = endOfPHYear(nowUTC);
      return { start, end, label: describeRange("this_year", start, end) };
    }
    // custom
    if (!customStart || !customEnd) {
      return { label: "CUSTOM: (invalid)" };
    }
    const start = startOfPHDateString(customStart);
    const end = endOfPHDateString(customEnd);
    return { start, end, label: describeRange("custom", start, end) };
  }

  // ---- PASSWORD GATE ----
  async function handleExportNow() {
    setExportError("");
    if (needsReauth()) {
      const { data } = await supabase.auth.getUser();
      setReauthEmail(data?.user?.email || "");
      setShowReauth(true);
      return;
    }
    await doExportNow();
  }

  async function confirmReauth() {
    setReauthError("");
    setReauthing(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: reauthEmail,
        password: reauthPassword,
      });
      if (error) throw error;

      setLastReauthAt(Date.now());
      setShowReauth(false);
      setReauthPassword("");
      await doExportNow();
    } catch (e: any) {
      setReauthError(e?.message || "Authentication failed.");
    } finally {
      setReauthing(false);
    }
  }

  // ---- ACTUAL EXPORT (PH window → UTC, exclusive end) ----
  async function doExportNow() {
    setExporting(true);
    try {
      const { start, end, label } = resolveRange();
      let query = supabase
        .from("activity_logs")
        .select("id, user_email, user_role, action, details, created_at")
        .order("created_at", { ascending: false });

      if (exportChoice !== "all") {
        if (!start || !end) {
          setExportError("Please provide a valid date range.");
          setExporting(false);
          return;
        }
        const endExclusive = new Date(end.getTime() + 1);
        query = query
          .gte("created_at", start.toISOString())
          .lt("created_at", endExclusive.toISOString());
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Log the export action (let DB set created_at with default now())
      try {
        const { data } = await supabase.auth.getUser();
        const userEmail = data?.user?.email || "unknown";
        await supabase.from("activity_logs").insert([
          {
            user_email: userEmail,
            user_role: "admin",
            action:
              exportChoice === "all"
                ? "Exported Activity Log (ALL)"
                : `Exported Activity Log (${label})`,
            details: {
              rows: rows?.length ?? 0,
              filter: exportChoice,
              ...(exportChoice !== "all"
                ? {
                    start_utc: start?.toISOString(),
                    end_utc: end?.toISOString(),
                  }
                : {}),
            },
            // created_at omitted on purpose
          },
        ]);
      } catch {
        /* ignore logging errors */
      }

      // Build and download workbook
      const headerRow = ["User", "Account Type", "Activity", "Date", "Time"];
      const exportRows =
        rows?.map((a) => [
          a.user_email,
          !a.user_role || a.user_role.toLowerCase() === "authenticated"
            ? "Admin"
            : a.user_role.charAt(0).toUpperCase() + a.user_role.slice(1),
          a.action,
          formatPHDate(a.created_at),
          formatPHTime(a.created_at),
        ]) ?? [];

      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Activity Log");

      const fileSuffix =
        exportChoice === "all"
          ? "ALL"
          : resolveRange()
              .label.replace(/[^\dA-Z_ -]/gi, "")
              .replace(/\s+/g, "_");
      XLSX.writeFile(
        wb,
        `Activity_Log_${fileSuffix}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`
      );

      setShowExport(false);
    } catch (err: any) {
      setExportError(err?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`${dmSans.className} px-4 pb-6 pt-1`}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="pt-1 text-3xl font-bold mb-1">Activity Log</h1>
          <p className="text-sm text-gray-500 mb-2">
            Track and review system activities performed by users.
          </p>
        </div>
      </div>

      {/* Quick chips */}
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

      {/* Filters */}
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
                  <td
                    colSpan={5}
                    className="py-6 text-center text-gray-400 text-sm"
                  >
                    No activities found.
                  </td>
                </tr>
              ) : (
                paged.map((act) => (
                  <tr key={act.id} className="border-t hover:bg-gray-50">
                    <td className="py-2 px-3">{act.user_email ?? "—"}</td>
                    <td className="py-2 px-3">
                      {accountTypeBadge(act.user_role)}
                    </td>
                    <td className="py-2 px-3">{activityChip(act.action)}</td>
                    <td className="py-2 px-3">
                      {formatPHDate(act.created_at)}
                    </td>
                    <td className="py-2 px-3">
                      {formatPHTime(act.created_at)}
                    </td>
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
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-semibold mb-2 text-center">
              Export Activity Log
            </h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              Choose a time frame to include in the Excel export.
            </p>

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "today", label: "Today" },
                  { key: "this_week", label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "this_year", label: "This Year" },
                  { key: "custom", label: "Custom Range" },
                  { key: "all", label: "All" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
                      exportChoice === (opt.key as ExportChoice)
                        ? "border-black bg-gray-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportChoice"
                      value={opt.key}
                      checked={exportChoice === (opt.key as ExportChoice)}
                      onChange={() => setExportChoice(opt.key as ExportChoice)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>

              {exportChoice === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      Start date (PH)
                    </label>
                    <input
                      type="date"
                      className="border rounded-lg px-3 py-2 w-full"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      End date (PH)
                    </label>
                    <input
                      type="date"
                      className="border rounded-lg px-3 py-2 w-full"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {exportError && (
                <div className="text-xs text-red-600">{exportError}</div>
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 rounded bg-black text-white hover:opacity-90 text-sm disabled:opacity-50"
                onClick={handleExportNow}
                disabled={
                  exporting ||
                  (exportChoice === "custom" && (!customStart || !customEnd))
                }
              >
                {exporting ? "Exporting…" : "Export Now"}
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={() => {
                  setShowExport(false);
                  setExportChoice("today");
                  setCustomStart("");
                  setCustomEnd("");
                  setExportError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-auth modal */}
      {showReauth && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold mb-2 text-center">
              Confirm Your Identity
            </h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              For security, please re-enter your password to export logs.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={reauthEmail}
                  disabled
                  aria-disabled="true"
                  tabIndex={-1}
                  className="border rounded-lg px-3 py-2 w-full bg-gray-100 text-gray-500 cursor-not-allowed opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
              </div>
              {reauthError && (
                <div className="text-xs text-red-600">{reauthError}</div>
              )}
            </div>

            <div className="flex gap-3 justify-center mt-5">
              <button
                className="px-4 py-2 rounded bg-black text-white hover:opacity-90 text-sm disabled:opacity-50"
                onClick={confirmReauth}
                disabled={reauthing || !reauthPassword}
              >
                {reauthing ? "Verifying…" : "Verify & Continue"}
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={() => {
                  setShowReauth(false);
                  setReauthPassword("");
                  setReauthError("");
                }}
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
