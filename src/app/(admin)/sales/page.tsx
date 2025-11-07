"use client";
import { Suspense } from "react";
import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";
import { on, off } from "@/utils/eventEmitter";

import {
  formatPHDate,
  formatPHTime,
  formatPHISODate,
  getPHISOString,
} from "@/lib/datetimePH";

/* =========================
   TYPES
========================= */
type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  amount: number;
  profit?: number;
};

type MovingProduct = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  current_stock: number;
  units_90d: number;
  est_days_of_cover: number | null;
  pr_units_velocity: number;
};

type OrderWithDetails = {
  id: string;
  total_amount: number;
  status: string;
  date_created: string;
  payment_terms?: number | null;
  interest_percent?: number | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    address: string;
    contact_person?: string;
    code?: string;
    area?: string;
    date?: string;
    transaction?: string;
    status?: string;
    payment_type?: string;
    customer_type?: string;
    order_count?: number;
  };
  order_items: {
    quantity: number;
    price: number;
    inventory: {
      id: number;
      sku: string;
      product_name: string;
      category: string;
      subcategory: string;
      unit: string;
      quantity: number;
      unit_price: number;
      cost_price?: number;
      amount?: number;
    };
  }[];
};

type PickingOrder = { orderId: string; status: "accepted" | "rejected" };

function SalesPageContent() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Removed: showModal (Picking List). We only use Sales Order + Final Confirm.
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [showSalesOrderModal, setShowSalesOrderModal] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const orderRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const pendingOrdersSectionRef = useRef<HTMLDivElement>(null);

  // quantities are locked to ordered values; discounts are editable in Sales Order
  const [editedQuantities, setEditedQuantities] = useState<number[]>([]);
  const [editedDiscounts, setEditedDiscounts] = useState<number[]>([]);

  const [pickingStatus, setPickingStatus] = useState<PickingOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Terms/Interest
  const [numberOfTerms, setNumberOfTerms] = useState(1);
  const [interestPercent, setInterestPercent] = useState(0);

  // Sales order meta
  const [poNumber, setPoNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [isSalesTaxOn, setIsSalesTaxOn] = useState(true);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [orderToReject, setOrderToReject] = useState<OrderWithDetails | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [forwarder, setForwarder] = useState("");

  // Activity Logs Modal state (unchanged API – modal UI not included here)
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logOrderId, setLogOrderId] = useState<string | null>(null);

  type Processor = { name: string; email: string; role: string | null };
  const [processor, setProcessor] = useState<Processor | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userRow } = await supabase
        .from("users")
        .select("display_name, role")
        .eq("email", user.email ?? "")
        .maybeSingle();
      const friendly =
        userRow?.display_name ||
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        (user.email ? user.email.split("@")[0] : "User");
      setProcessor({
        name: friendly,
        email: user.email ?? "unknown",
        role: userRow?.role ?? user.user_metadata?.role ?? null,
      });

      setRepName((prev) => (prev && prev.trim() ? prev : nameOnly(friendly)));
    })();
  }, []);

  // Pick up target order if navigated from NotificationBell
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("scroll-to-order-id");
      if (id) {
        sessionStorage.removeItem("scroll-to-order-id");
        setPendingScrollId(id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (id: string) => setPendingScrollId(id);
    on("scroll-to-order", handler);
    return () => off("scroll-to-order", handler);
  }, []);

  async function fetchActivityLogs(orderId: string) {
    setLogsLoading(true);
    setLogOrderId(orderId);
    setShowLogsModal(true);
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("details->>order_id", orderId)
      .order("created_at", { ascending: false });
    if (!error && data) setActivityLogs(data);
    else toast.error("Failed to fetch activity logs.");
    setLogsLoading(false);
  }

  /* ======= Moving Products Report (combined fast & slow) ======= */
  const [movingProducts, setMovingProducts] = useState<MovingProduct[]>([]);
  const [showMovingReport, setShowMovingReport] = useState(false);

  const fetchMovingProducts = async () => {
    // Use the same view, sort by units_90d desc for “fast”; we can show both ends in one table.
    const { data, error } = await supabase
      .from("v_fast_moving_products")
      .select("*")
      .order("units_90d", { ascending: false });
    if (!error && data) setMovingProducts(data);
  };

  const ordersPerPage = 10;

  // Interest mapping helper
  const interestFromTerms = (terms: number) => {
    if (!terms || terms <= 0) return 0;
    if (terms <= 1) return 2;
    if (terms <= 3) return 6;
    if (terms <= 6) return 12;
    if (terms <= 12) return 24;
    return Math.min(30, Math.round((terms / 12) * 24));
  };

  /* ======= Totals (uses discounts now edited in Sales Order modal) ======= */
  const totals = useMemo(() => {
    if (!selectedOrder) {
      return {
        subtotalBeforeDiscount: 0,
        totalDiscount: 0,
        subtotalAfterDiscount: 0,
        tax: 0,
        effectiveInterestPercent: 0,
        interestAmount: 0,
        grandTotal: 0,
        perTerm: 0,
      };
    }

    const subtotalBeforeDiscountCalc = selectedOrder.order_items.reduce(
      (sum, item, idx) => {
        if (item.inventory.quantity === 0) return sum;
        const qty = editedQuantities[idx] ?? item.quantity;
        return sum + qty * item.price;
      },
      0
    );

    const totalDiscountCalc = selectedOrder.order_items.reduce(
      (sum, item, idx) => {
        if (item.inventory.quantity === 0) return sum;
        const qty = editedQuantities[idx] ?? item.quantity;
        const percent = editedDiscounts[idx] ?? 0;
        return sum + qty * item.price * (percent / 100);
      },
      0
    );

    const subtotalAfterDiscount = Math.max(
      0,
      subtotalBeforeDiscountCalc - totalDiscountCalc
    );

    const tax = isSalesTaxOn ? subtotalAfterDiscount * 0.12 : 0;
    const baseTotal = subtotalAfterDiscount + tax;

    const isCredit = selectedOrder.customers.payment_type === "Credit";
    const effectiveInterestPercent = isCredit
      ? interestPercent || interestFromTerms(numberOfTerms)
      : 0;

    const interestAmount = baseTotal * (effectiveInterestPercent / 100);
    const grandTotal = baseTotal + interestAmount;
    const perTerm =
      isCredit && numberOfTerms > 0 ? grandTotal / numberOfTerms : grandTotal;

    return {
      subtotalBeforeDiscount: subtotalBeforeDiscountCalc,
      totalDiscount: totalDiscountCalc,
      subtotalAfterDiscount,
      tax,
      effectiveInterestPercent,
      interestAmount,
      grandTotal,
      perTerm,
    };
  }, [
    selectedOrder,
    editedQuantities,
    editedDiscounts,
    isSalesTaxOn,
    numberOfTerms,
    interestPercent,
  ]);

  const computedOrderTotal = totals.subtotalAfterDiscount;
  const salesTaxValue = totals.tax;
  const getGrandTotalWithInterest = () => totals.grandTotal;
  const getPerTermAmount = () => totals.perTerm;
  const subtotalBeforeDiscount = totals.subtotalBeforeDiscount;
  const totalDiscount = totals.totalDiscount;

  /* ======= Scroll helpers ======= */
  function scrollToOrder(orderId: string) {
    const el = orderRefs.current[orderId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-500");
      setTimeout(() => el.classList.remove("ring-2", "ring-blue-500"), 1200);
    }
  }
  useEffect(() => {
    if (!pendingScrollId) return;
    const exists = orders.some((o) => o.id === pendingScrollId);
    if (exists) {
      document.getElementById("pending-orders-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      requestAnimationFrame(() => {
        scrollToOrder(pendingScrollId);
      });
      setPendingScrollId(null);
    }
  }, [orders, pendingScrollId]);

  /* ======= Stats cards ======= */
  const totalOrders = orders.length;
  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "completed").length,
    [orders]
  );
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  // 👉 Autofill Sales Rep with the customer's name (locked/read-only)
useEffect(() => {
  if (!selectedOrder) return;
  const customerName = selectedOrder.customers?.name || "";
  if (customerName) setRepName(customerName);
}, [selectedOrder, showSalesOrderModal]);

  useEffect(() => {
  if (showSalesOrderModal && (!repName || !repName.trim()) && processor?.name) {
    setRepName(nameOnly(processor.name));
  }
}, [showSalesOrderModal, processor, repName]);

  /* ======= Data fetches & realtime ======= */
  const fetchItems = async () => {
    const { data } = await supabase.from("inventory").select("*, profit");
    if (data) setItems(data);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        status,
        total_amount,
        date_created,
        payment_terms,
        interest_percent,
        customers:customer_id (
          id,
          name,
          email,
          phone,
          address,
          contact_person,
          code,
          area,
          date,
          transaction,
          status,
          payment_type,
          customer_type,
          order_count
        ),
        order_items (
          quantity,
          price,
          inventory:inventory_id (
            id,
            sku,
            product_name,
            category,
            subcategory,
            unit,
            quantity,
            unit_price,
            cost_price
          )
        )
      `
      )
      .order("date_created", { ascending: false });

    if (!error && data) {
      const formatted = data.map((o: any) => ({
        ...o,
        customers: Array.isArray(o.customers) ? o.customers[0] : o.customers,
        order_items: o.order_items.map((item: any) => ({
          ...item,
          inventory: Array.isArray(item.inventory) ? item.inventory[0] : item.inventory,
        })),
      }));
      setOrders(formatted);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchOrders();
    fetchMovingProducts();

    const inventoryChannel: RealtimeChannel = supabase
      .channel("inventory-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        fetchItems();
        fetchMovingProducts();
      })
      .subscribe();

    const ordersChannel: RealtimeChannel = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  /* ======= Helpers ======= */
  const resetSalesForm = () => {
    setPoNumber("");
    setRepName("");
    setForwarder("");
    setNumberOfTerms(1);
    setInterestPercent(0);
    setIsSalesTaxOn(true);
    setEditedQuantities([]);
    setEditedDiscounts([]);
    setFieldErrors({ poNumber: false, repName: false });
  };

  useEffect(() => {
    if (!showSalesOrderModal) resetSalesForm();
  }, [showSalesOrderModal]);

  const isOrderAccepted = (orderId: string) =>
    pickingStatus.some((p) => p.orderId === orderId && p.status === "accepted");

  // Validation state
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({
    poNumber: false,
    repName: false,
  });

  /* ======= Accept / Reject / Complete ======= */
  const handleAcceptOrder = async (order: OrderWithDetails) => {
    // Log acceptance intent
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userEmail = user?.email || "unknown";
      const userRole = user?.user_metadata?.role || "unknown";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          user_role: userRole,
          action: "Accept Sales Order",
          details: {
            order_id: order.id,
            customer_name: order.customers.name,
            customer_email: order.customers.email,
            items: order.order_items.map((oi) => ({
              product_name: oi.inventory.product_name,
              ordered_qty: oi.quantity,
              unit_price: oi.price,
            })),
            total_amount: order.total_amount,
            payment_type: order.customers.payment_type,
          },
          created_at: getPHISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to log activity for order acceptance:", err);
    }

    // Mark accepted immediately (no picking modal anymore)
    const { error } = await supabase.from("orders").update({ status: "accepted" }).eq("id", order.id);
    if (error) {
      toast.error("Failed to accept order: " + error.message);
      return;
    }

    setSelectedOrder(order);
    setRepName(order.customers?.name || "");
    setEditedQuantities(order.order_items.map((item) => item.quantity));
    setEditedDiscounts(order.order_items.map(() => 0));
    setNumberOfTerms(order.payment_terms || 1);
    setInterestPercent(order.interest_percent || interestFromTerms(order.payment_terms || 1));

    setShowSalesOrderModal(true);
    setRepName((prev) => (prev && prev.trim() ? prev : nameOnly(processor?.name || "")));

    setPickingStatus((prev) => [...prev, { orderId: order.id, status: "accepted" }]);

    // Notify customer: order approved
    try {
      await fetch("/api/notify-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: order.customers.email,
          recipientName: order.customers.name,
          type: "order_approved",
          title: "Order Approved",
          message: `Your order ${order.customers.code ?? order.id} has been approved.`,
          href: `/customer?txn=${order.customers.code ?? order.id}`,
          orderId: order.id,
          transactionCode: order.customers.code ?? null,
          actorEmail: processor?.email ?? "admin@system",
        }),
      });
    } catch (e) {
      console.error("notify (order_approved) failed:", e);
    }
  };

  const handleRejectOrder = async (order: OrderWithDetails) => {
    setPickingStatus((prev) => [...prev, { orderId: order.id, status: "rejected" }]);
    await supabase.from("orders").update({ status: "rejected" }).eq("id", order.id);

    // notify
    try {
      await fetch("/api/notify-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: order.customers.email,
          recipientName: order.customers.name,
          type: "order_rejected",
          title: "Order Rejected",
          message: `We're sorry — your order ${order.customers.code ?? order.id} was rejected.`,
          href: `/customer?txn=${order.customers.code ?? order.id}`,
          orderId: order.id,
          transactionCode: order.customers.code ?? null,
          actorEmail: (await supabase.auth.getUser()).data.user?.email ?? "admin@system",
        }),
      });
    } catch (e) {
      console.error("notify (order_rejected) failed:", e);
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userEmail = user?.email || "unknown";
      const userRole = user?.user_metadata?.role || "unknown";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          user_role: userRole,
          action: "Reject Sales Order",
          details: {
            order_id: order.id,
            customer_name: order.customers.name,
            customer_email: order.customers.email,
            items: order.order_items.map((oi) => ({
              product_name: oi.inventory.product_name,
              ordered_qty: oi.quantity,
              unit_price: oi.price,
            })),
            total_amount: order.total_amount,
            payment_type: order.customers.payment_type,
          },
          created_at: getPHISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to log activity for order rejection:", err);
    }
    fetchOrders();
  };
// Keep only letters & spaces, cap to 30 chars
const nameOnly = (s: string) => (s || "").replace(/[^A-Za-z\s]/g, "").trim().slice(0, 30);

  const handleOrderComplete = async () => {
    if (!selectedOrder || isCompletingOrder) return;

    // Validate required fields
    setFieldErrors({ poNumber: false, repName: false });
    const errors: Record<string, boolean> = {};
    if (!poNumber || !poNumber.trim()) errors.poNumber = true;
    if (!repName || !repName.trim()) errors.repName = true;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Please fill all required fields!");
      return;
    }

    setIsCompletingOrder(true);
    try {
      // Persist fulfilled quantities + per-item discounts + inventory & sales rows
      for (let i = 0; i < selectedOrder.order_items.length; i++) {
        const oi = selectedOrder.order_items[i];
        const invId = oi.inventory.id;
        const qty = editedQuantities[i];

        // 1) fulfilled quantity
        await supabase
          .from("order_items")
          .update({ fulfilled_quantity: qty, discount_percent: editedDiscounts[i] || 0 })
          .eq("order_id", selectedOrder.id)
          .eq("inventory_id", invId);

        // 2) inventory decrement (guard)
        const remaining = (oi.inventory.quantity || 0) - qty;
        if (remaining < 0) {
          toast.error(`Insufficient stock for ${oi.inventory.product_name}`);
          setIsCompletingOrder(false);
          setShowFinalConfirm(false);
          setShowSalesOrderModal(true);
          return;
        }
        await supabase.from("inventory").update({ quantity: remaining }).eq("id", invId);

        // 3) sales row
        const unitPrice = oi.price;
        const discountPercent = editedDiscounts[i] || 0;
        const costPrice = oi.inventory.cost_price || 0;
        const amount = qty * unitPrice * (1 - discountPercent / 100);
        const earnings = (unitPrice - costPrice) * qty * (1 - discountPercent / 100);

        await supabase.from("sales").insert([
          {
            inventory_id: invId,
            quantity_sold: qty,
            amount,
            earnings,
            date: getPHISOString(),
          },
        ]);
      }

      // Approve/schedule via RPC then mark completed
      const isCredit = selectedOrder.customers.payment_type === "Credit";
      const firstDue = new Date();
      firstDue.setMonth(firstDue.getMonth() + 1);
      const p_first_due = firstDue.toISOString().slice(0, 10);
      const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

      const { error: rpcErr } = await supabase.rpc("approve_order", {
        p_order_id: selectedOrder.id,
        p_terms: isCredit ? numberOfTerms : 1,
        p_per_term: round2(isCredit ? getPerTermAmount() : getGrandTotalWithInterest()),
        p_first_due,
        p_grand_total_with_interest: round2(getGrandTotalWithInterest()),
        p_interest_percent: isCredit ? round2(totals.effectiveInterestPercent) : 0,
        p_sales_tax: round2(isSalesTaxOn ? salesTaxValue : 0),
        p_po_number: poNumber,
        p_salesman: repName,
        p_forwarder: forwarder || null,
        p_processed_by_email: processor?.email ?? "unknown",
        p_processed_by_name: processor?.name ?? "unknown",
        p_processed_by_role: processor?.role ?? "unknown",
      });
      if (rpcErr) throw rpcErr;

      const nowPH = getPHISOString();
      const { error: doneErr } = await supabase
        .from("orders")
        .update({ status: "completed", date_completed: nowPH, processed_at: nowPH })
        .eq("id", selectedOrder.id);
      if (doneErr) throw doneErr;

      // notify customer: order completed
      try {
        await fetch("/api/notify-customer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: selectedOrder.customers.email,
            recipientName: selectedOrder.customers.name,
            type: "order_completed",
            title: "Order Completed",
            message: `Your order ${selectedOrder.customers.code ?? selectedOrder.id} has been completed. Thank you!`,
            href: `/customer?txn=${selectedOrder.customers.code ?? selectedOrder.id}`,
            orderId: selectedOrder.id,
            transactionCode: selectedOrder.customers.code ?? null,
            metadata: {
              grand_total: getGrandTotalWithInterest(),
              terms: selectedOrder.customers.payment_type === "Credit" ? numberOfTerms : 1,
            },
            actorEmail: processor?.email ?? "admin@system",
          }),
        });
      } catch (e) {
        console.error("notify (order_completed) failed:", e);
      }

      // Close / refresh
      setShowSalesOrderModal(false);
      setShowFinalConfirm(false);
      resetSalesForm();
      setSelectedOrder(null);
      setPickingStatus((prev) => prev.filter((p) => p.orderId !== selectedOrder.id));
      await Promise.all([fetchOrders(), fetchItems()]);
      toast.success("Order successfully completed!");

      try {
        setIsSendingEmail(true);
        const emailRes = await fetch("/api/send-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: selectedOrder.id }),
        });
        const result = await emailRes.json();
        if (result.success) toast.success("Receipt emailed to customer!");
        else toast.error("Failed to send receipt email.");
      } catch {
        toast.error("Failed to send receipt email.");
      } finally {
        setIsSendingEmail(false);
      }

      setIsCompletingOrder(false);
    } catch (err: any) {
      if (err?.message?.includes('unique constraint "unique_po_number"')) {
        toast.error("PO Number is already used, try another.");
        setIsCompletingOrder(false);
        setShowFinalConfirm(false);
        setShowSalesOrderModal(true);
        return;
      }
      toast.error(`Failed to complete order: ${err?.message ?? "Unexpected error"}`);
      setIsCompletingOrder(false);
      setShowFinalConfirm(false);
      setShowSalesOrderModal(true);
    }
  };

  /* ======= UI ======= */
  return (
    <div className="p-6">
      {isCompletingOrder && <PageLoader label="Completing order…" />}

      {/* Header */}
      <div className="mb-6 -mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
          Sales Processing
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Manage customer orders, picking lists, and sales confirmations.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search products..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded"
      />

      {/* Cards Section */}
      <div className="flex flex-wrap gap-4 mb-8">
        {/* Moving Products Report (combined) */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Click to view Moving Products Report"
          onClick={() => setShowMovingReport(true)}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Moving Products Report
          </div>
          {movingProducts.length > 0 ? (
            <>
              <div className="text-base font-bold text-blue-700 mb-1 underline hover:text-blue-900 transition">
                {movingProducts[0].product_name}
              </div>
              <div className="text-sm text-gray-600">
                Sold in last 90d: <b>{movingProducts[0].units_90d.toLocaleString()}</b> units
                <br />
                Stock Left: <b>{movingProducts[0].current_stock.toLocaleString()}</b>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No data</div>
          )}
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs">
          <div className="text-xs text-gray-500 font-semibold mb-2">Total Orders</div>
          <div className="text-2xl font-bold text-black mb-1">{totalOrders}</div>
        </div>

        {/* Completed Orders */}
        <div className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs">
          <div className="text-xs text-gray-500 font-semibold mb-2">Completed Orders</div>
          <div className="text-2xl font-bold text-blue-700 mb-1">{completedOrders}</div>
        </div>

        {/* Pending Orders (jump) */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Jump to Pending Orders"
          onClick={() => {
            if (pendingOrders > 0) {
              document.getElementById("pending-orders-section")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            } else {
              toast.info("No Available Orders");
            }
          }}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">Pending Orders</div>
          <div className="text-2xl font-bold text-orange-500 mb-1">{pendingOrders}</div>
        </div>
      </div>

      {/* --- MOVING PRODUCTS REPORT MODAL (combined fast/slow) --- */}
      <AnimatePresence>
        {showMovingReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 inset-0 flex items-center justify-center bg-black/40"
            onClick={() => setShowMovingReport(false)}
          >
            <motion.div
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] md:max-w-5xl p-0 md:p-8 border overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-bold text-black">
                  Moving Products Report{" "}
                  <span className="font-normal text-base text-gray-600">
                    (last 90 days)
                  </span>
                </span>
                <button
                  className="w-8 h-8 text-gray-400 hover:bg-gray-100 rounded-full flex items-center justify-center text-xl"
                  onClick={() => setShowMovingReport(false)}
                  title="Close"
                >
                  ×
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm border rounded-xl shadow">
                  <thead>
                    <tr className="bg-[#ffba20] text-black text-left font-bold text-base border-b">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Subcategory</th>
                      <th className="py-2 px-3 text-right">Sold (90d)</th>
                      <th className="py-2 px-3 text-right">Stock Left</th>
                      <th className="py-2 px-3 text-right">Days of Cover</th>
                      <th className="py-2 px-3 text-right">Velocity (units/day)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movingProducts.map((prod, idx) => (
                      <tr key={prod.id} className="border-b hover:bg-gray-50/80">
                        <td className="py-2 px-3 font-semibold text-center">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold">{prod.product_name}</td>
                        <td className="py-2 px-3">{prod.category}</td>
                        <td className="py-2 px-3">{prod.subcategory}</td>
                        <td className="py-2 px-3 text-right">{prod.units_90d.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">{prod.current_stock.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">
                          {prod.est_days_of_cover ? prod.est_days_of_cover.toFixed(1) : "-"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.pr_units_velocity?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-4">
                  <b>Days of Cover</b> = Stock Left ÷ average daily sales (last 90 days).
                  Highest rows are “fast”; lowest rows are “slow”.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inventory Table */}
      <div className="overflow-x-auto rounded-lg shadow mb-6">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="py-2 px-4">SKU</th>
              <th className="py-2 px-4">Product</th>
              <th className="py-2 px-4">Category</th>
              <th className="py-2 px-4">Subcategory</th>
              <th className="py-2 px-4">Unit</th>
              <th className="py-2 px-4 text-right">Quantity</th>
              <th className="py-2 px-4 text-right">Unit Price</th>
              <th className="py-2 px-4 text-right">Cost Price</th>
              <th className="py-2 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((it) =>
                it.product_name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((it) => (
                <tr
                  key={it.id}
                  className={
                    "border-b hover:bg-gray-100 " +
                    (it.quantity === 0 ? "bg-red-100 text-red-700 font-semibold" : "")
                  }
                >
                  <td className="py-2 px-4">{it.sku}</td>
                  <td className="py-2 px-4">{it.product_name}</td>
                  <td className="py-2 px-4">{it.category}</td>
                  <td className="py-2 px-4">{it.subcategory}</td>
                  <td className="py-2 px-4">{it.unit}</td>
                  <td className="py-2 px-4 text-right">{it.quantity}</td>
                  <td className="py-2 px-4 text-right">₱{it.unit_price?.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right">
                    {it.cost_price !== undefined && it.cost_price !== null
                      ? `₱${it.cost_price.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="py-2 px-4 text-right">
                    ₱{(it.unit_price * it.quantity).toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Orders List */}
      <div className="mt-10" id="pending-orders-section" ref={pendingOrdersSectionRef}>
        <h2 className="text-2xl font-bold mb-4">Customer Orders (Pending)</h2>
        {orders
          .filter((o) => o.status === "pending" || o.status === "accepted")
          .slice((currentPage - 1) * ordersPerPage, currentPage * ordersPerPage)
          .map((order) => {
            const isAccepted = isOrderAccepted(order.id);
            const isRejected = pickingStatus.some(
              (p) => p.orderId === order.id && p.status === "rejected"
            );
            return (
              <div
                key={order.id}
                id={`order-card-${order.id}`}
                ref={(el) => {
                  orderRefs.current[order.id] = el;
                }}
                className={`border p-4 mb-4 rounded shadow bg-white text-base transition-all duration-500 ${
                  isAccepted ? "border-blue-600 border-2" : ""
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-xl">
                    Transaction ID:{" "}
                    <span className="text-blue-700">{order.customers.code}</span>
                  </span>
                  <span
                    className={`font-bold px-3 py-1 rounded text-base ml-4 ${
                      order.customers.payment_type === "Credit"
                        ? "bg-blue-200 text-blue-800"
                        : order.customers.payment_type === "Cash"
                        ? "bg-green-200 text-green-700"
                        : "bg-orange-200 text-orange-700"
                    }`}
                  >
                    {order.customers.payment_type || "N/A"}
                  </span>
                </div>
                {isAccepted && (
                  <div className="mb-2 flex items-center">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-base font-semibold shadow-sm">
                      Processing by Admin
                    </span>
                  </div>
                )}
                <p className="font-bold">Customer: {order.customers.name}</p>
                <p>Email: {order.customers.email}</p>
                <p>Phone: {order.customers.phone}</p>
                <p>Address: {order.customers.address}</p>
                <p>Status: {order.status}</p>
                <p>
                  Order Date &amp; Time: {formatPHDate(order.date_created)}{" "}
                  {formatPHTime(order.date_created)}
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {order.order_items.map((item, idx) => (
                    <li key={idx}>
                      {item.inventory.product_name} - {item.quantity} pcs
                      <br />
                      <span className="text-sm text-gray-600">
                        Ordered: ₱{item.price.toFixed(2)} | Now: ₱
                        {item.inventory.unit_price?.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-bold text-lg">
                  Total: ₱{order.total_amount.toLocaleString()}
                </p>
                {order.status !== "completed" && order.status !== "rejected" && (
                  <div className="flex gap-2 mt-2">
                    {!isAccepted && !isRejected && (
                      <>
                        <button
                          onClick={() => handleAcceptOrder(order)}
                          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-base"
                        >
                          Accept Order
                        </button>
                        <button
                          onClick={() => {
                            setShowRejectConfirm(true);
                            setOrderToReject(order);
                          }}
                          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-base"
                        >
                          Reject Order
                        </button>
                      </>
                    )}
                    {isAccepted && (
                      <button
                        onClick={() => {
                          setPickingStatus((prev) => prev.filter((p) => p.orderId !== order.id));
                          setEditedQuantities([]);
                          setEditedDiscounts([]);
                          setSelectedOrder(null);
                          setShowSalesOrderModal(false);
                        }}
                        className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded ${
              currentPage === 1
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            ← Prev
          </button>
          <span className="text-base font-semibold text-gray-700">
            Page {currentPage} of{" "}
            {Math.ceil(
              orders.filter((o) => o.status === "pending" || o.status === "accepted").length /
                ordersPerPage
            )}
          </span>
          <button
            onClick={() =>
              setCurrentPage((p) =>
                p <
                Math.ceil(
                  orders.filter((o) => o.status === "pending" || o.status === "accepted").length /
                    ordersPerPage
                )
                  ? p + 1
                  : p
              )
            }
            disabled={
              currentPage >=
              Math.ceil(
                orders.filter((o) => o.status === "pending" || o.status === "accepted").length /
                  ordersPerPage
              )
            }
            className={`px-4 py-2 rounded ${
              currentPage >=
              Math.ceil(
                orders.filter((o) => o.status === "pending" || o.status === "accepted").length /
                  ordersPerPage
              )
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      {/* SALES ORDER MODAL (now includes editable Discount inputs) */}
      {showSalesOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-start z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-[96vw] h-[94vh] mx-auto flex flex-col gap-6 px-10 py-8 my-4 text-[15px] max-w-none max-h-[94vh] overflow-y-auto mt-16">
            <h2 className="text-3xl font-bold mb-6 tracking-wide text-center text-gray-800">
              SALES ORDER
            </h2>
            <div className="flex flex-col md:flex-row md:justify-between mb-2 gap-2">
              <div>
                <div>
                  <span className="font-medium">Sales Order Number: </span>
                  <span className="text-lg text-blue-700 font-bold">
                    {selectedOrder.customers.code}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Sales Order Date: </span>
                  {formatPHISODate(new Date())}
                </div>
              </div>
              <div className="text-right space-y-1">
                {/* PO Number */}
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">PO Number:</span>
                  <span className="text-gray-700">No.</span>
                  <input
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={poNumber}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setPoNumber(digitsOnly);
                      if (fieldErrors.poNumber) setFieldErrors((f) => ({ ...f, poNumber: false }));
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = (e.clipboardData.getData("text") || "")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setPoNumber(text);
                      if (fieldErrors.poNumber) setFieldErrors((f) => ({ ...f, poNumber: false }));
                    }}
                    className={`border-b outline-none px-1 transition-all duration-150 tracking-widest tabular-nums ${
                      fieldErrors.poNumber ? "border-red-500 bg-red-50 animate-shake" : "border-gray-300"
                    }`}
                    style={{ minWidth: 110 }}
                    placeholder="000000"
                    aria-label="PO Number (numbers only, max 6)"
                  />
                </div>
                {fieldErrors.poNumber && (
                  <div className="text-xs text-red-600 mt-1">PO Number is required</div>
                )}

                <div>
                  <span className="font-medium">Processed By: </span>
                  <span className="font-semibold">{processor?.name || "Unknown"}</span>
                  <span className="text-gray-500"> ({processor?.email || "-"})</span>
                  {processor?.role && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100">
                      {processor.role}
                    </span>
                  )}
                </div>

                {/* Sales Rep Name (autofilled from customer, read-only) */}
<div>
  <span className="font-medium">Sales Rep Name: </span>
  <input
    type="text"
    value={repName}
    readOnly
    disabled
    className="border-b outline-none px-1 bg-gray-100 text-gray-700 cursor-not-allowed border-gray-300"
    style={{ minWidth: 220 }}
    aria-label="Sales Rep Name (read-only)"
  />
  <div className="text-xs text-gray-500 mt-1">
    Auto-filled from customer name
  </div>
</div>


                <div>
                  <span className="font-medium">Payment Terms: </span>
                  {selectedOrder.customers.payment_type === "Credit"
                    ? <>Net {numberOfTerms} Monthly</>
                    : selectedOrder.customers.payment_type}
                </div>
              </div>
            </div>

            {/* CUSTOMER DETAILS */}
            <div className="bg-[#f6f6f9] border rounded-lg px-4 py-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 text-[15px]">
              <div>
                <div className="font-bold">To:</div>
                <div><b>Name:</b> {selectedOrder.customers.name}</div>
                <div><b>Email:</b> {selectedOrder.customers.email}</div>
                <div><b>Phone:</b> {selectedOrder.customers.phone}</div>
                <div><b>Address:</b> {selectedOrder.customers.address}</div>
                {selectedOrder.customers.area && (
                  <div><b>Area:</b> {selectedOrder.customers.area}</div>
                )}
              </div>
              <div>
                <div className="font-bold">Ship To:</div>
                <div><b>Name:</b> {selectedOrder.customers.name}</div>
                <div><b>Address:</b> {selectedOrder.customers.address}</div>
                {selectedOrder.customers.area && (
                  <div><b>Area:</b> {selectedOrder.customers.area}</div>
                )}
              </div>
            </div>

            {/* Item Table – DISCOUNT inputs moved here */}
            <div className="rounded-xl border mt-3">
              <table className="w-full text-[15px]">
                <thead className="bg-[#ffba20] text-black">
                  <tr>
                    <th className="py-1 px-2 text-left">Quantity</th>
                    <th className="py-1 px-2 text-left">Unit</th>
                    <th className="py-1 px-2 text-left">Description</th>
                    <th className="py-1 px-2 text-left">Notes</th>
                    <th className="py-1 px-2 text-right">Unit Price</th>
                    <th className="py-1 px-2 text-right">Cost Price</th>
                    <th className="py-1 px-2 text-right">Discount (%)</th>
                    <th className="py-1 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.order_items.map((item, idx) => {
                    const qty = editedQuantities[idx] ?? item.quantity; // locked
                    const price = item.price;
                    const percent = editedDiscounts[idx] || 0;
                    const amount = qty * price * (1 - percent / 100);
                    const stock = item.inventory.quantity;
                    const insufficient = qty > stock || stock === 0;

                    // Show blank input when percent === 0
                    const displayPercent = percent === 0 ? "" : String(percent);

                    return (
                      <tr
                        key={idx}
                        className={
                          "border-t " + (insufficient ? "bg-red-100 text-red-700 font-semibold" : "")
                        }
                      >
                        <td className="py-1 px-2">{qty}</td>
                        <td className="py-1 px-2">{item.inventory.unit}</td>
                        <td className="py-1 px-2 font-semibold">{item.inventory.product_name}</td>
                        <td className="py-1 px-2">
                          {stock === 0 ? (
                            <span className="text-red-600 font-semibold">Out of Stock</span>
                          ) : qty > stock ? (
                            <span className="text-orange-600 font-semibold">
                              Insufficient (Requested {qty}, In stock {stock})
                            </span>
                          ) : (
                            <span className="text-green-600">Available</span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-right">₱{price.toLocaleString()}</td>
                        <td className="py-1 px-2 text-right">
                          {item.inventory.cost_price !== undefined &&
                          item.inventory.cost_price !== null
                            ? `₱${item.inventory.cost_price.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="py-1 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              max={50}
                              step={1}
                              value={displayPercent as any}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw.trim() === "") {
                                  setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? 0 : d)));
                                  return;
                                }
                                let p = parseFloat(raw.replace(/[^0-9]/g, ""));
                                if (isNaN(p)) p = 0;
                                if (p > 50) p = 50;
                                if (p < 0) p = 0;
                                setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? p : d)));
                              }}
                              className="w-16 text-center border rounded px-1 py-0.5 font-bold"
                              placeholder=""
                              aria-label="Discount percent (0-50)"
                            />
                            <span>%</span>
                            <button
                              className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-100 active:bg-blue-200 transition"
                              onClick={() =>
                                setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? 0 : d)))
                              }
                              type="button"
                            >
                              Reset
                            </button>
                          </div>
                        </td>
                        <td className="py-1 px-2 text-right font-semibold">
                          ₱
                          {amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals and Terms */}
            <div className="flex flex-col md:flex-row md:justify-end gap-4 mt-5">
              <div className="space-y-2 min-w-[350px]">
                <div className="flex justify-between font-medium">
                  <span>
                    Subtotal:
                    <div className="text-xs text-gray-500">Sum before tax & discount</div>
                  </span>
                  <span>
                    ₱
                    {subtotalBeforeDiscount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Sales Tax (12%):
                    <div className="text-xs text-gray-500">Tax applied to subtotal</div>
                  </span>
                  <span>
                    ₱
                    {salesTaxValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSalesTaxOn}
                    onChange={() => setIsSalesTaxOn(!isSalesTaxOn)}
                    id="sales-tax-toggle"
                    className="mr-1 accent-blue-600"
                  />
                  <label htmlFor="sales-tax-toggle" className="font-semibold">
                    Include Sales Tax (12%)
                  </label>
                </div>

                <div className="flex justify-between">
                  <span>
                    Discount/Add:
                    <div className="text-xs text-gray-500">Sum of per-item discounts/adds</div>
                  </span>
                  <span className={totalDiscount !== 0 ? "text-orange-600 font-semibold" : ""}>
                    {totalDiscount === 0
                      ? "—"
                      : `-₱${Math.abs(totalDiscount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}`}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Subtotal w/ Tax & Discount:
                    <div className="text-xs text-gray-500">Subtotal after discount & tax</div>
                  </span>
                  <span>
                    ₱
                    {(subtotalBeforeDiscount + salesTaxValue - totalDiscount).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2 }
                    )}
                  </span>
                </div>

                {selectedOrder.customers.payment_type === "Credit" && (
                  <>
                    <div className="flex justify-between">
                      <span>
                        Interest Amount ({totals.effectiveInterestPercent}%):
                        <div className="text-xs text-gray-500">For credit terms</div>
                      </span>
                      <span>
                        ₱
                        {totals.interestAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-medium">Terms (months):</span>
                      <input
                        type="number"
                        min={1}
                        max={48}
                        value={numberOfTerms}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(48, Number(e.target.value) || 1));
                          setNumberOfTerms(n);
                        }}
                        className="border rounded px-2 py-1 w-20 text-center"
                      />
                      <span className="font-medium">Interest %:</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        value={interestPercent || totals.effectiveInterestPercent}
                        onChange={(e) => {
                          let p = Number(e.target.value);
                          if (isNaN(p)) p = 0;
                          p = Math.max(0, Math.min(30, p));
                          setInterestPercent(p);
                        }}
                        className="border rounded px-2 py-1 w-20 text-center"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>
                    TOTAL ORDER AMOUNT:
                    <div className="text-xs text-gray-500">
                      Final total (tax, discount &amp; interest)
                    </div>
                  </span>
                  <span className="text-green-700">
                    ₱
                    {getGrandTotalWithInterest().toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {selectedOrder.customers.payment_type === "Credit" && (
                  <div className="flex justify-between">
                    <span>
                      Payment per Term:
                      <div className="text-xs text-gray-500">Amount per installment/month</div>
                    </span>
                    <span className="font-bold text-blue-700">
                      ₱
                      {getPerTermAmount().toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-8 mt-6">
              <button
                className="bg-green-600 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition"
                onClick={() => setShowFinalConfirm(true)}
              >
                Confirm
              </button>
              <button
                className="bg-gray-400 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={() => {
                  setShowSalesOrderModal(false);
                  resetSalesForm();
                  setSelectedOrder(null);
                }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL CONFIRMATION */}
      {showFinalConfirm && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-auto p-10 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to <span className="text-green-700">COMPLETE</span> this order?
            </div>
            <div className="text-base mb-6">
              This will deduct the items from inventory, mark the order as completed, and record the
              sales transaction.
            </div>
            <div className="flex justify-center gap-10 mt-4">
              <button
                className={`bg-green-600 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition flex items-center justify-center ${
                  isCompletingOrder ? "opacity-75 cursor-not-allowed" : ""
                }`}
                onClick={handleOrderComplete}
                disabled={isCompletingOrder}
                aria-busy={isCompletingOrder}
              >
                {isCompletingOrder ? (
                  <>
                    <span className="inline-block h-5 w-5 rounded-full border-2 border-white/70 border-t-transparent animate-spin mr-2" />
                    Processing…
                  </>
                ) : (
                  "Yes, Confirm Order"
                )}
              </button>

              <button
                className={`bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow transition ${
                  isCompletingOrder ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-500"
                }`}
                onClick={() => setShowFinalConfirm(false)}
                disabled={isCompletingOrder}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT CONFIRM */}
      {showRejectConfirm && orderToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto p-8 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to <span className="text-red-600">REJECT</span> this order?
            </div>
            <div className="text-base mb-6">
              This will permanently reject the order and notify the customer.
            </div>
            <div className="flex justify-center gap-8 mt-4">
              <button
                className="bg-red-600 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-red-700 transition"
                onClick={async () => {
                  await handleRejectOrder(orderToReject);
                  setShowRejectConfirm(false);
                  setOrderToReject(null);
                }}
              >
                Yes, Reject Order
              </button>
              <button
                className="bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={() => {
                  setShowRejectConfirm(false);
                  setOrderToReject(null);
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

export default function SalesPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading sales…" />}>
      <SalesPageContent />
    </Suspense>
  );
}