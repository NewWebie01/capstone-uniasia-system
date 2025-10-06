"use client";
import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";
import { Clock } from "lucide-react";

const DAYS_AHEAD = 7;

const ExpirationNotify = () => {
  const [expNotify, setExpNotify] = useState(0);

  useEffect(() => {
    const today = new Date();
    const until = new Date(Date.now() + DAYS_AHEAD * 86400000);
    supabase
      .from("inventory")
      .select("id", { count: "exact", head: true })
      .gte("expiration_date", today.toISOString().slice(0, 10))
      .lte("expiration_date", until.toISOString().slice(0, 10))
      .then(({ count }) => setExpNotify(count || 0));
  }, []);

  return (
    <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
      <Clock className="w-8 h-8 text-yellow-500" />
      <div>
        <div className="text-2xl font-bold">{expNotify}</div>
        <div className="text-xs text-neutral-500">ExpNotify (7 days)</div>
      </div>
    </div>
  );
};

export default ExpirationNotify;
