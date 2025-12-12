// src/app/customer/checkout/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";
import { useCart, CartItem as CtxCartItem } from "@/context/CartContext";

/* -------------------------------- Types -------------------------------- */
type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_price: number;
  status: string;
  image_url?: string | null;
  unit?: string | null;
  pieces_per_unit?: number | null;
  weight_per_piece_kg?: number | null;
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

type SidebarOrder = {
  id: number;
  status: string | null;
  created_at: string | null;
  total: number | null;
};

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

/* ----------------------------- Constants ----------------------------- */
const MAX_QTY = 1000;
const clampQty = (n: number) =>
  Math.max(1, Math.min(MAX_QTY, Math.floor(n) || 1));

const TRUCK_LIMITS = {
  maxTotalWeightKg: 10_000,
  maxDistinctItems: 60,
};
const LIMIT_TOAST =
  "Exceeds items per transaction. Please split into another transaction.";

const TERM_TO_INTEREST: Record<number, number> = { 1: 2, 3: 6, 6: 12, 12: 24 };

/* ------------------------------ Helpers ------------------------------ */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

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

const safeFormatPH = (d?: string | null) => (d ? formatPH(d) : "—");

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

function generateTransactionCode(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${yyyymmdd}-${random}`;
}

function normalizePhone(input: string | null | undefined): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12)
    return "0" + digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits;
  return "";
}

// Deterministic order TXN derived from order id (no DB change needed)
function getTxnCode(
  orderId: string | number,
  createdAt?: string | Date | null
) {
  const s = String(orderId);
  const last6 = s.slice(-6).toUpperCase();
  const dt = createdAt ? new Date(createdAt) : new Date();
  const ymd = dt.toISOString().slice(0, 10).replace(/-/g, "");
  return `TXN-${ymd}-${last6}`;
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

function isValidPhone(phone: string) {
  return /^\d{11}$/.test(phone);
}

const getAuthIdentity = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  const name = getDisplayNameFromMetadata(user?.user_metadata, email);
  const phone = normalizePhone((user?.user_metadata as any)?.phone || "");
  return { email, name, phone, authUserId: user?.id ?? null };
};

// pull contact number from profiles instead of account_requests
const loadPhoneForEmail = async (email: string): Promise<string> => {
  const clean = (email || "").trim();
  try {
    const { data: userWrap } = await supabase.auth.getUser();
    const uid = userWrap?.user?.id || null;
    if (uid) {
      const { data: byUid } = await supabase
        .from("profiles")
        .select("contact_number")
        .eq("id", uid)
        .maybeSingle();
      const phone = normalizePhone(byUid?.contact_number);
      if (phone) return phone;
    }
    if (clean) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("contact_number")
        .ilike("email", clean)
        .limit(1)
        .maybeSingle();
      const phone = normalizePhone(byEmail?.contact_number);
      if (phone) return phone;
    }
    return "";
  } catch {
    return "";
  }
};

/* ------------------------------ Weight rules ------------------------------ */
const isOutOfStock = (i: InventoryItem) =>
  (i.status || "").toLowerCase().includes("out") || (i.quantity ?? 0) <= 0;

function unitWeightKg(i: InventoryItem): number {
  const unit = (i.unit || "").trim();
  if (unit === "Kg") return 1;
  const piecesPerUnit =
    Number(
      i.pieces_per_unit ?? (unit === "Piece" ? 1 : unit === "Dozen" ? 12 : 0)
    ) || 0;
  const weightPerPiece = Number(i.weight_per_piece_kg ?? 0);
  const w =
    piecesPerUnit > 0 && weightPerPiece > 0
      ? piecesPerUnit * weightPerPiece
      : 0;
  return isFinite(w) ? w : 0;
}
function cartTotalWeightKg(list: CartItem[]) {
  return list.reduce((sum, ci) => sum + unitWeightKg(ci.item) * ci.quantity, 0);
}

/* ----------------------------- Component ----------------------------- */
export default function CheckoutPage() {
  const router = useRouter();
  const { cart, updateQty, removeItem, clearCart } = useCart();

  // auth defaults
  const [authDefaults, setAuthDefaults] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [orderHistoryCount, setOrderHistoryCount] = useState<number | null>(
    null
  );

  // customer info
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

  // credit terms
  const [termsMonths, setTermsMonths] = useState<number | null>(null);
  const [interestPercent, setInterestPercent] = useState<number>(0);

  // modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [txnCode, setTxnCode] = useState<string>("");

  // Terms & Conditions (Credit) state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false); // user tick on main confirm modal
  const [tcReadyToAccept, setTcReadyToAccept] = useState(false); // becomes true after reading terms
  const termsBodyRef = useRef<HTMLDivElement | null>(null);

  // orders sidebar
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<SidebarOrder[]>([]);
  const [fetchingOrders, setFetchingOrders] = useState(false);

  // PSGC state
  const [regions, setRegions] = useState<PSGCRegion[]>([]);
  const [provinces, setProvinces] = useState<PSGCProvince[]>([]);
  const [cities, setCities] = useState<PSGCCity[]>([]);
  const [barangays, setBarangays] = useState<PSGCBarangay[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [houseStreet, setHouseStreet] = useState("");

  // NEW: staged address prefill holder (applied level-by-level)
  const [pendingAddress, setPendingAddress] = useState<{
    region?: string;
    province?: string;
    city?: string;
    barangay?: string;
    house?: string;
  } | null>(null);

  /* ---------------------- Address computation hooks ---------------------- */
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

  const isNCR = useMemo(
    () =>
      !!regionCode &&
      (regionCode.startsWith("13") ||
        (selectedRegion?.name || "")
          .toLowerCase()
          .includes("national capital")),
    [regionCode, selectedRegion]
  );

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

  /* -------------------- Autofill from last customer row -------------------- */
  const loadLastCustomerSnapshot = useCallback(async (email: string) => {
    const clean = (email || "").trim();
    if (!clean) return;

    const { data: last, error } = await supabase
      .from("customers")
      .select(
        `
      contact_person,
      landmark,
      payment_type,
      customer_type,
      region_code,
      province_code,
      city_code,
      barangay_code,
      house_street,
      address
    `
      )
      .ilike("email", clean)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !last) return;

    // Stage the codes so we can apply them when each list is ready.
    setPendingAddress({
      region: last.region_code || undefined,
      province: last.province_code || undefined,
      city: last.city_code || undefined,
      barangay: last.barangay_code || undefined,
      house: last.house_street || undefined,
    });

    // Do NOT set region/province/city/barangay here directly — they’ll be
    // applied by the staged effects below once each options list is ready.

    setCustomerInfo((prev) => {
      const resolvedType =
        prev.customer_type || last.customer_type || undefined;
      const canUseCredit = resolvedType === "Existing Customer";
      const priorPay =
        last.payment_type === "Credit" && canUseCredit ? "Credit" : "Cash";

      return {
        ...prev,
        contact_person: prev.contact_person || last.contact_person || "",
        landmark: prev.landmark || last.landmark || "",
        payment_type: prev.payment_type || priorPay,
        customer_type: resolvedType,
      };
    });
  }, []);

  /* ------------------------ Prefill from auth ------------------------ */
  useEffect(() => {
    (async () => {
      const {
        email,
        name,
        phone: phoneFromAuth,
        authUserId,
      } = await getAuthIdentity();
      if (email) {
        const phoneFromSources =
          phoneFromAuth || (await loadPhoneForEmail(email));
        setAuthDefaults({
          name: name || "",
          email: email || "",
          phone: phoneFromSources || "",
        });
        setCustomerInfo((prev) => ({
          ...prev,
          name: prev.name || name || "",
          email: prev.email || email,
          phone: prev.phone || phoneFromSources || "",
        }));
        await setTypeFromHistory(email);
      }
      setAuthUserId(authUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- Compute customer type from completed orders by email -------- */
const setTypeFromHistory = useCallback(async (email: string) => {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) return;
  const { count, error } = await supabase
    .from("orders")
    .select("id, status, customers!inner(email)", {
      count: "exact",
      head: true,
    })
    .ilike("customers.email", cleanEmail)
    .in("status", ["completed"]);
  if (error) return;
  const completedCount = count ?? 0;
  setOrderHistoryCount(completedCount);
  const type: CustomerInfo["customer_type"] =
    completedCount > 0 ? "Existing Customer" : "New Customer";
  setCustomerInfo((prev) => ({
    ...prev,
    customer_type: type,
  }));
}, []);


  useEffect(() => {
    const t = setTimeout(() => {
      if (customerInfo.email) setTypeFromHistory(customerInfo.email);
    }, 500);
    return () => clearTimeout(t);
  }, [customerInfo.email, setTypeFromHistory]);

  /* ------------------------- PSGC loading flows ------------------------- */
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

  // 3.1 Apply REGION once regions are loaded
  useEffect(() => {
    if (!pendingAddress) return;
    if (
      pendingAddress.region &&
      regions.length &&
      regionCode !== pendingAddress.region
    ) {
      setRegionCode(pendingAddress.region);
    }
  }, [pendingAddress, regions, regionCode]);

  // 3.2 Apply PROVINCE (only for non-NCR) once provinces are ready
  useEffect(() => {
    if (!pendingAddress) return;
    if (isNCR) return; // NCR has no provinces
    if (!regionCode) return; // need region first
    if (provinces.length && pendingAddress.province && !provinceCode) {
      const exists = provinces.some((p) => p.code === pendingAddress.province);
      if (exists) setProvinceCode(pendingAddress.province);
    }
  }, [pendingAddress, isNCR, regionCode, provinces, provinceCode]);

  // 3.3 Apply CITY once cities are ready
  useEffect(() => {
    if (!pendingAddress) return;
    if (!regionCode) return;
    // for non-NCR, province must be set first
    if (!isNCR && !provinceCode) return;
    if (cities.length && pendingAddress.city && !cityCode) {
      const exists = cities.some((c) => c.code === pendingAddress.city);
      if (exists) setCityCode(pendingAddress.city);
    }
  }, [pendingAddress, isNCR, regionCode, provinceCode, cities, cityCode]);

  // 3.4 Apply BARANGAY (and house/street) once barangays are ready, then clear pending
  useEffect(() => {
    if (!pendingAddress) return;
    if (!cityCode) return;
    if (barangays.length && pendingAddress.barangay && !barangayCode) {
      const exists = barangays.some((b) => b.code === pendingAddress.barangay);
      if (exists) {
        setBarangayCode(pendingAddress.barangay);
        if (pendingAddress.house) setHouseStreet(pendingAddress.house);
        // Clear after final step so we don't keep re-applying
        setPendingAddress(null);
      }
    }
  }, [pendingAddress, cityCode, barangays, barangayCode]);

  /* ----------------------------- Sidebar orders ----------------------------- */
  // Directly read orders joined to customers, filtered by the signed-in email.
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setFetchingOrders(true);
      try {
        const { data: uw } = await supabase.auth.getUser();
        const email = uw?.user?.email?.trim().toLowerCase() ?? "";
        if (!email) {
          if (mounted) setOrders([]);
          return;
        }

        // Direct join: orders -> customer (filter by email)
        const { data, error } = await supabase
          .from("orders")
          .select(
            `
    id,
    status,
    date_created,
    grand_total_with_interest,
    customer:customer_id ( email )
  `
          )
          .eq("customer.email", email)
          .order("date_created", { ascending: false })
          .limit(20);

        if (error) {
          console.warn("[checkout sidebar] orders join fetch error:", error);
          if (mounted) setOrders([]);
          return;
        }
        const rows = (data ?? []).map((o: any) => ({
          id: o.id,
          status: o?.status ?? "pending",
          created_at: o?.date_created ?? null, // mapped for UI
          total: o?.grand_total_with_interest ?? null,
        }));

        if (mounted) setOrders(rows);
        console.log("[checkout sidebar] loaded orders:", rows.length, rows);
      } catch (e) {
        console.error("[checkout sidebar] load failed:", e);
        if (mounted) setOrders([]);
      } finally {
        if (mounted) setFetchingOrders(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []); // reads auth inside

  /* --------------------------- Payment type logic --------------------------- */


  useEffect(() => {
    if (customerInfo.payment_type === "Credit") {
      setTermsMonths((prev) => (prev == null ? 1 : prev));
    } else {
      setTermsMonths(null);
      setInterestPercent(0);
    }
  }, [customerInfo.payment_type]);

  useEffect(() => {
    if (customerInfo.payment_type !== "Credit") {
      setTcAccepted(false);
      setTcReadyToAccept(false);
      setShowTermsModal(false);
    }
  }, [customerInfo.payment_type]);

  useEffect(() => {
    if (customerInfo.payment_type === "Credit" && termsMonths != null) {
      setInterestPercent(TERM_TO_INTEREST[termsMonths] ?? 0);
    }
  }, [termsMonths, customerInfo.payment_type]);

  /* ---------------------------- Cart quantity ops --------------------------- */
  const handleUpdateQty = (ci: CtxCartItem, nextRaw: number) => {
    const next = clampQty(Number.isFinite(nextRaw) ? nextRaw : 1);

    const tempCart: CartItem[] = cart.map((x) => ({
      item: x.item as any,
      quantity: x.quantity,
    }));
    const target = tempCart.find((x) => x.item.id === ci.item.id);
    if (!target) return;

    const perUnitKg = unitWeightKg(target.item as any);
    if (perUnitKg <= 0) {
      toast.error(LIMIT_TOAST);
      return;
    }

    const weightWithoutThis =
      cartTotalWeightKg(tempCart) - perUnitKg * target.quantity;
    const remainingKg = TRUCK_LIMITS.maxTotalWeightKg - weightWithoutThis;
    const maxQtyByWeight = Math.max(0, Math.floor(remainingKg / perUnitKg));
    const approved = Math.max(1, Math.min(next, maxQtyByWeight));

    if (next > MAX_QTY) {
      toast.error(
        `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
      );
    } else if (next > approved) {
      toast.error(LIMIT_TOAST);
    }
    updateQty(ci.item.id, approved);
  };

  /* ------------------------------ Derived totals ----------------------------- */
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (s, ci) => s + Number(ci.item.unit_price || 0) * ci.quantity,
        0
      ),
    [cart]
  );
  const tax = 0;
  const shipping = 0;
  const grandTotal = subtotal + tax + shipping;

  /* ------------------------------ Validation ------------------------------ */
const missingFields = useMemo(() => {
  const missing: string[] = [];
  if (!customerInfo.name?.trim()) missing.push("Customer Name");
  // Email is now optional
  if (!customerInfo.contact_person?.trim()) missing.push("Contact Person");
  // Phone is now optional
  if (!houseStreet?.trim()) missing.push("House & Street");
  if (!regionCode) missing.push("Region");
  if (!isNCR && !provinceCode) missing.push("Province");
  if (!cityCode) missing.push("City / Municipality");
  if (!barangayCode) missing.push("Barangay");
  if (cart.length === 0) missing.push("Cart");

  if (customerInfo.payment_type === "Credit") {
    if (!termsMonths) missing.push("Payment Terms (months)");
    if (interestPercent < 0) missing.push("Interest % must be 0 or higher");
    if (!tcAccepted) missing.push("Accept Terms & Conditions");
  }

  return missing;
}, [
  customerInfo.name,
  customerInfo.email,          // can stay in deps, no issue
  customerInfo.contact_person,
  customerInfo.phone,          // can stay in deps, no issue
  customerInfo.payment_type,
  houseStreet,
  regionCode,
  provinceCode,
  cityCode,
  barangayCode,
  cart,
  isNCR,
  termsMonths,
  interestPercent,
  tcAccepted,
]);


  const isConfirmEnabled = missingFields.length === 0;

  /* ------------------------- Customer upsert helpers ------------------------- */
  async function ensureUniqueCustomerCode(): Promise<string> {
    // generate until we hit a free code (very low probability of >1 tries)
    for (let i = 0; i < 5; i++) {
      const candidate = generateTransactionCode();
      const { data: exists } = await supabase
        .from("customers")
        .select("id")
        .eq("code", candidate)
        .limit(1)
        .maybeSingle();
      if (!exists?.id) return candidate;
    }
    // fallback with timestamp suffix
    return `${generateTransactionCode()}-${Date.now().toString().slice(-5)}`;
  }

  /**
   * Finds an existing customer (by auth uid or email). If none, creates one.
   * Updates address/contact fields on existing row.
   * Returns the customer id and the canonical code.
   */
  async function getOrCreateCustomer(): Promise<{ id: string; code: string }> {
    // 1) Try find existing by auth user id or email
    const { data: userWrap } = await supabase.auth.getUser();
    const auth = userWrap?.user;
    const email = (
      customerInfo.email ||
      authDefaults.email ||
      auth?.email ||
      ""
    ).trim();

    let existing: { id: string; code: string | null } | null = null;

    if (auth?.id) {
      const { data: byUid } = await supabase
        .from("customers")
        .select("id, code")
        .eq("id", auth.id) // only if you use auth uid as customers.id; if not, this returns null and we fall back to email
        .maybeSingle();
      if (byUid?.id) existing = { id: byUid.id, code: byUid.code ?? null };
    }

    if (!existing && email) {
      const { data: byEmail } = await supabase
        .from("customers")
        .select("id, code")
        .ilike("email", email)
        .order("date_created", { ascending: false })

        .limit(1)
        .maybeSingle();
      if (byEmail?.id)
        existing = { id: byEmail.id, code: byEmail.code ?? null };
    }

    const nowPH = new Date().toLocaleString("sv-SE", {
      timeZone: "Asia/Manila",
    });

    const baseFields = {
      name: customerInfo.name,
      email,
      phone: normalizePhone(customerInfo.phone) || customerInfo.phone,
      address: computedAddress,
      contact_person: customerInfo.contact_person || null,
      area: customerInfo.area || null,
      status: "pending",
      payment_type: customerInfo.payment_type === "Credit" ? "Credit" : "Cash",
      customer_type: customerInfo.customer_type || null,
      landmark: customerInfo.landmark || null,
      region_code: regionCode || null,
      province_code: isNCR ? null : provinceCode || null,
      city_code: cityCode || null,
      barangay_code: barangayCode || null,
      house_street: houseStreet || null,
      date: nowPH as any,
      transaction: cart
        .map((ci) => `${ci.item.product_name} x${ci.quantity}`)
        .join(", "),
    };

    if (existing) {
      // Update contact/address only — DO NOT touch customers.code
      await supabase.from("customers").update(baseFields).eq("id", existing.id);
      return { id: existing.id, code: existing.code || "" }; // code here is no longer used as TXN
    }

    // 3) Create a new customer once with a unique code
    const freshCode = await ensureUniqueCustomerCode();
    const insertPayload = { ...baseFields, code: freshCode };

    // Try insert; if we somehow collided on code, regenerate once and retry.
    let created: { id: string; code: string } | null = null;
    {
      const { data, error } = await supabase
        .from("customers")
        .insert([insertPayload])
        .select("id, code")
        .single();
      if (!error && data) {
        created = { id: data.id, code: data.code };
      } else if (
        error &&
        String(error.message).includes("customers_code_key")
      ) {
        const retryCode = await ensureUniqueCustomerCode();
        const { data: data2, error: err2 } = await supabase
          .from("customers")
          .insert([{ ...insertPayload, code: retryCode }])
          .select("id, code")
          .single();
        if (err2) throw err2;
        created = { id: data2!.id, code: data2!.code };
      } else if (error) {
        throw error;
      }
    }
    // safety
    if (!created) throw new Error("Failed to create customer");
    return created;
  }

  /* ------------------------------- Handlers ------------------------------- */
  const openConfirmModal = async () => {
    // Best-effort phone autofill
    const { email: authEmail, name: authName } = await getAuthIdentity();
    const emailToUse =
      (customerInfo.email && customerInfo.email.trim()) ||
      authDefaults.email ||
      authEmail;

    let ensuredPhone =
      normalizePhone(customerInfo.phone) || normalizePhone(authDefaults.phone);
    if (!ensuredPhone && emailToUse)
      ensuredPhone = await loadPhoneForEmail(emailToUse);

    setAuthDefaults((prev) => ({
      ...prev,
      name: prev.name || authName,
      email: prev.email || authEmail,
      phone: ensuredPhone || prev.phone,
    }));

    setCustomerInfo((prev) => ({
      ...prev,
      name: prev.name || authDefaults.name || authName,
      email: prev.email || authDefaults.email || authEmail,
      phone: ensuredPhone || prev.phone,
    }));

    // NEW: Autofill from the most recent customer snapshot for this email
    if (emailToUse) {
      await loadLastCustomerSnapshot(emailToUse);
    }

    if (!ensuredPhone) {
      toast.error(
        "We couldn't auto-fill your phone number. Please update your profile."
      );
    }

    setShowConfirmModal(true);
  };

  // Open/close terms modal
  const openTerms = () => {
    setShowTermsModal(true);
    setTcReadyToAccept(false); // must scroll again to bottom each view
  };
  const closeTerms = () => setShowTermsModal(false);

  // When user scrolls the terms body, unlock the checkbox
  const onTermsScroll = () => {
    const el = termsBodyRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (atBottom) setTcReadyToAccept(true);
  };

  const proceedToFinal = () => {
    if (!isConfirmEnabled) {
      toast.error(
        `Please complete required fields: ${missingFields
          .slice(0, 3)
          .join(", ")}${missingFields.length > 3 ? "…" : ""}`
      );
      return;
    }
    if (cart.length > TRUCK_LIMITS.maxDistinctItems) {
      toast.error(LIMIT_TOAST);
      return;
    }
    if (cartTotalWeightKg(cart as any) > TRUCK_LIMITS.maxTotalWeightKg) {
      toast.error(LIMIT_TOAST);
      return;
    }
    setShowConfirmModal(false);
    setShowFinalModal(true);
  };

  const handleConfirmOrder = async () => {
    if (placingOrder) return;
    if (!isConfirmEnabled) {
      toast.error("Please complete all required details before confirming.");
      return;
    }

    setPlacingOrder(true);

    try {
      // (1) Ensure customer exists once (no duplicate code inserts)
      const { id: customerId, code: customerCode } =
        await getOrCreateCustomer();

      // (2) Create order
      const now = new Date();
      const phTime = now.toLocaleString("sv-SE", { timeZone: "Asia/Manila" });

      const orderPayload: any = {
        customer_id: customerId,
        total_amount: subtotal,
        status: "pending",
        date_created: phTime, // <-- make sure your orders table has this column
      };

      // optional credit fields
      if (customerInfo.payment_type === "Credit") {
        const months = termsMonths ?? 1;
        orderPayload.terms = `Net ${months} Monthly`;
        orderPayload.payment_terms = months;
        orderPayload.interest_percent = TERM_TO_INTEREST[months];
      }

      // insert the order and get id + date_created back
      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select("id, date_created")
        .single();
      if (ordErr) throw ordErr;

      // build the display TXN code from the new row
      const orderId = ord.id as string;
      const thisOrderCode = getTxnCode(orderId, ord?.date_created);
      setTxnCode(thisOrderCode);

      // (3) Create order_items
      const items = cart.map((ci) => ({
        order_id: orderId,
        inventory_id: ci.item.id,
        quantity: ci.quantity,
        price: ci.item.unit_price || 0,
      }));
      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(items);
      if (itemsErr) throw itemsErr;

      // (4) Admin notification (best effort)
      try {
        const preview = cart
          .slice(0, 3)
          .map((ci) => `${ci.item.product_name} x${ci.quantity}`)
          .join(", ");
        const more = cart.length > 3 ? `, +${cart.length - 3} more` : "";
        await supabase.from("system_notifications").insert([
          {
            type: "order",
            title: "Order Request",
            message: `${
              customerInfo.name || authDefaults.name
            } • TXN ${thisOrderCode} • ${preview}${more} • Total: ${formatCurrency(
              subtotal
            )}`,
            order_id: orderId,
            customer_id: customerId,
            source: "customer",
            read: false,
            metadata: {
              order_id: orderId,
              txn_code: thisOrderCode,
              total_amount: Number(subtotal || 0),
              item_count: cart.length,
              payment_type: customerInfo.payment_type || "Cash",
              terms_months:
                customerInfo.payment_type === "Credit"
                  ? termsMonths ?? null
                  : null,
              interest_percent:
                customerInfo.payment_type === "Credit"
                  ? interestPercent ?? null
                  : null,
            },
          },
        ]);
      } catch (notifErr) {
        console.warn("Failed to create order notification:", notifErr);
      }
      //EMAIL ADMIN
      // (5) Email admin about new order (best effort)
      try {
        const response = await fetch("/api/notify-admin-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            transactionCode: thisOrderCode,
            customer: {
              name: customerInfo.name || authDefaults.name || "Customer",
              email: customerInfo.email || authDefaults.email || "",
              phone: customerInfo.phone || authDefaults.phone || "",
              address: computedAddress,
            },
            totals: {
              subtotal,
              paymentType: customerInfo.payment_type || "Cash",
              termsMonths:
                customerInfo.payment_type === "Credit"
                  ? termsMonths ?? null
                  : null,
              interestPercent:
                customerInfo.payment_type === "Credit"
                  ? interestPercent ?? null
                  : null,
            },
            items: cart.map((ci) => ({
              product_name: ci.item.product_name,
              category: ci.item.category,
              subcategory: ci.item.subcategory,
              quantity: ci.quantity,
              unit_price: Number(ci.item.unit_price || 0),
            })),
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("notify-admin-order failed:", response.status, text);
        }
      } catch (emailErr) {
        console.warn("Failed to send admin new-order email:", emailErr);
      }

      toast.success("Your order has been submitted successfully!");

      // reset cart + keep auth defaults
      setShowFinalModal(false);
      clearCart();

      setCustomerInfo({
        name: authDefaults.name,
        email: authDefaults.email,
        phone: authDefaults.phone,
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

      // Refresh customer type after order
      try {
        const emailUsed = customerInfo.email || authDefaults.email;
        if (emailUsed) await setTypeFromHistory(emailUsed);
      } catch {}
    } catch (e: any) {
      console.error("Order submission error:", e?.message || e);
      toast.error(
        e?.message?.includes("customers_code_key")
          ? "We hit a duplicate customer code once. Please try again."
          : "Something went wrong. Please try again."
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="p-4">
      <header className="h-14 flex items-center gap-3">
        <motion.h1
          className="text-3xl font-bold tracking-tight text-neutral-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Cart / Checkout
        </motion.h1>
      </header>

      <div className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Cart Items */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-lg mb-3">Your Cart</h3>

            {cart.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-600 mb-3">Your cart is empty.</div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => router.push("/customer/product-catalog")}
                    className="px-4 py-2 rounded bg-[#181918] text-white"
                  >
                    Shop Products
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b">
                      <tr>
                        <th className="py-2">Product</th>
                        <th className="py-2 w-40">Qty</th>
                        <th className="py-2 w-40">Unit Price</th>
                        <th className="py-2 w-40">Line</th>
                        <th className="py-2 w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((ci) => (
                        <tr key={ci.item.id} className="border-b">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 bg-gray-100 overflow-hidden rounded">
                                {ci.item.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={ci.item.image_url}
                                    alt={ci.item.product_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                                    No Image
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-medium">
                                  {ci.item.product_name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {ci.item.category ?? ""} •{" "}
                                  {ci.item.subcategory ?? ""}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleUpdateQty(ci, clampQty(ci.quantity - 1))
                                }
                                className="px-2 py-1 border rounded"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                value={ci.quantity}
                                onChange={(e) =>
                                  handleUpdateQty(
                                    ci,
                                    Number(e.target.value) || 1
                                  )
                                }
                                className="w-16 text-center border rounded px-1 py-1"
                                min={1}
                              />
                              <button
                                onClick={() =>
                                  handleUpdateQty(ci, clampQty(ci.quantity + 1))
                                }
                                className="px-2 py-1 border rounded"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="py-3">
                            {formatCurrency(Number(ci.item.unit_price || 0))}
                          </td>
                          <td className="py-3">
                            {formatCurrency(
                              Number(ci.item.unit_price || 0) * ci.quantity
                            )}
                          </td>

                          <td className="py-3">
                            <button
                              onClick={() => removeItem(ci.item.id)}
                              className="px-3 py-1 rounded bg-red-500 text-white"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* totals + proceed */}
                <div className="mt-4 flex flex-col lg:flex-row items-start lg:items-center gap-4">
                  {/* Note + Estimated total */}
                  <div className="flex-1 bg-gray-50 p-4 rounded">
                    <div className="text-xs text-gray-600 mb-2">
                      * Final price may change if an admin applies a discount
                      during order processing. Shipping fee is not yet applied
                      and (if any) will be added later by the admin.
                    </div>
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Estimated Total</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        clearCart();
                        toast("Cart cleared.");
                      }}
                      className="h-11 px-5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm transition"
                    >
                      Clear
                    </button>

                    <button
                      onClick={openConfirmModal}
                      disabled={cart.length === 0}
                      className="h-11 px-6 rounded-lg bg-[#ffba20] text-black font-semibold hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-md transition whitespace-nowrap"
                      title={
                        cart.length === 0
                          ? "Your cart is empty"
                          : "Proceed to checkout"
                      }
                    >
                      Proceed to Checkout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Snapshot of customer status */}
        <aside>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Customer Snapshot</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="text-gray-500">Name: </span>
                <span className="font-medium">
                  {customerInfo.name || authDefaults.name || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Email: </span>
                <span className="font-medium">
                  {customerInfo.email || authDefaults.email || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Phone: </span>
                <span className="font-medium">
                  {customerInfo.phone || authDefaults.phone || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Customer Type: </span>
                <span className="font-medium">
                  {customerInfo.customer_type || "—"}
                </span>
              </div>
              {orderHistoryCount !== null && (
                <div className="text-xs text-gray-500">
                  Past orders under this email: {orderHistoryCount}
                </div>
              )}
            </div>
          </div>

          {/* Past orders for this customer */}
          <div className="bg-white rounded-lg shadow p-4 mt-4">
            <h3 className="font-semibold mb-3">Your Orders</h3>
            {fetchingOrders ? (
              <div className="text-sm text-gray-500">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-sm text-gray-500">
                No orders yet. Place your first order!
              </div>
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className="border rounded p-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {getTxnCode(o.id, o.created_at)}
                        </div>

                        <div className="text-xs text-gray-500">
                          {safeFormatPH(o.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">{o.status}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ------------------------ Confirm Order Modal ------------------------ */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="bg-white w-full max-w-4xl max-h-[85vh] p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden"
          >
            <h2 className="text-2xl font-semibold tracking-tight shrink-0">
              Confirm Order
            </h2>

            <div className="flex-1 overflow-auto mt-4 space-y-4">
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Customer name – still read only (from auth) */}
  <input
    placeholder="Customer Name"
    className="border px-3 py-2 rounded bg-gray-100 cursor-not-allowed"
    value={customerInfo.name}
    readOnly
  />

  {/* Email – OPTIONAL + EDITABLE */}
  <input
    type="email"
    placeholder="Email (optional)"
    className="border px-3 py-2 rounded"
    value={customerInfo.email || ""}
    onChange={(e) =>
      setCustomerInfo((prev) => ({
        ...prev,
        email: e.target.value,
      }))
    }
  />

  {/* Phone – OPTIONAL + EDITABLE, digits only, max 11 */}
  <input
    type="tel"
    placeholder="Phone (optional, 11 digits)"
    className="border px-3 py-2 rounded"
    value={customerInfo.phone || ""}
    onChange={(e) => {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
      setCustomerInfo((prev) => ({
        ...prev,
        phone: digits,
      }));
    }}
  />

  {/* Contact person – still required */}
  <input
    placeholder="Contact Person (required)"
    maxLength={30}
    pattern="[A-Za-z\\s]*"
    title="Letters only, maximum 30 characters"
    className={`border px-3 py-2 rounded ${
      !customerInfo.contact_person?.trim()
        ? "border-red-400 focus:ring-red-500"
        : ""
    }`}
    value={customerInfo.contact_person || ""}
    onChange={(e) => {
      const value = e.target.value.replace(/[^A-Za-z\s]/g, "");
      if (value.length <= 30) {
        setCustomerInfo((prev) => ({
          ...prev,
          contact_person: value,
        }));
      }
    }}
  />


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
                  maxLength={30}
                  title="Maximum 30 characters only"
                  className="border px-3 py-2 rounded col-span-2"
                  value={houseStreet}
                  onChange={(e) => {
                    if (e.target.value.length <= 30)
                      setHouseStreet(e.target.value);
                  }}
                />
                <input
                  placeholder="Landmark"
                  maxLength={30}
                  title="Maximum 30 characters only"
                  className="border px-3 py-2 rounded col-span-2"
                  value={customerInfo.landmark || ""}
                  onChange={(e) =>
                    e.target.value.length <= 30 &&
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

<div className="flex gap-4">
  {(["Cash", "Credit"] as const).map((type) => (
    <label key={type} className="flex items-center gap-2">
      <input
        type="radio"
        name="payment_type"
        value={type}
        checked={customerInfo.payment_type === type}
        onChange={(e) =>
          setCustomerInfo((prev) => ({
            ...prev,
            payment_type: e.target.value as "Cash" | "Credit",
          }))
        }
      />
      {type}
    </label>
  ))}
</div>


                {customerInfo.payment_type === "Credit" && (
                  <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1">Payment Terms</label>
                      <select
                        className={`border px-3 py-2 rounded w-full ${
                          !termsMonths ? "border-red-400" : ""
                        }`}
                        value={termsMonths ?? ""}
                        onChange={(e) =>
                          setTermsMonths(Number(e.target.value) || null)
                        }
                      >
                        <option value="">Select term</option>
                        <option value={1}>1 month (Net 1)</option>
                        <option value={3}>3 months (Net 3)</option>
                        <option value={6}>6 months (Net 6)</option>
                        <option value={12}>12 months (Net 12)</option>
                      </select>
<div className="text-xs text-gray-500 mt-1">
  Available when you select Credit as payment type.
</div>

                    </div>

                    <div>
                      <label className="block mb-1">Interest %</label>
                      <input
                        type="number"
                        className="border px-3 py-2 rounded w-full bg-gray-100 cursor-not-allowed"
                        value={interestPercent}
                        readOnly
                        disabled
                        title="Interest is fixed per selected term"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        1m→2%, 3m→6%, 6m→12%, 12m→24%.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Credit Terms & Conditions acknowledgement */}
              {customerInfo.payment_type === "Credit" && (
                <div className="col-span-2 rounded border p-3 bg-amber-50/50">
                  <div className="text-sm">
                    By selecting <span className="font-medium">Credit</span>,
                    you agree to our{" "}
                    <button
                      type="button"
                      onClick={openTerms}
                      className="text-blue-600 hover:underline underline-offset-2"
                    >
                      Terms & Conditions on interest
                    </button>
                    .
                  </div>

                  <label className="mt-2 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={tcAccepted}
                      onChange={(e) => setTcAccepted(e.target.checked)}
                      disabled={!tcReadyToAccept}
                    />
                    <span>
                      I have read and agree to the Terms & Conditions on
                      interest.
                      {!tcReadyToAccept && (
                        <span className="ml-1 text-xs text-gray-500">
                          (open & read the terms first)
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              )}

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
                      <th className="py-2 px-3 text-left">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((ci) => (
                      <tr key={ci.item.id} className="border-b">
                        <td className="py-2 px-3">{ci.item.product_name}</td>
                        <td className="py-2 px-3">{ci.item.category}</td>
                        <td className="py-2 px-3">{ci.item.subcategory}</td>
                        <td className="py-2 px-3">
                          {formatCurrency(Number(ci.item.unit_price || 0))}
                        </td>
                        <td className="py-2 px-3">{ci.quantity}</td>
                        <td className="py-2 px-3">{ci.item.status}</td>
                        <td className="py-2 px-3 font-medium">
                          {formatCurrency(
                            Number(ci.item.unit_price || 0) * ci.quantity
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between px-3 py-2 bg-white border-t">
                  <div className="text-xs text-gray-500">
                    * Final price may change if an admin applies a discount
                    during order processing.
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      <span className="mr-2 text-gray-600">
                        Estimated Total:
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                    {customerInfo.payment_type === "Credit" && (
                      <div className="mt-1">
                        <span className="mr-2 text-gray-600">
                          Est. w/ Interest:
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(
                            subtotal * (1 + Math.max(0, interestPercent) / 100)
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {missingFields.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <strong>Required:</strong>{" "}
                {missingFields.slice(0, 5).join(", ")}
                {missingFields.length > 5 ? "..." : ""}
              </div>
            )}

            <div className="shrink-0 flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={proceedToFinal}
                className="px-4 py-2 rounded-xl bg-green-600 text-white shadow-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                disabled={!isConfirmEnabled}
                title={
                  !isConfirmEnabled
                    ? "Please complete required fields"
                    : "Submit order"
                }
              >
                Submit Order
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ------------------------ Terms & Conditions Modal ------------------------ */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="bg-white w-full max-w-3xl max-h-[85vh] p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col"
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Terms &amp; Conditions – Credit Interest
            </h2>

            {/* Scrollable body; must reach bottom to enable main checkbox */}
            <div
              ref={termsBodyRef}
              onScroll={onTermsScroll}
              className="mt-4 overflow-auto pr-2"
              style={{ maxHeight: "60vh" }}
            >
              <div className="prose prose-sm max-w-none">
                <p>
                  These Terms &amp; Conditions govern the application of
                  interest for credit purchases made through UniAsia Hardware
                  &amp; Electrical Mktg. Corp. By using the Credit payment
                  option, you acknowledge and agree to the following:
                </p>

                <h3>1. Interest Schedule</h3>
                <ul>
                  <li>
                    Net 1 month: <strong>2%</strong> interest for the whole
                    term.
                  </li>
                  <li>
                    Net 3 months: <strong>6%</strong> interest for the whole
                    term.
                  </li>
                  <li>
                    Net 6 months: <strong>12%</strong> interest for the whole
                    term.
                  </li>
                  <li>
                    Net 12 months: <strong>24%</strong> interest for the whole
                    term.
                  </li>
                </ul>

                <h3>2. Computation Basis</h3>
                <p>
                  Interest is computed on the order subtotal (exclusive of
                  shipping). Shipping fees, if any, may be added separately and
                  are not part of the interest base.
                </p>

                <h3>3. Payment Schedule</h3>
                <p>
                  The total with interest is divided into equal monthly
                  installments over the selected term. Any missed or late
                  installment may be subject to additional charges or order
                  restrictions at the Company’s discretion.
                </p>

                <h3>4. Early Settlement</h3>
                <p>
                  Early payment of the remaining balance is allowed. Any request
                  for interest adjustment on early settlement is subject to
                  approval by the Company.
                </p>

                <h3>5. Order Changes</h3>
                <p>
                  Discounts, returns, or adjustments approved by an
                  administrator may change the final payable amount. Such
                  changes will reflect in subsequent statements or installment
                  schedules.
                </p>

                <h3>6. Defaults</h3>
                <p>
                  Failure to comply with the payment schedule may result in
                  suspension of credit privileges and collection actions
                  permitted by law.
                </p>

                <h3>7. Acceptance</h3>
                <p>
                  You must read this document in full before accepting. The
                  agreement checkbox in the confirmation form will only be
                  enabled after you scroll to the bottom of this page.
                </p>

                <p className="text-gray-500 text-sm mt-6">
                  <em>Scroll to the very bottom to enable acceptance.</em>
                </p>
              </div>

              {/* Invisible spacer so the user truly reaches the bottom */}
              <div className="h-6" />
            </div>

            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm">
                {tcReadyToAccept ? (
                  <span className="text-green-700 font-medium">
                    You may now tick the checkbox in the form.
                  </span>
                ) : (
                  <span className="text-gray-600">
                    Please scroll to the bottom to unlock acceptance.
                  </span>
                )}
              </div>

              <button
                onClick={closeTerms}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ------------------------ Final Confirmation Modal ------------------------ */}
      {showFinalModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="bg-white w-full max-w-4xl max-height-[85vh] p-6 rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden"
          >
            <h2 className="text-2xl font-semibold tracking-tight shrink-0">
              Order Confirmation
            </h2>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Customer</div>
                  <div className="font-medium">{customerInfo.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Transaction Code</div>
                  <div className="font-medium">{txnCode || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div className="font-medium">{formatPH()}</div>
                </div>
              </div>

              {customerInfo.payment_type === "Credit" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Payment Type</div>
                    <div className="font-medium">Credit</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Terms</div>
                    <div className="font-medium">
                      {termsMonths ?? "-"} month(s)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">
                      Interest (Whole Term)
                    </div>
                    <div className="font-medium">{interestPercent}%</div>
                  </div>
                </div>
              )}

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
                      <th className="py-2 px-3 text-left">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((ci) => (
                      <tr key={ci.item.id} className="border-b">
                        <td className="py-2 px-3">{ci.item.product_name}</td>
                        <td className="py-2 px-3">{ci.item.category}</td>
                        <td className="py-2 px-3">{ci.item.subcategory}</td>
                        <td className="py-2 px-3">
                          {formatCurrency(Number(ci.item.unit_price || 0))}
                        </td>
                        <td className="py-2 px-3">{ci.quantity}</td>
                        <td className="py-2 px-3">{ci.item.status}</td>
                        <td className="py-2 px-3 font-medium">
                          {formatCurrency(
                            Number(ci.item.unit_price || 0) * ci.quantity
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between px-3 py-2 bg-white border-t">
                  <div className="text-xs text-gray-500">
                    * Final price may change if an admin applies a discount
                    during order processing.
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      <span className="mr-2 text-gray-600">
                        Estimated Total:
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                    {customerInfo.payment_type === "Credit" && (
                      <div className="mt-1">
                        <span className="mr-2 text-gray-600">
                          Est. w/ Interest:
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(
                            subtotal * (1 + Math.max(0, interestPercent) / 100)
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {missingFields.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <strong>Missing required fields:</strong>{" "}
                {missingFields.slice(0, 5).join(", ")}
                {missingFields.length > 5 ? "..." : ""}
              </div>
            )}

            <div className="shrink-0 flex justify-end gap-2 mt-4">
              <button
                onClick={() => !placingOrder && setShowFinalModal(false)}
                disabled={placingOrder || !isConfirmEnabled}
                className={`px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm ${
                  placingOrder || !isConfirmEnabled
                    ? "opacity-60 cursor-not-allowed"
                    : ""
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={placingOrder || !isConfirmEnabled}
                className={`px-4 py-2 rounded-xl bg-[#ffba20] text-black shadow-lg inline-flex items-center gap-2 ${
                  placingOrder || !isConfirmEnabled
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
