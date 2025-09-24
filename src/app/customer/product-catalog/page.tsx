// src/app/customer/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";

/* ----------------------------- Limits ----------------------------- */
const MAX_QTY = 1000;
const clampQty = (n: number) =>
  Math.max(1, Math.min(MAX_QTY, Math.floor(n) || 1));

/* ---------------------- Cart-wide limits (silent) ---------------------- */
// Do NOT show these numbers in the UI/toasts.
const TRUCK_LIMITS = {
  maxTotalWeightKg: 10_000, // internal weight cap
  maxDistinctItems: 60, // how many different SKUs per order
};

// One generic message for all cart-limit failures.
const LIMIT_TOAST =
  "Exceeds items per transaction. Please split into another transaction.";

const totalUnits = (list: CartItem[]) =>
  list.reduce((sum, ci) => sum + ci.quantity, 0);

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (d?: string | number | Date) =>
  new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(d ? new Date(d) : new Date());

/* ---------------------- Encoding & PSGC fetch helpers --------------------- */
const fixEncoding = (s: string) => {
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
};

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);
  return JSON.parse(text);
}

/* ---------------------------------- Types --------------------------------- */
type PSGCRegion = { id: number; name: string; code: string };
type PSGCProvince = {
  id: number;
  name: string;
  code: string;
  region_id: number;
};
type PSGCCity = {
  id: number;
  name: string;
  code: string;
  province_id?: number;
  type: string;
};
type PSGCBarangay = { id: number; name: string; code: string };

/** ⬇️ include unit + weight fields from inventory for weight calc */
type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_price: number;
  status: string;
  image_url?: string | null;
  date_added?: string | null;

  // OPTIONAL: used for weight-based limits
  unit?: string | null; // "Piece" | "Dozen" | "Box" | "Pack" | "Kg" | etc.
  pieces_per_unit?: number | null; // e.g., Piece=1, Dozen=12, Box=24...
  weight_per_piece_kg?: number | null; // weight of ONE piece in kg (if unit !== "Kg")
};

type CartItem = { item: InventoryItem; quantity: number };

type CustomerInfo = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contact_person?: string;
  code?: string;
  area?: string;
  landmark?: string;
  date?: string;
  transaction?: string;
  status?: "pending" | "completed" | "rejected";
  payment_type?: "Credit" | "Cash";
  customer_type?: "New Customer" | "Existing Customer";
};

/* ------------------------------ Weight helpers ------------------------------ */
/** Weight in kg for ONE inventory "unit" (e.g., 1 piece, 1 dozen, 1 box, or 1 kg). */
function unitWeightKg(i: InventoryItem): number {
  const unit = (i.unit || "").trim();
  // If sold directly by kg, 1 unit = 1 kg
  if (unit === "Kg") return 1;

  const piecesPerUnit =
    Number(
      i.pieces_per_unit ??
        (unit === "Piece" ? 1 : unit === "Dozen" ? 12 : undefined)
    ) || 0;

  const weightPerPiece = Number(i.weight_per_piece_kg ?? 0);

  const w =
    piecesPerUnit > 0 && weightPerPiece > 0
      ? piecesPerUnit * weightPerPiece
      : 0;
  return isFinite(w) ? w : 0;
}

/** Sum of all cart items' total weight (kg). */
function cartTotalWeightKg(
  list: { item: InventoryItem; quantity: number }[]
): number {
  return list.reduce((sum, ci) => sum + unitWeightKg(ci.item) * ci.quantity, 0);
}

/** Pre-add check: distinct items + weight cap. */
function canAddItemWithQty(
  current: { item: InventoryItem; quantity: number }[],
  item: InventoryItem,
  qty: number
) {
  // distinct items rule
  const nextDistinct = current.some((ci) => ci.item.id === item.id)
    ? current.length
    : current.length + 1;
  if (nextDistinct > TRUCK_LIMITS.maxDistinctItems) {
    return { ok: false as const, reason: "distinct", message: LIMIT_TOAST };
  }

  // weight rule
  const perUnitKg = unitWeightKg(item);
  if (perUnitKg <= 0) {
    // cannot compute weight -> block with generic message
    return {
      ok: false as const,
      reason: "weight-missing",
      message: LIMIT_TOAST,
    };
  }
  const nextWeight = cartTotalWeightKg(current) + perUnitKg * qty;
  if (nextWeight > TRUCK_LIMITS.maxTotalWeightKg) {
    return { ok: false as const, reason: "weight", message: LIMIT_TOAST };
  }

  return { ok: true as const };
}

/* ------------------------------ Util helpers ------------------------------ */
function generateTransactionCode(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${yyyymmdd}-${random}`;
}
function isValidPhone(phone: string) {
  return /^\d{11}$/.test(phone);
}
function getDisplayNameFromMetadata(meta: any, fallbackEmail?: string) {
  const nameFromMeta =
    meta?.full_name || meta?.name || meta?.display_name || meta?.username || "";
  if (nameFromMeta && typeof nameFromMeta === "string")
    return nameFromMeta.trim();
  if (fallbackEmail && fallbackEmail.includes("@"))
    return fallbackEmail.split("@")[0];
  return "";
}
function formatPeso(n: number | undefined | null) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(v);
}

/* -------------------------------- Component ------------------------------- */
export default function CustomerInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [showCartPopup, setShowCartPopup] = useState(false);
  const [showFinalPopup, setShowFinalPopup] = useState(false);
  const [finalOrderDetails, setFinalOrderDetails] = useState<{
    customer: CustomerInfo;
    items: CartItem[];
  } | null>(null);

  const [txn, setTxn] = useState("");
  const [trackingResult, setTrackingResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // identity defaults from auth (if any)
  const [authDefaults, setAuthDefaults] = useState<{
    name: string;
    email: string;
  }>({
    name: "",
    email: "",
  });

  // order history counter (for display)
  const [orderHistoryCount, setOrderHistoryCount] = useState<number | null>(
    null
  );

  // loader while placing the final order
  const [placingOrder, setPlacingOrder] = useState(false);

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: "",
    email: "",
    phone: "",
    address: "",
    contact_person: "",
    code: "",
    area: "",
    payment_type: "Cash",
    customer_type: undefined,
    landmark: "",
  });

  /* ----------------------------- PSGC state ----------------------------- */
  const [regions, setRegions] = useState<PSGCRegion[]>([]);
  const [provinces, setProvinces] = useState<PSGCProvince[]>([]);
  const [cities, setCities] = useState<PSGCCity[]>([]);
  const [barangays, setBarangays] = useState<PSGCBarangay[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [houseStreet, setHouseStreet] = useState("");

  // Derived selected objects
  const selectedRegion = useMemo(
    () => regions.find((r) => r.code === regionCode) || null,
    [regions, regionCode]
  );
  const selectedProvince = useMemo(
    () => provinces.find((p) => p.code === provinceCode) || null,
    [provinces, provinceCode]
  );
  const selectedCity = useMemo(
    () => cities.find((c) => c.code === cityCode) || null,
    [cities, cityCode]
  );
  const selectedBarangay = useMemo(
    () => barangays.find((b) => b.code === barangayCode) || null,
    [barangays, barangayCode]
  );

  // NCR (Region 13) has no provinces
  const isNCR = useMemo(
    () =>
      !!regionCode &&
      (regionCode.startsWith("13") ||
        (selectedRegion?.name || "")
          .toLowerCase()
          .includes("national capital")),
    [regionCode, selectedRegion]
  );

  // Full address string
  const computedAddress = useMemo(() => {
    const parts = [
      houseStreet.trim(),
      selectedBarangay?.name ?? "",
      selectedCity?.name ?? "",
      selectedProvince?.name ?? "",
      selectedRegion?.name ?? "",
    ]
      .filter(Boolean)
      .map(fixEncoding);
    return parts.join(", ");
  }, [
    houseStreet,
    selectedBarangay,
    selectedCity,
    selectedProvince,
    selectedRegion,
  ]);

  useEffect(() => {
    setCustomerInfo((prev) => ({ ...prev, address: computedAddress }));
  }, [computedAddress]);

  /* ---------------------------- Load PSGC lists --------------------------- */
  useEffect(() => {
    fetchJSON<PSGCRegion[]>("https://psgc.cloud/api/regions")
      .then((data) =>
        setRegions(
          data
            .map((r) => ({ ...r, name: fixEncoding(r.name) }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => toast.error("Failed to load regions"));
  }, []);

  useEffect(() => {
    setProvinces([]);
    setProvinceCode("");
    setCities([]);
    setCityCode("");
    setBarangays([]);
    setBarangayCode("");
    if (!regionCode) return;

    if (isNCR) {
      Promise.all([
        fetchJSON<PSGCCity[]>(
          `https://psgc.cloud/api/regions/${regionCode}/cities`
        ),
        fetchJSON<PSGCCity[]>(
          `https://psgc.cloud/api/regions/${regionCode}/municipalities`
        ),
      ])
        .then(([c, m]) => {
          const list = [...c, ...m]
            .map((x) => ({ ...x, name: fixEncoding(x.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setCities(list);
        })
        .catch(() => toast.error("Failed to load cities for NCR"));
      return;
    }

    fetchJSON<PSGCProvince[]>("https://psgc.cloud/api/provinces")
      .then((all) => {
        const provs = all
          .filter((p) => p.code.startsWith(regionCode.slice(0, 2)))
          .map((p) => ({ ...p, name: fixEncoding(p.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setProvinces(provs);
      })
      .catch(() => toast.error("Failed to load provinces"));
  }, [regionCode, isNCR]);

  useEffect(() => {
    if (isNCR) return;

    setCities([]);
    setCityCode("");
    setBarangays([]);
    setBarangayCode("");
    if (!provinceCode) return;

    Promise.all([
      fetchJSON<PSGCCity[]>("https://psgc.cloud/api/cities"),
      fetchJSON<PSGCCity[]>("https://psgc.cloud/api/municipalities"),
    ])
      .then(([c, m]) => {
        const byProv = (x: PSGCCity) =>
          x.code.startsWith(provinceCode.slice(0, 4));
        const list = [...c.filter(byProv), ...m.filter(byProv)]
          .map((x) => ({ ...x, name: fixEncoding(x.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCities(list);
      })
      .catch(() => toast.error("Failed to load cities/municipalities"));
  }, [provinceCode, isNCR]);

  useEffect(() => {
    setBarangays([]);
    setBarangayCode("");
    if (!cityCode) return;

    const loadBarangays = async () => {
      const prefix9 = cityCode.slice(0, 9);
      const prefix6 = cityCode.slice(0, 6);
      const fixSort = (list: PSGCBarangay[]) => {
        const collator = new Intl.Collator(undefined, {
          numeric: true,
          sensitivity: "base",
        });
        return list
          .map((b) => ({ ...b, name: fixEncoding(b.name) }))
          .sort((a, b) => collator.compare(a.name, b.name));
      };

      try {
        const fromCity = await fetchJSON<PSGCBarangay[]>(
          `https://psgc.cloud/api/cities/${cityCode}/barangays`
        );
        const cleaned = fixSort(fromCity);
        if (cleaned.length > 0) return setBarangays(cleaned);
      } catch {}

      try {
        const fromMunicipality = await fetchJSON<PSGCBarangay[]>(
          `https://psgc.cloud/api/municipalities/${cityCode}/barangays`
        );
        const cleaned = fixSort(fromMunicipality);
        if (cleaned.length > 0) return setBarangays(cleaned);
      } catch {}

      try {
        const all = await fetchJSON<PSGCBarangay[]>(
          "https://psgc.cloud/api/barangays"
        );
        const filtered = all.filter(
          (b) => b.code.startsWith(prefix9) || b.code.startsWith(prefix6)
        );
        setBarangays(fixSort(filtered));
      } catch {
        toast.error("Failed to load barangays");
      }
    };

    loadBarangays();
  }, [cityCode]);

  /* --------------------- Inventory load + realtime --------------------- */
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    // ⬇️ pull the weight-related fields too (unit_price already present)
    const { data, error } = await supabase
      .from("inventory")
      .select(
        "id, product_name, category, subcategory, quantity, unit_price, status, image_url, unit, pieces_per_unit, weight_per_piece_kg"
      );

    if (error) {
      console.error("Error fetching inventory:", error);
      toast.error("Could not load inventory.");
    } else {
      const cleaned = (data ?? []).map((r: any) => ({
        id: r.id,
        product_name: r.product_name ?? "",
        category: r.category ?? "",
        subcategory: r.subcategory ?? "",
        quantity: Number(r.quantity ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        status: r.status ?? "",
        image_url: r.image_url ?? null,
        unit: r.unit ?? null,
        pieces_per_unit: r.pieces_per_unit ?? null,
        weight_per_piece_kg: r.weight_per_piece_kg ?? null,
      }));
      setInventory(cleaned);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();

    const invChannel: RealtimeChannel = supabase
      .channel("realtime:inventory")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchInventory()
      )
      .subscribe();

    return () => void supabase.removeChannel(invChannel);
  }, [fetchInventory]);

  /* -------- Compute type from order history (by email, always) ---------- */
  const setTypeFromHistory = useCallback(async (email: string) => {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) return;

    const { count, error } = await supabase
      .from("orders")
      .select("id, customers!inner(email)", { count: "exact", head: true })
      .ilike("customers.email", cleanEmail);

    if (error) {
      console.warn("Could not compute order history:", error.message);
      return;
    }

    const c = count ?? 0;
    setOrderHistoryCount(c);
    const type: CustomerInfo["customer_type"] =
      c > 0 ? "Existing Customer" : "New Customer";

    setCustomerInfo((prev) => ({
      ...prev,
      customer_type: type,
      // NEW: For Existing customers, automatically set to Credit only.
      payment_type: type === "Existing Customer" ? "Credit" : "Cash",
    }));
  }, []);

  // Pre-fill name/email if logged in and compute type once
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const displayName = getDisplayNameFromMetadata(
          user.user_metadata,
          user.email || undefined
        );
        const email = user.email || "";
        setAuthDefaults({ name: displayName || "", email });
        setCustomerInfo((prev) => ({
          ...prev,
          name: prev.name || displayName || "",
          email: prev.email || email,
        }));
        await setTypeFromHistory(email);
      }
    })();
  }, [setTypeFromHistory]);

  // Debounce re-check if email ever changes elsewhere (kept for safety)
  useEffect(() => {
    const t = setTimeout(() => {
      if (customerInfo.email) setTypeFromHistory(customerInfo.email);
    }, 500);
    return () => clearTimeout(t);
  }, [customerInfo.email, setTypeFromHistory]);

  /* ------------------------------ Tracking ------------------------------ */
  const refetchTrackingByCode = useCallback(async (code: string) => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(
          `
            id, name, code, contact_person, email, phone, address, status, date,
            orders (
              id, total_amount, status, date_created, date_completed, salesman, terms, po_number,
              order_items (
                quantity, price,
                inventory:inventory_id (product_name, category, subcategory, status)
              )
            )
          `
        )
        .eq("code", code.trim().toUpperCase())
        .maybeSingle();

      if (error || !data) {
        setTrackError("Transaction code not found.");
        setTrackingResult(null);
      } else {
        setTrackError(null);
        setTrackingResult(data);
      }
    } catch {
      setTrackError("Error while fetching. Please try again.");
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackingResult(null);
    setTrackingLoading(true);
    await refetchTrackingByCode(txn);
  };

  // Realtime tracking subscription (customers by code + orders by customer_id)
  useEffect(() => {
    const code = txn.trim().toUpperCase();
    if (!code) return;

    const channel = supabase.channel(`realtime:tracking:${code}`);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "customers",
        filter: `code=eq.${code}`,
      },
      () => refetchTrackingByCode(code)
    );

    if (trackingResult?.id) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${trackingResult.id}`,
        },
        () => refetchTrackingByCode(code)
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [txn, trackingResult?.id, refetchTrackingByCode]);

  /* --------------------------- Payment type logic --------------------------- */
  useEffect(() => {
    if (customerInfo.customer_type === "New Customer") {
      setCustomerInfo((prev) => ({ ...prev, payment_type: "Cash" }));
    } else if (customerInfo.customer_type === "Existing Customer") {
      // NEW: Existing customer => always Credit (Balance removed)
      setCustomerInfo((prev) => ({ ...prev, payment_type: "Credit" }));
    }
  }, [customerInfo.customer_type]);

  /* ------------------------------- Cart flow ------------------------------- */
  const handleAddToCartClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setOrderQuantity(1);
  };

  const addToCart = () => {
    if (!selectedItem) return;

    let qty = clampQty(orderQuantity);
    if (orderQuantity > MAX_QTY) {
      toast.error(
        `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
      );
    }
    if (cart.some((ci) => ci.item.id === selectedItem.id)) {
      toast.error("Item already in cart.");
      return;
    }

    const check = canAddItemWithQty(cart, selectedItem, qty);
    if (!check.ok) {
      toast.error(LIMIT_TOAST); // always generic
      return;
    }

    setCart((prev) => [...prev, { item: selectedItem!, quantity: qty }]);
    setSelectedItem(null);
    setOrderQuantity(1);
  };

  const updateCartQuantity = (itemId: number, nextQtyRaw: number) => {
    const current = cart.find((ci) => ci.item.id === itemId);
    if (!current) return;

    // clamp per-item rule first
    const requested = clampQty(Number.isFinite(nextQtyRaw) ? nextQtyRaw : 1);

    // compute how many units we can still fit by WEIGHT
    const perUnitKg = unitWeightKg(current.item);
    if (perUnitKg <= 0) {
      // if weight unknown, keep current and show generic limit
      toast.error(LIMIT_TOAST);
      return;
    }
    const weightWithoutThis =
      cartTotalWeightKg(cart) - perUnitKg * current.quantity;
    const remainingKg = TRUCK_LIMITS.maxTotalWeightKg - weightWithoutThis;
    const maxQtyByWeight = Math.max(0, Math.floor(remainingKg / perUnitKg));

    // approved quantity is min of requested, weight-cap, and not below 1
    const approved = Math.max(1, Math.min(requested, maxQtyByWeight));

    setCart((prev) =>
      prev.map((ci) =>
        ci.item.id === itemId ? { ...ci, quantity: approved } : ci
      )
    );

    // toasts
    if (requested > MAX_QTY) {
      toast.error(
        `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
      );
    } else if (requested > approved) {
      toast.error(LIMIT_TOAST);
    }
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const handleShowCart = async () => {
    if (!customerInfo.code) {
      setCustomerInfo((prev) => ({ ...prev, code: generateTransactionCode() }));
    }
    setCustomerInfo((prev) => ({
      ...prev,
      name: prev.name || authDefaults.name,
      email: prev.email || authDefaults.email,
    }));
    const emailToCheck =
      (customerInfo.email && customerInfo.email.trim()) || authDefaults.email;
    if (emailToCheck) await setTypeFromHistory(emailToCheck);
    setShowCartPopup(true);
  };

  /* ------------------ VALIDATION: required fields for Submit Order ------------------ */
  const missingFields = useMemo(() => {
    const missing: string[] = [];

    if (!customerInfo.name || !customerInfo.name.trim()) {
      missing.push("Customer Name");
    }
    if (!customerInfo.email || !customerInfo.email.includes("@")) {
      missing.push("Email");
    }
    if (!isValidPhone(customerInfo.phone || "")) {
      missing.push("Phone (11 digits)");
    }
    if (!houseStreet || !houseStreet.trim()) {
      missing.push("House & Street");
    }
    if (!regionCode) {
      missing.push("Region");
    }
    // Province required only when not NCR
    if (!isNCR && !provinceCode) {
      missing.push("Province");
    }
    if (!cityCode) {
      missing.push("City / Municipality");
    }
    if (!barangayCode) {
      missing.push("Barangay");
    }
    if (!cart || cart.length === 0) {
      missing.push("Cart (add at least one item)");
    }

    return missing;
  }, [
    customerInfo.name,
    customerInfo.email,
    customerInfo.phone,
    houseStreet,
    regionCode,
    provinceCode,
    cityCode,
    barangayCode,
    cart,
    isNCR,
  ]);

  const isConfirmOrderEnabled = missingFields.length === 0;

  /* ------------------ end validation ------------------ */

  const handleOpenFinalModal = () => {
    // enforce validation client-side as well
    if (!isConfirmOrderEnabled) {
      toast.error(
        `Please complete required fields before submitting: ${missingFields
          .slice(0, 3)
          .join(", ")}${missingFields.length > 3 ? "…" : ""}`
      );
      return;
    }

    // distinct items
    if (cart.length > TRUCK_LIMITS.maxDistinctItems) {
      toast.error(LIMIT_TOAST);
      return;
    }
    // weight
    if (cartTotalWeightKg(cart) > TRUCK_LIMITS.maxTotalWeightKg) {
      toast.error(LIMIT_TOAST);
      return;
    }

    setFinalOrderDetails({ customer: customerInfo, items: cart });
    setShowCartPopup(false);
    setShowFinalPopup(true);
  };

  const handleConfirmOrder = async () => {
    if (!finalOrderDetails || placingOrder) return;
    // last-line guard
    if (!isConfirmOrderEnabled) {
      toast.error("Please complete all required details before confirming.");
      return;
    }

    setPlacingOrder(true);

    const { customer, items } = finalOrderDetails;
    if (items.some((ci) => ci.quantity > MAX_QTY)) {
      toast.error(
        `Each item can be ordered up to ${MAX_QTY} units only. For larger needs, please submit another transaction.`
      );
      setPlacingOrder(false);
      return;
    }
    if (items.length > TRUCK_LIMITS.maxDistinctItems) {
      toast.error(LIMIT_TOAST);
      setPlacingOrder(false);
      return;
    }
    if (cartTotalWeightKg(items) > TRUCK_LIMITS.maxTotalWeightKg) {
      toast.error(LIMIT_TOAST);
      setPlacingOrder(false);
      return;
    }

    const now = new Date();
    const phTime = now.toLocaleString("sv-SE", { timeZone: "Asia/Manila" });

    const customerPayload: Partial<CustomerInfo> = {
      ...customer,
      landmark: customer.landmark || "",
      date: phTime,
      status: "pending",
      transaction: items
        .map((ci) => `${ci.item.product_name} x${ci.quantity}`)
        .join(", "),
    };

    try {
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert([customerPayload])
        .select()
        .single();
      if (custErr) throw custErr;

      const customerId = cust.id;
      const totalAmount = items.reduce(
        (sum, ci) => sum + (ci.item.unit_price || 0) * ci.quantity,
        0
      );

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .insert([
          {
            customer_id: customerId,
            total_amount: totalAmount,
            status: "pending",
            date_created: phTime,
          },
        ])
        .select()
        .single();
      if (ordErr) throw ordErr;

      const orderId = ord.id;
      const rows = items.map((ci) => ({
        order_id: orderId,
        inventory_id: ci.item.id,
        quantity: ci.quantity,
        price: ci.item.unit_price || 0,
      }));
      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(rows);
      if (itemsErr) throw itemsErr;

      toast.success("Your order has been submitted successfully!");

      // Reset UI but keep identity
      setShowFinalPopup(false);
      setFinalOrderDetails(null);
      setCart([]);

      setCustomerInfo({
        name: authDefaults.name,
        email: authDefaults.email,
        phone: "",
        address: "",
        contact_person: "",
        code: "",
        area: "",
        payment_type: "Cash",
        customer_type: undefined,
      });
      setRegionCode("");
      setProvinceCode("");
      setCityCode("");
      setBarangayCode("");
      setProvinces([]);
      setCities([]);
      setBarangays([]);
      setHouseStreet("");

      await fetchInventory();

      const emailUsed = customer.email || authDefaults.email;
      if (emailUsed) await setTypeFromHistory(emailUsed);
    } catch (e: any) {
      console.error("Order submission error:", e.message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  /* ------------------------------ Derived ------------------------------ */
  const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);
  const categoriesList = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))).sort(),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return inventory.filter((i) => {
      const matchesSearch =
        i.product_name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.subcategory.toLowerCase().includes(q);
      const matchesCategory =
        categoryFilter === "" || i.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, categoryFilter]);

  /* ----------------------- Pagination: 10 per page ----------------------- */
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, inventory.length]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredInventory.length / itemsPerPage)
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageEnd = pageStart + itemsPerPage;
  const pageItems = useMemo(
    () => filteredInventory.slice(pageStart, pageEnd),
    [filteredInventory, pageStart, pageEnd]
  );

  const goToPage = (p: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  /* ---------------------- Image modal (view-only) ---------------------- */
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalItem, setImageModalItem] = useState<InventoryItem | null>(
    null
  );
  const openImageModal = (item: InventoryItem) => {
    setImageModalItem(item);
    setShowImageModal(true);
  };
  const closeImageModal = () => {
    setShowImageModal(false);
    setImageModalItem(null);
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="p-4">
      {/* Page Title */}
      <header className="h-14 flex items-center gap-3">
        <motion.h1
          className="text-3xl font-bold tracking-tight text-neutral-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          Product Catalog
        </motion.h1>
      </header>

      <p className="text-neutral-500 mb-4 text-sm">
        Browse available products, check categories, and add items to your cart
        for ordering.
      </p>

      {/* Controls: Search + Category Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Search by product, category, or subcategory..."
          className="border border-gray-300 rounded px-3 py-2 w-full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="border border-gray-300 rounded px-3 py-2 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categoriesList.map((cat) => (
            <option key={cat} value={cat}>
              {cat || "Uncategorized"}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading inventory...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg shadow mb-3">
            <table className="w-full table-fixed bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  <th className="py-2 px-4 w-2/6">Product Name</th>
                  <th className="py-2 px-4 w-1/6">Category</th>
                  <th className="py-2 px-4 w-1/6">Subcategory</th>
                  <th className="py-2 px-4 w-1/6">Unit Price</th>
                  <th className="py-2 px-4 w-1/6">Status</th>
                  <th className="py-2 px-4 w-1/6">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-100">
                    <td className="py-2 px-4 pl-6 text-left">
                      <button
                        className="text-[#2f63b7] hover:underline font-normal text-left"
                        onClick={() => openImageModal(item)}
                        title={
                          item.image_url
                            ? "View product image"
                            : "No image available"
                        }
                        style={{ wordBreak: "break-word" }}
                      >
                        {item.product_name}
                      </button>
                    </td>
                    <td className="py-2 px-4 text-left">{item.category}</td>
                    <td className="py-2 px-4 text-left">{item.subcategory}</td>
                    <td className="py-2 px-4 text-left">
                      {formatPeso(item.unit_price)}
                    </td>
                    <td className="py-2 px-4 text-left">{item.status}</td>
                    <td className="py-2 px-4">
                      <button
                        className="bg-[#ffba20] text-white px-3 py-1 text-sm rounded hover:bg-yellow-600"
                        onClick={() => handleAddToCartClick(item)}
                      >
                        Add to Cart
                      </button>
                    </td>
                  </tr>
                ))}
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-gray-500">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls*/}
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
                  {filteredInventory.length > 0 ? (
                    <>
                      <span className="font-semibold">{pageStart + 1}</span>–
                      <span className="font-semibold">
                        {Math.min(pageEnd, filteredInventory.length)}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold">
                        {filteredInventory.length}
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

      {/* Image Modal */}
      {showImageModal && imageModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">{imageModalItem.product_name}</h3>
              <button
                className="text-gray-500 hover:text-black"
                onClick={closeImageModal}
              >
                ✕
              </button>
            </div>
            <div className="pl-0 pr-4 pt-0">
              {imageModalItem.image_url ? (
                <img
                  src={imageModalItem.image_url}
                  alt={imageModalItem.product_name}
                  className="w-full h-auto rounded"
                />
              ) : (
                <div className="text-center text-gray-500 border rounded p-6">
                  No image uploaded for this item.
                </div>
              )}
              <div className="mt-3 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Category:</span>{" "}
                  {imageModalItem.category || "—"}
                </div>
                <div>
                  <span className="font-medium">Subcategory:</span>{" "}
                  {imageModalItem.subcategory || "—"}
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  {imageModalItem.status || "—"}
                </div>
                <div>
                  <span className="font-medium">Unit Price:</span>{" "}
                  {formatPeso(imageModalItem.unit_price)}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right">
              <button
                onClick={closeImageModal}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Cart Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {selectedItem.product_name}
            </h2>
            <p>Category: {selectedItem.category}</p>
            <p>Subcategory: {selectedItem.subcategory}</p>
            <p>Status: {selectedItem.status}</p>
            <p>Unit Price: {formatPeso(selectedItem.unit_price)}</p>
            <div className="mt-4">
              <label className="block mb-1">Quantity to Order</label>
              <input
                type="number"
                className="w-full border px-3 py-2 rounded"
                min={1}
                max={MAX_QTY}
                value={orderQuantity}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const clamped = clampQty(isNaN(raw) ? 1 : raw);
                  setOrderQuantity(clamped);
                }}
                onBlur={(e) => {
                  const raw = Number(e.target.value);
                  if (raw > MAX_QTY) {
                    toast.error(
                      `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
                    );
                  }
                  setOrderQuantity(clampQty(isNaN(raw) ? 1 : raw));
                }}
              />
              <div className="text-xs text-gray-500 mt-1">
                Max {MAX_QTY} per item.
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
              >
                Cancel
              </button>
              <button
                onClick={addToCart}
                className="px-4 py-2 rounded-xl bg-[#ffba20] text-black shadow-lg hover:brightness-95 active:translate-y-px transition"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart (editable qty) */}
      {cart.length > 0 && (
        <div className="mt-10 bg-gray-100 p-4 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Cart</h2>
          <table className="w-full bg-white text-sm mb-4">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4 pl-6 text-left">Product Name</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Subcategory</th>
                <th className="py-2 px-4">Unit Price</th>
                <th className="py-2 px-4">Qty</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Remove</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((ci) => (
                <tr key={ci.item.id} className="border-b">
                  <td className="py-2 px-4">{ci.item.product_name}</td>
                  <td className="py-2 px-4">{ci.item.category}</td>
                  <td className="py-2 px-4">{ci.item.subcategory}</td>
                  <td className="py-2 px-4">
                    {formatPeso(ci.item.unit_price)}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 rounded border hover:bg-gray-100"
                        onClick={() =>
                          updateCartQuantity(ci.item.id, ci.quantity - 1)
                        }
                        title="Decrease"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1 text-center"
                        min={1}
                        max={MAX_QTY}
                        value={ci.quantity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateCartQuantity(ci.item.id, isNaN(v) ? 1 : v);
                        }}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v > MAX_QTY) {
                            toast.error(
                              `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
                            );
                          }
                          updateCartQuantity(ci.item.id, isNaN(v) ? 1 : v);
                        }}
                      />
                      <button
                        className="px-2 py-1 rounded border hover:bg-gray-100"
                        onClick={() =>
                          updateCartQuantity(ci.item.id, ci.quantity + 1)
                        }
                        title="Increase"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="py-2 px-4">{ci.item.status}</td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => removeFromCart(ci.item.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center">
            <div>Total Items: {totalItems}</div>
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              onClick={handleShowCart}
            >
              Order Item
            </button>
          </div>
        </div>
      )}

      {/* First Confirm Order Modal (name/email are READ-ONLY) */}
      {showCartPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="bg-white w-full max-w-5xl max-h-[85vh] p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden"
          >
            <h2 className="text-2xl font-semibold tracking-tight shrink-0">
              Confirm Order
            </h2>

            <div className="flex-1 overflow-auto mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* READ-ONLY name & email */}
                <input
                  placeholder="Customer Name"
                  className="border px-3 py-2 rounded bg-gray-100 cursor-not-allowed"
                  value={customerInfo.name}
                  readOnly
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="border px-3 py-2 rounded bg-gray-100 cursor-not-allowed"
                  value={customerInfo.email}
                  readOnly
                />
                {/* Editable phone & contact */}
                <input
                  type="tel"
                  placeholder="Phone (11 digits)"
                  className="border px-3 py-2 rounded"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={11}
                  value={customerInfo.phone}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 11)
                      setCustomerInfo({ ...customerInfo, phone: value });
                  }}
                />
                <input
                  placeholder="Contact Person"
                  className="border px-3 py-2 rounded"
                  value={customerInfo.contact_person}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      contact_person: e.target.value,
                    })
                  }
                />

                {/* Address pickers */}
                <div className="col-span-2 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Region</label>
                    <select
                      className="border px-3 py-2 rounded w-full"
                      value={regionCode}
                      onChange={(e) => setRegionCode(e.target.value)}
                    >
                      <option value="">Select region</option>
                      {regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Province</label>
                    <select
                      className="border px-3 py-2 rounded w-full"
                      value={provinceCode}
                      onChange={(e) => setProvinceCode(e.target.value)}
                      disabled={!regionCode || isNCR}
                    >
                      <option value="">
                        {!regionCode
                          ? "Select region first"
                          : isNCR
                          ? "NCR has no provinces"
                          : "Select province"}
                      </option>
                      {!isNCR &&
                        provinces.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">
                      City / Municipality
                    </label>
                    <select
                      className="border px-3 py-2 rounded w-full"
                      value={cityCode}
                      onChange={(e) => setCityCode(e.target.value)}
                      disabled={isNCR ? !regionCode : !provinceCode}
                    >
                      <option value="">
                        {isNCR
                          ? regionCode
                            ? "Select city/municipality"
                            : "Select region first"
                          : provinceCode
                          ? "Select city/municipality"
                          : "Select province first"}
                      </option>
                      {cities.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Barangay</label>
                    <select
                      className="border px-3 py-2 rounded w-full"
                      value={barangayCode}
                      onChange={(e) => setBarangayCode(e.target.value)}
                      disabled={!cityCode}
                    >
                      <option value="">
                        {cityCode ? "Select barangay" : "Select city first"}
                      </option>
                      {barangays.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <input
                  placeholder="House Number & Street Name"
                  className="border px-3 py-2 rounded col-span-2"
                  value={houseStreet}
                  onChange={(e) => setHouseStreet(e.target.value)}
                />
                <input
                  placeholder="Landmark"
                  className="border px-3 py-2 rounded col-span-2"
                  value={customerInfo.landmark || ""}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      landmark: e.target.value,
                    })
                  }
                />
                <input
                  className="border px-3 py-2 rounded col-span-2 bg-gray-50"
                  value={customerInfo.address || ""}
                  placeholder="Address will be set from House/St. + Barangay/City/Province/Region"
                  readOnly
                />

                {/* Customer Type (derived) */}
                <div className="col-span-2">
                  <label className="block mb-1">Customer Type</label>
                  <input
                    className="border px-3 py-2 rounded w-full bg-gray-100 cursor-not-allowed"
                    value={customerInfo.customer_type || ""}
                    readOnly
                  />
                  {orderHistoryCount !== null && (
                    <div className="text-xs text-gray-500 mt-1">
                      Past orders under this email: {orderHistoryCount}
                    </div>
                  )}
                </div>

                {/* Payment Type */}
                <div className="col-span-2">
                  <label className="block mb-1">Payment Type</label>
                  <div className="flex gap-4">
                    {(customerInfo.customer_type === "Existing Customer"
                      ? ["Credit"]
                      : ["Cash"]
                    ).map((type) => (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="payment_type"
                          value={type}
                          checked={customerInfo.payment_type === type}
                          onChange={(e) =>
                            setCustomerInfo({
                              ...customerInfo,
                              payment_type: e.target.value as "Cash" | "Credit",
                            })
                          }
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div className="border rounded-xl bg-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-left">Product</th>
                      <th className="py-2 px-3 text-left">Category</th>
                      <th className="py-2 px-3 text-left">Subcategory</th>
                      <th className="py-2 px-3 text-left">Unit Price</th>
                      <th className="py-2 px-3 text-left">Qty</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((ci) => (
                      <tr key={ci.item.id} className="border-b">
                        <td className="py-2 px-3">{ci.item.product_name}</td>
                        <td className="py-2 px-3">{ci.item.category}</td>
                        <td className="py-2 px-3">{ci.item.subcategory}</td>
                        <td className="py-2 px-3">
                          {formatPeso(ci.item.unit_price)}
                        </td>
                        <td className="py-2 px-3">{ci.quantity}</td>
                        <td className="py-2 px-3">{ci.item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Show missing fields (if any) */}
            {missingFields.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <strong>Required:</strong>{" "}
                {missingFields.slice(0, 5).join(", ")}
                {missingFields.length > 5 ? "..." : ""}
              </div>
            )}

            <div className="shrink-0 flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCartPopup(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenFinalModal}
                className={`px-4 py-2 rounded-xl bg-green-600 text-white shadow-lg hover:bg-green-700 active:translate-y-px transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2`}
                disabled={!isConfirmOrderEnabled}
                title={
                  !isConfirmOrderEnabled
                    ? "Please complete required fields before submitting"
                    : "Submit order"
                }
              >
                Submit Order
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Final Confirmation Modal */}
      {showFinalPopup && finalOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="bg-white w-full max-w-4xl max-h-[85vh] p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden"
          >
            <h2 className="text-2xl font-semibold tracking-tight shrink-0">
              Order Confirmation
            </h2>

            <div className="flex-1 overflow-auto mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Customer</div>
                  <div className="font-medium">
                    {finalOrderDetails.customer.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Transaction Code</div>
                  <div className="font-medium">
                    {finalOrderDetails.customer.code}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div className="font-medium">{formatPH()}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Region</div>
                  <div className="font-medium">
                    {selectedRegion?.name ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Province</div>
                  <div className="font-medium">
                    {selectedProvince?.name ?? (isNCR ? "—" : "-")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">City/Municipality</div>
                  <div className="font-medium">{selectedCity?.name ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Barangay</div>
                  <div className="font-medium">
                    {selectedBarangay?.name ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">House & Street</div>
                  <div className="font-medium">{houseStreet || "-"}</div>
                </div>
              </div>

              <div className="border rounded-xl bg-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-left">Product</th>
                      <th className="py-2 px-3 text-left">Category</th>
                      <th className="py-2 px-3 text-left">Subcategory</th>
                      <th className="py-2 px-3 text-left">Unit Price</th>
                      <th className="py-2 px-3 text-left">Qty</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalOrderDetails.items.map((ci) => (
                      <tr key={ci.item.id} className="border-b">
                        <td className="py-2 px-3">{ci.item.product_name}</td>
                        <td className="py-2 px-3">{ci.item.category}</td>
                        <td className="py-2 px-3">{ci.item.subcategory}</td>
                        <td className="py-2 px-3">
                          {formatPeso(ci.item.unit_price)}
                        </td>
                        <td className="py-2 px-3">{ci.quantity}</td>
                        <td className="py-2 px-3">{ci.item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* show missing fields here too (shouldn't happen if flow enforced) */}
            {missingFields.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <strong>Missing required fields:</strong>{" "}
                {missingFields.slice(0, 5).join(", ")}
                {missingFields.length > 5 ? "..." : ""}
              </div>
            )}

            <div className="shrink-0 flex justify-end gap-2 mt-4">
              <button
                onClick={() => !placingOrder && setShowFinalPopup(false)}
                disabled={placingOrder}
                className={`px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition ${
                  placingOrder ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={placingOrder || !isConfirmOrderEnabled}
                className={`px-4 py-2 rounded-xl bg-[#ffba20] text-black shadow-lg hover:brightness-95 active:translate-y-px transition inline-flex items-center gap-2 ${
                  placingOrder || !isConfirmOrderEnabled
                    ? "opacity-70 cursor-not-allowed"
                    : ""
                }`}
              >
                {placingOrder ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-black" />
                    Submitting…
                  </>
                ) : (
                  "Confirm Order"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
