// src/components/CustomerNotificationBell.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BellRing, CheckCheck, Loader2, Clipboard } from "lucide-react";
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

/* ----------------------------- Config ----------------------------- */
type SupabaseChannelState = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
const MAX_ITEMS = 5;
const SEEN_KEY_BASE = "customer-notifs-seen-v1";
const RT_POLL_MS = 15000;
const RT_RETRY_MS = 4000;

const PLAY_SILENT_WAV =
  "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAABAAAAA=";

/** Customer-facing events we show (admin/system-driven only) */
const ADMIN_EVENT_TYPES = [
  "order_approved",
  "order_rejected",
  "order_completed",
  "payment_received",
  "payment_rejected",
  "invoice_sent",
  "receipt_sent",
  "delivery_scheduled",
  "delivery_to_ship",
  "delivery_to_receive",
  "delivery_delivered",
] as const;

/* ----------------------------- Types ------------------------------ */
type NotificationRow = {
  id: string | number;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  recipient_email?: string | null;
  recipient_name?: string | null;

  transaction_code?: string | null;

  actor_email?: string | null;
  actor_role?: string | null;
  source?: string | null;

  metadata?: Record<string, any> | null;
};

/* ----------------------------- Helpers ---------------------------- */
const formatPH = (d?: string | number | Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "";

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

function isAllowedNotification(n: NotificationRow, currentUserEmail?: string | null) {
  const typeOk = !!n.type && (ADMIN_EVENT_TYPES as readonly string[]).includes(n.type);
  if (!typeOk) return false;
  if (currentUserEmail && n.actor_email && n.actor_email === currentUserEmail) return false;
  if (n.source && !["admin", "system"].includes(n.source)) return false;
  return true;
}

/* ========================= Component ========================= */
export default function CustomerNotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<NotificationRow[]>([]);
  const [unseen, setUnseen] = useState<number>(0);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const emailRef = useRef<string | null>(null);
  const [seenKey, setSeenKey] = useState(SEEN_KEY_BASE);

  const ringRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  // Dedupe guards
  const seenIds = useRef<Set<string | number>>(new Set());
  const versionsRef = useRef<Map<string | number, string>>(new Map()); // id -> version

  // Channel & health
  const channelRef = useRef<RealtimeChannel | null>(null);
  const rtHealthyRef = useRef<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const allowedTypeSet = useMemo(
    () => new Set<string>(ADMIN_EVENT_TYPES as unknown as string[]),
    []
  );

  const getVersion = (row: NotificationRow) =>
    (row.updated_at && new Date(row.updated_at).toISOString()) ||
    `${row.title ?? ""}|${row.message ?? ""}|${row.type ?? ""}`;

  /* ------------------------- Load current user ------------------------- */
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email ? user.email.toLowerCase() : null; // ✅ force lowercase
      const name = (user?.user_metadata?.name as string) || email || null;
      setUserEmail(email);
      emailRef.current = email;
      setUserName(name);
      setSeenKey(`${SEEN_KEY_BASE}:${email || "guest"}`); // store key per lowercased email
      console.log("[bell] userEmail key:", email);
    })();
  }, []);

  useEffect(() => {
    emailRef.current = userEmail;
  }, [userEmail]);

  // Refresh when window/tab regains focus — code-only UI robustness
  useEffect(() => {
    const onFocus = () => fetchScoped(emailRef.current);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------- Seen tracking ----------------------- */
  const [seenMap, setSeenMapState] = useState<Record<string | number, boolean>>({});

  // Load seen map whenever the key (i.e., user) changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(seenKey);
      setSeenMapState(raw ? (JSON.parse(raw) as Record<string | number, boolean>) : {});
    } catch {
      setSeenMapState({});
    }
  }, [seenKey]);

  // Helper to persist + update state
  const setSeenMap = (m: Record<string | number, boolean>) => {
    try {
      localStorage.setItem(seenKey, JSON.stringify(m));
    } catch {}
    setSeenMapState(m);
  };

  const unseenCount = useMemo(
    () => list.reduce((acc, n) => (seenMap[n.id] ? acc : acc + 1), 0),
    [list, seenMap]
  );
  useEffect(() => setUnseen(unseenCount), [unseenCount]);

  /* --------------------------- Fetch -------------------------- */
  async function fetchScoped(currentUserEmail?: string | null) {
    setLoading(true);
    try {
      if (!currentUserEmail) {
        setList([]);
        setLoading(false);
        return;
      }

      const key = currentUserEmail.toLowerCase(); // ✅ lower for equality filter
      console.log("[bell] fetch key:", key);

      const { data, error } = await supabase
        .from("customer_notifications")
        .select("*")
        .eq("recipient_email", key) // ✅ match lowercase
        .order("created_at", { ascending: false })
        .limit(200)
        .neq("actor_email", key); // ✅ avoid self notifs using same key

      if (error) {
        console.groupCollapsed("customer_notifications fetch error");
        console.error("message:", error.message);
        // @ts-ignore
        console.error("details:", error.details);
        // @ts-ignore
        console.error("hint:", error.hint);
        console.groupEnd();
        setList([]);
        setLoading(false);
        return;
      }

      if (!Array.isArray(data)) {
        console.error("customer_notifications fetch returned non-array:", data);
        setList([]);
        setLoading(false);
        return;
      }

      const rows = (data as NotificationRow[]).filter(
        (n) => !!n.type && allowedTypeSet.has(n.type!) && isAllowedNotification(n, key)
      );

      for (const r of rows) {
        seenIds.current.add(r.id);
        versionsRef.current.set(r.id, getVersion(r));
      }

      setList(rows.slice(0, MAX_ITEMS));
    } catch (e) {
      console.error("customer_notifications fetch exception", e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchScoped(userEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  /* --------------------- Realtime + robust fallback ------------------- */
  const clearTimers = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const teardownChannel = () => {
    try {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    } catch {}
  };

  const startPollFallback = () => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      if (!rtHealthyRef.current) fetchScoped(emailRef.current);
    }, RT_POLL_MS);
  };

  const showToast = (row: NotificationRow) => {
    toast.info(row.title || "New notification", {
      description: row.message || "",
      action: {
        label: "Details",
        onClick: () => {
          setSelected(row);
          setDetailOpen(true);
        },
      },
    });
    try {
      ringRef.current?.play().catch(() => {});
    } catch {}
  };

  const handleRtPayload = (row: NotificationRow) => {
    if (!row?.recipient_email || !emailRef.current) return;
    if (row.recipient_email.toLowerCase() !== emailRef.current.toLowerCase()) return; // ✅
    if (!row?.type || !allowedTypeSet.has(row.type)) return;
    if (!isAllowedNotification(row, emailRef.current)) return;

    const verNext = getVersion(row);
    const hasId = seenIds.current.has(row.id);
    const verPrev = versionsRef.current.get(row.id);
    const isNewId = !hasId;
    const changed = hasId && verPrev !== verNext;
    if (!isNewId && !changed) return;

    seenIds.current.add(row.id);
    versionsRef.current.set(row.id, verNext);
    setList((prev) => [row, ...prev.filter((x) => x.id !== row.id)].slice(0, MAX_ITEMS));
    showToast(row);
  };

  const subscribeRealtime = (email: string) => {
    teardownChannel();
    rtHealthyRef.current = false;

    const key = email.toLowerCase(); // ✅ lower for channel filter & presence key
    console.log("[bell] RT subscribe key:", key);

    const filter = `recipient_email=eq.${key}`;
    const channel = supabase.channel(`cust-notifs:${key}`, {
      config: { broadcast: { self: false }, presence: { key } },
    });

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "customer_notifications", filter },
      (payload: any) => handleRtPayload(payload.new as NotificationRow)
    );

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "customer_notifications", filter },
      (payload: any) => handleRtPayload(payload.new as NotificationRow)
    );

    channel.subscribe(async (status: SupabaseChannelState) => {
      if (status === "SUBSCRIBED") {
        rtHealthyRef.current = true;
        await fetchScoped(emailRef.current);
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        rtHealthyRef.current = false;
        if (!retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            if (emailRef.current) subscribeRealtime(emailRef.current);
          }, RT_RETRY_MS);
        }
      } else if (status === "CLOSED") {
        rtHealthyRef.current = false;
      }
    });

    channelRef.current = channel;
  };

  useEffect(() => {
    clearTimers();
    if (!userEmail) {
      teardownChannel();
      startPollFallback();
      return;
    }
    subscribeRealtime(userEmail);
    startPollFallback();

    return () => {
      clearTimers();
      teardownChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  // Extra-safe global click-away using capturing pointerdown
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!open) return;
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener("pointerdown", handler, opts);
    return () => document.removeEventListener("pointerdown", handler, opts);
  }, [open]);

  /* ----------------------------- UI ----------------------------- */
  return (
    <>
      <audio ref={ringRef} preload="auto" src={PLAY_SILENT_WAV} />

      <div className="relative" ref={rootRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative rounded-full p-2 bg-white/90 shadow hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
          title="Notifications"
          aria-label="Notifications"
          aria-expanded={open}
        >
          <BellRing className="w-5 h-5 text-gray-800" />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
              {unseen > 99 ? "99+" : unseen}
            </span>
          )}
        </button>

        {/* Backdrop to guarantee click-away */}
        {open && (
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        {open && (
          <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-100 z-50">
            <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-white/90 backdrop-blur border-b">
              <div className="font-semibold text-sm">Notifications</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchScoped(emailRef.current)}
                  className="inline-flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
                  title="Refresh"
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    const next: Record<string | number, boolean> = { ...seenMap };
                    for (const n of list) next[n.id] = true;
                    setSeenMap(next);
                    setUnseen(0);
                  }}
                  className="inline-flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
                >
                  <CheckCheck className="w-4 h-4" />
                  Mark all read
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-6 flex items-center justify-center text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading…
              </div>
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No notifications yet.</div>
            ) : (
              <ul className="divide-y">
                {list.map((n) => {
                  const isSeen = !!seenMap[n.id];
                  return (
                    <li
                      key={String(n.id)}
                      onClick={() => {
                        setSelected(n);
                        setDetailOpen(true);
                        if (!seenMap[n.id]) {
                          const next = { ...seenMap, [n.id]: true };
                          setSeenMap(next);
                          setUnseen((u) => Math.max(0, u - 1));
                        }
                      }}
                      className={`px-3 py-3 hover:bg-gray-50 cursor-pointer ${
                        !isSeen ? "bg-yellow-50/60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 w-2 h-2 rounded-full ${
                            !isSeen ? "bg-yellow-500/80" : "bg-gray-300"
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
                          <div
                            className="text-[11px] text-gray-400 mt-1"
                            title={n.created_at ? formatPH(n.created_at) : ""}
                          >
                            {n.created_at ? timeAgo(n.created_at) : ""}
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

      {/* Details Modal (no routing, no Order ID/Link rows) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.title || selected?.type || "Notification"}</DialogTitle>
            <DialogDescription>
              {selected?.created_at && (
                <span className="text-xs text-gray-500">{formatPH(selected.created_at)}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selected?.message && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.message}</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              {selected?.transaction_code && (
                <div className="col-span-2 flex items-center justify-between rounded-md bg-gray-50 p-2">
                  <span className="text-gray-600">Transaction Code:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-gray-900">{selected.transaction_code}</code>
                    <button
                      title="Copy TXN code"
                      onClick={() =>
                        selected?.transaction_code &&
                        navigator.clipboard.writeText(selected.transaction_code)
                      }
                      className="p-1 rounded hover:bg-gray-200"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
          </div>

          <DialogFooter className="mt-4">
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
