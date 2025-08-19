"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Clock,
  Truck,
  Plus,
  Printer,
  ReceiptText,
} from "lucide-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
} from "@/components/ui/dialog";
import { generatePDFBlob } from "@/utils/exportInvoice";
import { toast } from "sonner";

/* =========================
   TYPES
========================= */
type Delivery = {
  id: number;
  destination: string;
  plate_number: string;
  driver: string;
  status: "Scheduled" | "Ongoing" | "Delivered" | string;
  schedule_date: string;
  arrival_date: string | null;
  participants?: string[] | null;
  food?: number | null;
  gas?: number | null;
  toll?: number | null;
  boat?: number | null;
  other?: number | null;
  created_at?: string;
  _orders?: OrderWithCustomer[];
};

type Customer = {
  id: number;
  name: string;
  code: string;
  address?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  transaction?: string | null;
  date?: string | null;
  created_at?: string | null;
  status?: string | null;
};

type OrderWithCustomer = {
  id: number;
  total_amount: number | null;
  status: string | null;
  truck_delivery_id: number | null;
  customer: Customer; // joined
  order_items?: Array<{
    quantity: number;
    price: number;
    inventory: {
      product_name: string;
      category: string | null;
      subcategory: string | null;
      status: string | null;
    } | null;
  }>;
};

type ConfirmDialogState = {
  open: boolean;
  id: number | null;
  newStatus: string;
};

export default function TruckDeliveryPage() {
  const supabase = createPagesBrowserClient();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const [invoiceDialogOpenId, setInvoiceDialogOpenId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    id: null,
    newStatus: "",
  });

  const [selectedOrderForDialog, setSelectedOrderForDialog] =
    useState<OrderWithCustomer | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForDeliveryId, setAssignForDeliveryId] = useState<number | null>(null);
  const [unassignedOrders, setUnassignedOrders] = useState<OrderWithCustomer[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);

  const [newDelivery, setNewDelivery] = useState({
    destination: "",
    plateNumber: "",
    status: "Scheduled",
    scheduleDate: "",
    arrivalDate: "",
    driver: "",
    participants: [] as string[],
    expenses: { food: 0, gas: 0, toll: 0, boat: 0, other: 0 },
  });

  /* =========================
     LOAD DATA
  ========================= */
  useEffect(() => {
    fetchDeliveriesAndAssignments();
  }, []);

  const fetchDeliveriesAndAssignments = async () => {
    const { data: dData, error: dErr } = await supabase
      .from<"truck_deliveries", Delivery>("truck_deliveries")
      .select("*")
      .order("created_at", { ascending: false });

    if (dErr) {
      console.error("Fetch deliveries error:", dErr);
      toast.error("Failed to load deliveries");
      setDeliveries([]);
      return;
    }

    const deliveriesList = dData ?? [];
    setDeliveries(deliveriesList);

    if (deliveriesList.length === 0) return;

    const ids = deliveriesList.map((d) => d.id);
    const { data: oData, error: oErr } = await supabase
      .from<OrderWithCustomer>("orders")
      .select(`
        id,
        total_amount,
        status,
        truck_delivery_id,
        customer:customer_id(
          id,
          name,
          code,
          address,
          contact_person,
          phone,
          status,
          date,
          created_at
        ),
        order_items(
          quantity,
          price,
          inventory:inventory_id(
            product_name,
            category,
            subcategory,
            status
          )
        )
      `)
      .in("truck_delivery_id", ids);

    if (oErr) {
      console.error("Fetch assigned orders error:", oErr);
      return;
    }

    const byDelivery = new Map<number, OrderWithCustomer[]>();
    (oData ?? []).forEach((o) => {
      if (!o.truck_delivery_id) return;
      if (!byDelivery.has(o.truck_delivery_id)) {
        byDelivery.set(o.truck_delivery_id, []);
      }
      byDelivery.get(o.truck_delivery_id)!.push(o);
    });

    setDeliveries((prev) =>
      prev.map((d) => ({
        ...d,
        _orders: byDelivery.get(d.id) || [],
      }))
    );
  };

  const fetchUnassignedOrders = async () => {
    const { data, error } = await supabase
      .from<OrderWithCustomer>("orders")
      .select(`
        id,
        total_amount,
        status,
        truck_delivery_id,
        customer:customer_id(
          id,
          name,
          code,
          address,
          contact_person,
          phone,
          status,
          date,
          created_at
        )
      `)
      .is("truck_delivery_id", null)
      .order("id", { ascending: false });

    if (error) {
      console.error("Fetch unassigned orders error:", error);
      toast.error("Failed to load unassigned invoices");
      setUnassignedOrders([]);
      return;
    }

    setUnassignedOrders(data ?? []);
  };

  /* =========================
     CLEAR INVOICES HANDLER
  ========================= */
  const handleClearInvoices = async (deliveryId: number) => {
    const delivery = deliveries.find((d) => d.id === deliveryId);
    const orderIds = delivery?._orders?.map((o) => o.id) || [];
    if (orderIds.length === 0) {
      toast.info("No invoices to clear on this truck.");
      return;
    }

    if (!window.confirm("Clear all invoices from this truck?")) return;

    const { error } = await supabase
      .from("orders")
      .update({ truck_delivery_id: null })
      .in("id", orderIds);

    if (error) {
      toast.error("Failed to clear invoices.");
      return;
    }

    toast.success("All invoices cleared from this truck.");
    await fetchDeliveriesAndAssignments();
  };

  /* =========================
     HELPERS
  ========================= */
  const showForm = () => setFormVisible(true);
  const hideForm = () => {
    setFormVisible(false);
    setNewPerson("");
    setNewDelivery({
      destination: "",
      plateNumber: "",
      status: "Scheduled",
      scheduleDate: "",
      arrivalDate: "",
      driver: "",
      participants: [],
      expenses: { food: 0, gas: 0, toll: 0, boat: 0, other: 0 },
    });
  };

  const handleAddDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("truck_deliveries").insert([
      {
        destination: newDelivery.destination,
        plate_number: newDelivery.plateNumber,
        driver: newDelivery.driver,
        participants: newDelivery.participants,
        status: newDelivery.status,
        schedule_date: newDelivery.scheduleDate,
        arrival_date: newDelivery.arrivalDate || null,
        food: newDelivery.expenses.food,
        gas: newDelivery.expenses.gas,
        toll: newDelivery.expenses.toll,
        boat: newDelivery.expenses.boat,
        other: newDelivery.expenses.other,
      },
    ]);

    if (error) {
      console.error("Insert error:", error);
      toast.error("Failed to add delivery");
      return;
    }

    toast.success("Delivery schedule added");
    await fetchDeliveriesAndAssignments();
    hideForm();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Delivered":
        return <CheckCircle className="text-green-600" />;
      case "Ongoing":
        return <Truck className="text-yellow-600" />;
      case "Scheduled":
        return <Clock className="text-blue-600" />;
      default:
        return null;
    }
  };

  const updateDeliveryStatusInState = (id: number, status: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
  };

  const confirmStatusChange = async () => {
    const { id, newStatus } = confirmDialog;
    if (id == null) return;

    const { error } = await supabase
      .from("truck_deliveries")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("Update error:", error);
      toast.error("Failed to update delivery status");
    } else {
      updateDeliveryStatusInState(id, newStatus);
      toast.success("Delivery status changed successfully");
    }

    setConfirmDialog({ open: false, id: null, newStatus: "" });
  };

  const addParticipant = () => {
    if (!newPerson.trim()) return;
    setNewDelivery((prev) => ({
      ...prev,
      participants: [...prev.participants, newPerson.trim()],
    }));
    setNewPerson("");
  };

  const updateArrivalDate = async (deliveryId: number, date: string) => {
    const { error } = await supabase
      .from("truck_deliveries")
      .update({ arrival_date: date })
      .eq("id", deliveryId);

    if (error) {
      toast.error("Failed to update Date Received");
      return;
    }

    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? { ...d, arrival_date: date } : d))
    );
    toast.success("Date Received updated");
  };

  /* =========================
     GROUP BY schedule_date
  ========================= */
  const groupedDeliveries = useMemo(() => {
    return deliveries.reduce<Record<string, Delivery[]>>((acc, delivery) => {
      const dateKey = delivery.schedule_date || "Unscheduled";
      (acc[dateKey] ||= []).push(delivery);
      return acc;
    }, {});
  }, [deliveries]);

  /* =========================
     ASSIGN ORDERS -> DELIVERY
  ========================= */
  const openAssignDialog = async (deliveryId: number) => {
    setAssignForDeliveryId(deliveryId);
    setSelectedOrderIds([]);
    await fetchUnassignedOrders();
    setAssignOpen(true);
  };

  const toggleSelectOrder = (orderId: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const assignSelected = async () => {
    if (!assignForDeliveryId || selectedOrderIds.length === 0) {
      setAssignOpen(false);
      return;
    }
    const { error } = await supabase
      .from("orders")
      .update({ truck_delivery_id: assignForDeliveryId })
      .in("id", selectedOrderIds);

    if (error) {
      console.error("Assign error:", error);
      toast.error("Failed to assign invoices to truck");
      return;
    }
    toast.success("Invoices assigned to truck");
    setAssignOpen(false);
    await fetchDeliveriesAndAssignments();
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Truck Delivery</h1>
        <button
          onClick={showForm}
          className="bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] flex items-center gap-2 mr-20"
        >
          <Plus size={18} /> Add Delivery Schedule
        </button>
      </div>

      {/* Delivery Cards – GROUPED BY schedule_date */}
      {Object.entries(groupedDeliveries).map(([date, dayDeliveries]) => (
        <div key={date} className="mb-10">
          <h2 className="text-lg font-bold text-gray-700 mb-3">
            Scheduled on: {date}
          </h2>

          {dayDeliveries.map((delivery) => (
            <motion.div
              key={delivery.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-white p-6 rounded-lg shadow-md mb-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">
                    Delivery to {delivery.destination}
                  </h2>

                  <div className="mt-2 text-sm text-gray-700 space-y-1">
                    <p>
                      <strong>Schedule Date:</strong> {delivery.schedule_date}
                    </p>
                    <p>
                      <strong>Plate Number:</strong> {delivery.plate_number}
                    </p>

                    {/* Editable Date Received if Delivered */}
                    {delivery.status === "Delivered" ? (
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold">Date Received:</label>
                        <input
                          type="date"
                          value={delivery.arrival_date || ""}
                          onChange={(e) => updateArrivalDate(delivery.id, e.target.value)}
                          className="border px-2 py-1 rounded text-sm"
                        />
                      </div>
                    ) : (
                      delivery.arrival_date && (
                        <p>
                          <strong>Arrival Date:</strong> {delivery.arrival_date}
                        </p>
                      )
                    )}

                    <p>
                      <strong>Driver:</strong> {delivery.driver}
                    </p>
                    {(delivery.participants?.length ?? 0) > 0 && (
                      <p>
                        <strong>Other Participants:</strong>{" "}
                        {(delivery.participants || []).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 w-full max-w-2xl">
                  <h3 className="font-semibold mb-1">Invoices on this truck</h3>
                  {delivery._orders && delivery._orders.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {delivery._orders.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition shadow-sm"
                        >
                          {/* TXN */}
                          <div className="font-mono text-[#222] text-sm font-semibold tracking-tight bg-white px-2 py-1 rounded mr-2 border border-gray-300 shadow-sm min-w-[165px] text-center">
                            {o.customer?.code}
                          </div>
                          {/* Name & Address */}
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="text-gray-800 text-base font-medium truncate">
                              {o.customer?.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {o.customer?.address ? o.customer.address : "No address provided"}
                            </div>
                          </div>
                          {/* Delivery Date at right */}
                          <div className="ml-auto flex flex-col items-end min-w-[125px]">
                            <span className="text-xs font-semibold text-gray-500">
                              Order Completion Date
                            </span>
                            <span className="text-sm text-gray-700">
                              {delivery.schedule_date
                                ? new Date(delivery.schedule_date).toLocaleDateString("en-PH", {
                                    year: "numeric",
                                    month: "short",
                                    day: "2-digit",
                                  })
                                : "-"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No invoices assigned yet.</p>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex flex-col items-end gap-2 text-sm min-w-[220px]">
                  <div className="flex items-center gap-2">
                    {delivery.status === "Delivered" && <CheckCircle className="text-green-600" />}
                    {delivery.status === "Ongoing" && <Truck className="text-yellow-600" />}
                    {delivery.status === "Scheduled" && <Clock className="text-blue-600" />}
                    <select
                      value={delivery.status}
                      onChange={(e) =>
                        setConfirmDialog({
                          open: true,
                          id: delivery.id,
                          newStatus: e.target.value,
                        })
                      }
                      className={`border px-2 py-1 rounded text-sm ${
                        delivery.status === "Delivered"
                          ? "text-green-600"
                          : delivery.status === "Ongoing"
                          ? "text-yellow-600"
                          : "text-blue-600"
                      }`}
                    >
                      <option value="Scheduled">Scheduled</option>
                      <option value="Ongoing">Ongoing</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>

                                    <button
                    onClick={() => openAssignDialog(delivery.id)}
                    className="px-3 py-1.5 border rounded hover:bg-gray-50"
                  >
                    Assign Invoices
                  </button>

                  <button
                    onClick={() => handleClearInvoices(delivery.id)}
                    className="px-3 py-1.5 border border-red-500 text-red-500 rounded hover:bg-red-50 transition"
                  >
                    Clear Invoices
                  </button>

                  {/* View Invoice(s) */}
                  <Dialog
                    open={invoiceDialogOpenId === delivery.id}
                    onOpenChange={(open) => {
                      setInvoiceDialogOpenId(open ? delivery.id : null);
                      if (!open) {
                        setSelectedCustomer(null);
                        setSelectedOrderForDialog(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <button className="text-sm text-blue-600 underline hover:text-blue-800">
                        View Invoice
                      </button>
                    </DialogTrigger>

                    <DialogContent className="max-w-5xl">
                      {delivery._orders && delivery._orders.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm font-medium">
                            Select an invoice (by customer) assigned to this truck:
                          </p>
                          <select
  value={selectedOrderForDialog?.id ?? ""}
  onChange={(e) => {
    const id = String(e.target.value); // <- Always string!
    const ord = delivery._orders!.find((x) => String(x.id) === id) || null;
    setSelectedOrderForDialog(ord);
    setSelectedCustomer(ord?.customer || null);
    console.log("Selected order:", ord);
  }}
  className="border p-2 rounded w-full"
>
  <option value="">-- Choose order --</option>
  {delivery._orders.map((o) => (
    <option key={o.id} value={o.id}>
      {o.customer?.name} — {o.customer?.code}
    </option>
  ))}
</select>

                          {selectedOrderForDialog?.customer && (
                            <div
                              id={`invoice-${selectedOrderForDialog.customer.id}`}
                              className="bg-white p-6 text-sm"
                            >
                              <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                  <ReceiptText /> Sales Invoice – {selectedOrderForDialog.customer.code}
                                </h2>
                                <button
                                  onClick={async () => {
                                    const blob = await generatePDFBlob(
                                      `invoice-${selectedOrderForDialog.customer.id}`
                                    );
                                    if (blob) {
                                      const url = URL.createObjectURL(blob);
                                      setPdfUrl(url);
                                      toast.success("PDF ready — opening preview…");
                                    } else {
                                      toast.error("Failed to generate PDF");
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  <Printer className="w-4 h-4" /> Preview PDF
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-y-1 text-sm">
                                <p><strong>NAME:</strong> {selectedOrderForDialog.customer.name}</p>
                                <p><strong>TRANSACTION CODE:</strong> {selectedOrderForDialog.customer.code}</p>
                                <p className="col-span-2">
                                  <strong>ADDRESS:</strong> {selectedOrderForDialog.customer.address}
                                </p>
                                <p><strong>CONTACT PERSON:</strong> {selectedOrderForDialog.customer.contact_person}</p>
                                <p><strong>TEL NO:</strong> {selectedOrderForDialog.customer.phone}</p>
                                <p><strong>TERMS:</strong> Net 30</p>
                                <p><strong>COLLECTION:</strong> On Delivery</p>
                                <p><strong>CREDIT LIMIT:</strong> ₱20,000</p>
                                <p><strong>SALESMAN:</strong> Pedro Reyes</p>
                              </div>
                              <div className="overflow-auto mt-4">
                                <table className="w-full text-sm border">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="border px-2 py-1">TRANSACTION DATE</th>
                                      <th className="border px-2 py-1">RECEIVED DATE</th>
                                      <th className="border px-2 py-1">TRANSACTION</th>
                                      <th className="border px-2 py-1">STATUS</th>
                                      <th className="border px-2 py-1">CHARGE</th>
                                      <th className="border px-2 py-1">CREDIT</th>
                                      <th className="border px-2 py-1">BALANCE</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(selectedOrderForDialog.order_items ?? []).map((it, i) => {
                                      const desc = it.inventory?.product_name ?? "(item)";
                                      const qty = it.quantity ?? 0;
                                      const price = it.price ?? 0;
                                      const charge = qty * price;
                                      const credit = 0;
                                      const balance = charge - credit;
                                      const txnDate =
                                        (selectedOrderForDialog as any)?.created_at
                                          ? new Date((selectedOrderForDialog as any).created_at)
                                              .toLocaleDateString()
                                          : new Date().toLocaleDateString();
                                      const receivedDate = delivery.arrival_date
                                        ? new Date(delivery.arrival_date).toLocaleDateString()
                                        : "";

                                      return (
                                        <tr key={i}>
                                          <td className="border px-2 py-1">{txnDate}</td>
                                          <td className="border px-2 py-1">{receivedDate}</td>
                                          <td className="border px-2 py-1">
                                            {desc} — {qty} @ ₱{price.toLocaleString()}
                                          </td>
                                          <td className="border px-2 py-1">
                                            {selectedOrderForDialog.status || "Pending"}
                                          </td>
                                          <td className="border px-2 py-1">₱{charge.toLocaleString()}</td>
                                          <td className="border px-2 py-1">₱{credit.toLocaleString()}</td>
                                          <td className="border px-2 py-1">₱{balance.toLocaleString()}</td>
                                        </tr>
                                      );
                                    })}
                                    {selectedOrderForDialog && (
                                      <tr>
                                        <td className="border px-2 py-1 text-right" colSpan={4}>
                                          <strong>Total</strong>
                                        </td>
                                        <td className="border px-2 py-1">
                                          ₱{(selectedOrderForDialog.order_items ?? [])
                                            .reduce((s, it) => s + (it.quantity ?? 0) * (it.price ?? 0), 0)
                                            .toLocaleString()}
                                        </td>
                                        <td className="border px-2 py-1">₱0</td>
                                        <td className="border px-2 py-1">
                                          ₱{(selectedOrderForDialog.order_items ?? [])
                                            .reduce((s, it) => s + (it.quantity ?? 0) * (it.price ?? 0), 0)
                                            .toLocaleString()}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">
                          No invoices assigned to this truck yet. Use <em>Assign Invoices</em>.
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="mt-4">
                <h3 className="font-semibold mb-2">Delivery Expenses</h3>
                <ul className="text-sm space-y-1">
                  <li>🚚 Food Allowance: ₱{delivery.food ?? 0}</li>
                  <li>⛽ Gas: ₱{delivery.gas ?? 0}</li>
                  <li>🛣 Toll Fees: ₱{delivery.toll ?? 0}</li>
                  <li>🛥 Boat Shipping: ₱{delivery.boat ?? 0}</li>
                  <li>📦 Other Fees: ₱{delivery.other ?? 0}</li>
                  <li className="font-medium">
                    Total: ₱
                    {[
                      delivery.food ?? 0,
                      delivery.gas ?? 0,
                      delivery.toll ?? 0,
                      delivery.boat ?? 0,
                      delivery.other ?? 0,
                    ].reduce((sum, fee) => sum + (fee || 0), 0)}
                  </li>
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      ))}

      {/* Confirmation Modal */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, id: null, newStatus: "" });
        }}
      >
        <DialogContent>
          <p>
            Are you sure you want to change this delivery’s status to{" "}
            <strong>{confirmDialog.newStatus}</strong>?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() =>
                setConfirmDialog({ open: false, id: null, newStatus: "" })
              }
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={confirmStatusChange}
              className="px-4 py-2 bg-[#181918] text-white rounded hover:bg-[#2b2b2b]"
            >
              Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Invoices Modal */}
      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open);
          if (!open) {
            setAssignForDeliveryId(null);
            setSelectedOrderIds([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <h3 className="text-lg font-semibold mb-2">Assign invoices to truck</h3>
          {unassignedOrders.length === 0 ? (
            <p className="text-sm text-gray-600">No unassigned invoices found.</p>
          ) : (
            <div className="max-h-96 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Select</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">TXN</th>
                    <th className="text-left p-2">Amount</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedOrders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(o.id)}
                          onChange={() => toggleSelectOrder(o.id)}
                        />
                      </td>
                      <td className="p-2">{o.customer?.name}</td>
                      <td className="p-2 font-mono">{o.customer?.code}</td>
                      <td className="p-2">₱{o.total_amount ?? 0}</td>
                      <td className="p-2">{o.status || "pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="px-4 py-2 border rounded hover:bg-gray-100"
              onClick={() => setAssignOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-[#181918] text-white rounded hover:bg-[#2b2b2b]"
              onClick={assignSelected}
              disabled={!assignForDeliveryId || selectedOrderIds.length === 0}
            >
              Assign Selected
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Form Modal */}
      {formVisible && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white p-6 rounded-xl w-full max-w-3xl shadow-lg"
          >
            <h2 className="text-xl font-bold mb-4">Add Delivery Schedule</h2>
            <form onSubmit={handleAddDelivery} className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Destination</label>
                  <input
                    type="text"
                    value={newDelivery.destination}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, destination: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Plate Number</label>
                  <input
                    type="text"
                    value={newDelivery.plateNumber}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, plateNumber: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Driver</label>
                  <input
                    type="text"
                    value={newDelivery.driver}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, driver: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Participant</label>
                  <div className="flex gap-2 w-full">
                    <input
                      type="text"
                      value={newPerson}
                      onChange={(e) => setNewPerson(e.target.value)}
                      className="w-full border p-2 rounded"
                    />
                    <button
                      type="button"
                      onClick={addParticipant}
                      className="bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-900"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {newDelivery.participants.length > 0 && (
                  <div className="col-span-2 text-sm pl-36 text-gray-600">
                    Current: {newDelivery.participants.join(", ")}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Status</label>
                  <select
                    value={newDelivery.status}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, status: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                  >
                    <option>Scheduled</option>
                    <option>Ongoing</option>
                    <option>Delivered</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Schedule Date</label>
                  <input
                    type="date"
                    value={newDelivery.scheduleDate}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, scheduleDate: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                {newDelivery.status === "Delivered" && (
                  <div className="flex items-center gap-2 col-span-2">
                    <label className="w-32 text-sm font-medium">Arrival Date</label>
                    <input
                      type="date"
                      value={newDelivery.arrivalDate}
                      onChange={(e) =>
                        setNewDelivery({ ...newDelivery, arrivalDate: e.target.value })
                      }
                      className="w-full border p-2 rounded"
                    />
                  </div>
                )}

                {Object.keys(newDelivery.expenses).map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <label className="w-32 text-sm font-medium capitalize">{key}</label>
                    <input
                      type="number"
                      placeholder="₱"
                      value={(newDelivery.expenses as any)[key]}
                      onChange={(e) =>
                        setNewDelivery({
                          ...newDelivery,
                          expenses: {
                            ...newDelivery.expenses,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border p-2 rounded"
                      min={0}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={hideForm}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#181918] text-white px-4 py-2 rounded hover:bg-[#2b2b2b]"
                >
                  Save Delivery
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

