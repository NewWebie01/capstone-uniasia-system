// components/Bargraph.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import supabase from "@/config/supabaseClient";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type RawSale = {
  amount: number;
  date: string;
};

type ChartPoint = {
  label: string;
  total: number;
};

const periodOptions = [
  { key: "Daily", label: "Last 7 Days" },
  { key: "Weekly", label: "Last 6 Weeks" },
  { key: "Monthly", label: "Last 6 Months" },
  { key: "YTD", label: "Year to Date" }, // Full display text here
  { key: "Annually", label: "Last 6 Years" },
] as const;

type Period = (typeof periodOptions)[number]["key"];

const Bargraph: React.FC = () => {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [data, setData] = useState<ChartPoint[]>([]);

  useEffect(() => {
    async function load() {
      const now = new Date();
      type Bucket = { key: string; label: string };
      const buckets: Record<string, number> = {};
      const timeline: Bucket[] = [];

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
              7
          );
          buckets[key] = 0;
          timeline.push({ key, label: `W${weekNum}` });
        }
      } else if (period === "Monthly") {
        for (let i = 5; i >= 0; i--) {
          const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          const label = dt.toLocaleString("en-US", { month: "short" });
          buckets[key] = 0;
          timeline.push({ key, label });
        }
      } else if (period === "YTD") {
        // From Jan 1 to today (daily), abbreviated month/day
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        let dt = new Date(startOfYear);
        while (dt <= now) {
          const key = dt.toISOString().slice(0, 10);
          const label = dt.toLocaleDateString("en-US", {
            month: "short", // abbreviated month
            day: "numeric",
          });
          buckets[key] = 0;
          timeline.push({ key, label });
          dt.setDate(dt.getDate() + 1);
        }
      } else {
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

      const { data: rowsRaw, error } = await supabase
        .from("sales")
        .select("amount, date")
        .gte("date", startDate);

      if (error) {
        console.error("Error loading sales:", error);
        return;
      }

      (rowsRaw ?? []).forEach(({ amount, date }) => {
        const dt = new Date(date);
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
          key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
        } else {
          key = `${dt.getFullYear()}`;
        }
        if (buckets[key] !== undefined) buckets[key] += Number(amount) || 0;
      });

      setData(
        timeline.map(({ key, label }) => ({
          label,
          total: buckets[key],
        }))
      );
    }

    load();
  }, [period]);

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
            <CardTitle>Sales Overview</CardTitle>
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
                {o.label} {/* Full label display */}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis width={60} tickFormatter={formatPHP} />
            <Tooltip formatter={(v: number) => formatPHP(v)} />
            <Bar dataKey="total" fill="#ffba20" radius={4} />
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
