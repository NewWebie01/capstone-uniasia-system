"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";

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

export default function SalesPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
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
  const [taxAmount, setTaxAmount] = useState(0);
  const [freightAmount, setFreightAmount] = useState(0);
  const ordersPerPage = 10;

  // Fetch all inventory items
  const fetchItems = async () => {
    const { data, error } = await supabase.from("inventory").select("*");
    if (!error) setItems(data || []);
  };

  // Fetch orders with related customer & items
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
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
      `)
      .order("date_created", { ascending: false });
    if (!error && data) {
      const formatted = data.map((o) => ({
        ...o,
        customers: Array.isArray(o.customer) ? o.customer[0] : o.customer,
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
    // Realtime inventory & orders
    const inventoryChannel: RealtimeChannel = supabase
      .channel("inventory-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, fetchItems)
      .subscribe();

    const ordersChannel: RealtimeChannel = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  useEffect(() => {
    if (!showModal) {
      setNumberOfTerms(1);
      setInterestPercent(0);
      setTaxAmount(0);
      setFreightAmount(0);
    }
  }, [showModal]);

  const isOrderAccepted = (orderId: string) =>
    pickingStatus.some((p) => p.orderId === orderId && p.status === "accepted");

  const handleAcceptOrder = (order: OrderWithDetails) => {
    setEditedDiscounts(order.order_items.map(() => 0));
    setPickingStatus((prev) => [...prev, { orderId: order.id, status: "accepted" }]);
    setEditedQuantities(order.order_items.map((item) => item.quantity));
    setSelectedOrder(order);
    setShowModal(true);
    setNumberOfTerms(1);
    setInterestPercent(0);
    setTaxAmount(0);
    setFreightAmount(0);
  };

  const handleRejectOrder = async (order: OrderWithDetails) => {
    setPickingStatus((prev) => [...prev, { orderId: order.id, status: "rejected" }]);
    await supabase.from("orders").update({ status: "rejected" }).eq("id", order.id);
    fetchOrders();
  };

  // --- Calculations ---
  const computedOrderTotal = useMemo(() => {
    if (!selectedOrder) return 0;
    return selectedOrder.order_items.reduce((sum, item, idx) => {
      const q = editedQuantities[idx] ?? item.quantity;
      const percent = editedDiscounts[idx] ?? 0;
      const p = item.price;
      return sum + q * p * (1 + percent / 100);
    }, 0);
  }, [selectedOrder, editedQuantities, editedDiscounts]);

  const getGrandTotalWithInterest = () => {
    if (!selectedOrder) return 0;
    const baseTotal = computedOrderTotal + taxAmount + freightAmount;
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

  // Save order & payment terms
  const handleOrderConfirm = async () => {
    if (!selectedOrder) return;
    setShowFinalConfirm(true);
  };

  // After admin confirms in the confirmation modal
  const handleOrderComplete = async () => {
    if (!selectedOrder) return;
    for (let i = 0; i < selectedOrder.order_items.length; i++) {
      const oi = selectedOrder.order_items[i];
      const invId = oi.inventory.id;
      const remaining = oi.inventory.quantity - editedQuantities[i];
      if (remaining < 0) {
        alert(`Insufficient stock for ${oi.inventory.product_name}`);
        setShowFinalConfirm(false);
        return;
      }
      await supabase.from("inventory").update({ quantity: remaining }).eq("id", invId);
      await supabase.from("sales").insert([
        {
          inventory_id: invId,
          quantity_sold: editedQuantities[i],
          amount:
            editedQuantities[i] *
            oi.price *
            (1 + (editedDiscounts[i] || 0) / 100),
          date: new Date().toISOString(),
        },
      ]);
    }
    // Save payment terms/interest for Credit orders to DB
    if (selectedOrder.customers.payment_type === "Credit") {
      await supabase
        .from("orders")
        .update({
          payment_terms: numberOfTerms,
          interest_percent: interestPercent,
          grand_total_with_interest: getGrandTotalWithInterest(),
          per_term_amount: getPerTermAmount(),
          status: "completed",
          sales_tax: taxAmount,
          freight: freightAmount,
        })
        .eq("id", selectedOrder.id);
    } else {
      await supabase
        .from("orders")
        .update({
          status: "completed",
          sales_tax: taxAmount,
          freight: freightAmount,
        })
        .eq("id", selectedOrder.id);
    }
    setShowSalesOrderModal(false);
    setShowModal(false);
    setShowFinalConfirm(false);
    setSelectedOrder(null);
    fetchOrders();
    fetchItems();
    alert("Order successfully completed.");
  };

  // Back to first modal (not close)
  const handleBackModal = () => {
    setShowSalesOrderModal(false);
    setShowModal(true);
  };

  // Cancel and close all
  const handleCancelModal = () => {
    setShowModal(false);
    setSelectedOrder(null);
    setShowSalesOrderModal(false);
    setShowFinalConfirm(false);
    setPoNumber("");
    setRepName("");
    setTaxAmount(0);
    setFreightAmount(0);
  };

  // RESET discount for a row
  const handleResetDiscount = (idx: number) => {
    setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? 0 : d)));
  };

  // Add/Minus Discount Hold Support
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

  // Discount/Add percent input handler (number only, no + or - typing)
  const handleDiscountInput = (idx: number, value: string) => {
    let percent = parseFloat(value.replace(/[^0-9\-]/g, ''));
    if (isNaN(percent)) percent = 0;
    if (percent > 100) percent = 100;
    if (percent < -100) percent = -100;
    setEditedDiscounts((prev) => prev.map((d, i) => (i === idx ? percent : d)));
  };

  return (
    <div className="p-6">
      <motion.h1 className="text-3xl font-bold mb-4">Sales Processing</motion.h1>
      <input
        type="text"
        placeholder="Search products..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded"
      />

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
                it.product_name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((it) => (
                <tr key={it.id} className="border-b hover:bg-gray-100">
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
      <div className="mt-10">
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
                className={`border p-4 mb-4 rounded shadow bg-white text-base ${isAccepted ? "border-blue-600 border-2" : ""}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-xl">
                    Transaction ID: <span className="text-blue-700">{`TXN-${order.id.slice(0, 8).toUpperCase()}`}</span>
                  </span>
                  <span className={`font-bold px-3 py-1 rounded text-base ml-4 ${order.customers.payment_type === "Credit" ? "bg-blue-200 text-blue-800" : order.customers.payment_type === "Cash" ? "bg-green-200 text-green-700" : "bg-orange-200 text-orange-700"}`}>
                    {order.customers.payment_type || "N/A"}
                  </span>
                </div>
                {isAccepted && (
                  <div className="mb-2 flex items-center">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-base font-semibold shadow-sm">Processing by Admin</span>
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
                          onClick={() => handleRejectOrder(order)}
                          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-base"
                        >
                          Reject Order
                        </button>
                      </>
                    )}
                    {isAccepted && (
                      <button
                        onClick={() => {
                          setPickingStatus(prev => prev.filter(p => p.orderId !== order.id));
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
            className={`px-4 py-2 rounded ${currentPage === 1
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
            className={`px-4 py-2 rounded ${currentPage >=
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

      {/* Picking List Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-auto flex flex-col gap-6 p-6 my-10 text-[15px]">
            {/* Customer Info */}
            <div className="bg-[#F7FAFC] rounded-xl shadow px-8 py-6 border border-gray-200 mb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                <div>
                  <h2 className="font-bold text-base mb-2 tracking-wide text-[#1A202C]">Customer Info</h2>
                  <p><b>Name:</b> {selectedOrder.customers.name}</p>
                  <p><b>Email:</b> {selectedOrder.customers.email}</p>
                  <p><b>Phone:</b> {selectedOrder.customers.phone}</p>
                  <p><b>Address:</b> {selectedOrder.customers.address}</p>
                  {selectedOrder.customers.area && <p><b>Area:</b> {selectedOrder.customers.area}</p>}
                </div>
                <div className="flex flex-col justify-start items-end">
                  <p>
                    <b>Total:</b>{" "}
                    <span className="font-bold text-2xl text-green-700">
                      ₱{computedOrderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold">Payment Terms:</span>{" "}
                    <span
                      className={
                        selectedOrder.customers.payment_type === "Credit"
                          ? "font-bold text-blue-600"
                          : selectedOrder.customers.payment_type === "Cash"
                            ? "font-bold text-green-600"
                            : selectedOrder.customers.payment_type === "Balance"
                              ? "font-bold text-orange-500"
                              : "font-bold"
                      }
                    >
                      {selectedOrder.customers.payment_type || "N/A"}
                    </span>
                  </p>
                  <div className="flex flex-col gap-1 mt-2 w-full items-end">
                    <div>
                      <span className="font-semibold mr-1">Terms:</span>
                      <input
                        type="number"
                        min={1}
                        value={numberOfTerms}
                        onChange={e => setNumberOfTerms(Math.max(1, Number(e.target.value)))}
                        className="border rounded px-2 py-1 w-16 text-center"
                        disabled={selectedOrder.customers.payment_type !== "Credit"}
                      />
                    </div>
                    <div>
                      <span className="font-semibold mr-1">Interest %:</span>
                      <input
                        type="number"
                        min={0}
                        value={interestPercent}
                        onChange={e => setInterestPercent(Math.max(0, Number(e.target.value)))}
                        className="border rounded px-2 py-1 w-16 text-center"
                        disabled={selectedOrder.customers.payment_type !== "Credit"}
                      />
                    </div>
                    <div className="text-base text-gray-700 mt-1">
                      <b>Grand Total w/ Interest:</b> <span className="text-blue-700 font-bold">₱{getGrandTotalWithInterest().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <br />
                      <b>Per Term:</b> <span className="text-blue-700 font-bold">₱{getPerTermAmount().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Picking List Table */}
            <div className="bg-white rounded-xl shadow border border-gray-200 px-2 py-4 mb-4">
              <h2 className="font-bold text-base mb-2 tracking-wide text-[#1A202C] text-center">Picking List</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[15px] border border-gray-200 rounded-xl">
                  <thead className="bg-[#ffba20] text-black">
                    <tr>
                      <th className="py-2 px-3 text-center">QTY</th>
                      <th className="py-2 px-3 text-center">UNIT</th>
                      <th className="py-2 px-3 text-left">ITEM DESCRIPTION</th>
                      <th className="py-2 px-3 text-right">UNIT PRICE</th>
                      <th className="py-2 px-3 text-right">DISCOUNT/ADD (%)</th>
                      <th className="py-2 px-3 text-right">LESS/ADD</th>
                      <th className="py-2 px-3 text-right">AMOUNT</th>
                      <th className="py-2 px-3 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.order_items.map((item, idx) => {
                      const qty = editedQuantities[idx] ?? item.quantity;
                      const price = item.price;
                      const percent = editedDiscounts[idx] || 0;
                      const lessAmount = qty * price * (percent / 100);
                      const netAmount = qty * price * (1 + percent / 100);
                      return (
                        <tr key={idx} className="border-t text-center text-[15px]">
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={1}
                              max={item.inventory.quantity}
                              value={qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setEditedQuantities(prev =>
                                  prev.map((q, i) => (i === idx ? val : q))
                                );
                              }}
                              className="border rounded px-2 py-1 w-14 text-center bg-[#F7FAFC] font-semibold"
                              title="Quantity"
                            />
                          </td>
                          <td className="py-2 px-3">{item.inventory.unit}</td>
                          <td className="py-2 px-3 text-left">
                            <div className="font-semibold">{item.inventory.product_name}</div>
                            <div className="text-xs text-gray-500">
                              <span>SKU: {item.inventory.sku}</span>
                              {item.inventory.category && <span> | {item.inventory.category}</span>}
                              {item.inventory.subcategory && <span> | {item.inventory.subcategory}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">₱{item.inventory.unit_price?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex flex-col items-center">
                              <div className="flex items-center gap-2">
                                <button
                                  className="bg-gray-200 px-2 py-1 rounded text-base font-bold hover:bg-gray-300 select-none"
                                  title="Minus"
                                  onMouseDown={() => {
                                    handleDecrement(idx);
                                    timersRef.current[idx] = setInterval(() => handleDecrement(idx), 150);
                                  }}
                                  onMouseUp={() => clearInterval(timersRef.current[idx])}
                                  onMouseLeave={() => clearInterval(timersRef.current[idx])}
                                >–</button>
                                <input
                                  type="number"
                                  value={percent}
                                  onChange={e => handleDiscountInput(idx, e.target.value)}
                                  min={-100}
                                  max={100}
                                  className="w-14 border rounded px-1 py-1 text-center font-semibold"
                                  style={{ MozAppearance: 'textfield' }}
                                  title="Enter negative for discount, positive for surcharge. Range: -100 to 100"
                                />
                                <button
                                  className="bg-gray-200 px-2 py-1 rounded text-base font-bold hover:bg-gray-300 select-none"
                                  title="Add"
                                  onMouseDown={() => {
                                    handleIncrement(idx);
                                    timersRef.current[idx] = setInterval(() => handleIncrement(idx), 150);
                                  }}
                                  onMouseUp={() => clearInterval(timersRef.current[idx])}
                                  onMouseLeave={() => clearInterval(timersRef.current[idx])}
                                >+</button>
                                <span className="ml-2 font-bold">
                                  {percent > 0 ? "+" : percent < 0 ? "-" : ""}
                                  {Math.abs(percent)}%
                                </span>
                              </div>
                              <button
                                type="button"
                                className="mt-1 px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 font-medium"
                                onClick={() => handleResetDiscount(idx)}
                              >
                                Reset
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right text-[#DC7633] font-semibold">
                            {percent >= 0
                              ? `₱${lessAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                              : `-₱${Math.abs(lessAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </td>
                          <td className="py-2 px-3 text-right text-[#26734d] font-semibold">
                            ₱{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            ₱{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Action Buttons */}
            <div className="flex justify-center gap-8 mt-2">
              <button
                className="bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition"
                onClick={() => {
                  setShowModal(false);
                  setShowSalesOrderModal(true);
                }}
              >
                Proceed Order
              </button>
              <button
                className="bg-gray-400 text-white px-8 py-4 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={handleCancelModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALES ORDER MODAL (Confirmation Layout) */}
      {showSalesOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-auto flex flex-col gap-6 px-8 py-10 my-10 border text-[15px]">
            <h2 className="text-xl font-bold mb-2 tracking-wide">SALES ORDER</h2>
            <div className="flex flex-col md:flex-row md:justify-between mb-2 gap-2">
              <div>
                <div>
                  <span className="font-medium">Sales Order Number: </span>
                  <span className="text-lg text-blue-700 font-bold">{`TXN-${selectedOrder.id.slice(0, 8).toUpperCase()}`}</span>
                </div>
                <div>
                  <span className="font-medium">Sales Order Date: </span>
                  {new Date().toISOString().slice(0, 10)}
                </div>
                <div>
                  <span className="font-medium">Ship By: </span>
                  <input
                    type="date"
                    className="border-b outline-none"
                    style={{ minWidth: 120 }}
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </div>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <span className="font-medium">PO Number: </span>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={e => setPoNumber(e.target.value)}
                    className="border-b outline-none px-1"
                    style={{ minWidth: 100 }}
                    placeholder="Input PO No"
                  />
                </div>
                <div>
                  <span className="font-medium">Sales Rep Name: </span>
                  <input
                    type="text"
                    value={repName}
                    onChange={e => setRepName(e.target.value)}
                    className="border-b outline-none px-1"
                    style={{ minWidth: 100 }}
                    placeholder="Input Rep"
                  />
                </div>
                <div>
                  <span className="font-medium">Payment Terms: </span>
                  {selectedOrder.customers.payment_type === "Credit" ? (
                    <>
                      Net {numberOfTerms} Monthly
                      <span className="text-gray-500 ml-2">(Terms: {numberOfTerms})</span>
                    </>
                  ) : (
                    selectedOrder.customers.payment_type
                  )}
                </div>
              </div>
            </div>
            {/* CUSTOMER DETAILS: Only show needed fields */}
            <div className="bg-[#f6f6f9] border rounded-lg px-4 py-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 text-[15px]">
              <div>
                <div className="font-bold">To:</div>
                <div><b>Name:</b> {selectedOrder.customers.name}</div>
                <div><b>Email:</b> {selectedOrder.customers.email}</div>
                <div><b>Phone:</b> {selectedOrder.customers.phone}</div>
                <div><b>Address:</b> {selectedOrder.customers.address}</div>
                {selectedOrder.customers.area && <div><b>Area:</b> {selectedOrder.customers.area}</div>}
              </div>
              <div>
                <div className="font-bold">Ship To:</div>
                <div><b>Name:</b> {selectedOrder.customers.name}</div>
                <div><b>Address:</b> {selectedOrder.customers.address}</div>
                {selectedOrder.customers.area && <div><b>Area:</b> {selectedOrder.customers.area}</div>}
              </div>
            </div>
            {/* Item Table */}
            <div className="rounded-xl overflow-x-auto border mt-3">
              <table className="w-full text-[15px]">
                <thead className="bg-[#ffba20] text-black">
                  <tr>
                    <th className="py-2 px-3 text-left">Quantity</th>
                    <th className="py-2 px-3 text-left">Unit</th>
                    <th className="py-2 px-3 text-left">Description</th>
                    <th className="py-2 px-3 text-right">Unit Price</th>
                    <th className="py-2 px-3 text-right">Discount/Add (%)</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.order_items.map((item, idx) => {
                    const qty = editedQuantities[idx] ?? item.quantity;
                    const price = item.price;
                    const percent = editedDiscounts[idx] || 0;
                    const amount = qty * price * (1 + percent / 100);
                    return (
                      <tr key={idx} className="border-t text-[15px]">
                        <td className="py-2 px-3">{qty}</td>
                        <td className="py-2 px-3">{item.inventory.unit}</td>
                        <td className="py-2 px-3">
                          {item.inventory.product_name}
                          {item.inventory.category ? ` | ${item.inventory.category}` : ""}
                          {item.inventory.subcategory ? ` | ${item.inventory.subcategory}` : ""}
                        </td>
                        <td className="py-2 px-3 text-right">₱{item.price.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="font-bold">
                            {percent > 0 ? "+" : percent < 0 ? "-" : ""}
                            {Math.abs(percent)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          ₱{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  <span>Subtotal:</span>
                  <span>₱{computedOrderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sales Tax:</span>
                  <input
                    type="number"
                    value={taxAmount}
                    onChange={e => setTaxAmount(Number(e.target.value))}
                    className="w-28 border-b text-right px-2 outline-none"
                    min={0}
                    step={1}
                    placeholder="₱0.00"
                  />
                </div>
                <div className="flex justify-between">
                  <span>Freight:</span>
                  <input
                    type="number"
                    value={freightAmount}
                    onChange={e => setFreightAmount(Number(e.target.value))}
                    className="w-28 border-b text-right px-2 outline-none"
                    min={0}
                    step={1}
                    placeholder="₱0.00"
                  />
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>TOTAL ORDER AMOUNT:</span>
                  <span className="text-green-700">₱{getGrandTotalWithInterest().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {selectedOrder.customers.payment_type === "Credit" && (
                  <div className="flex justify-between">
                    <span>Payment per Term:</span>
                    <span className="font-bold text-blue-700">
                      ₱{getPerTermAmount().toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              Are you sure you want to <span className="text-green-700">COMPLETE</span> this order?
            </div>
            <div className="text-base mb-6">
              This will deduct the items from inventory, mark the order as completed, and record the sales transaction.
            </div>
            <div className="flex justify-center gap-10 mt-4">
              <button
                className="bg-green-600 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-green-700 transition"
                onClick={handleOrderComplete}
              >
                Yes, Confirm Order
              </button>
              <button
                className="bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={() => setShowFinalConfirm(false)}
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