// src/app/customer/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";

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
// Repairs common UTF‑8 → Latin‑1 mojibake like "PiÃ±as" → "Piñas"
const fixEncoding = (s: string) => {
  try {
    // escape() percent-encodes bytes 0–255; decodeURIComponent treats them as UTF‑8
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
};

// Robust JSON fetch with explicit UTF‑8 decode
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
  type: string; // 'City' / 'Municipality' etc.
};
type PSGCBarangay = { id: number; name: string; code: string };

type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_price: number;
  status: string;
  date_added: string;
  image_url?: string | null;
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
  date?: string;
  transaction?: string;
  status?: "pending" | "completed" | "rejected";
  payment_type?: "Credit" | "Balance" | "Cash";
  customer_type?: "New Customer" | "Existing Customer";
};

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

  // NCR (Region 13 / National Capital Region) has no provinces
  const isNCR = useMemo(
    () =>
      !!regionCode &&
      (regionCode.startsWith("13") ||
        (selectedRegion?.name || "")
          .toLowerCase()
          .includes("national capital")),
    [regionCode, selectedRegion]
  );

  // Full address string (province may be empty for NCR)
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
  // Regions
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

  // Children of region:
  // NCR → load cities directly; Others → load provinces
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

  // Cities when province changes (skip for NCR)
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

  // Barangays when city changes
  useEffect(() => {
    setBarangays([]);
    setBarangayCode("");
    if (!cityCode) return;

    const sel = cities.find((c) => c.code === cityCode);
    if (!sel) return;

    const isCityType = (sel.type || "").toLowerCase().includes("city");
    const url = isCityType
      ? `https://psgc.cloud/api/cities/${cityCode}/barangays`
      : `https://psgc.cloud/api/municipalities/${cityCode}/barangays`;

    fetchJSON<PSGCBarangay[]>(url)
      .then((list) =>
        setBarangays(
          list
            .map((b) => ({ ...b, name: fixEncoding(b.name) }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(async () => {
        // Fallback: filter all by the 9-digit city/municipality prefix
        try {
          const all = await fetchJSON<PSGCBarangay[]>(
            "https://psgc.cloud/api/barangays"
          );
          const list = all
            .filter((b) => b.code.startsWith(cityCode.slice(0, 9)))
            .map((b) => ({ ...b, name: fixEncoding(b.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setBarangays(list);
        } catch {
          toast.error("Failed to load barangays");
        }
      });
  }, [cityCode, cities]);

  /* --------------------- Inventory load + realtime --------------------- */
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select("*");
    if (error) {
      console.error("Error fetching inventory:", error.message);
      toast.error("Could not load inventory.");
    } else {
      setInventory((data ?? []) as InventoryItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();

    const channel: RealtimeChannel = supabase
      .channel("public:inventory")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchInventory()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInventory]);

  /* ------------------------------ Tracking ------------------------------ */
  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackingResult(null);
    setTrackingLoading(true);

    try {
      const { data, error } = await supabase
        .from("customers")
        .select(
          `
          id,
          name,
          code,
          contact_person,
          email,
          phone,
          address,
          status,
          date,
          orders (
            id,
            total_amount,
            status,
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
          )
        `
        )
        .eq("code", txn.trim().toUpperCase())
        .maybeSingle();

      if (error || !data) {
        setTrackError("Transaction code not found.");
      } else {
        setTrackingResult(data);
      }
    } catch {
      setTrackError("Error while fetching. Please try again.");
    } finally {
      setTrackingLoading(false);
    }
  };

  /* --------------------------- Payment type logic --------------------------- */
  useEffect(() => {
    if (customerInfo.customer_type === "New Customer") {
      setCustomerInfo((prev) => ({ ...prev, payment_type: "Cash" }));
    } else if (customerInfo.customer_type === "Existing Customer") {
      setCustomerInfo((prev) => ({
        ...prev,
        payment_type: prev.payment_type === "Credit" ? "Credit" : "Cash",
      }));
    }
  }, [customerInfo.customer_type]);

  /* ------------------------------- Cart flow ------------------------------- */
  const handleAddToCartClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setOrderQuantity(1);
  };

  const addToCart = () => {
    if (!selectedItem) return;

    if (orderQuantity > selectedItem.quantity) {
      toast.error("Cannot order more than available stock");
      return;
    }

    if (cart.some((ci) => ci.item.id === selectedItem.id)) {
      toast.error("Item already in cart.");
      return;
    }

    setCart((prev) => [
      ...prev,
      { item: selectedItem, quantity: orderQuantity },
    ]);
    setSelectedItem(null);
    setOrderQuantity(1);
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  // Open first confirm modal
  const handleShowCart = () => {
    if (!customerInfo.code) {
      setCustomerInfo((prev) => ({ ...prev, code: generateTransactionCode() }));
    }
    setShowCartPopup(true);
  };

  // First modal "Submit Order" -> open final confirmation
  const handleOpenFinalModal = () => {
    if (!isValidPhone(customerInfo.phone)) {
      toast.error("Phone number must be exactly 11 digits.");
      return;
    }
    if (
      !houseStreet.trim() ||
      !barangayCode ||
      !cityCode ||
      (!isNCR && !provinceCode) || // province optional for NCR
      !regionCode
    ) {
      toast.error(
        "Please complete your full address (House/St., Barangay, City, Province/Region)."
      );
      return;
    }
    if (
      !customerInfo.name ||
      !customerInfo.email ||
      !customerInfo.phone ||
      !customerInfo.address ||
      !customerInfo.payment_type ||
      !customerInfo.code ||
      !customerInfo.customer_type
    ) {
      toast.error("Please complete all required customer fields.");
      return;
    }

    setFinalOrderDetails({ customer: customerInfo, items: cart });
    setShowCartPopup(false);
    setShowFinalPopup(true);
  };

  // Final modal "Confirm Order" -> insert to DB
  const handleConfirmOrder = async () => {
    if (!finalOrderDetails) return;

    const { customer, items } = finalOrderDetails;

    if (!isValidPhone(customer.phone)) {
      toast.error("Phone number must be exactly 11 digits.");
      return;
    }
    if (!customer.address) {
      toast.error("Missing address.");
      return;
    }

    const { data: existing } = await supabase
      .from("customers")
      .select("code")
      .eq("code", customer.code);

    if (existing && existing.length > 0) {
      toast.error("Duplicate transaction code generated. Please try again.");
      return;
    }

    const customerPayload: Partial<CustomerInfo> = {
      ...customer,
      date: new Date().toISOString(), // UTC
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

      setShowFinalPopup(false);
      setFinalOrderDetails(null);
      setCart([]);

      setCustomerInfo({
        name: "",
        email: "",
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
    } catch (e: any) {
      console.error("Order submission error:", e.message);
      toast.error("Something went wrong. Please try again.");
    }
  };

  /* ------------------------------ Derived ------------------------------ */
  const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  const categoriesList = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))).sort(),
    [inventory]
  );

  const filteredInventory = inventory.filter((i) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      i.product_name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.subcategory.toLowerCase().includes(q);
    const matchesCategory =
      categoryFilter === "" || i.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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
      <motion.h1 className="text-3xl font-bold mb-4">Product Catalog</motion.h1>

      {/* Controls: Search + Category Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Search by product, category, or subcategory..."
          className="border border-gray-300 rounded px-3 py-2 w/full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
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

      {/* Tracking */}
      <div className="bg-white border rounded p-4 mb-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Track Your Delivery</h2>
        <form
          onSubmit={handleTrack}
          className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
        >
          <input
            value={txn}
            onChange={(e) => {
              setTxn(e.target.value);
              setTrackingResult(null);
              setTrackError(null);
            }}
            placeholder="Enter TXN code (e.g., TXN-20250819-ABC123)"
            className="w-full border px-3 py-2 rounded text-sm tracking-wider uppercase"
            required
          />
          <button
            type="submit"
            disabled={trackingLoading}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {trackingLoading ? "Checking..." : "Track"}
          </button>
        </form>
        {trackError && (
          <p className="text-red-600 mt-2 text-sm">{trackError}</p>
        )}
      </div>

      {trackingResult && (
        <div className="bg-gray-50 border rounded p-4 mb-6">
          <h3 className="font-semibold text-md mb-2">Customer & Order Info</h3>
          <p>
            <strong>Name:</strong> {trackingResult.name}
          </p>
          <p>
            <strong>TXN Code:</strong> {trackingResult.code}
          </p>
          <p>
            <strong>Status:</strong> {trackingResult.status}
          </p>
          <p>
            <strong>Address:</strong> {trackingResult.address}
          </p>
          <p>
            <strong>Contact:</strong> {trackingResult.phone}
          </p>
          <p>
            <strong>Email:</strong> {trackingResult.email}
          </p>
          <p>
            <strong>Date:</strong> {formatPH(trackingResult.date)}
          </p>

          <h4 className="mt-4 font-semibold">Items Ordered:</h4>
          <ul className="list-disc ml-6">
            {trackingResult.orders?.[0]?.order_items.map(
              (item: any, index: number) => (
                <li key={index}>
                  {item.inventory?.product_name} – {item.quantity} pcs (
                  {item.inventory?.category}/{item.inventory?.subcategory}) -{" "}
                  {item.inventory?.status}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {loading ? (
        <p>Loading inventory...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow mb-6">
          <table className="w-full table-fixed bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4 w-1/5">Product Name</th>
                <th className="py-2 px-4 w-1/5">Category</th>
                <th className="py-2 px-4 w-1/5">Subcategory</th>
                <th className="py-2 px-4 w-1/5">Status</th>
                <th className="py-2 px-4 w-1/5">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-4">
                    <button
                      className="text-blue-600 hover:underline font-medium"
                      onClick={() => openImageModal(item)}
                      title={
                        item.image_url
                          ? "View product image"
                          : "No image available"
                      }
                    >
                      {item.product_name}
                    </button>
                  </td>
                  <td className="py-2 px-4">{item.category}</td>
                  <td className="py-2 px-4">{item.subcategory}</td>
                  <td className="py-2 px-4">{item.status}</td>
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

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-gray-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* View-only IMAGE MODAL */}
      {showImageModal && imageModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-lg max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">{imageModalItem.product_name}</h3>
              <button
                className="text-gray-500 hover:text-black"
                onClick={closeImageModal}
              >
                ✕
              </button>
            </div>
            <div className="p-4">
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
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right">
              <button
                onClick={closeImageModal}
                className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Cart Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {selectedItem.product_name}
            </h2>
            <p>Category: {selectedItem.category}</p>
            <p>Subcategory: {selectedItem.subcategory}</p>
            <p>Status: {selectedItem.status}</p>
            <div className="mt-4">
              <label className="block mb-1">Quantity to Order</label>
              <input
                type="number"
                className="w-full border px-3 py-2 rounded"
                min={1}
                max={selectedItem.quantity}
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(Number(e.target.value))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={addToCart}
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Preview */}
      {cart.length > 0 && (
        <div className="mt-10 bg-gray-100 p-4 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Cart</h2>
          <table className="w-full bg-white text-sm mb-4">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4">Product</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Subcategory</th>
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
                  <td className="py-2 px-4">{ci.quantity}</td>
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

      {/* First Confirm Order Modal */}
      {showCartPopup && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-none shadow w-full max-w-5xl space-y-4">
            <h2 className="text-xl font-bold">Confirm Order</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                placeholder="Customer Name"
                className="border px-3 py-2 rounded"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, name: e.target.value })
                }
              />
              <input
                type="email"
                placeholder="Email"
                className="border px-3 py-2 rounded"
                value={customerInfo.email}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, email: e.target.value })
                }
              />
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

              {/* Location Pickers + House/Street */}
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
                className="border px-3 py-2 rounded col-span-2 bg-gray-50"
                value={customerInfo.address || ""}
                placeholder="Address will be set from House/St. + Barangay/City/Province/Region"
                readOnly
              />

              <div className="col-span-2">
                <label className="block mb-1">Customer Type</label>
                <select
                  className="border px-3 py-2 rounded w-full"
                  value={customerInfo.customer_type || ""}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_type: e.target.value as
                        | "New Customer"
                        | "Existing Customer",
                    })
                  }
                >
                  <option value="" disabled>
                    Select customer type
                  </option>
                  <option value="New Customer">New Customer</option>
                  <option value="Existing Customer">Existing Customer</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block mb-1">Payment Type</label>
                <div className="flex gap-4">
                  {(customerInfo.customer_type === "Existing Customer"
                    ? ["Credit", "Balance"]
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
                            payment_type: e.target.value as
                              | "Cash"
                              | "Credit"
                              | "Balance",
                          })
                        }
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <table className="w-full table-fixed text-sm bg-gray-100">
              <thead className="bg-gray-200">
                <tr>
                  <th className="py-2 px-3 text-left">Product</th>
                  <th className="py-2 px-3 text-left">Category</th>
                  <th className="py-2 px-3 text-left">Subcategory</th>
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
                    <td className="py-2 px-3">{ci.quantity}</td>
                    <td className="py-2 px-3">{ci.item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCartPopup(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenFinalModal}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Submit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Confirmation Modal */}
      {showFinalPopup && finalOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-none shadow w-full max-w-4xl space-y-4">
            <h2 className="text-xl font-bold">Order Confirmation</h2>

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
                <div className="font-medium">{selectedRegion?.name ?? "-"}</div>
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

            <table className="w-full table-fixed text-sm bg-gray-100">
              <thead className="bg-gray-200">
                <tr>
                  <th className="py-2 px-3 text-left">Product</th>
                  <th className="py-2 px-3 text-left">Category</th>
                  <th className="py-2 px-3 text-left">Subcategory</th>
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
                    <td className="py-2 px-3">{ci.quantity}</td>
                    <td className="py-2 px-3">{ci.item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowFinalPopup(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder}
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
