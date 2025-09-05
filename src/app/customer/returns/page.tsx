// src/app/customer/returns/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

/* ----------------------------- Date helpers ----------------------------- */
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
    : "—";

const daysBetween = (a?: string | Date | null, b?: string | Date | null) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

/* ------------------------ Return types + normalizer ---------------------- */
type ReturnReason =
  | "Damaged/Defective"
  | "Wrong Item"
  | "Missing Item/Part"
  | "Expired"
  | "Other";

type ReturnRow = {
  id: string;
  code: string;
  status: string;
  reason: ReturnReason;
  note: string | null;
  created_at: string;
  order_id: string;
  return_items: Array<{
    order_item_id: number;
    quantity: number;
    photo_urls: string[] | null;
    inventory: { product_name: string | null } | null;
  }>;
};

const toNum = (v: unknown, fallback = 0) =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : fallback;

const toStrOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

const normalizeReturns = (rows: any[]): ReturnRow[] =>
  (rows ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code ?? ""),
    status: String(r.status ?? "requested"),
    reason: (r.reason ?? "Other") as ReturnReason,
    note: toStrOrNull(r.note),
    created_at: r.created_at ?? new Date().toISOString(),
    order_id: String(r.order_id),
    return_items: (r.return_items ?? []).map((ri: any) => ({
      order_item_id: toNum(ri.order_item_id),
      quantity: toNum(ri.quantity, 0),
      photo_urls: Array.isArray(ri.photo_urls)
        ? ri.photo_urls.map((x: any) => String(x))
        : null,
      inventory: ri.inventory
        ? { product_name: toStrOrNull(ri.inventory.product_name) }
        : null,
    })),
  }));

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  id: number; // order_items.id is integer
  quantity: number; // original ordered quantity
  price: number | null;
  inventory_id: number | null;
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
  } | null;
};

type OrderRow = {
  id: string;
  status: string | null;
  truck_delivery_id?: string | number | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: string;
  code: string | null; // <-- TXN code
  email: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  orders?: OrderRow[];
};

/* -------------------------------- Component ------------------------------- */
export default function CustomerReturnsPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  // Data
  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = (id: string) =>
    setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const StatusChip = ({ status }: { status: string }) => {
    const s = (status || "").toLowerCase();
    const styles =
      s === "approved"
        ? "bg-green-100 text-green-700 border-green-200"
        : s === "rejected"
        ? "bg-red-100 text-red-700 border-red-200"
        : s === "processing" || s === "review"
        ? "bg-blue-100 text-blue-700 border-blue-200"
        : "bg-gray-100 text-gray-700 border-gray-200"; // requested, etc.
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs border ${styles}`}
      >
        {status || "—"}
      </span>
    );
  };

  // Track how many units already returned per order_item_id
  const [returnedQtyByItem, setReturnedQtyByItem] = useState<
    Record<number, number>
  >({});

  // Delivery status per truck_delivery_id
  const [deliveryStatusById, setDeliveryStatusById] = useState<
    Record<string, string>
  >({});
  // Map order_id -> TXN code (for grouping returns)
  const [orderIdToTxn, setOrderIdToTxn] = useState<Record<string, string>>({});

  // Keep ids around for subscriptions
  const deliveryIdsRef = useRef<Set<string>>(new Set());
  const orderIdsRef = useRef<Set<string>>(new Set());

  // Modal state
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sel, setSel] = useState<{
    txn?: CustomerTx;
    order?: OrderRow;
    item?: ItemRow;
  }>({});
  const [reason, setReason] = useState<ReturnReason>("Damaged/Defective");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  // Local previews for confirmation modal (object URLs)
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    if (files && files.length > 0) {
      const urls = Array.from(files)
        .slice(0, 5)
        .map((f) => URL.createObjectURL(f));
      setPreviewUrls(urls);
    } else {
      setPreviewUrls([]);
    }
    return () => {
      try {
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch {}
    };
  }, [files]);

  /* -------------------------- Initial load (user) ------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        setAuthEmail(email);

        if (!email) {
          setTxns([]);
          setReturnsList([]);
          setReturnedQtyByItem({});
          setDeliveryStatusById({});
          deliveryIdsRef.current = new Set();
          orderIdsRef.current = new Set();
          setOrderIdToTxn({});
          return;
        }

        // 1) customers -> orders -> items (also truck_delivery_id)
        const { data: customers, error } = await supabase
          .from("customers")
          .select(
            `
            id,
            code,
            email,
            name,
            phone,
            address,
            date,
            orders (
              id,
              status,
              truck_delivery_id,
              order_items (
                id,
                quantity,
                price,
                inventory_id,
                inventory:inventory_id (
                  product_name,
                  category,
                  subcategory,
                  status
                )
              )
            )
          `
          )
          .eq("email", email)
          .order("date", { ascending: false });

        if (error || !customers) {
          setTxns([]);
          deliveryIdsRef.current = new Set();
          orderIdsRef.current = new Set();
          setOrderIdToTxn({});
        } else {
          const list = customers as CustomerTx[];
          setTxns(list);

          // gather ids + build order->TXN map
          const dIds = new Set<string>();
          const oIds = new Set<string>();
          const orderToTxn: Record<string, string> = {};

          for (const t of list) {
            for (const o of t.orders ?? []) {
              const orderId = String(o.id);
              oIds.add(orderId);
              orderToTxn[orderId] = String(t.code ?? "—");
              if (o.truck_delivery_id != null)
                dIds.add(String(o.truck_delivery_id));
            }
          }
          deliveryIdsRef.current = dIds;
          orderIdsRef.current = oIds;
          setOrderIdToTxn(orderToTxn);

          // 2) fetch delivery statuses
          if (dIds.size > 0) {
            const { data: deliveries } = await supabase
              .from("truck_deliveries")
              .select("id, status")
              .in("id", Array.from(dIds));

            const map: Record<string, string> = {};
            (deliveries ?? []).forEach((d: any) => {
              map[String(d.id)] = String(d.status ?? "");
            });
            setDeliveryStatusById(map);
          } else {
            setDeliveryStatusById({});
          }

          // 3) load returns for the user’s orders
          await refreshReturns();
        }

        // 4) realtime
        setupRealtime();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      supabase.removeAllChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------- realtime subscriptions ----------------------- */
  const setupRealtime = () => {
    const ch1 = supabase
      .channel("cust-returns")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "returns" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row && orderIdsRef.current.has(String(row.order_id))) {
            refreshReturns();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "return_items" },
        () => {
          refreshReturns();
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel("cust-truck-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "truck_deliveries" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          const id = row?.id != null ? String(row.id) : null;
          if (id && deliveryIdsRef.current.has(id)) {
            setDeliveryStatusById((prev) => ({
              ...prev,
              [id]: String((payload.new as any)?.status ?? row?.status ?? ""),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch1);
        supabase.removeChannel(ch2);
      } catch {}
    };
  };

  const refreshReturns = async () => {
    const orderIds = Array.from(orderIdsRef.current);
    if (orderIds.length === 0) {
      setReturnsList([]);
      setReturnedQtyByItem({});
      return;
    }

    const { data: rtns } = await supabase
      .from("returns")
      .select(
        `
        id,
        code,
        status,
        reason,
        note,
        created_at,
        order_id,
        return_items (
          order_item_id,
          quantity,
          photo_urls,
          inventory:inventory_id ( product_name )
        )
      `
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    const normalized = normalizeReturns(rtns ?? []);
    setReturnsList(normalized);

    // Build returned quantity map per order_item_id
    const qtyMap: Record<number, number> = {};
    normalized.forEach((r) => {
      r.return_items.forEach((ri) => {
        if (typeof ri.order_item_id === "number") {
          qtyMap[ri.order_item_id] =
            (qtyMap[ri.order_item_id] || 0) + (ri.quantity || 0);
        }
      });
    });
    setReturnedQtyByItem(qtyMap);
  };

  /* --------------------- Derived: eligible items --------------------- */
  const eligibleRows = useMemo(() => {
    const out: Array<{ txn: CustomerTx; order: OrderRow; item: ItemRow }> = [];
    const now = new Date();

    for (const t of txns) {
      for (const o of t.orders ?? []) {
        const delivId =
          o.truck_delivery_id != null ? String(o.truck_delivery_id) : null;
        const delivStatus = delivId
          ? (deliveryStatusById[delivId] || "").toLowerCase()
          : "";
        const delivered = delivStatus === "delivered";
        const within7 = daysBetween(t.date, now) <= 7;
        if (!delivered || !within7) continue;

        for (const it of o.order_items ?? []) {
          const alreadyReturned = returnedQtyByItem[it.id] || 0;
          const remaining = Math.max(0, (it.quantity || 0) - alreadyReturned);
          if (remaining <= 0) continue;

          // Push a copy where quantity reflects the remaining eligible qty
          out.push({ txn: t, order: o, item: { ...it, quantity: remaining } });
        }
      }
    }
    return out;
  }, [txns, returnedQtyByItem, deliveryStatusById]);

  /* -------- Group by TXN code -------- */
  const eligibleByTxn = useMemo(() => {
    const groups: Record<
      string,
      Array<{ txn: CustomerTx; order: OrderRow; item: ItemRow }>
    > = {};
    for (const row of eligibleRows) {
      const key = row.txn.code ?? "—";
      (groups[key] ||= []).push(row);
    }
    return groups;
  }, [eligibleRows]);

  const returnsByTxn = useMemo(() => {
    const groups: Record<string, ReturnRow[]> = {};
    for (const r of returnsList) {
      const key = orderIdToTxn[r.order_id] ?? "—";
      (groups[key] ||= []).push(r);
    }
    return groups;
  }, [returnsList, orderIdToTxn]);

  /* ---------------------- Pagination for Eligible TXN groups ---------------------- */
  const eligibleGroups = useMemo(
    () => Object.entries(eligibleByTxn),
    [eligibleByTxn]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const groupsPerPage = 5; // how many TXN cards per page

  // reset to first page whenever groups change
  useEffect(() => {
    setCurrentPage(1);
  }, [eligibleGroups.length]);

  const totalPages = Math.max(
    1,
    Math.ceil(eligibleGroups.length / groupsPerPage)
  );

  // clamp page if groups shrink
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * groupsPerPage;
  const pageEnd = pageStart + groupsPerPage;
  const pagedEligibleGroups = useMemo(
    () => eligibleGroups.slice(pageStart, pageEnd),
    [eligibleGroups, pageStart, pageEnd]
  );

  const goToPage = (p: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  /* --------------------- Modal helpers --------------------- */
  const openModal = (row: {
    txn: CustomerTx;
    order: OrderRow;
    item: ItemRow;
  }) => {
    setSel(row);
    setReason("Damaged/Defective");
    setQty(1);
    setNote("");
    setFiles(null);
    setOpen(true);
    setConfirmOpen(false);
  };

  const generateReturnCode = () => {
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RTN-${yyyymmdd}-${rnd}`;
  };

  // First-step validation + open confirmation
  const openConfirmModal = () => {
    if (!sel.item) return;

    const maxQty = sel.item.quantity ?? 1; // remaining qty shown in modal
    const q = Number(qty) || 0;

    // REQUIRED: reason, qty within bounds, note non-empty, at least 1 photo
    if (!reason) {
      toast.error("Please select a reason for the return.");
      return;
    }
    if (q < 1 || q > maxQty) {
      toast.error(`Quantity must be between 1 and ${maxQty}.`);
      return;
    }
    if (!note || !note.trim()) {
      toast.error("Please provide notes describing the issue.");
      return;
    }
    if (!files || files.length === 0) {
      toast.error("Please upload at least one photo (up to 5).");
      return;
    }

    setConfirmOpen(true);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const valid = Array.from(files).filter((f) => f.type.startsWith("image/"));

    if (valid.length !== files.length) {
      toast.error("Only image files are allowed (jpg, png, gif, webp).");
    }

    // If at least one valid file, keep them, otherwise reset
    setFiles(valid.length ? (valid as unknown as FileList) : null);
  };

  const submitReturn = async () => {
    if (!sel.txn || !sel.order || !sel.item) return;

    const { txn, order, item } = sel as {
      txn: CustomerTx;
      order: OrderRow;
      item: ItemRow;
    };

    setSubmitting(true);
    try {
      const code = generateReturnCode();

      // 1) returns
      const { data: userData } = await supabase.auth.getUser();
      const { data: rtn, error: e1 } = await supabase
        .from("returns")
        .insert([
          {
            customer_id: txn.id,
            order_id: order.id,
            code,
            reason,
            note: note || null,
            created_by: userData.user?.id ?? null,
          },
        ])
        .select()
        .single();
      if (e1 || !rtn) throw e1 || new Error("Failed to create return");

      // 2) upload photos (required ≥1, up to 5)
      let urls: string[] = [];
      if (files && files.length > 0) {
        const bucket = supabase.storage.from("returns");
        const uploaded: string[] = [];
        for (const file of Array.from(files).slice(0, 5)) {
          const path = `${rtn.id}/${Date.now()}_${file.name}`;
          const { data: up, error: upErr } = await bucket.upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
          if (upErr) continue;
          const { data: pub } = bucket.getPublicUrl(up.path);
          if (pub?.publicUrl) uploaded.push(pub.publicUrl);
        }
        urls = uploaded;
      }
      if (urls.length === 0) {
        throw new Error(
          "Photo upload failed. Please attach at least one image."
        );
      }

      // 3) return_items
      const { error: e2 } = await supabase.from("return_items").insert([
        {
          return_id: rtn.id,
          order_item_id: item.id,
          inventory_id: item.inventory_id,
          quantity: qty,
          photo_urls: urls,
        },
      ]);
      if (e2) throw e2;

      toast.success("Return submitted. We’ll review it shortly.");

      // Optimistic updates:
      // - update returned qty map for this order_item
      setReturnedQtyByItem((prev) => ({
        ...prev,
        [item.id]: (prev[item.id] || 0) + qty,
      }));

      // - add to returns list (so history shows immediately)
      setReturnsList((prev) => [
        {
          id: String(rtn.id),
          code: String(rtn.code),
          status: String(rtn.status ?? "requested"),
          reason: rtn.reason ?? "Other",
          note: rtn.note ?? null,
          created_at: rtn.created_at ?? new Date().toISOString(),
          order_id: String(rtn.order_id),
          return_items: [
            {
              order_item_id: item.id,
              quantity: qty,
              photo_urls: urls,
              inventory: { product_name: item.inventory?.product_name ?? null },
            },
          ],
        },
        ...prev,
      ]);

      // Close both modals
      setConfirmOpen(false);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit return.");
    } finally {
      setSubmitting(false);
    }
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
        Returns &amp; Issues
      </h1>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        Manage your return requests, report issues with delivered items, and
        track the status of your submissions.
      </p>

      {!authEmail && !loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Please sign in to view this page.</p>
        </div>
      )}

      {loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Loading…</p>
        </div>
      )}

      {!loading && authEmail && (
        <>
          {eligibleGroups.length === 0 ? (
            <div className="bg-white border rounded-2xl p-4 shadow-sm mb-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  Eligible for Return (delivery delivered, within 7 days)
                </h2>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                No items are currently eligible.
              </p>
            </div>
          ) : (
            <>
              {pagedEligibleGroups.map(([txnCode, rows]) => (
                <div
                  key={txnCode}
                  className="bg-white border rounded-2xl p-4 shadow-sm mb-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg">
                      Eligible for Return • TXN:{" "}
                      <span className="tracking-wider">{txnCode}</span>
                    </h2>
                    <span className="text-sm text-gray-500">
                      {rows.length} item(s)
                    </span>
                  </div>

                  <div className="mt-3 border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-2 px-3 text-left">Product</th>
                          <th className="py-2 px-3 text-left">Order Date</th>
                          <th className="py-2 px-3 text-left">Remaining Qty</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ txn, order, item }) => (
                          <tr key={item.id} className="border-t">
                            <td className="py-2 px-3">
                              {item.inventory?.product_name ?? "—"}
                            </td>
                            <td className="py-2 px-3">{formatPH(txn.date)}</td>
                            <td className="py-2 px-3">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                className="px-3 py-1 rounded-xl text-white hover:opacity-90"
                                style={{ background: "#000" }}
                                onClick={() => openModal({ txn, order, item })}
                              >
                                Return / Report issue
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Pagination controls — inline, no gradient */}
              <div className="mt-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  {/* Prev */}
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg 
                                bg-white/70 backdrop-blur-sm ring-1 ring-black/10
                                hover:bg-white active:translate-y-px transition
                                text-gray-800
                                disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label="Previous page"
                    title="Previous page"
                  >
                    <span className="text-lg">←</span>
                    <span className="font-medium">Prev</span>
                  </button>

                  {/* Center status */}
                  <div className="text-sm sm:text-base font-medium text-gray-900/90 text-center">
                    Page <span className="font-bold">{currentPage}</span> of{" "}
                    <span className="font-bold">{totalPages}</span>
                    <span className="hidden sm:inline text-gray-700/80">
                      {" "}
                      • Showing{" "}
                      {eligibleGroups.length > 0 ? (
                        <>
                          <span className="font-semibold">{pageStart + 1}</span>
                          –
                          <span className="font-semibold">
                            {Math.min(pageEnd, eligibleGroups.length)}
                          </span>{" "}
                          of{" "}
                          <span className="font-semibold">
                            {eligibleGroups.length}
                          </span>
                        </>
                      ) : (
                        "0"
                      )}
                    </span>
                  </div>

                  {/* Next */}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg 
                                bg-white/70 backdrop-blur-sm ring-1 ring-black/10
                                hover:bg-white active:translate-y-px transition
                                text-gray-800
                                disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label="Next page"
                    title="Next page"
                  >
                    <span className="font-medium">Next</span>
                    <span className="text-lg">→</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal: Create Return */}
      {open && sel.item && sel.order && sel.txn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl ring-1 ring-black/5 p-6">
            <h3 className="text-xl font-semibold">Return / Report issue</h3>
            <p className="text-sm text-gray-600 mt-1">
              {sel.item.inventory?.product_name}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <select
                  className="border px-3 py-2 rounded w-full"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                >
                  <option>Damaged/Defective</option>
                  <option>Wrong Item</option>
                  <option>Missing Item/Part</option>
                  <option>Expired</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Quantity (max {sel.item.quantity}){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={sel.item.quantity}
                  value={qty}
                  onChange={(e) =>
                    setQty(
                      Math.max(
                        1,
                        Math.min(
                          sel.item!.quantity,
                          Number(e.target.value) || 1
                        )
                      )
                    )
                  }
                  className="border px-3 py-2 rounded w-full"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="border px-3 py-2 rounded w-full"
                  placeholder="Describe the issue to help us resolve it faster."
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Photos (required, up to 5){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFiles(e.target.files)}
                  className="block w-full text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={openConfirmModal}
                className="px-4 py-2 rounded-xl bg-[#ffba20] text-black shadow-lg hover:brightness-95 active:translate-y-px transition"
                disabled={submitting}
              >
                Review & Submit
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Returns are accepted within 7 days of purchase for delivered
              orders. We’ll review your request and contact you with the next
              steps.
            </p>
          </div>
        </div>
      )}

      {/* Modal: Confirmation (second step) */}
      {confirmOpen && sel.item && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl ring-1 ring-black/5 p-6">
            <h3 className="text-xl font-semibold">Confirm Return Details</h3>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Product</span>
                <span className="font-medium text-right">
                  {sel.item.inventory?.product_name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Reason</span>
                <span className="font-medium text-right">{reason}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Quantity</span>
                <span className="font-medium text-right">{qty}</span>
              </div>
              {note ? (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Note</span>
                  <span className="font-medium text-right whitespace-pre-wrap">
                    {note}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Photos</span>
                <span className="font-medium text-right">
                  {files ? Math.min(files.length, 5) : 0}
                </span>
              </div>

              {previewUrls.length > 0 && (
                <div className="pt-2">
                  <div className="text-gray-600 mb-2">Preview</div>
                  <div className="flex gap-2 flex-wrap">
                    {previewUrls.map((u, i) => (
                      <img
                        key={i}
                        src={u}
                        alt={`preview-${i}`}
                        className="w-14 h-14 object-cover rounded border"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
                disabled={submitting}
              >
                Back
              </button>
              <button
                onClick={submitReturn}
                className="px-4 py-2 rounded-xl bg-black text-white shadow-lg hover:opacity-90 active:translate-y-px transition"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              By confirming, you’ll submit this return request for review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
