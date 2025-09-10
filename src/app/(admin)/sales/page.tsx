"use client";
import { Suspense } from "react";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";

type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

type FastMovingProduct = {
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
      amount?: number;
    };
  }[];
};

type PickingOrder = {
  orderId: string;
  status: "accepted" | "rejected";
};

function SalesPageContent() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null
  );

  const orderRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [editedQuantities, setEditedQuantities] = useState<number[]>([]);
  const [editedDiscounts, setEditedDiscounts] = useState<number[]>([]);
  const [pickingStatus, setPickingStatus] = useState<PickingOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [numberOfTerms, setNumberOfTerms] = useState(1);
  const [interestPercent, setInterestPercent] = useState(0);
  const [showSalesOrderModal, setShowSalesOrderModal] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [isSalesTaxOn, setIsSalesTaxOn] = useState(true);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [orderToReject, setOrderToReject] = useState<OrderWithDetails | null>(
    null
  );
  const [salesman, setSalesman] = useState("");
  const [forwarder, setForwarder] = useState("");
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

  // Highlight/Validation State!
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({
    poNumber: false,
    repName: false,
  });

  // --- Activity Logs Modal State --- (kept as original)
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
    })();
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

  const [fastMovingProducts, setFastMovingProducts] = useState<
    FastMovingProduct[]
  >([]);
  const [showFastMovingModal, setShowFastMovingModal] = useState(false);
  const [slowMovingProducts, setSlowMovingProducts] = useState<
    FastMovingProduct[]
  >([]);
  const [showSlowMovingModal, setShowSlowMovingModal] = useState(false);
  const ordersPerPage = 10;

const computedOrderTotal = useMemo(() => {
  if (!selectedOrder) return 0;
  return selectedOrder.order_items.reduce((sum, item, idx) => {
    // Skip out-of-stock
    if (item.inventory.quantity === 0) return sum;
    const qty = editedQuantities[idx] ?? item.quantity;
    const percent = editedDiscounts[idx] ?? 0;
    const price = item.price;
    // Apply discount to each
    const discounted = qty * price * (1 - percent / 100);
    return sum + discounted;
  }, 0);
}, [selectedOrder, editedQuantities, editedDiscounts]);

  const salesTaxValue = isSalesTaxOn ? computedOrderTotal * 0.12 : 0;

  const getGrandTotalWithInterest = () => {
    if (!selectedOrder) return 0;
    const baseTotal = computedOrderTotal + salesTaxValue;
    if (
      selectedOrder.customers.payment_type === "Credit" &&
      numberOfTerms > 0
    ) {
      return baseTotal * (1 + interestPercent / 100);
    }
    return baseTotal;
  };

  const getPerTermAmount = () => {
    if (
      selectedOrder &&
      selectedOrder.customers.payment_type === "Credit" &&
      numberOfTerms > 0
    ) {
      return getGrandTotalWithInterest() / numberOfTerms;
    }
    return getGrandTotalWithInterest();
  };

  // Calculate original subtotal (before any discounts/markups)
const subtotalBeforeDiscount = selectedOrder
  ? selectedOrder.order_items.reduce(
      (sum, item, idx) =>
        item.inventory.quantity === 0
          ? sum
          : sum + (editedQuantities[idx] ?? item.quantity) * item.price,
      0
    )
  : 0;


// Total discount/add
const totalDiscount = selectedOrder
  ? selectedOrder.order_items.reduce((sum, item, idx) => {
      if (item.inventory.quantity === 0) return sum;
      const qty = editedQuantities[idx] ?? item.quantity;
      const percent = editedDiscounts[idx] ?? 0;
      return sum + qty * item.price * (percent / 100);
    }, 0)
  : 0;



  const totalSales = useMemo(
    () =>
      orders
        .filter((o) => o.status === "completed")
        .reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [orders]
  );
  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "completed").length,
    [orders]
  );
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );
  const totalOrders = orders.length;

  // Fetch all inventory items
  const fetchItems = async () => {
    const { data, error } = await supabase.from("inventory").select("*");
    if (!error) setItems(data || []);
  };

  // Fetch orders with related customer & items
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        status,
        total_amount,
        date_created,
        customer:customer_id (
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
            unit_price
          )
        )
      `
      )
      .order("date_created", { ascending: false });
    if (!error && data) {
      const formatted = data.map((o: any) => ({
        ...o,
        customers: Array.isArray(o.customer) ? o.customer[0] : o.customer,
        order_items: o.order_items.map((item: any) => ({
          ...item,
          inventory: Array.isArray(item.inventory)
            ? item.inventory[0]
            : item.inventory,
        })),
      }));
      setOrders(formatted);
    }
  };

  // Fetch Fast & Slow Moving Products from VIEW
  const fetchFastMovingProducts = async () => {
    const { data, error } = await supabase
      .from("v_fast_moving_products")
      .select("*")
      .order("units_90d", { ascending: false });
    if (!error && data) setFastMovingProducts(data.slice(0, 20));
  };

  const fetchSlowMovingProducts = async () => {
    const { data, error } = await supabase
      .from("v_fast_moving_products")
      .select("*")
      .order("units_90d", { ascending: true });
    if (!error && data) setSlowMovingProducts(data.slice(0, 20));
  };

  useEffect(() => {
    fetchItems();
    fetchOrders();
    fetchFastMovingProducts();
    fetchSlowMovingProducts();

    const inventoryChannel: RealtimeChannel = supabase
      .channel("inventory-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => {
          fetchItems();
          fetchFastMovingProducts();
          fetchSlowMovingProducts();
        }
      )
      .subscribe();

    const ordersChannel: RealtimeChannel = supabase
      .channel("orders-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  useEffect(() => {
    if (!showModal && !showSalesOrderModal) {
      resetSalesForm();
    }
  }, [showModal, showSalesOrderModal]);

  const isOrderAccepted = (orderId: string) =>
    pickingStatus.some((p) => p.orderId === orderId && p.status === "accepted");

  const handleAcceptOrder = async (order: OrderWithDetails) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "accepted" })
      .eq("id", order.id);

    if (error) {
      toast.error("Failed to accept order: " + error.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("orders")
      .update({
        accepted_by_auth_id: user?.id ?? null,
        accepted_by_email: user?.email ?? null,
        accepted_by_name:
          processor?.name ?? (user?.email ? user.email.split("@")[0] : null),
        accepted_by_role: processor?.role ?? user?.user_metadata?.role ?? null,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    try {
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
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to log activity for order acceptance:", err);
    }

  setSelectedOrder(order);
setEditedQuantities(order.order_items.map(item => item.quantity));
setEditedDiscounts(order.order_items.map(() => 0));
setShowModal(true);
setNumberOfTerms(1);
setInterestPercent(0);
setPickingStatus((prev) => [
  ...prev,
  { orderId: order.id, status: "accepted" },
]);

  };

  const handleRejectOrder = async (order: OrderWithDetails) => {
    setPickingStatus((prev) => [
      ...prev,
      { orderId: order.id, status: "rejected" },
    ]);
    await supabase
      .from("orders")
      .update({ status: "rejected" })
      .eq("id", order.id);

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
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to log activity for order rejection:", err);
    }

    fetchOrders();
  };

  // --- 🎯 THE VALIDATED "COMPLETE" HANDLER ---
  const handleOrderComplete = async () => {
    if (!selectedOrder || isCompletingOrder) return;

    // Reset errors before checking
    setFieldErrors({ poNumber: false, repName: false });

    let errors: any = {};
    if (!poNumber || !poNumber.trim()) errors.poNumber = true;
    if (!repName || !repName.trim()) errors.repName = true;
    // add more checks if needed

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Please fill all required fields!");
      return;
    }

    setIsCompletingOrder(true);
    try {
      for (let i = 0; i < selectedOrder.order_items.length; i++) {
  const oi = selectedOrder.order_items[i];
  if (oi.inventory.quantity === 0) continue;
  const invId = oi.inventory.id;
  const remaining = oi.inventory.quantity - editedQuantities[i];

  if (remaining < 0) {
    toast.error(`Insufficient stock for ${oi.inventory.product_name}`);
    setShowFinalConfirm(false);
    throw new Error("Insufficient stock");
  }

  // 1. Update inventory
  await supabase
    .from("inventory")
    .update({ quantity: remaining })
    .eq("id", invId);

  // 2. Update discount_percent in order_items
  await supabase
    .from("order_items")
    .update({
      discount_percent: editedDiscounts[i] || 0,
    })
    .eq("order_id", selectedOrder.id)
    .eq("inventory_id", invId);

  // 3. Insert to sales as usual
  await supabase.from("sales").insert([
    {
      inventory_id: invId,
      quantity_sold: editedQuantities[i],
      amount: editedQuantities[i] * oi.price * (1 - (editedDiscounts[i] || 0) / 100),
      date: new Date().toISOString(),
    },
  ]);
}


      const isCredit = selectedOrder.customers.payment_type === "Credit";
      const updateFields = {
        status: "completed",
        date_completed: new Date().toISOString(),
        sales_tax: isSalesTaxOn ? computedOrderTotal * 0.12 : 0,
        po_number: poNumber,
        salesman: repName,
        terms: isCredit
          ? `Net ${numberOfTerms} Monthly`
          : selectedOrder.customers.payment_type,
        payment_terms: isCredit ? numberOfTerms : null,
        interest_percent: isCredit ? interestPercent : null,
        grand_total_with_interest: isCredit
          ? getGrandTotalWithInterest()
          : null,
        per_term_amount: isCredit ? getPerTermAmount() : null,
        forwarder,
        processed_by_email: processor?.email ?? "unknown",
        processed_by_name: processor?.name ?? "unknown",
        processed_by_role: processor?.role ?? "unknown",
        processed_at: new Date().toISOString(),
      } as const;

      const { error: ordersErr } = await supabase
        .from("orders")
        .update(updateFields)
        .eq("id", selectedOrder.id);
      if (ordersErr) throw ordersErr;

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
            action: "Complete Sales Order",
            details: {
              order_id: selectedOrder.id,
              customer_name: selectedOrder.customers.name,
              customer_email: selectedOrder.customers.email,
              items: selectedOrder.order_items.map((oi, idx) => ({
                product_name: oi.inventory.product_name,
                ordered_qty: oi.quantity,
                fulfilled_qty: editedQuantities[idx],
                unit_price: oi.price,
                discount_percent: editedDiscounts[idx] || 0,
              })),
              total_amount: getGrandTotalWithInterest(),
              payment_type: selectedOrder.customers.payment_type,
            },
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        console.error(
          "Failed to log activity for sales order completion:",
          err
        );
      }

      setShowSalesOrderModal(false);
      setShowModal(false);
      setShowFinalConfirm(false);
      resetSalesForm();
      setSelectedOrder(null);
      setPickingStatus((prev) =>
        prev.filter((p) => p.orderId !== selectedOrder.id)
      );

      await Promise.all([fetchOrders(), fetchItems()]);
      toast.success("Order successfully completed!");
    } catch (err: any) {
      console.error("Failed completing order:", err);
      toast.error(
        `Failed to complete order: ${err?.message ?? "Unexpected error"}`
      );
    } finally {
      setIsCompletingOrder(false);
    }
  };

  const handleOrderConfirm = async () => {
    if (!selectedOrder) return;
    setShowFinalConfirm(true);
  };

  const handleBackModal = () => {
    setShowSalesOrderModal(false);
    setShowModal(true);
  };

  const handleCancelModal = () => {
    setShowModal(false);
    setShowSalesOrderModal(false);
    setShowFinalConfirm(false);
    resetSalesForm();
    setSelectedOrder(null);
    setPickingStatus((prev) =>
      selectedOrder ? prev.filter((p) => p.orderId !== selectedOrder.id) : prev
    );
  };

  const handleResetDiscount = (idx: number) => {
    setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? 0 : d)));
  };

  const timersRef = useRef<{ [key: number]: NodeJS.Timeout }>({});

  const handleIncrement = (idx: number) => {
    setEditedDiscounts((prev) =>
      prev.map((d, i) => (i === idx ? Math.min(100, (Number(d) || 0) + 1) : d))
    );
  };
  const handleDecrement = (idx: number) => {
    setEditedDiscounts((prev) =>
      prev.map((d, i) => (i === idx ? Math.max(-100, (Number(d) || 0) - 1) : d))
    );
  };
  const handleDiscountInput = (idx: number, value: string) => {
    let percent = parseFloat(value.replace(/[^0-9\-]/g, ""));
    if (isNaN(percent)) percent = 0;
    if (percent > 100) percent = 100;
    if (percent < -100) percent = -100;
    setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? percent : d)));
  };

  const pendingOrdersSectionRef = useRef<HTMLDivElement>(null);

  // --- RENDER ---
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
        {/* Fast Moving Product */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Click to view Top 20 Fast Moving Products"
          onClick={() => setShowFastMovingModal(true)}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Fast Moving Product
          </div>
          {fastMovingProducts.length > 0 ? (
            <>
              <div className="text-base font-bold text-blue-700 mb-1 underline hover:text-blue-900 transition">
                {fastMovingProducts[0].product_name}
              </div>
              <div className="text-sm text-gray-600">
                Sold in last 90d:{" "}
                <b>{fastMovingProducts[0].units_90d.toLocaleString()}</b> units
                <br />
                Stock Left:{" "}
                <b>{fastMovingProducts[0].current_stock.toLocaleString()}</b>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No data</div>
          )}
        </div>

        {/* Slow Moving Product */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Click to view Top 20 Slow Moving Products"
          onClick={() => setShowSlowMovingModal(true)}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Slow Moving Product
          </div>
          {slowMovingProducts.length > 0 ? (
            <>
              <div className="text-base font-bold text-orange-600 mb-1 underline hover:text-orange-800 transition">
                {slowMovingProducts[0].product_name}
              </div>
              <div className="text-sm text-gray-600">
                Sold in last 90d:{" "}
                <b>{slowMovingProducts[0].units_90d.toLocaleString()}</b> units
                <br />
                Stock Left:{" "}
                <b>{slowMovingProducts[0].current_stock.toLocaleString()}</b>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No data</div>
          )}
        </div>

        {/* Total Orders */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Total Orders"
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Total Orders
          </div>
          <div className="text-2xl font-bold text-black mb-1">
            {totalOrders}
          </div>
        </div>

        {/* Completed Orders */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Completed Orders"
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Completed Orders
          </div>
          <div className="text-2xl font-bold text-blue-700 mb-1">
            {completedOrders}
          </div>
        </div>

        {/* Pending Orders */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Jump to Pending Orders"
          onClick={() => {
            if (pendingOrders > 0) {
              const ordersSection = document.getElementById(
                "pending-orders-section"
              );
              if (ordersSection) {
                ordersSection.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }
            } else {
              toast.info("No Available Orders");
            }
          }}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Pending Orders
          </div>
          <div className="text-2xl font-bold text-orange-500 mb-1">
            {pendingOrders}
          </div>
        </div>
      </div>

      {/* --- FAST MOVING MODAL --- */}
      <AnimatePresence>
        {showFastMovingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 inset-0 flex items-center justify-center bg-black/40"
            style={{
              zIndex: 9999,
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0",
            }}
            onClick={() => setShowFastMovingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 0 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] md:max-w-4xl p-0 md:p-8 border border-blue-200 overflow-x-auto"
              style={{
                margin: "0 auto",
                position: "relative",
                maxHeight: "90vh",
                overflowY: "auto",
                boxSizing: "border-box",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-bold text-black">
                  Top 20 Fast Moving Products{" "}
                  <span className="font-normal text-base text-gray-600">
                    (last 90 days)
                  </span>
                </span>
                <button
                  className="w-8 h-8 text-gray-400 hover:bg-gray-100 rounded-full flex items-center justify-center text-xl"
                  onClick={() => setShowFastMovingModal(false)}
                  title="Close"
                >
                  ×
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm border rounded-xl shadow">
                  <thead>
                    <tr className="bg-[#ffba20] text-black text-left font-bold text-base border-b">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Subcategory</th>
                      <th className="py-2 px-3 text-right">Sold (90d)</th>
                      <th className="py-2 px-3 text-right">Stock Left</th>
                      <th className="py-2 px-3 text-right">Days of Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fastMovingProducts.map((prod, idx) => (
                      <tr
                        key={prod.id}
                        className="border-b hover:bg-blue-50/80"
                      >
                        <td className="py-2 px-3 font-semibold text-center">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold">
                          {prod.product_name}
                        </td>
                        <td className="py-2 px-3">{prod.category}</td>
                        <td className="py-2 px-3">{prod.subcategory}</td>
                        <td className="py-2 px-3 text-right">
                          {prod.units_90d.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.current_stock.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.est_days_of_cover
                            ? prod.est_days_of_cover.toFixed(1)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-4">
                  <b>Days of Cover</b> = Stock Left ÷ average daily sales (last
                  90 days). Shows how long the stock will last at current sales
                  velocity.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- SLOW MOVING MODAL --- */}
      <AnimatePresence>
        {showSlowMovingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 inset-0 flex items-center justify-center bg-black/40"
            style={{
              zIndex: 9999,
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0",
            }}
            onClick={() => setShowSlowMovingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 0 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] md:max-w-4xl p-0 md:p-8 border border-orange-200 overflow-x-auto"
              style={{
                margin: "0 auto",
                position: "relative",
                maxHeight: "90vh",
                overflowY: "auto",
                boxSizing: "border-box",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-bold text-black">
                  Top 20 Slow Moving Products{" "}
                  <span className="font-normal text-base text-gray-600">
                    (last 90 days)
                  </span>
                </span>
                <button
                  className="w-8 h-8 text-gray-400 hover:bg-gray-100 rounded-full flex items-center justify-center text-xl"
                  onClick={() => setShowSlowMovingModal(false)}
                  title="Close"
                >
                  ×
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm border rounded-xl shadow">
                  <thead>
                    <tr className="bg-[#ffba20] text-black text-left font-bold text-base border-b">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Subcategory</th>
                      <th className="py-2 px-3 text-right">Sold (90d)</th>
                      <th className="py-2 px-3 text-right">Stock Left</th>
                      <th className="py-2 px-3 text-right">Days of Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowMovingProducts.map((prod, idx) => (
                      <tr
                        key={prod.id}
                        className="border-b hover:bg-orange-50/80"
                      >
                        <td className="py-2 px-3 font-semibold text-center">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold">
                          {prod.product_name}
                        </td>
                        <td className="py-2 px-3">{prod.category}</td>
                        <td className="py-2 px-3">{prod.subcategory}</td>
                        <td className="py-2 px-3 text-right">
                          {prod.units_90d.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.current_stock.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.est_days_of_cover
                            ? prod.est_days_of_cover.toFixed(1)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-4">
                  <b>Days of Cover</b> = Stock Left ÷ average daily sales (last
                  90 days). Indicates how long the current inventory will last.
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
              <th className="py-2 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((it) =>
                it.product_name
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())
              )
              .map((it) => (
                <tr
                  key={it.id}
                  className={
                    "border-b hover:bg-gray-100 " +
                    (it.quantity === 0
                      ? "bg-red-100 text-red-700 font-semibold"
                      : "")
                  }
                >
                  <td className="py-2 px-4">{it.sku}</td>
                  <td className="py-2 px-4">{it.product_name}</td>
                  <td className="py-2 px-4">{it.category}</td>
                  <td className="py-2 px-4">{it.subcategory}</td>
                  <td className="py-2 px-4">{it.unit}</td>
                  <td className="py-2 px-4 text-right">{it.quantity}</td>
                  <td className="py-2 px-4 text-right">
                    ₱{it.unit_price?.toLocaleString()}
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
      <div
        className="mt-10"
        id="pending-orders-section"
        ref={pendingOrdersSectionRef}
      >
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
                    <span className="text-blue-700">
                      {order.customers.code}
                    </span>
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
                  Order Date &amp; Time:{" "}
                  {new Date(order.date_created).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hour12: true,
                    timeZone: "Asia/Manila",
                  })}
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
                {order.status !== "completed" &&
                  order.status !== "rejected" && (
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
                            setPickingStatus((prev) =>
                              prev.filter((p) => p.orderId !== order.id)
                            );
                            setEditedQuantities([]);
                            setEditedDiscounts([]);
                            setSelectedOrder(null);
                            setShowModal(false);
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
              orders.filter(
                (o) => o.status === "pending" || o.status === "accepted"
              ).length / ordersPerPage
            )}
          </span>
          <button
            onClick={() =>
              setCurrentPage((p) =>
                p <
                Math.ceil(
                  orders.filter(
                    (o) => o.status === "pending" || o.status === "accepted"
                  ).length / ordersPerPage
                )
                  ? p + 1
                  : p
              )
            }
            disabled={
              currentPage >=
              Math.ceil(
                orders.filter(
                  (o) => o.status === "pending" || o.status === "accepted"
                ).length / ordersPerPage
              )
            }
            className={`px-4 py-2 rounded ${
              currentPage >=
              Math.ceil(
                orders.filter(
                  (o) => o.status === "pending" || o.status === "accepted"
                ).length / ordersPerPage
              )
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      {/* --- MODALS: Picking List, Sales Order, Final Confirmation --- */}

      {/* Picking List Modal */}
    {showModal &&
  selectedOrder &&
  (() => {
    const hasZeroStock = selectedOrder.order_items.some(
      (item) => item.inventory.quantity === 0
    );

    const hasInsufficientStock = selectedOrder.order_items.some((item, i) => {
      const requested = editedQuantities[i] ?? item.quantity;
      return requested > item.inventory.quantity;
    });


          return (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-start z-50 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl w-[96vw] max-w-[1800px] mx-auto flex flex-col px-10 py-8 text-[15px] mt-16">
                {/* PICKING LIST MODAL CONTENT */}
                <h2 className="text-3xl font-bold mb-6 text-center text-gray-900 tracking-wide">
                  Picking List
                </h2>

                {/* Customer & Payment Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-gray-50 border rounded-xl p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">
                      Customer Details
                    </h3>
                    <p>
                      <span className="font-bold">Name:</span>{" "}
                      {selectedOrder.customers.name}
                    </p>
                    <p>
                      <span className="font-bold">Email:</span>{" "}
                      {selectedOrder.customers.email}
                    </p>
                    <p>
                      <span className="font-bold">Phone:</span>{" "}
                      {selectedOrder.customers.phone}
                    </p>
                    <p>
                      <span className="font-bold">Address:</span>{" "}
                      {selectedOrder.customers.address}
                    </p>
                    {selectedOrder.customers.area && (
                      <p>
                        <span className="font-bold">Area:</span>{" "}
                        {selectedOrder.customers.area}
                      </p>
                    )}
                  </div>
                  <div className="bg-gray-50 border rounded-xl p-5 shadow-sm flex flex-col gap-3">
  <h3 className="text-lg font-semibold text-gray-700 mb-2">
    Payment & Totals
  </h3>

  {/* TOTAL */}
  <div>
    <span className="font-semibold">Total: </span>
    <span className="text-2xl font-bold text-green-700">
      ₱{computedOrderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
    <div className="text-xs text-gray-500 ml-1">Sum of items after discount</div>
  </div>

  {/* PAYMENT TYPE */}
  <div>
    <span className="font-semibold">Payment Type:</span>{" "}
    <span
      className={
        selectedOrder.customers.payment_type === "Credit"
          ? "font-bold text-blue-600"
          : selectedOrder.customers.payment_type === "Cash"
          ? "font-bold text-green-600"
          : "font-bold text-orange-500"
      }
    >
      {selectedOrder.customers.payment_type || "N/A"}
    </span>
    <div className="text-xs text-gray-500 ml-1">Customer&apos;s chosen payment method</div>
  </div>

  {/* TERMS (only for Credit) */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div>
      <label className="font-semibold mr-2">Terms:</label>
      <input
        type="number"
        min={1}
        value={numberOfTerms}
        onChange={(e) => setNumberOfTerms(Math.max(1, Number(e.target.value)))}
        className="border rounded px-2 py-1 w-20 text-center"
      />
      <div className="text-xs text-gray-500 ml-1">
        Number of months to pay (credit terms)
      </div>
    </div>
  )}

  {/* INTEREST % (only for Credit) */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div>
      <label className="font-semibold mr-2">Interest %:</label>
      <input
        type="number"
        min={0}
        value={interestPercent}
        onChange={(e) => setInterestPercent(Math.max(0, Number(e.target.value)))}
        className="border rounded px-2 py-1 w-20 text-center"
      />
      <div className="text-xs text-gray-500 ml-1">
        Interest applied to subtotal + tax
      </div>
    </div>
  )}

  {/* SALES TAX CHECKBOX */}
  <div className="flex items-center">
    <input
      type="checkbox"
      checked={isSalesTaxOn}
      onChange={() => setIsSalesTaxOn(!isSalesTaxOn)}
      id="sales-tax-toggle"
      className="mr-2 accent-blue-600"
    />
    <label htmlFor="sales-tax-toggle" className="font-semibold">
      Include Sales Tax (12%)
    </label>
    <div className="text-xs text-gray-500 ml-6">Check to add 12% VAT to total</div>
  </div>

  {/* SALES TAX VALUE */}
  <div>
    <span className="font-semibold">Sales Tax (12%): </span>
    <span>₱{salesTaxValue.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
    <div className="text-xs text-gray-500 ml-1">Tax amount added to subtotal</div>
  </div>

  {/* INTEREST AMOUNT */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div>
      <span className="font-semibold">
        Interest Amount ({interestPercent}%):
      </span>
      <span>
        ₱{((computedOrderTotal + salesTaxValue) * (interestPercent/100)).toLocaleString(undefined, {minimumFractionDigits:2})}
      </span>
      <div className="text-xs text-gray-500 ml-1">
        Additional cost due to credit terms
      </div>
    </div>
  )}

  {/* GRAND TOTAL */}
  <div className="border-t pt-3 text-sm">
    <span className="font-bold">Grand Total w/ Interest:</span>{" "}
    <span className="font-bold text-blue-700">
      ₱{getGrandTotalWithInterest().toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
    <div className="text-xs text-gray-500 ml-1">
      Final amount after tax & interest
    </div>
  </div>

  {/* PER TERM */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div>
      <span className="font-bold">Per Term ({numberOfTerms}x):</span>
      <span className="font-bold text-blue-700 ml-2">
        ₱{getPerTermAmount().toLocaleString(undefined, {minimumFractionDigits:2})}
      </span>
      <div className="text-xs text-gray-500 ml-1">
        Amount due per installment/month
      </div>
    </div>
  )}
</div>

                </div>

                {/* Picking List Table */}
                <div className="overflow-x-auto rounded-xl border shadow-sm">
                  <table className="w-full text-sm">
<thead className="bg-[#ffba20] text-black">
  <tr>
    <th className="py-2 px-3 text-left">Quantity</th>
    <th className="py-2 px-3 text-left">Unit</th>
    <th className="py-2 px-3 text-left">Description</th>
    <th className="py-2 px-3 text-left">Notes</th>
    <th className="py-2 px-3 text-right">Unit Price</th>
    <th className="py-2 px-3 text-right">Discount (%)</th>
    <th className="py-2 px-3 text-right">Amount</th>
  </tr>
</thead>


                    <tbody>
                     {selectedOrder.order_items.map((item, idx) => {
  const qty = editedQuantities[idx] ?? item.quantity;
  const price = item.price;
  const percent = editedDiscounts[idx] || 0;
  const amount = qty * price * (1 - percent / 100);

  const stock = item.inventory.quantity;
  const insufficient = qty > stock || stock === 0; // highlight rule

 

  return (
    <tr
      key={idx}
      className={
        "border-t hover:bg-gray-50 " +
        (insufficient ? "bg-red-100 text-red-700 font-semibold" : "")
      }
    >
      {/* Quantity */}
      <td className="py-2 px-3">
        <input
  type="number"
  min={1}
  // enforce both stock limit and 50k max
  max={Math.min(item.inventory.quantity, 50000)}
  value={qty}
  onChange={(e) => {
    let val = Number(e.target.value);

    // clamp between 1 and 50,000 (and also not more than stock)
    if (isNaN(val) || val < 1) val = 1;
    if (val > 50000) val = 50000;
    if (val > item.inventory.quantity) val = item.inventory.quantity;

    setEditedQuantities((prev) =>
      prev.map((q, i) => (i === idx ? val : q))
    );
  }}
  className="border rounded px-2 py-1 w-24 text-center bg-gray-100 font-medium"
/>

      </td>

      {/* Unit */}
      <td className="py-2 px-3">{item.inventory.unit}</td>

      {/* Description */}
<td className="py-2 px-3">
  <div className="font-semibold">{item.inventory.product_name}</div>
  <div className="text-xs text-gray-500">SKU: {item.inventory.sku}</div>
</td>

{/* Notes */}
<td className="py-2 px-3">
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


      {/* Unit Price */}
      <td className="py-2 px-3 text-right">
        ₱{price.toLocaleString()}
      </td>

      {/* Discount/Add (%) */}
<td className="py-2 px-3 text-right">
  <div className="flex flex-col items-center gap-1">
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        value={percent}
        onChange={(e) => {
          let p = parseFloat(e.target.value.replace(/[^0-9]/g, ""));
          if (isNaN(p)) p = 0;
          if (p > 100) p = 100;
          if (p < 0) p = 0;
          setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? p : d)));
        }}
        className="w-14 text-center border rounded px-1 py-0.5 mx-1 font-bold"
        min={0}
        max={100}
        step={1}
        style={{
          fontWeight: 600,
          color: "#222",
        }}
      />
      <span className="ml-1">%</span>
    </div>
    <button
      className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 mt-0.5 hover:bg-blue-100 active:bg-blue-200 transition"
      style={{ fontSize: "11px" }}
      onClick={() =>
        setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? 0 : d)))
      }
      type="button"
    >
      Reset
    </button>
  </div>
</td>



      {/* Amount */}
  <td className="py-2 px-3 text-right font-semibold">
  ₱
  {(item.inventory.quantity === 0
    ? 0
    : amount
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}
</td>

     
    </tr>
  );
})}

                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}

               {/* Optional warning banner if there are stock issues */}
{(hasZeroStock || hasInsufficientStock) && (
  <div className="mt-4 mb-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700 text-center">
    Some items are out of stock or exceed available quantity. You can still proceed and review on the next step.
  </div>
)}

{/* Action Buttons */}
<div className="flex justify-center gap-8 mt-6">
  <button
    className="bg-green-600 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition"
    onClick={() => {
      setShowModal(false);
      setShowSalesOrderModal(true);
    }}
  >
    Proceed Order
  </button>
  <button
    className="bg-gray-400 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
    onClick={() => {
      // Reset states back to default
      setShowModal(false);
      setShowSalesOrderModal(false);
      setShowFinalConfirm(false);
      setSelectedOrder(null);
      setEditedQuantities([]);
      setEditedDiscounts([]);
      setPickingStatus([]);
      setPoNumber("");
      setRepName("");
      setNumberOfTerms(1);
      setInterestPercent(0);
      setIsSalesTaxOn(true);
    }}
  >
    Cancel
  </button>
</div>

              </div>
            </div>
          );
        })()}

      {/* SALES ORDER MODAL (Confirmation Layout) */}
      {showSalesOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-start z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-[96vw] h-[94vh] mx-auto flex flex-col gap-6 px-10 py-8 my-4 text-[15px] max-w-none max-h-[94vh] overflow-y-auto mt-16">
            <h2
              className="text-3xl font-bold mb-6 tracking-wide text-center text-gray-800"
              style={{ letterSpacing: "0.07em" }}
            >
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
                  {new Date().toISOString().slice(0, 10)}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-right space-y-1">
                  {/* Payment Terms display stays here */}
                </div>

                {/* PO Number — digits only, max 6, with “No.” prefix */}
<div className="flex items-baseline gap-2">
  <span className="font-medium">PO Number:</span>
  <span className="text-gray-700">No.</span>
  <input
    inputMode="numeric"
    pattern="\d*"
    maxLength={6}
    value={poNumber}
    onChange={(e) => {
      // keep only digits, clamp to 6 chars
      const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
      setPoNumber(digitsOnly);
      if (fieldErrors.poNumber) setFieldErrors((f) => ({ ...f, poNumber: false }));
    }}
    onPaste={(e) => {
      // ensure pasted content follows the same rule
      e.preventDefault();
      const text = (e.clipboardData.getData("text") || "")
        .replace(/\D/g, "")
        .slice(0, 6);
      setPoNumber(text);
      if (fieldErrors.poNumber) setFieldErrors((f) => ({ ...f, poNumber: false }));
    }}
    className={`border-b outline-none px-1 transition-all duration-150 tracking-widest tabular-nums ${
      fieldErrors.poNumber
        ? "border-red-500 bg-red-50 animate-shake"
        : "border-gray-300"
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
                  <span className="font-semibold">
                    {processor?.name || "Unknown"}
                  </span>
                  <span className="text-gray-500">
                    {" "}
                    ({processor?.email || "-"})
                  </span>
                  {processor?.role && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100">
                      {processor.role}
                    </span>
                  )}
                </div>
              {/* Sales Rep Name — letters + spaces only, max 30 chars */}
<div>
  <span className="font-medium">Sales Rep Name: </span>
  <input
    type="text"
    maxLength={30}
    value={repName}
    onChange={(e) => {
      // allow only letters and spaces, clamp to 30
      const lettersOnly = e.target.value.replace(/[^A-Za-z\s]/g, "").slice(0, 30);
      setRepName(lettersOnly);
      if (fieldErrors.repName)
        setFieldErrors((f) => ({ ...f, repName: false }));
    }}
    onPaste={(e) => {
      e.preventDefault();
      const text = (e.clipboardData.getData("text") || "")
        .replace(/[^A-Za-z\s]/g, "")
        .slice(0, 30);
      setRepName(text);
      if (fieldErrors.repName)
        setFieldErrors((f) => ({ ...f, repName: false }));
    }}
    className={`border-b outline-none px-1 transition-all duration-150 ${
      fieldErrors.repName
        ? "border-red-500 bg-red-50 animate-shake"
        : "border-gray-300"
    }`}
    style={{ minWidth: 120 }}
    placeholder="Input Rep (letters only)"
    aria-label="Sales Rep Name (letters only, max 30)"
  />
  {fieldErrors.repName && (
    <div className="text-xs text-red-600 mt-1">
      Sales Rep Name is required
    </div>
  )}
</div>

                <div>
                  <span className="font-medium">Payment Terms: </span>
                  {selectedOrder.customers.payment_type === "Credit" ? (
                    <>
                      Net {numberOfTerms} Monthly
                      <span className="text-gray-500 ml-2">
                        (Terms: {numberOfTerms})
                      </span>
                    </>
                  ) : (
                    selectedOrder.customers.payment_type
                  )}
                </div>
              </div>
            </div>
            {/* CUSTOMER DETAILS */}
            <div className="bg-[#f6f6f9] border rounded-lg px-4 py-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 text-[15px]">
              <div>
                <div className="font-bold">To:</div>
                <div>
                  <b>Name:</b> {selectedOrder.customers.name}
                </div>
                <div>
                  <b>Email:</b> {selectedOrder.customers.email}
                </div>
                <div>
                  <b>Phone:</b> {selectedOrder.customers.phone}
                </div>
                <div>
                  <b>Address:</b> {selectedOrder.customers.address}
                </div>
                {selectedOrder.customers.area && (
                  <div>
                    <b>Area:</b> {selectedOrder.customers.area}
                  </div>
                )}
              </div>
              <div>
                <div className="font-bold">Ship To:</div>
                <div>
                  <b>Name:</b> {selectedOrder.customers.name}
                </div>
                <div>
                  <b>Address:</b> {selectedOrder.customers.address}
                </div>
                {selectedOrder.customers.area && (
                  <div>
                    <b>Area:</b> {selectedOrder.customers.area}
                  </div>
                )}
              </div>
            </div>
            {/* Item Table */}
            <div className="rounded-xl border mt-3">
              <table className="w-full text-[15px]">
<thead className="bg-[#ffba20] text-black">
  <tr>
    <th className="py-1 px-2 text-left">Quantity</th>
    <th className="py-1 px-2 text-left">Unit</th>
    <th className="py-1 px-2 text-left">Description</th>
    <th className="py-1 px-2 text-left">Notes</th>
    <th className="py-1 px-2 text-right">Unit Price</th>
    <th className="py-1 px-2 text-right">Discount</th>
    <th className="py-1 px-2 text-right">Amount</th>
  </tr>
</thead>


                <tbody>
                  {selectedOrder.order_items.map((item, idx) => {
                   const qty = editedQuantities[idx] ?? item.quantity;
const price = item.price;
const percent = editedDiscounts[idx] || 0;
const amount = qty * price * (1 - percent / 100);

const stock = item.inventory.quantity;
const insufficient = qty > stock || stock === 0; // ← our rule

                    return (
<tr key={idx} className="border-t text-[14px]">
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
    {editedDiscounts[idx]
      ? `-${Math.abs(editedDiscounts[idx])}%`
      : "0%"}
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

  {/* Subtotal */}
  <div className="flex justify-between font-medium">
    <span>
      Subtotal:
      <div className="text-xs text-gray-500">Sum before tax & discount</div>
    </span>
    <span>
      ₱{subtotalBeforeDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}
    </span>
  </div>

  {/* Sales Tax */}
  <div className="flex justify-between">
    <span>
      Sales Tax (12%):
      <div className="text-xs text-gray-500">Tax applied to subtotal</div>
    </span>
    <span>
      ₱{salesTaxValue.toLocaleString(undefined, {minimumFractionDigits: 2})}
    </span>
  </div>

  {/* Total Discount */}
  <div className="flex justify-between">
    <span>
      Discount/Add:
      <div className="text-xs text-gray-500">Sum of per-item discounts/adds</div>
    </span>
    <span className={totalDiscount !== 0 ? "text-orange-600 font-semibold" : ""}>
      {totalDiscount === 0
        ? "—"
        : `${totalDiscount > 0 ? "-" : "+"}₱${Math.abs(totalDiscount).toLocaleString(undefined, {minimumFractionDigits: 2})}`}
    </span>
  </div>

  {/* Subtotal with Tax/Discount */}
  <div className="flex justify-between">
    <span>
      Subtotal w/ Tax & Discount:
      <div className="text-xs text-gray-500">Subtotal after discount & tax</div>
    </span>
    <span>
      ₱{(subtotalBeforeDiscount + salesTaxValue - totalDiscount).toLocaleString(undefined, {minimumFractionDigits: 2})}
    </span>
  </div>

  {/* Interest (for Credit) */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div className="flex justify-between">
      <span>
        Interest Amount ({interestPercent}%):
        <div className="text-xs text-gray-500">For credit terms</div>
      </span>
      <span>
        ₱{((subtotalBeforeDiscount + salesTaxValue - totalDiscount) * (interestPercent/100)).toLocaleString(undefined, {minimumFractionDigits:2})}
      </span>
    </div>
  )}

  {/* Grand Total */}
  <div className="flex justify-between text-xl font-bold border-t pt-2">
    <span>
      TOTAL ORDER AMOUNT:
      <div className="text-xs text-gray-500">Final total (tax, discount &amp; interest)</div>
    </span>
    <span className="text-green-700">
      ₱{getGrandTotalWithInterest().toLocaleString(undefined, {minimumFractionDigits: 2})}
    </span>
  </div>

  {/* Per Term (for Credit) */}
  {selectedOrder.customers.payment_type === "Credit" && (
    <div className="flex justify-between">
      <span>
        Payment per Term:
        <div className="text-xs text-gray-500">Amount per installment/month</div>
      </span>
      <span className="font-bold text-blue-700">
        ₱{getPerTermAmount().toLocaleString(undefined, {minimumFractionDigits: 2})}
      </span>
    </div>
  )}
</div>

            </div>
            {/* Action Buttons */}
            <div className="flex justify-center gap-8 mt-6">
              <button
                className="bg-green-600 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition"
                onClick={handleOrderConfirm}
              >
                Confirm
              </button>
              <button
                className="bg-gray-400 text-white px-10 py-4 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={handleBackModal}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL ADMIN CONFIRMATION MODAL */}
      {showFinalConfirm && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-auto p-10 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to{" "}
              <span className="text-green-700">COMPLETE</span> this order?
            </div>
            <div className="text-base mb-6">
              This will deduct the items from inventory, mark the order as
              completed, and record the sales transaction.
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
                  isCompletingOrder
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-500"
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
      {/* --- REJECT CONFIRMATION MODAL --- */}
      {showRejectConfirm && orderToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto p-8 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to{" "}
              <span className="text-red-600">REJECT</span> this order?
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