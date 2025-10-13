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
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { generatePDFBlob } from "@/utils/exportInvoice";
import { toast } from "sonner";

// --- PSGC helpers (Region / Province only) ---
const fixEncoding = (s: string) => {
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const txt = new TextDecoder("utf-8").decode(buf);
  return JSON.parse(txt);
}

type PSGCRegion = { code: string; name: string };
type PSGCProvince = { code: string; name: string };

// CALENDAR HELPER
const todayLocal = (() => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
})();

/* =========================
   TYPES
========================= */
type Delivery = {
  id: number;
  destination: string;
  plate_number: string;
  driver: string;
  status: "Scheduled" | "To Ship" | "To Receive" | string;
  schedule_date: string;
  arrival_date: string | null;
  eta_date?: string | null;
  participants?: string[] | null;
  created_at?: string;
  shipping_fee?: number | null;
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
  landmark?: string | null;
};

type OrderWithCustomer = {
  id: number;
  total_amount: number | null;
  status: string | null;
  truck_delivery_id: number | null;
  terms?: string | null;
  collection?: string | null;
  salesman?: string | null;
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
  const [invoiceDialogOpenId, setInvoiceDialogOpenId] = useState<number | null>(
    null
  );
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] =
    useState<OrderWithCustomer | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    id: null,
    newStatus: "",
  });

  // Add after: const supabase = createPagesBrowserClient();
  async function logActivity(action: string, details: any = {}) {
    try {
      const { data } = await supabase.auth.getUser();
      const userEmail = data?.user?.email || "";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          action,
          details,
          user_role: "admin", // Always log as admin
          created_at: new Date().toISOString(), // Always log timestamp
        },
      ]);
    } catch (e) {
      console.error("Log activity failed", e);
    }
  }

  const [assignOpen, setAssignOpen] = useState(false);
  const [prefillOrderId, setPrefillOrderId] = useState<number | null>(null);
  const [prefillOrderAddress, setPrefillOrderAddress] = useState<string>("");
  const [assignForDeliveryId, setAssignForDeliveryId] = useState<number | null>(
    null
  );
  const [unassignedOrders, setUnassignedOrders] = useState<OrderWithCustomer[]>(
    []
  );
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);

  const [newDelivery, setNewDelivery] = useState({
    destination: "",
    plateNumber: "",
    status: "Scheduled",
    scheduleDate: "",
    arrivalDate: "",
    driver: "",
    participants: [] as string[],
  });

  // TODO: LOCATION HERE
  // Region / Province pickers for Destination
  const [regions, setRegions] = useState<PSGCRegion[]>([]);
  const [provinces, setProvinces] = useState<PSGCProvince[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [selectedRegionName, setSelectedRegionName] = useState<string>("");
  const [selectedProvinceName, setSelectedProvinceName] = useState<string>("");
  //FOR SHIPPING CONST
  const [editingShippingFees, setEditingShippingFees] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const selected = regions.find((r) => r.code === regionCode);
    if (selected) setSelectedRegionName(selected.name);
  }, [regionCode, regions]);

  useEffect(() => {
    const selected = provinces.find((p) => p.code === provinceCode);
    if (selected) setSelectedProvinceName(selected.name);
  }, [provinceCode, provinces]);

  // Load regions on mount
  useEffect(() => {
    fetchJSON<PSGCRegion[]>("https://psgc.cloud/api/regions")
      .then((data) =>
        setRegions(
          data
            .map((r) => ({
              code: r.code,
              name: fixEncoding((r as any).name ?? r.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => toast.error("Failed to load regions"));
  }, []);

  // When region changes, (re)load its provinces
  useEffect(() => {
    setProvinces([]);
    setProvinceCode("");

    if (!regionCode) return;

    // NCR (13…) has no provinces
    const isNCR = regionCode.startsWith("13");

    if (isNCR) return;

    fetchJSON<any[]>("https://psgc.cloud/api/provinces")
      .then((all) => {
        const list = all
          .filter((p) => (p.code as string).startsWith(regionCode.slice(0, 2)))
          .map((p) => ({ code: p.code, name: fixEncoding(p.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setProvinces(list);
      })
      .catch(() => toast.error("Failed to load provinces"));
  }, [regionCode]);

  /* =========================
     LOAD DATA
  ========================= */
  useEffect(() => {
    fetchDeliveriesAndAssignments();
  }, []);

  const fetchDeliveriesAndAssignments = async () => {
    // NOTE: removed generics to avoid TS incompatibility with your Supabase install
    const { data: dData, error: dErr } = await supabase
      .from("truck_deliveries")
      .select("*")
      //.in("status", ["Scheduled", "To Ship", "To Receive"])
      .order("schedule_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (dErr) {
      console.error("Fetch deliveries error:", dErr);
      toast.error("Failed to load deliveries");
      setDeliveries([]);
      return;
    }

    const deliveriesList = (dData as Delivery[]) ?? [];
    setDeliveries(deliveriesList);

    // 🔑 Put Scheduled first, then Ongoing, Delivered last.
    // Within the same status, newer schedule_date first.
    const statusRank = (s?: string) =>
      s === "Scheduled" ? 0 : s === "To Ship" ? 1 : 2; // Delivered (and others) last

    deliveriesList.sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;

      const ta = a.schedule_date ? new Date(a.schedule_date).getTime() : 0;
      const tb = b.schedule_date ? new Date(b.schedule_date).getTime() : 0;
      return tb - ta; // latest first
    });

    setDeliveries(deliveriesList);

    if (deliveriesList.length === 0) return;

    const ids = deliveriesList.map((d) => d.id);
    const { data: oData, error: oErr } = await supabase
      .from("orders")
      .select(
        `
    id,
    total_amount,
    status,
    truck_delivery_id,
    salesman,
    terms,
    accepted_at,
    customer:customer_id (
      id,
      name,
      code,
      address,
      landmark,
      contact_person,
      phone,
      status,
      date
    ),
    order_items (
      quantity,
      price,
      inventory:inventory_id (
        product_name,
        category,
        subcategory,
        status
      )
    )
  `
      )
      .in("truck_delivery_id", ids)
      .order("accepted_at", { ascending: false }); // instead of created_at

    if (oErr) {
      console.error("Fetch assigned orders error:", oErr);
      return;
    }

    const fetchedOrders = (oData as any[]) ?? [];

    const byDelivery = new Map<number, OrderWithCustomer[]>();
    fetchedOrders.forEach((oRaw) => {
      // supabase returns nested object customer: { ... } - keep as-is
      const o: OrderWithCustomer = {
        id: oRaw.id,
        total_amount: oRaw.total_amount,
        status: oRaw.status,
        truck_delivery_id: oRaw.truck_delivery_id,
        terms: oRaw.terms ?? null,
        salesman: oRaw.salesman ?? null,
        customer: oRaw.customer ?? null,
        order_items: oRaw.order_items ?? [],
      };
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
      .from("orders")
      .select(
        `
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
      `
      )
      .is("truck_delivery_id", null)
      .eq("status", "completed")
      .order("id", { ascending: true });

    if (error) {
      console.error("Fetch unassigned orders error:", error);
      toast.error("Failed to load unassigned invoices");
      setUnassignedOrders([]);
      return;
    }

    if (error) {
      console.error("Fetch unassigned orders error:", error);
      toast.error("Failed to load unassigned invoices");
      setUnassignedOrders([]);
      return;
    }

    // 🟡 Sort manually by TXN code (FIFO logic)
    // THIS IS THE PREVIOUS BASED ON TXN NUMBER
    // const sorted = (data as unknown as OrderWithCustomer[]).sort((a, b) => {
    //   const codeA = a.customer?.code || "";
    //   const codeB = b.customer?.code || "";
    //   return codeA.localeCompare(codeB); // FIFO sort by TXN
    // });

    // 🟢 Sort by customer created_at date (newest first) time based
    if (data) {
      const sorted = (data as unknown as OrderWithCustomer[]).sort((a, b) => {
        const dateA = new Date(a.customer?.created_at || "").getTime();
        const dateB = new Date(b.customer?.created_at || "").getTime();
        return dateA - dateB;
      });

      setUnassignedOrders(sorted);
    }

    setUnassignedOrders(
      (data as any[]).map((oRaw) => ({
        id: oRaw.id,
        total_amount: oRaw.total_amount,
        status: oRaw.status,
        truck_delivery_id: oRaw.truck_delivery_id,
        customer: Array.isArray(oRaw.customer)
          ? oRaw.customer[0]
          : oRaw.customer,
        order_items: oRaw.order_items ?? [],
      })) || []
    );

    const assignSelected = async () => {
      if (!assignForDeliveryId || selectedOrderIds.length === 0) {
        setAssignOpen(false);
        return;
      }

      // 1) Re-check the latest state of the selected orders
      const { data: checkRows, error: checkErr } = await supabase
        .from("orders")
        .select("id, status, truck_delivery_id")
        .in("id", selectedOrderIds);

      if (checkErr) {
        console.error("Check before assign error:", checkErr);
        toast.error("Unable to verify selected invoices. Try again.");
        return;
      }

      const invalid = (checkRows ?? []).filter(
        (r: any) => r.status !== "completed" || r.truck_delivery_id !== null
      );

      if (invalid.length > 0) {
        const taken = invalid
          .filter((r: any) => r.truck_delivery_id !== null)
          .map((r: any) => r.id);
        const wrongStatus = invalid
          .filter((r: any) => r.status !== "completed")
          .map((r: any) => r.id);

        if (taken.length) {
          toast.error(
            `Some invoices are already assigned to another truck: ${taken.join(
              ", "
            )}`
          );
        }
        if (wrongStatus.length) {
          toast.error(
            `Some invoices are not completed: ${wrongStatus.join(", ")}`
          );
        }
        return;
      }

      // 2) Defensive update: only assign rows that are still unassigned AND completed
      const { data: updated, error: updErr } = await supabase
        .from("orders")
        .update({ truck_delivery_id: assignForDeliveryId })
        .in("id", selectedOrderIds)
        .is("truck_delivery_id", null)
        .eq("status", "completed")
        .select("id"); // return which rows were actually updated

      if (updErr) {
        console.error("Assign error:", updErr);
        toast.error("Failed to assign invoices to truck");
        return;
      }

      const updatedCount = (updated ?? []).length;
      if (updatedCount === 0) {
        toast.error(
          "No invoices were assigned. They may have been taken or changed."
        );
      } else if (updatedCount < selectedOrderIds.length) {
        const notUpdated = selectedOrderIds.filter(
          (id) => !(updated ?? []).some((u: any) => u.id === id)
        );
        toast.warning(
          `Assigned ${updatedCount} invoice(s). Some were skipped: ${notUpdated.join(
            ", "
          )}`
        );
      } else {
        toast.success(`Assigned ${updatedCount} invoice(s) to the truck.`);
      }

      setAssignOpen(false);
      await fetchDeliveriesAndAssignments();
    };

    setUnassignedOrders(
      (data as any[]).map((oRaw) => ({
        id: oRaw.id,
        total_amount: oRaw.total_amount,
        status: oRaw.status,
        truck_delivery_id: oRaw.truck_delivery_id,
        customer: Array.isArray(oRaw.customer)
          ? oRaw.customer[0]
          : oRaw.customer,
        order_items: oRaw.order_items ?? [],
      })) || []
    );
  };

  const handleClearInvoices = async (deliveryId: number) => {
    const delivery = deliveries.find((d) => d.id === deliveryId);
    const orderIds = delivery?._orders?.map((o) => o.id) || [];
    if (orderIds.length === 0) {
      toast.info("No invoices to clear on this truck.");
      return;
    }

    // --------- PASTE UPDATED TOAST HERE ----------
    toast(`Clear all invoices from this truck?`, {
      action: {
        label: "Confirm",
        onClick: async () => {
          const t = toast.loading("Clearing invoices...");
          const { error } = await supabase
            .from("orders")
            .update({ truck_delivery_id: null })
            .in("id", orderIds);

          toast.dismiss(t);

          if (error) {
            toast.error("Failed to clear invoices.");
            console.error("Clear invoices error:", error);
            return;
          }

          toast.success("All invoices cleared from this truck.");

          // DEBUG LOG
          console.log("Will log activity now!");

          // LOG TO ACTIVITY
          await logActivity("Cleared all invoices from truck", {
            deliveryId,
            clearedOrderIds: orderIds,
          });

          console.log("Activity should be logged now!");

          await fetchDeliveriesAndAssignments();
        },
      },
      duration: 12000,
    });
    // ----------------------------------------------
  };

  /* =========================
     HELPERS
  ========================= */
  const showForm = () => {
    setNewDelivery((prev) => ({
      ...prev,
      destination: "",
    }));
    setRegionCode("");
    setProvinceCode("");
    setFormVisible(true);
  };
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
    });
    setRegionCode("");
    setProvinceCode("");
  };
  function openFormPrefilledFromOrder(order: OrderWithCustomer) {
    const addr = order?.customer?.address?.trim() || "";
    setPrefillOrderId(order.id);
    setPrefillOrderAddress(addr);

    setNewDelivery((prev) => ({
      ...prev,
      destination: addr,
      plateNumber: "",
      driver: "",
      participants: [],
      status: "Scheduled",
      scheduleDate: "",
      arrivalDate: "",
    }));

    setAssignOpen(false);
    setRegionCode("");
    setProvinceCode("");
    setFormVisible(true);
  }

  const handleAddDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const region = regions.find((r) => r.code === regionCode)?.name || "";
    const province = provinces.find((p) => p.code === provinceCode)?.name || "";
    const destinationComposed =
      newDelivery.destination?.trim() ||
      [region, province].filter(Boolean).join(", ");

    const { error: insErr, data: insData } = await supabase
      .from("truck_deliveries")
      .insert([
        {
          destination: destinationComposed,
          plate_number: newDelivery.plateNumber,
          driver: newDelivery.driver,
          participants: newDelivery.participants,
          status: newDelivery.status,
          schedule_date: newDelivery.scheduleDate,
          arrival_date: newDelivery.arrivalDate || null,
        },
      ])
      .select("id")
      .single();

    if (insErr) {
      console.error("Insert error:", insErr);
      toast.error("Failed to add delivery");
      return;
    }

    // 👇 NEW: Assign to order if opened via "Create Delivery"
    if (prefillOrderId) {
      const { error: linkErr } = await supabase
        .from("orders")
        .update({ truck_delivery_id: insData.id })
        .eq("id", prefillOrderId)
        .is("truck_delivery_id", null);

      if (linkErr) {
        console.error("Link order error:", linkErr);
        toast.error("Delivery created, but failed to link the invoice.");
      } else {
        toast.success("Invoice linked to the new truck.");
      }

      setPrefillOrderId(null);
      setPrefillOrderAddress("");
    }

    // ✅ ACTIVITY LOG ON SAVE
    await logActivity("Added Delivery Schedule", {
      destination: destinationComposed,
      plate_number: newDelivery.plateNumber,
      driver: newDelivery.driver,
      participants: newDelivery.participants,
      status: newDelivery.status,
      schedule_date: newDelivery.scheduleDate,
      arrival_date: newDelivery.arrivalDate || null,
    });

    await fetchDeliveriesAndAssignments();
    hideForm();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "To Receive":
        return <CheckCircle className="text-green-600" />;
      case "To Ship":
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
      if (newStatus === "To Receive") {
        setDeliveries((prev) => prev.filter((d) => d.id !== id));
        toast.success("Marked as Delivered — moved to Delivered History.");
      } else {
        updateDeliveryStatusInState(id, newStatus);
        toast.success("Delivery status changed successfully");
      }

      // ✅ ACTIVITY LOG FOR STATUS CHANGE
      await logActivity("Changed Delivery Status", {
        delivery_id: id,
        new_status: newStatus,
      });
    }

    setConfirmDialog({ open: false, id: null, newStatus: "" });
  };

  const addParticipant = () => {
    if (!newPerson.trim()) return;
    // optional safety: max 3
    if (newDelivery.participants.length >= 2)
      return toast.error("Up to 2 participants only.");
    setNewDelivery((prev) => ({
      ...prev,
      participants: [...prev.participants, newPerson.trim()],
    }));
    setNewPerson("");
  };

  /** Update arrival_date (a.k.a. Date Received) */
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

    // ✅ ACTIVITY LOG FOR DATE RECEIVED
    await logActivity("Updated Delivery Date Received", {
      delivery_id: deliveryId,
      arrival_date: date,
    });
  };

  /** Update eta_date (Estimated Arrival for Ongoing) */
  const updateEtaDate = async (deliveryId: number, date: string) => {
    const { error } = await supabase
      .from("truck_deliveries")
      .update({ eta_date: date })
      .eq("id", deliveryId);

    if (error) {
      console.error("ETA update failed:", error);
      toast.error(
        "Failed to update Estimated Arrival. Make sure 'eta_date' exists in truck_deliveries."
      );
      return;
    }

    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? { ...d, eta_date: date } : d))
    );
    toast.success("Estimated Arrival updated");

    // Optional activity log
    await logActivity("Updated Estimated Arrival", {
      delivery_id: deliveryId,
      eta_date: date,
    });
  };

  //SHIPPING FEE HANDLER
  const handleShippingFeeChange = async (deliveryId: number, value: number) => {
    const { error } = await supabase
      .from("truck_deliveries")
      .update({ shipping_fee: value })
      .eq("id", deliveryId);

    if (error) {
      toast.error("Failed to update Shipping Fee");
      return;
    }

    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? { ...d, shipping_fee: value } : d))
    );

    toast.success("Shipping Fee updated");

    await logActivity("Updated Shipping Fee", {
      delivery_id: deliveryId,
      shipping_fee: value,
    });
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

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedDeliveries).sort((da, db) => {
      const ta = da ? new Date(da).getTime() : 0;
      const tb = db ? new Date(db).getTime() : 0;
      return tb - ta; // latest date section first
    });
  }, [groupedDeliveries]);

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
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
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

    // 🟡 ADD THIS: LOG ACTIVITY!
    await logActivity("Assigned invoices to truck", {
      deliveryId: assignForDeliveryId,
      assignedOrderIds: selectedOrderIds,
    });

    await fetchDeliveriesAndAssignments();
    setAssignOpen(false);
  };

  /* =========================
     INVOICE MODAL HELPERS
  ========================= */

  // open the invoice dialog for the given delivery + optional specific order
  const openInvoiceDialogForOrder = (
    deliveryId: number,
    order?: OrderWithCustomer
  ) => {
    setInvoiceDialogOpenId(deliveryId);
    setSelectedOrderForInvoice(order ?? null);
  };

  const closeInvoiceDialog = () => {
    setInvoiceDialogOpenId(null);
    setSelectedOrderForInvoice(null);
    setPdfUrl(null);
  };

  const isLocked = (status: string) => status === "To Receive";
  const isActiveStatus = (s?: string) => s === "Scheduled" || s === "To Ship";
  const statusRank = (s?: string) => {
    if (s === "Scheduled") return 0;
    if (s === "To Ship") return 1;
    return 2; // To Receive / Delivered / others
  };

  type Groups = Record<string, Delivery[]>;

  const groupByDate = (arr: Delivery[]): Groups =>
    arr.reduce<Groups>((acc, d) => {
      const key = d.schedule_date || "Unscheduled";
      (acc[key] ||= []).push(d);
      return acc;
    }, {});

  // Split deliveries into Active vs Delivered
  const activeDeliveries = useMemo(
    () => deliveries.filter((d) => isActiveStatus(d.status)),
    [deliveries]
  );
  //TO REMOVE THE TO RECEIVE STATUS IN LOGISTICS
  const listToShow = deliveries.filter((d) => isActiveStatus(d.status));

  const sortedActive = useMemo(() => {
    return [...listToShow].sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;
      const ta = a.schedule_date ? new Date(a.schedule_date).getTime() : 0;
      const tb = b.schedule_date ? new Date(b.schedule_date).getTime() : 0;
      return tb - ta; // latest first
    });
  }, [listToShow]);
  // Group each bucket by date
  const groupedActive = useMemo(
    () => groupByDate(sortedActive),
    [sortedActive]
  );

  // Sorted date keys (latest date section first) for each bucket
  const sortedDateKeysActive = useMemo(() => {
    return Object.keys(groupedActive).sort((da, db) => {
      const ta = da ? new Date(da).getTime() : 0;
      const tb = db ? new Date(db).getTime() : 0;
      return tb - ta;
    });
  }, [groupedActive]);

  const pesoOrBlank = (v?: number | string | null) => {
    const n = Number(v ?? 0);
    return n > 0 ? `₱${n}` : "";
  };

  // Valicade name to avoid numbers and special characters
  const handleDriverChange = (value: string) => {
    // Allow only letters and spaces
    const regex = /^[A-Za-z\s]*$/;

    if (!regex.test(value)) {
      toast.error("Driver name can only contain letters and spaces");
      return; // block invalid input
    }

    // Auto-capitalize each word & trim spaces
    let formatted = value
      .replace(/\s+/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    setNewDelivery((prev) => ({ ...prev, driver: formatted }));
  };

  //PLATE NUM VALIDATION
  const handlePlateNumberChange = (value: string) => {
    // Remove spaces just for counting
    const withoutSpaces = value.replace(/\s/g, "");
    if (withoutSpaces.length <= 7) {
      setNewDelivery((prev) => ({ ...prev, plateNumber: value.toUpperCase() }));
    } else {
      toast.error("Plate number must not exceed 7 characters", {
        id: "plate-limit",
      });
    }
  };

  /* =========================
     RENDER
  ========================= */

  return (
    <div className="px-4 pb-4 pt-1 font-sans antialiased text-slate-800">
      {/* Header */}
      {/* Header */}
      <div className="flex items-start justify-between mb-4 -mt-1 pr-[96px] sm:pr-[120px]">
        <div>
          <h1 className="pt-2 text-3xl font-bold tracking-tight text-neutral-800">
            Truck Delivery
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Schedules, assignments & invoices
          </p>
        </div>

        <button
          onClick={() => {
            setAssignOpen(true);
            fetchUnassignedOrders();
          }}
          className="shrink-0 bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] flex items-center gap-2"
        >
          <Plus size={18} /> Assign Invoice
        </button>
      </div>

      {/* Delivery Cards – GROUPED BY schedule_date */}
      {/* 1) ACTIVE (Scheduled/Ongoing) — newest first */}
      {sortedDateKeysActive.map((date) => {
        const dayDeliveries = groupedActive[date];
        return (
          <div key={`active-${date}`} className="mb-10">
            <h2 className="text-lg font-bold text-gray-700 mb-3">
              Scheduled on: {date}
            </h2>

            {dayDeliveries.map((delivery) => (
              <motion.div
                key={delivery.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className={`bg-white p-6 rounded-lg shadow-md mb-6 ${
                  isLocked(delivery.status) ? "opacity-80" : ""
                }`}
              >
                <div className="grid grid-cols-12 gap-6">
                  {/* LEFT: Delivery details */}
                  <div className="col-span-12 lg:col-span-5">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Delivery to{" "}
                      <span className="text-slate-900">
                        {delivery.destination || (
                          <span className="italic text-gray-400">
                            [No destination]
                          </span>
                        )}
                      </span>
                    </h2>
                    {/* ✅ Landmark display below destination */}
                    {delivery._orders?.[0]?.customer?.landmark && (
                      <p className="text-sm mt-1 text-gray-500">
                        <strong>Landmark:</strong>{" "}
                        {delivery._orders[0].customer.landmark}
                      </p>
                    )}

                    <div className="mt-3 text-sm leading-6">
                      <div className="grid grid-cols-2 gap-y-2">
                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          SCHEDULE DATE
                        </div>
                        <div className="font-medium">
                          {delivery.schedule_date}
                        </div>

                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          PLATE NUMBER
                        </div>
                        <div className="font-medium">
                          {delivery.plate_number}
                        </div>

                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          DRIVER
                        </div>
                        <div className="font-medium">{delivery.driver}</div>

                        {delivery.arrival_date &&
                          delivery.status !== "Delivered" && (
                            <>
                              <div className="text-slate-500 uppercase tracking-wide text-xs">
                                DATE RECEIVED
                              </div>
                              <div className="font-medium">
                                {delivery.arrival_date}
                              </div>
                            </>
                          )}
                      </div>
                      {/* If Ongoing, show ETA date picker */}
                      {/* ETA picker for Ongoing */}
                      {delivery.status === "To Ship" && (
                        <div className="mt-3">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                            Estimated Arrival
                          </label>
                          <input
                            type="date"
                            value={delivery.eta_date || ""}
                            min={todayLocal}
                            onChange={(e) =>
                              updateEtaDate(delivery.id, e.target.value)
                            }
                            className="border rounded-md px-2 py-1 text-sm w-full max-w-xs"
                          />
                        </div>
                      )}

                      {delivery.status === "Scheduled" && (
                        <div className="mt-3">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                            Shipping Fee (₱)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={999999.99} // 6 digits max before decimals
                            className="border rounded-md px-2 py-1 text-sm w-full max-w-xs"
                            value={
                              editingShippingFees[delivery.id] ??
                              (delivery.shipping_fee != null
                                ? String(delivery.shipping_fee)
                                : "")
                            }
                            onChange={(e) => {
                              let v = e.target.value;

                              // allow empty while editing
                              if (v === "") {
                                setEditingShippingFees((prev) => ({
                                  ...prev,
                                  [delivery.id]: "",
                                }));
                                return;
                              }

                              // keep only digits and one dot
                              v = v.replace(/[^\d.]/g, "");
                              const parts = v.split(".");
                              const intPart = (parts[0] || "").slice(0, 6); // <- limit to 6 digits
                              let next = intPart;

                              if (parts.length > 1) {
                                const decPart = (parts[1] || "").slice(0, 2); // <- up to 2 decimals
                                next = decPart.length
                                  ? `${intPart}.${decPart}`
                                  : `${intPart}.`;
                              }

                              setEditingShippingFees((prev) => ({
                                ...prev,
                                [delivery.id]: next,
                              }));
                            }}
                            onBlur={(e) => {
                              const raw = e.currentTarget.value.trim();
                              if (raw === "") return;

                              let amount = Number(raw);
                              if (!Number.isFinite(amount)) {
                                // reset to previous DB value
                                setEditingShippingFees((prev) => ({
                                  ...prev,
                                  [delivery.id]:
                                    delivery.shipping_fee != null
                                      ? String(delivery.shipping_fee)
                                      : "",
                                }));
                                // toast.error("Invalid amount", { id: `shipfee-${delivery.id}` });
                                return;
                              }

                              // clamp to range 0 … 999999.99 and round to 2 decimals
                              amount = Math.max(
                                0,
                                Math.min(
                                  999999.99,
                                  Math.round(amount * 100) / 100
                                )
                              );

                              // Skip if unchanged
                              if (amount === (delivery.shipping_fee ?? 0)) {
                                // clear local buffer
                                setEditingShippingFees((prev) => {
                                  const copy = { ...prev };
                                  delete copy[delivery.id];
                                  return copy;
                                });
                                return;
                              }

                              // Commit once on blur
                              handleShippingFeeChange(delivery.id, amount);

                              // Clear local buffer after commit
                              setEditingShippingFees((prev) => {
                                const copy = { ...prev };
                                delete copy[delivery.id];
                                return copy;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                (e.currentTarget as HTMLInputElement).blur();
                            }}
                            placeholder="Enter shipping fee"
                          />
                        </div>
                      )}

                      {/* If Delivered (rare here), keep read-only date */}
                      {delivery.status === "Delivered" && (
                        <div className="mt-3">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                            Date Received
                          </label>
                          <input
                            type="date"
                            value={delivery.arrival_date || ""}
                            disabled={true}
                            className="border rounded-md px-2 py-1 text-sm w-full max-w-xs opacity-60 cursor-not-allowed"
                          />
                        </div>
                      )}

                      {(delivery.participants?.length ?? 0) > 0 && (
                        <p className="mt-3 text-sm">
                          <span className="text-slate-500 uppercase tracking-wide text-xs">
                            Assistants:
                          </span>
                          <br />
                          <span className="font-medium">
                            {(delivery.participants || []).join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* MIDDLE: Assigned invoices list */}
                  <div className="col-span-12 lg:col-span-5">
                    <h3 className="text-sm font-semibold text-slate-600 mb-2">
                      Invoices on this truck
                    </h3>

                    {delivery._orders && delivery._orders.length > 0 ? (
                      <div className="space-y-3">
                        {delivery._orders.map((o) => (
                          <div
                            key={o.id}
                            className="grid grid-cols-12 items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 hover:bg-slate-100/60 transition"
                          >
                            <button
                              className="col-span-12 sm:col-span-3 border rounded-lg px-3 py-1.5 font-mono text-xs bg-white hover:bg-slate-50 shadow-sm"
                              onClick={() =>
                                openInvoiceDialogForOrder(delivery.id, o)
                              }
                              title="Open invoice"
                            >
                              {o.customer?.code}
                            </button>

                            <div className="col-span-12 sm:col-span-6">
                              <div className="font-medium truncate">
                                {o.customer?.name}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {o.customer?.address ?? ""}
                              </div>
                              {o.customer?.landmark && (
                                <div className="text-xs text-slate-400 italic truncate">
                                  Landmark: {o.customer.landmark}
                                </div>
                              )}
                            </div>

                            <div className="col-span-12 sm:col-span-3 text-right">
                              <div className="mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700">
                                {o.status ?? "pending"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No invoices assigned yet.
                      </p>
                    )}
                  </div>

                  {/* RIGHT: Actions & status */}
                  <div className="col-span-12 lg:col-span-2">
                    <div className="flex lg:flex-col gap-2 justify-end lg:justify-start">
                      <div className="inline-flex items-center gap-2">
                        {delivery.status === "Delivered" && (
                          <CheckCircle className="text-emerald-600" />
                        )}
                        {delivery.status === "Ongoing" && (
                          <Truck className="text-amber-600" />
                        )}
                        {delivery.status === "Scheduled" && (
                          <Clock className="text-sky-600" />
                        )}

                        <select
                          value={delivery.status}
                          onChange={(e) =>
                            setConfirmDialog({
                              open: true,
                              id: delivery.id,
                              newStatus: e.target.value,
                            })
                          }
                          disabled={isLocked(delivery.status)}
                          className="border rounded-md px-2 py-1 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        >
                          <option value="Scheduled">Scheduled</option>
                          <option value="To Ship">To Ship</option>
                          <option value="To Receive">To Receive</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        );
      })}

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
          <h3 className="text-lg font-semibold mb-2">
            Assign invoices to truck
          </h3>
          {unassignedOrders.length === 0 ? (
            <p className="text-sm text-gray-600">
              No unassigned invoices found.
            </p>
          ) : (
            <div className="max-h-96 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Select</th>
                    <th className="text-left p-2">TXN</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Amount</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedOrders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                            title="Create delivery for this invoice and auto-fill address"
                            onClick={() => openFormPrefilledFromOrder(o)}
                          >
                            Create Delivery
                          </button>
                        </div>
                      </td>

                      <td className="p-2 font-mono">{o.customer?.code}</td>
                      <td className="p-2">{o.customer?.name}</td>
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

      {/* Invoice Dialog (used when invoiceDialogOpenId is set) */}
      <Dialog
        open={invoiceDialogOpenId !== null}
        onOpenChange={(open) => {
          if (!open) closeInvoiceDialog();
        }}
      >
        <DialogContent className="max-w-5xl">
          <div className="space-y-3">
            {/* If the dialog was opened for a specific delivery, show a dropdown of that delivery's orders */}
            {invoiceDialogOpenId !== null ? (
              <>
                {/* Render invoice content for the selected order */}
                {selectedOrderForInvoice ? (
                  <div
                    id={`invoice-${selectedOrderForInvoice.id}`}
                    className="bg-white p-6 text-sm"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <ReceiptText /> Sales Invoice –{" "}
                        {selectedOrderForInvoice.customer.code}
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-y-1 text-sm">
                      <p>
                        <strong>NAME: </strong>{" "}
                        {selectedOrderForInvoice.customer.name}
                      </p>
                      <p>
                        <strong>TRANSACTION CODE: </strong>{" "}
                        {selectedOrderForInvoice.customer.code}
                      </p>
                      <p className="col-span-2">
                        <strong>ADDRESS: </strong>{" "}
                        {selectedOrderForInvoice.customer.address}
                      </p>
                      {selectedOrderForInvoice.customer.landmark && (
                        <p className="col-span-2">
                          <strong>LANDMARK: </strong>{" "}
                          {selectedOrderForInvoice.customer.landmark}
                        </p>
                      )}
                      <p>
                        <strong>CONTACT PERSON: </strong>{" "}
                        {selectedOrderForInvoice.customer.contact_person}
                      </p>
                      <p>
                        <strong>TEL NO: </strong>{" "}
                        {selectedOrderForInvoice.customer.phone}
                      </p>
                      <p>
                        <strong>TERMS: </strong>
                        {selectedOrderForInvoice.terms ?? "—"}
                      </p>
                      <p>
                        <strong>SALESMAN: </strong>
                        {selectedOrderForInvoice.salesman ?? "—"}
                      </p>
                    </div>

                    <div className="overflow-auto mt-4">
                      <table className="w-full text-sm border">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border px-2 py-1">
                              TRANSACTION DATE
                            </th>
                            <th className="border px-2 py-1">RECEIVED DATE</th>
                            <th className="border px-2 py-1">TRANSACTION</th>
                            <th className="border px-2 py-1">STATUS</th>
                            <th className="border px-2 py-1">CHARGE</th>
                            <th className="border px-2 py-1">CREDIT</th>
                            <th className="border px-2 py-1">BALANCE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* try rendering order_items if present, otherwise fall back to transaction string */}
                          {selectedOrderForInvoice.order_items &&
                          selectedOrderForInvoice.order_items.length > 0
                            ? selectedOrderForInvoice.order_items.map(
                                (it, idx) => {
                                  const product =
                                    it.inventory?.product_name ?? "Item";
                                  const amount =
                                    (it.price || 0) * (it.quantity || 0);
                                  return (
                                    <tr key={idx}>
                                      <td className="border px-2 py-1">
                                        {selectedOrderForInvoice.customer
                                          .date ??
                                          selectedOrderForInvoice.customer
                                            .created_at}
                                      </td>
                                      <td className="border px-2 py-1">
                                        {new Date().toLocaleDateString()}
                                      </td>
                                      <td className="border px-2 py-1">
                                        {product} — {it.quantity}
                                      </td>
                                      <td className="border px-2 py-1">
                                        {selectedOrderForInvoice.status ||
                                          "pending"}
                                      </td>
                                      <td className="border px-2 py-1">
                                        ₱{amount}
                                      </td>
                                      <td className="border px-2 py-1">
                                        {pesoOrBlank(0)}
                                      </td>
                                      <td className="border px-2 py-1">
                                        ₱{amount}
                                      </td>
                                    </tr>
                                  );
                                }
                              )
                            : (
                                selectedOrderForInvoice.customer.transaction?.split(
                                  ","
                                ) || []
                              ).map((txn: string, index: number) => (
                                <tr key={index}>
                                  <td className="border px-2 py-1">
                                    {selectedOrderForInvoice.customer.date ??
                                      selectedOrderForInvoice.customer
                                        .created_at}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {new Date().toLocaleDateString()}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {txn.trim()}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {selectedOrderForInvoice.status ||
                                      "Pending"}
                                  </td>
                                  <td className="border px-2 py-1">₱0</td>
                                  <td className="border px-2 py-1">₱0</td>
                                  <td className="border px-2 py-1">₱0</td>
                                </tr>
                              ))}
                          {/* total row */}
                          <tr>
                            <td
                              colSpan={4}
                              className="text-right border px-2 py-1 font-semibold"
                            >
                              Total
                            </td>
                            <td className="border px-2 py-1 font-semibold">
                              ₱
                              {(
                                selectedOrderForInvoice.order_items || []
                              ).reduce(
                                (s, it) =>
                                  s + (it.price || 0) * (it.quantity || 0),
                                0
                              )}
                            </td>
                            <td className="border px-2 py-1">₱0</td>
                            <td className="border px-2 py-1 font-semibold">
                              ₱
                              {(
                                selectedOrderForInvoice.order_items || []
                              ).reduce(
                                (s, it) =>
                                  s + (it.price || 0) * (it.quantity || 0),
                                0
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">
                    Select an invoice above to view details.
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">No delivery selected.</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={closeInvoiceDialog}
                className="px-4 py-2 border rounded"
              >
                Close
              </button>
            </div>
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
                  <label className="w-32 text-sm font-medium">
                    Destination
                  </label>
                  <div className="w-full">
                    {prefillOrderId && newDelivery.destination ? (
                      <input
                        type="text"
                        value={newDelivery.destination}
                        className="w-full border p-2 rounded bg-gray-100 text-gray-700 cursor-not-allowed"
                        disabled
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="border p-2 rounded"
                          value={regionCode}
                          onChange={(e) => setRegionCode(e.target.value)}
                          required
                        >
                          <option value="">Select region</option>
                          {regions.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.name}
                            </option>
                          ))}
                        </select>

                        <select
                          className="border p-2 rounded"
                          value={provinceCode}
                          onChange={(e) => setProvinceCode(e.target.value)}
                          disabled={!regionCode || regionCode.startsWith("13")}
                          required={
                            !regionCode.startsWith("13") && !!regionCode
                          }
                        >
                          <option value="">
                            {regionCode
                              ? regionCode.startsWith("13")
                                ? "NCR has no provinces"
                                : "Select province"
                              : "Select region first"}
                          </option>
                          {!regionCode.startsWith("13") &&
                            provinces.map((p) => (
                              <option key={p.code} value={p.code}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    value={newDelivery.plateNumber}
                    onChange={(e) => handlePlateNumberChange(e.target.value)}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Driver</label>
                  <input
                    type="text"
                    value={newDelivery.driver}
                    onChange={(e) => handleDriverChange(e.target.value)}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Assistant</label>
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
                    value="Scheduled"
                    disabled
                    className="w-full border p-2 rounded bg-gray-100 text-gray-500 cursor-not-allowed"
                  >
                    <option>Scheduled</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Schedule Date
                  </label>
                  <input
                    type="date"
                    value={newDelivery.scheduleDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) =>
                      setNewDelivery({
                        ...newDelivery,
                        scheduleDate: e.target.value,
                      })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                {newDelivery.status === "Delivered" && (
                  <div className="flex items-center gap-2 col-span-2">
                    <label className="w-32 text-sm font-medium">
                      Arrival Date
                    </label>
                    <input
                      type="date"
                      value={newDelivery.arrivalDate}
                      onChange={(e) =>
                        setNewDelivery({
                          ...newDelivery,
                          arrivalDate: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded"
                    />
                  </div>
                )}
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
