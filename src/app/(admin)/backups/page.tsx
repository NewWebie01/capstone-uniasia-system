"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Download,
  RotateCcw,
  Server,
  PlayCircle,
  RefreshCw,
} from "lucide-react";

type Artifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  updated_at: string;
};

const formatBytes = (n: number) =>
  !n
    ? "0 B"
    : n < 1024
    ? `${n} B`
    : n < 1024 ** 2
    ? `${(n / 1024).toFixed(1)} KB`
    : n < 1024 ** 3
    ? `${(n / 1024 ** 2).toFixed(1)} MB`
    : `${(n / 1024 ** 3).toFixed(1)} GB`;

export default function BackupsPage() {
  const [loading, setLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [dbUrl, setDbUrl] = useState<string>(
    "postgresql://***:***@aws-0-<region>.pooler.supabase.com:5432/postgres"
  );

  const fetchArtifacts = async () => {
    try {
      const res = await fetch("/api/backup/list", { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setArtifacts(j.items || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load backups");
    }
  };

  useEffect(() => {
    fetchArtifacts();
    fetch("/api/runtime/env")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v?.db && setDbUrl(v.db))
      .catch(() => {});
  }, []);

  const triggerBackup = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backup/trigger", { method: "POST" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Trigger failed");
      toast.success("Backup requested. Refresh in ~1–2 minutes.");
    } catch (e: any) {
      toast.error(e.message || "Unable to trigger backup");
    } finally {
      setLoading(false);
    }
  };

  const restoreHelper = (fileHint: string) => {
    const text = [
      "# Unpack the ZIP you downloaded; inside is a .tar.gz or .tar",
      "unzip backup_<id>.zip",
      "",
      "# Extract the tarball (Windows PowerShell):",
      "mkdir backup",
      fileHint.endsWith(".tar.gz")
        ? `tar -xzf ${fileHint} -C backup`
        : `tar -xf ${fileHint} -C backup`,
      "",
      "# Restore (pooler URL, SSL required). Schema first, then data:",
      `psql "postgresql://postgres:YOUR_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" -f backup/schema_*.sql`,
      `psql "postgresql://postgres:YOUR_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" -f backup/data_*.sql`,
      "",
      "# Tip: Use a staging project first. For prod, put app in maintenance/read-only while restoring.",
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Restore steps copied to clipboard");
  };

  const rows = useMemo(
    () =>
      artifacts.map((a) => (
        <tr key={a.id} className="border-b border-white/10">
          <td className="py-3">{a.name}</td>
          <td className="py-3">{new Date(a.created_at).toLocaleString()}</td>
          <td className="py-3">{formatBytes(a.size_in_bytes)}</td>
          <td className="py-3">
            {a.expired ? (
              <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-300">
                Expired
              </span>
            ) : (
              <span className="px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-300">
                Available
              </span>
            )}
          </td>
          <td className="py-3 flex gap-2">
            <a
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20"
              href={`/api/backup/download?id=${a.id}`}
            >
              <Download className="w-4 h-4" /> Download
            </a>
            {/* The artifact is a ZIP; it will contain your .tar.gz file (e.g., supabase-backup_YYYY.tar.gz) */}
            <button
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20"
              onClick={() =>
                restoreHelper("supabase-backup_YYYY-mm-ddTHH-MM-SSZ.tar.gz")
              }
              title="Copy restore commands"
            >
              <RotateCcw className="w-4 h-4" /> Restore Helper
            </button>
          </td>
        </tr>
      )),
    [artifacts]
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <motion.h1
        className="text-2xl font-semibold mb-4"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="inline-flex items-center gap-2">
          <Server className="w-6 h-6" /> Database Backups
        </span>
      </motion.h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={triggerBackup}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-amber-500/90 hover:bg-amber-500 text-black font-medium"
        >
          <PlayCircle className="w-5 h-5" />
          {loading ? "Requesting..." : "Trigger Backup"}
        </button>

        <button
          onClick={fetchArtifacts}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20"
        >
          <RefreshCw className="w-4 h-4" /> Refresh List
        </button>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Created</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">{rows}</tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/60">
        Note: Artifacts are ZIPs that contain your{" "}
        <code>supabase-backup_*.tar.gz</code>. Extract the ZIP, then the
        tarball.
      </p>
    </div>
  );
}
