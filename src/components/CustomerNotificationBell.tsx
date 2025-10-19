"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, Loader2, ExternalLink, Clipboard } from "lucide-react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const MAX_ITEMS = 5;
const SEEN_KEY_BASE = "customer-notifs-seen-v1";

type NotificationRow = {
  id: string | number;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;

  // Optional deep-link fields if you use them
  href?: string | null;
  order_id?: string | null;
  transaction_code?: string | null;
  customer_id?: string | null;
  // Add any other metadata your table stores (it will render if present)
  metadata?: Record<string, any> | null;
};

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ciIncludes = (hay?: string | null, needle?: string | null) =>
  hay && needle ? hay.toLowerCase().includes(needle.toLowerCase()) : false;

function matchesUser(n: NotificationRow, email?: string | null, name?: string | null) {
  if (!n) return false;
  if (email && n.recipient_email === email) return true;
  if (name && n.recipient_name === name) return true;
  if (email && (ciIncludes(n.title, email) || ciIncludes(n.message, email))) return true;
  if (name && (ciIncludes(n.title, name) || ciIncludes(n.message, name))) return true;
  return false;
}

export default function CustomerNotificationBell() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<NotificationRow[]>([]);
  const [unseen, setUnseen] = useState<number>(0);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState(SEEN_KEY_BASE);

  const ringRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Details modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  // Load user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email || null;
      const name = (user?.user_metadata?.name as string) || email || null;
      setUserEmail(email);
      setUserName(name);
      setSeenKey(`${SEEN_KEY_BASE}:${email || "guest"}`);
    })();
  }, []);

  // seen map helpers
  const getSeenMap = () => {
    try {
      const raw = localStorage.getItem(seenKey);
      return raw ? (JSON.parse(raw) as Record<string | number, boolean>) : {};
    } catch {
      return {};
    }
  };
  const setSeenMap = (m: Record<string | number, boolean>) => {
    try {
      localStorage.setItem(seenKey, JSON.stringify(m));
    } catch {}
  };

  const unseenCount = useMemo(() => {
    const seen = getSeenMap();
    return list.reduce((acc, n) => (seen[n.id] ? acc : acc + 1), 0);
  }, [list, seenKey]);

  useEffect(() => setUnseen(unseenCount), [unseenCount]);

  // Initial fetch (scoped) — capped to 5
  async function fetchScoped(email?: string | null, name?: string | null) {
    setLoading(true);

    // Try server-side filter first
    if (email || name) {
      try {
        const ors: string[] = [];
        if (email) ors.push(`recipient_email.eq.${email}`);
        if (name) ors.push(`recipient_name.eq.${name}`);

        if (ors.length > 0) {
          const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .or(ors.join(","))
            .order("created_at", { ascending: false })
            .limit(MAX_ITEMS);

          if (!error && data) {
            setList((data as NotificationRow[]) ?? []);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }

    // Fallback: fetch more then filter client-side, then cap to 5
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setList([]);
      setLoading(false);
      return;
    }

    const filtered = (data as NotificationRow[]).filter((n) => matchesUser(n, email, name));
    setList(filtered.slice(0, MAX_ITEMS));
    setLoading(false);
  }

  useEffect(() => {
    if (userEmail || userName) fetchScoped(userEmail, userName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, userName]);

  // Realtime: insert (scoped if possible), delete by id
  useEffect(() => {
    if (!userEmail && !userName) return;
    const ch = supabase.channel("notifications-realtime-customer");

    let usedFiltered = false;
    try {
      if (userEmail) {
        ch.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_email=eq.${userEmail}` },
          (payload: any) => handleIncoming(payload.new as NotificationRow)
        );
        usedFiltered = true;
      }
      if (userName) {
        ch.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_name=eq.${userName}` },
          (payload: any) => handleIncoming(payload.new as NotificationRow)
        );
        usedFiltered = true;
      }
    } catch {}

    if (!usedFiltered) {
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const row = payload.new as NotificationRow;
          if (matchesUser(row, userEmail, userName)) handleIncoming(row);
        }
      );
    }

    ch.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "notifications" },
      (payload: any) => {
        const id = payload.old?.id;
        setList((prev) => prev.filter((n) => n.id !== id));
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, userName]);

  const handleIncoming = (row: NotificationRow) => {
    setList((prev) => {
      const dedup = [row, ...prev.filter((x) => x.id !== row.id)];
      return dedup.slice(0, MAX_ITEMS);
    });
    try {
      ringRef.current?.play().catch(() => {});
    } catch {}
    toast.info(row.title || "New notification", { description: row.message || "" });
  };

  // Click-away & ESC to close dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return;
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = () => {
    const seen = getSeenMap();
    for (const n of list) seen[n.id] = true;
    setSeenMap(seen);
    setUnseen(0);
  };

  const markOneRead = (id: string | number) => {
    const seen = getSeenMap();
    if (!seen[id]) {
      seen[id] = true;
      setSeenMap(seen);
      setUnseen((u) => Math.max(0, u - 1));
    }
  };

  const toggle = () => setOpen((v) => !v);

  // Open details modal for a clicked notif
  const openDetails = (n: NotificationRow) => {
    setSelected(n);
    setDetailOpen(true);
    markOneRead(n.id);
  };

  // Optional: deep-link button handler
  const goToLink = (n: NotificationRow) => {
    if (n.href) {
      router.push(n.href);
      setDetailOpen(false);
      setOpen(false);
      return;
    }
    // Example fallbacks you can tweak:
    if (n.transaction_code) {
      router.push(`/customer?txn=${encodeURIComponent(n.transaction_code)}`);
      setDetailOpen(false);
      setOpen(false);
    } else if (n.order_id) {
      router.push(`/customer/orders/${encodeURIComponent(n.order_id)}`);
      setDetailOpen(false);
      setOpen(false);
    }
  };

  const copyText = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <>
      <audio
        ref={ringRef}
        preload="auto"
        src="data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAABAAAAA="
      />
      <div className="relative" ref={rootRef}>
        <button
          onClick={toggle}
          className="relative rounded-full p-2 bg-white/90 shadow hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
          title="Notifications"
          aria-label="Notifications"
        >
          <BellRing className="w-5 h-5 text-gray-800" />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
              {unseen > 99 ? "99+" : unseen}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-100 z-50">
            <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-white/90 backdrop-blur border-b">
              <div className="font-semibold text-sm">Notifications</div>
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </button>
            </div>

            {loading ? (
              <div className="p-6 flex items-center justify-center text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading…
              </div>
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No notifications for your account yet.
              </div>
            ) : (
              <ul className="divide-y">
                {list.map((n) => {
                  const seen = getSeenMap()[n.id];
                  return (
                    <li
                      key={String(n.id)}
                      onClick={() => openDetails(n)}
                      className={`px-3 py-3 hover:bg-gray-50 cursor-pointer ${
                        !seen ? "bg-yellow-50/60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 w-2 h-2 rounded-full ${
                            !seen ? "bg-yellow-500/80" : "bg-gray-300"
                          } shrink-0`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 line-clamp-1">
                            {n.title || n.type || "Notification"}
                          </div>
                          {n.message && (
                            <div className="text-[12px] text-gray-600 mt-0.5 line-clamp-2">
                              {n.message}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-1">
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Details Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>{selected?.title || selected?.type || "Notification"}</span>
              {selected?.href && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  onClick={() => selected && goToLink(selected)}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              )}
            </DialogTitle>
            <DialogDescription>
              {selected?.created_at ? (
                <span className="text-xs text-gray-500">
                  {new Date(selected.created_at).toLocaleString("en-PH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selected?.message && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.message}</p>
            )}

            {/* Render extra known fields if present */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {selected?.transaction_code && (
                <div className="col-span-2 flex items-center justify-between rounded-md bg-gray-50 p-2">
                  <span className="text-gray-600">Transaction Code:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-gray-900">{selected.transaction_code}</code>
                    <button
                      title="Copy TXN code"
                      onClick={() => copyText(selected.transaction_code!)}
                      className="p-1 rounded hover:bg-gray-200"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {selected?.order_id && (
                <div className="col-span-2 flex items-center justify-between rounded-md bg-gray-50 p-2">
                  <span className="text-gray-600">Order ID:</span>
                  <code className="text-gray-900">{selected.order_id}</code>
                </div>
              )}
              {selected?.type && (
                <div className="col-span-1 flex items-center justify-between rounded-md bg-gray-50 p-2">
                  <span className="text-gray-600">Type:</span>
                  <span className="text-gray-900">{selected.type}</span>
                </div>
              )}
              {(selected?.recipient_name || selected?.recipient_email) && (
                <div className="col-span-1 flex items-center justify-between rounded-md bg-gray-50 p-2">
                  <span className="text-gray-600">To:</span>
                  <span className="text-gray-900">
                    {selected?.recipient_name || selected?.recipient_email}
                  </span>
                </div>
              )}
            </div>

            {/* Generic metadata dump (if you store a JSON object) */}
            {selected?.metadata && (
              <pre className="text-xs bg-gray-50 rounded-md p-2 overflow-x-auto">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            )}
          </div>

          <DialogFooter className="mt-4">
            {/* Deep-link button if available or derivable */}
            {(selected?.href || selected?.transaction_code || selected?.order_id) && (
              <button
                onClick={() => selected && goToLink(selected)}
                className="inline-flex items-center gap-2 rounded-md bg-[#ffba20] text-black px-3 py-2 text-sm font-medium hover:brightness-95"
              >
                <ExternalLink className="w-4 h-4" />
                Open related page
              </button>
            )}
            <button
              onClick={() => setDetailOpen(false)}
              className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
