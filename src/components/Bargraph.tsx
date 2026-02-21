// components/Bargraph.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";
// import supabase from "@/config/supabaseClient";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

// import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChartPoint = {
  label: string;
  total: number;
};

const periodOptions = [
  { key: "Daily", label: "Last 7 Days" },
  { key: "Weekly", label: "Last 6 Weeks" },
  { key: "Monthly", label: "Last 6 Months" },
  { key: "YTD", label: "Year to Date" },
  { key: "Annually", label: "Last 6 Years" },
] as const;

type Period = (typeof periodOptions)[number]["key"];

// Helper: interpolate color from green to yellow
function lerpColor(a: string, b: string, t: number) {
  const ah = parseInt(a.slice(1), 16),
    bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff,
    ag = (ah >> 8) & 0xff,
    ab = ah & 0xff;
  const br = (bh >> 16) & 0xff,
    bg = (bh >> 8) & 0xff,
    bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (rr << 16) | (rg << 8) | rb).toString(16).slice(1)}`;
}

const Bargraph: React.FC = () => {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [data, setData] = useState<ChartPoint[]>([]);

  const load = useCallback(async () => {
    const now = new Date();
    type Bucket = { key: string; label: string };
    const buckets: Record<string, number> = {};
    const timeline: Bucket[] = [];

    // Setup timeline buckets
    if (period === "Daily") {
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(now);
        dt.setDate(now.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        const label = dt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        buckets[key] = 0;
        timeline.push({ key, label });
      }
    } else if (period === "Weekly") {
      const getMonday = (d: Date) => {
        const day = d.getDay();
        const diff = (day + 6) % 7;
        const m = new Date(d);
        m.setDate(d.getDate() - diff);
        m.setHours(0, 0, 0, 0);
        return m;
      };
      for (let i = 5; i >= 0; i--) {
        const anchor = new Date(now);
        anchor.setDate(now.getDate() - i * 7);
        const monday = getMonday(anchor);
        const key = monday.toISOString().slice(0, 10);
        const weekNum = Math.ceil(
          ((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) /
            86400000 +
            1) /
            7,
        );
        buckets[key] = 0;
        timeline.push({ key, label: `W${weekNum}` });
      }
    } else if (period === "Monthly") {
      for (let i = 5; i >= 0; i--) {
        const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        const label = dt.toLocaleString("en-US", { month: "short" });
        buckets[key] = 0;
        timeline.push({ key, label });
      }
    } else if (period === "YTD") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      let dt = new Date(startOfYear);
      while (dt <= now) {
        const key = dt.toISOString().slice(0, 10);
        const label = dt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        buckets[key] = 0;
        timeline.push({ key, label });
        dt.setDate(dt.getDate() + 1);
      }
    } else {
      // Annually
      for (let i = 5; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const key = `${year}`;
        const label = `${year}`;
        buckets[key] = 0;
        timeline.push({ key, label });
      }
    }

    const startKey = timeline[0]?.key;
    if (!startKey) {
      setData([]);
      return;
    }

    const startDate =
      period === "Daily"
        ? startKey
        : period === "Weekly"
          ? startKey
          : period === "Monthly"
            ? `${startKey}-01`
            : period === "YTD"
              ? startKey
              : `${startKey}-01-01`;

    // ===== Pull RECEIVED payments only (Supabase) =====
    // const { data: pays, error } = await supabase
    //   .from("payments")
    //   .select("received_at, amount, status")
    //   .eq("status", "received")
    //   .not("received_at", "is", null)
    //   .gte("received_at", startDate);

    // if (error) {
    //   console.error("Error loading payments:", error);
    //   setData(timeline.map(({ key, label }) => ({ label, total: 0 })));
    //   return;
    // }

    // TEMP (no DB yet): empty payments
    const pays: any[] = [];

    // Sum into buckets by period using received_at
    (pays ?? []).forEach((row: any) => {
      const dt = new Date(row.received_at);
      let key = "";
      if (period === "Daily" || period === "YTD") {
        key = dt.toISOString().slice(0, 10);
      } else if (period === "Weekly") {
        const day = dt.getDay();
        const monday = new Date(dt);
        monday.setDate(dt.getDate() - ((day + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        key = monday.toISOString().slice(0, 10);
      } else if (period === "Monthly") {
        key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      } else {
        key = `${dt.getFullYear()}`;
      }
      if (buckets[key] !== undefined) buckets[key] += Number(row.amount) || 0;
    });

    setData(timeline.map(({ key, label }) => ({ label, total: buckets[key] })));
  }, [period]);

  // Initial + on period change
  useEffect(() => {
    load();
  }, [period, load]);

  // Realtime refresh (Supabase)
  // useEffect(() => {
  //   const ch = supabase.channel("bargraph-payments-rt");

  //   ch.on(
  //     "postgres_changes",
  //     { event: "*", schema: "public", table: "payments" },
  //     (payload: RealtimePostgresChangesPayload<any>) => {
  //       const statusOf = (row: any): string =>
  //         typeof row?.status === "string" ? row.status.toLowerCase() : "";

  //       const newStatus = statusOf(payload.new);
  //       const oldStatus = statusOf(payload.old);

  //       if (
  //         payload.eventType === "INSERT" ||
  //         payload.eventType === "DELETE" ||
  //         newStatus === "received" ||
  //         oldStatus === "received"
  //       ) {
  //         load();
  //       }
  //     },
  //   );

  //   ch.subscribe();
  //   return () => {
  //     supabase.removeChannel(ch);
  //   };
  // }, [load]);

  // ---- Color logic for bars ----
  const values = data.map((d) => d.total);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const getBarColor = (value: number) => {
    if (max === min) return "#43a047"; // Default green
    const t = (value - min) / (max - min);
    return lerpColor("#43a047", "#ffd600", t); // Green to yellow
  };

  const formatPHP = (v: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(v || 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center w-full">
          <div>
            <CardTitle>Payments Received</CardTitle>
            <CardDescription>
              {periodOptions.find((o) => o.key === period)!.label}
            </CardDescription>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="border rounded px-2 py-1 text-sm"
          >
            {periodOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 20, bottom: 20, left: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis width={60} tickFormatter={formatPHP} />
            <Tooltip formatter={(v: number) => formatPHP(v)} />
            <Bar dataKey="total" radius={4}>
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={getBarColor(entry.total)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>

      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          Trending up by 5.2% this period <TrendingUp className="h-4 w-4" />
        </div>
      </CardFooter>
    </Card>
  );
};

export default Bargraph;
