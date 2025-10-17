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
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose, // Remove if not exported by your Dialog
} from "@/components/ui/dialog";
import supabase from "@/config/supabaseClient";

/* ========== ACTIVITY LOGGING ========= */
async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const userEmail = data?.user?.email || "";
    await supabase.from("activity_logs").insert([
      {
        user_email: userEmail,
        user_role: "admin",
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    // Fails silently
  }
}

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

  const [listLoading, setListLoading] = useState(false);

  const fetchArtifacts = async () => {
    try {
      setListLoading(true);
      const res = await fetch("/api/backup/list", { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setArtifacts(j.items || []);
      await logActivity("Refresh Backup List", {});
    } catch (e: any) {
      toast.error(e.message || "Failed to load backups");
    } finally {
      setListLoading(false);
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
      await logActivity("Trigger Backup", {});
    } catch (e: any) {
      toast.error(e.message || "Unable to trigger backup");
    } finally {
      setLoading(false);
    }
  };

  const restoreToStaging = async (artifactId: number) => {
    try {
      const res = await fetch("/api/restore/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId, target: "staging" }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok)
        throw new Error(j.error || `Restore dispatch failed (${res.status})`);
      toast.success(
        "Restore dispatched. Check GitHub → Actions → Supabase DB Restore."
      );
      await logActivity("Restore To Staging (Confirm)", { artifactId });
    } catch (e: any) {
      toast.error(e.message || "Failed to dispatch restore");
    }
  };

  const restoreHelper = (fileHint: string, artifact: Artifact) => {
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
    logActivity("Restore Helper Copy", {
      artifactId: artifact.id,
      artifactName: artifact.name,
      fileHint,
    });
  };

  function RestoreToStagingButton({
    artifactId,
    artifactName,
    onConfirm,
  }: {
    artifactId: number;
    artifactName: string;
    onConfirm: (id: number) => Promise<void>;
  }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
      try {
        setBusy(true);
        await onConfirm(artifactId);
        setOpen(false);
      } catch (e: any) {
        toast.error(e.message || "Failed to dispatch restore");
      } finally {
        setBusy(false);
      }
    };

    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) {
            logActivity("Open Restore To Staging Modal", {
              artifactId,
              artifactName,
            });
          } else {
            logActivity("Cancel Restore To Staging Modal", {
              artifactId,
              artifactName,
            });
          }
        }}
      >
        <DialogTrigger asChild>
          <button
            className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 whitespace-nowrap"
            title="Restore this backup to staging"
          >
            <RotateCcw className="w-4 h-4" /> Restore
          </button>
        </DialogTrigger>

        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore to staging?</DialogTitle>
            <DialogDescription>
              This will <b>overwrite</b> the current data in your <b>staging</b>{" "}
              database with this backup. Continue?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
                Cancel
              </button>
            </DialogClose>
            <button
              onClick={confirm}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/90 text-black hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? "Restoring..." : "Yes, restore"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const rows = useMemo(
    () =>
      artifacts.map((a) => (
        <tr
          key={a.id}
          className="even:bg-white/60 odd:bg-white/40 hover:bg-white/70 border-b border-black/5"
        >
          <td className="py-4 px-4 font-medium text-gray-900">{a.name}</td>
          <td className="py-4 px-4 text-gray-900">
            {new Date(a.created_at).toLocaleString()}
          </td>
          <td className="py-4 px-4 text-gray-900">
            {formatBytes(a.size_in_bytes)}
          </td>
          <td className="py-4 px-4">
            {a.expired ? (
              <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                Expired
              </span>
            ) : (
              <span className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">
                Available
              </span>
            )}
          </td>
          <td className="py-3 px-4 w-[440px] whitespace-nowrap">
            <div className="inline-flex flex-nowrap items-center gap-2">
              <a
                className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                href={`/api/backup/download?id=${a.id}`}
                onClick={() =>
                  logActivity("Download Backup", {
                    artifactId: a.id,
                    artifactName: a.name,
                  })
                }
              >
                <Download className="w-4 h-4" /> Download
              </a>

              <button
                className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-black/5 hover:bg-black/10 text-gray-900"
                onClick={() =>
                  restoreHelper(
                    "supabase-backup_YYYY-mm-ddTHH-MM-SSZ.tar.gz",
                    a
                  )
                }
                title="Copy restore commands"
              >
                <RotateCcw className="w-4 h-4" /> Helper
              </button>

              {/* uses the updated styled trigger above */}
              <RestoreToStagingButton
                artifactId={a.id}
                artifactName={a.name}
                onConfirm={restoreToStaging}
              />
            </div>
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
          disabled={listLoading}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-60"
        >
          <RefreshCw
            className={`w-4 h-4 ${listLoading ? "animate-spin" : ""}`}
          />
          {listLoading ? "Refreshing…" : "Refresh List"}
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border border-amber-500/40 bg-gradient-to-b from-amber-200/60 to-amber-100/30">
        <table className="w-full text-sm">
          <thead className="bg-amber-400 text-gray-900">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Created</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3 w-[440px]">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-black/5">
            {listLoading ? (
              <tr>
                <td colSpan={5} className="p-6">
                  <div className="flex items-center gap-3 text-gray-900">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-transparent" />
                    Loading latest backups…
                  </div>
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
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
