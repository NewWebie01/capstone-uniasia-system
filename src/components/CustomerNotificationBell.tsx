// src/components/CustomerNotificationBell.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Add this just under your imports
type SupabaseChannelState = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";


const MAX_ITEMS = 5;
const SEEN_KEY_BASE = "customer-notifs-seen-v1";

/** Customer-facing events we show */
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

type NotificationRow = {
  id: string | number;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;

  recipient_email?: string | null;
  recipient_name?: string | null;

  href?: string | null;
  order_id?: string | null;
  transaction_code?: string | null;
  customer_id?: string | null;

  actor_email?: string | null;
  actor_role?: string | null;
  source?: string | null;

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

/** Allow only customer-facing types; optionally exclude self-authored */
function isAllowedNotification(n: NotificationRow, currentUserEmail?: string | null) {
  const typeOk = !!n.type && (ADMIN_EVENT_TYPES as readonly string[]).includes(n.type);
  if (!typeOk) return false;
  // Optional: avoid showing notifications triggered by this same user
  if (currentUserEmail && n.actor_email && n.actor_email === currentUserEmail) return false;
  return true;
}

export default function CustomerNotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<NotificationRow[]>([]);
  const [unseen, setUnseen] = useState<number>(0);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const emailRef = useRef<string | null>(null); // always-latest email for realtime filter
  const [seenKey, setSeenKey] = useState(SEEN_KEY_BASE);

  const ringRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Details modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  // Dedupe guard for realtime payloads
  const seenIds = useRef<Set<string | number>>(new Set());

  // A fast lookup set for allowed types
  const allowedTypeSet = useMemo(() => new Set<string>(ADMIN_EVENT_TYPES as unknown as string[]), []);

  // Load user once
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || null;
      const name = (user?.user_metadata?.name as string) || email || null;
      setUserEmail(email);
      emailRef.current = email;
      setUserName(name);
      setSeenKey(`${SEEN_KEY_BASE}:${email || "guest"}`);
    })();
  }, []);

  // keep ref in sync if email changes later
  useEffect(() => {
    emailRef.current = userEmail;
  }, [userEmail]);

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

  const seenMap = useMemo(() => {
    try {
      const raw = localStorage.getItem(seenKey);
      return raw ? (JSON.parse(raw) as Record<string | number, boolean>) : {};
    } catch {
      return {};
    }
  }, [seenKey]);

  const unseenCount = useMemo(() => {
    return list.reduce((acc, n) => (seenMap[n.id] ? acc : acc + 1), 0);
  }, [list, seenMap]);

  useEffect(() => setUnseen(unseenCount), [unseenCount]);

  /** Initial fetch — scope to this customer's email; cap to MAX_ITEMS and dedupe */
  async function fetchScoped(currentUserEmail?: string | null) {
    setLoading(true);
    try {
      if (!currentUserEmail) {
        setList([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("customer_notifications")
        .select("*")
        .eq("recipient_email", currentUserEmail)
        .order("created_at", { ascending: false })
        .limit(60);

      // Optional: don't show items triggered by this exact user
      query = query.neq("actor_email", currentUserEmail);

      const { data, error } = await query;
      if (error || !data) {
        console.error("customer_notifications fetch error", error);
        setList([]);
        setLoading(false);
        return;
      }

      // Filter by allowed types and slice
      const rows = (data as NotificationRow[])
        .filter((n) => !!n.type && allowedTypeSet.has(n.type!) && isAllowedNotification(n, currentUserEmail));

      // Seed dedupe set
      for (const r of rows) seenIds.current.add(r.id);

      setList(rows.slice(0, MAX_ITEMS));
    } catch (e) {
      console.error("customer_notifications fetch exception", e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch when we know the user
  useEffect(() => {
    fetchScoped(userEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  /**
   * Realtime: subscribe INSERT-only with server-side filter.
   * Re-created whenever userEmail changes, and auto-logs connection states.
   */
  useEffect(() => {
    if (!userEmail) return; // wait for session

    const channel = supabase.channel(`customer-notifs:${userEmail}`, {
      config: {
        broadcast: { self: false },
        presence: { key: userEmail },
      },
    });

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "customer_notifications",
        filter: `recipient_email=eq.${userEmail}`,
      },
      (payload: any) => {
        const row = payload.new as NotificationRow;

        // Dedupe guard: ignore if we've seen this id already
        if (row?.id != null && seenIds.current.has(row.id)) return;

        // Filter by allowed types & not self-authored
        if (!row?.type || !allowedTypeSet.has(row.type)) return;
        if (!isAllowedNotification(row, emailRef.current)) return;

        // Accept now and mark seen in-memory so it won't duplicate
        if (row?.id != null) seenIds.current.add(row.id);

        // Insert at top, cap
        setList((prev) => {
          const next = [row, ...prev.filter((x) => x.id !== row.id)];
          return next.slice(0, MAX_ITEMS);
        });

        // SFX + Toast
        try {
          ringRef.current?.play().catch(() => {});
        } catch {}
        toast.info(row.title || "New notification", {
          description: row.message || "",
        });
      }
    );



// ...

// Subscribe with correct type guard (string comparisons are fine)
void channel.subscribe((status: SupabaseChannelState) => {
  console.log("[customer-notifs realtime]", status, "for", userEmail);

  if (status === "SUBSCRIBED") {
    // initial subscribe or re-subscribe: backfill anything missed
    fetchScoped(emailRef.current);
  } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
    // optional: soft refetch after a short delay
    setTimeout(() => fetchScoped(emailRef.current), 1000);
  }
  // CLOSED => nothing to do; cleanup handled in return()
});




    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [userEmail, allowedTypeSet]); // rebind when email changes

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
    const seen = { ...getSeenMap() };
    for (const n of list) seen[n.id] = true;
    setSeenMap(seen);
    setUnseen(0);
  };

  const markOneRead = (id: string | number) => {
    const seen = { ...getSeenMap() };
    if (!seen[id]) {
      seen[id] = true;
      setSeenMap(seen);
      setUnseen((u) => Math.max(0, u - 1));
    }
  };

  const toggle = () => setOpen((v) => !v);

  const openDetails = (n: NotificationRow) => {
    setSelected(n);
    setDetailOpen(true);
    markOneRead(n.id);
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
              <div className="p-6 text-center text-gray-500 text-sm">No notifications yet.</div>
            ) : (
              <ul className="divide-y">
                {list.map((n) => {
                  const isSeen = !!seenMap[n.id];
                  return (
                    <li
                      key={String(n.id)}
                      onClick={() => openDetails(n)}
                      className={`px-3 py-3 hover:bg-gray-50 cursor-pointer ${!isSeen ? "bg-yellow-50/60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 w-2 h-2 rounded-full ${!isSeen ? "bg-yellow-500/80" : "bg-gray-300"} shrink-0`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 line-clamp-1">
                            {n.title || n.type || "Notification"}
                          </div>
                          {n.message && (
                            <div className="text-[12px] text-gray-600 mt-0.5 line-clamp-2">{n.message}</div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</div>
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
            <DialogTitle>{selected?.title || selected?.type || "Notification"}</DialogTitle>
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
                    timeZone: "Asia/Manila",
                  })}
                </span>
              ) : null}
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
                        selected?.transaction_code && navigator.clipboard.writeText(selected.transaction_code)
                      }
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
