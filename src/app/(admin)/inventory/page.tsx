// src/app/(admin)/inventory/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/* ---------------------------------- Types --------------------------------- */
type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string | null;
  subcategory: string | null;
  unit: string | null;

  size: string | null;

  quantity: number;
  unit_price: number | null;
  cost_price: number | null;
  markup_percent: number | null;
  discount_percent: number | null;
  amount: number;
  profit: number | null;
  date_created: string;
  status: string | null;
  image_url?: string | null;

  weight_per_piece_kg: number | null;
  pieces_per_unit: number | null;
  total_weight_kg: number | null;

  expiration_date?: string | null;
  ceiling_qty: number | null;
  stock_level: string | null;
};

type SortKey =
  | "sku"
  | "product_name"
  | "category"
  | "subcategory"
  | "unit"
  | "size"
  | "quantity"
  | "cost_price"
  | "markup_percent"
  | "discount_percent"
  | "unit_price"
  | "amount"
  | "expiration_date"
  | "total_weight_kg"
  | "stock_level"
  | "date_created";

const FIXED_UNIT_OPTIONS = ["Piece", "Dozen", "Box", "Pack", "Kg"] as const;

const LIMITS = {
  MAX_WEIGHT_PER_PIECE_KG: 100,
  MAX_QUANTITY: 999_999,
  MAX_COST_PRICE: 1_000_000,
  MIN_MARKUP_PERCENT: 20,
  MAX_MARKUP_PERCENT: 100,
  MAX_DISCOUNT_PERCENT: 100,
} as const;

const clamp = (n: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(Math.max(n, min), max);

const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ============================================================================ */
function Row({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <label className="w-44 shrink-0 text-sm text-gray-700">
        {label}
        {required ? <span className="text-red-500">*</span> : null}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* -------------------------------- API helpers ------------------------------ */
async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameFieldType, setRenameFieldType] = useState<
    "category" | "subcategory" | "unit" | "size" | null
  >(null);
  const [renameOldValue, setRenameOldValue] = useState("");
  const [renameNewValue, setRenameNewValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [isCustomSize, setIsCustomSize] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);

  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalItem, setImageModalItem] = useState<InventoryItem | null>(
    null
  );

  // shadcn dropdown state
  const [catOpen, setCatOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);

  // sorting
  const [sortKey, setSortKey] = useState<SortKey>("date_created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  };

  const sortArrow = (key: SortKey) =>
    sortKey !== key ? "↕" : sortDir === "asc" ? "▲" : "▼";

  const getCellVal = (item: InventoryItem, key: SortKey) => {
    switch (key) {
      case "sku":
        return item.sku ?? "";
      case "product_name":
        return item.product_name ?? "";
      case "category":
        return item.category ?? "";
      case "subcategory":
        return item.subcategory ?? "";
      case "unit":
        return item.unit ?? "";
      case "size":
        return item.size ?? "";
      case "stock_level":
        return item.stock_level ?? item.status ?? "";
      case "expiration_date":
        return item.expiration_date ?? "";
      case "date_created":
        return item.date_created ?? "";
      case "quantity":
        return item.quantity ?? 0;
      case "cost_price":
        return item.cost_price ?? 0;
      case "markup_percent":
        return item.markup_percent ?? 0;
      case "discount_percent":
        return item.discount_percent ?? 0;
      case "unit_price":
        return item.unit_price ?? 0;
      case "amount":
        return item.amount ?? 0;
      case "total_weight_kg":
        return item.total_weight_kg ?? 0;
    }
  };

  const compare = (a: InventoryItem, b: InventoryItem, key: SortKey) => {
    const va = getCellVal(a, key);
    const vb = getCellVal(b, key);

    const numericKeys: SortKey[] = [
      "quantity",
      "cost_price",
      "markup_percent",
      "discount_percent",
      "unit_price",
      "amount",
      "total_weight_kg",
    ];
    if (numericKeys.includes(key)) return (va as number) - (vb as number);

    if (key === "date_created" || key === "expiration_date") {
      const da = va ? new Date(va as string).getTime() : 0;
      const db = vb ? new Date(vb as string).getTime() : 0;
      return da - db;
    }

    return String(va).localeCompare(String(vb), undefined, {
      sensitivity: "base",
    });
  };

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    product_name: "",
    category: "",
    subcategory: "",
    unit: "",
    size: null,

    quantity: 0,
    unit_price: 0,
    cost_price: 0,
    markup_percent: LIMITS.MIN_MARKUP_PERCENT,
    discount_percent: null,
    amount: 0,
    profit: 0,
    date_created: new Date().toISOString(),
    status: "",
    image_url: null,

    weight_per_piece_kg: null,
    pieces_per_unit: null,
    total_weight_kg: null,
    expiration_date: null,
    ceiling_qty: null,
    stock_level: "In Stock",
  });

  const isPipe =
    (newItem.category || "").trim().toLowerCase() === "plumbing" &&
    (newItem.subcategory || "").trim().toLowerCase() === "pipes";

  /* ------------------------------ PostgreSQL fetchers ------------------------------ */
  const fetchItems = async () => {
    try {
      setLoading(true);
      const j = await apiJSON<{ items: InventoryItem[] }>("/api/inventory", {
        method: "GET",
      });
      setItems(j.items || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to load inventory (offline DB).");
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    try {
      const j = await apiJSON<{
        categories: string[];
        subcategories: string[];
        units: string[];
        sizes: string[];
      }>("/api/inventory/options", { method: "GET" });

      setCategoryOptions(j.categories || []);
      setSubcategoryOptions(j.subcategories || []);
      setUnitOptions(j.units || []);
      setSizeOptions(j.sizes || []);
    } catch (e: any) {
      console.error(e);
      // keep silent-ish: dropdowns can still work from existing state
    }
  };

  useEffect(() => {
    fetchItems();
    fetchDropdownOptions();
  }, []);

  // Unit defaults (safe; only fires on unit change)
  useEffect(() => {
    const u = newItem.unit;
    if (u === "Kg") {
      setNewItem((prev) => ({
        ...prev,
        pieces_per_unit: 1,
        weight_per_piece_kg: 1,
      }));
      return;
    }
    if (u === "Piece") {
      setNewItem((prev) => ({ ...prev, pieces_per_unit: 1 }));
      return;
    }
    if (u === "Dozen") {
      setNewItem((prev) => ({ ...prev, pieces_per_unit: 12 }));
      return;
    }
  }, [newItem.unit]);

  /* ============================================================================ */
  const computedWeight = useMemo(() => {
    const unit = newItem.unit || "";
    const qty = Number(newItem.quantity) || 0;

    const weightPerPiece =
      unit === "Kg" ? 1 : Number(newItem.weight_per_piece_kg) || 0;
    const piecesPerUnit =
      unit === "Kg"
        ? 1
        : Number(newItem.pieces_per_unit) ||
          (unit === "Piece" ? 1 : unit === "Dozen" ? 12 : 0);

    const total =
      weightPerPiece > 0 && piecesPerUnit > 0 && qty > 0
        ? weightPerPiece * piecesPerUnit * qty
        : 0;

    return total || 0;
  }, [
    newItem.unit,
    newItem.weight_per_piece_kg,
    newItem.pieces_per_unit,
    newItem.quantity,
  ]);

  const computedPricing = useMemo(() => {
    const cost = Number(newItem.cost_price) || 0;

    const markup = clamp(
      Number(newItem.markup_percent) || LIMITS.MIN_MARKUP_PERCENT,
      LIMITS.MIN_MARKUP_PERCENT,
      LIMITS.MAX_MARKUP_PERCENT
    );

    const discountRaw = newItem.discount_percent;
    const discount =
      discountRaw === null ||
      discountRaw === undefined ||
      discountRaw === ("" as any)
        ? 0
        : clamp(Number(discountRaw) || 0, 0, LIMITS.MAX_DISCOUNT_PERCENT);

    const qty = Number(newItem.quantity) || 0;

    const baseSelling = cost + (cost * markup) / 100;
    const discountedSelling = baseSelling * (1 - discount / 100);

    const belowCost = discountedSelling + 1e-9 < cost;

    const finalUnit = Number((belowCost ? cost : discountedSelling).toFixed(2));
    const amount = Number((finalUnit * qty).toFixed(2));
    const profit = Number(((finalUnit - cost) * qty).toFixed(2));

    return {
      markup,
      discount:
        discountRaw === null ||
        discountRaw === undefined ||
        discountRaw === ("" as any)
          ? null
          : discount,
      unit_price: finalUnit,
      amount,
      profit,
      belowCost,
    };
  }, [
    newItem.cost_price,
    newItem.markup_percent,
    newItem.discount_percent,
    newItem.quantity,
  ]);

  const liveErrors = useMemo(() => {
    const quantity = Number(newItem.quantity) || 0;
    const cost_price = newItem.cost_price;
    const markup_percent = newItem.markup_percent;
    const discount_percent = newItem.discount_percent;
    const wpp = newItem.weight_per_piece_kg;
    const ceiling = newItem.ceiling_qty;

    return {
      product_name: !newItem.product_name.trim(),
      category: !(newItem.category || "").trim(),
      subcategory: !(newItem.subcategory || "").trim(),
      unit: !(newItem.unit || "").trim(),
      size: isPipe ? !(newItem.size || "").trim() : false,

      quantity: quantity < 0 || quantity > LIMITS.MAX_QUANTITY,
      cost_price:
        cost_price === null ||
        cost_price < 0 ||
        cost_price > LIMITS.MAX_COST_PRICE,

      markup_percent:
        markup_percent === null ||
        markup_percent < LIMITS.MIN_MARKUP_PERCENT ||
        markup_percent > LIMITS.MAX_MARKUP_PERCENT,

      discount_percent:
        discount_percent !== null &&
        (discount_percent < 0 ||
          discount_percent > LIMITS.MAX_DISCOUNT_PERCENT),

      pieces_per_unit:
        (newItem.unit === "Box" || newItem.unit === "Pack") &&
        (!newItem.pieces_per_unit || newItem.pieces_per_unit <= 0),

      weight_per_piece_kg:
        newItem.unit !== "Kg" && wpp !== null
          ? wpp < 0 || wpp > LIMITS.MAX_WEIGHT_PER_PIECE_KG
          : false,

      ceiling_qty: ceiling != null && ceiling < 0,

      pricing_below_cost: computedPricing.belowCost,
    };
  }, [newItem, isPipe, computedPricing.belowCost]);

  const normalizeForSave = () => {
    let { unit, pieces_per_unit, weight_per_piece_kg, quantity } = newItem;

    if (unit === "Kg") {
      pieces_per_unit = 1;
      weight_per_piece_kg = 1;
    } else if (unit === "Piece") {
      pieces_per_unit = 1;
    } else if (unit === "Dozen") {
      pieces_per_unit = 12;
    }

    const total_weight_kg =
      pieces_per_unit && weight_per_piece_kg
        ? Number(pieces_per_unit) *
          Number(weight_per_piece_kg) *
          Number(quantity || 0)
        : null;

    return {
      pieces_per_unit: pieces_per_unit ?? null,
      weight_per_piece_kg: weight_per_piece_kg ?? null,
      total_weight_kg: total_weight_kg ?? null,
    };
  };

  const resetForm = () => {
    setNewItem({
      sku: "",
      product_name: "",
      category: "",
      subcategory: "",
      unit: "",
      size: null,
      quantity: 0,
      unit_price: 0,
      cost_price: 0,
      markup_percent: LIMITS.MIN_MARKUP_PERCENT,
      discount_percent: null,
      amount: 0,
      profit: 0,
      date_created: new Date().toISOString(),
      status: "",
      image_url: null,
      weight_per_piece_kg: null,
      pieces_per_unit: null,
      total_weight_kg: null,
      expiration_date: null,
      ceiling_qty: null,
      stock_level: "In Stock",
    });

    setEditingItemId(null);
    setShowForm(false);

    setIsCustomCategory(false);
    setIsCustomSubcategory(false);
    setIsCustomUnit(false);
    setIsCustomSize(false);
  };

  const handleSubmitItem = async () => {
    try {
      const hasErrors = Object.values(liveErrors).some(Boolean);
      if (hasErrors) {
        if (liveErrors.pricing_below_cost) {
          toast.error(
            "Discount is too high. Selling price cannot go below Cost Price."
          );
        } else if (liveErrors.markup_percent) {
          toast.error(`Markup must be at least ${LIMITS.MIN_MARKUP_PERCENT}%.`);
        } else {
          toast.error("Please fill all required fields correctly.");
        }
        return;
      }

      setSaving(true);

      const normalized = normalizeForSave();

      const dataToSave = {
        ...newItem,
        ...normalized,
        date_created: new Date().toISOString(),
        markup_percent: computedPricing.markup,
        discount_percent: computedPricing.discount,
        unit_price: computedPricing.unit_price,
        amount: computedPricing.amount,
        profit: computedPricing.profit,
        total_weight_kg:
          normalized.total_weight_kg ?? (computedWeight ? computedWeight : null),
      };

      if (editingItemId !== null) {
        await apiJSON<{ ok: true }>("/api/inventory/" + editingItemId, {
          method: "PUT",
          body: JSON.stringify({ item: dataToSave }),
        });
        toast.success("Item updated successfully!");
      } else {
        await apiJSON<{ ok: true }>("/api/inventory", {
          method: "POST",
          body: JSON.stringify({ item: dataToSave }),
        });
        toast.success("New item added successfully!");
      }

      await fetchItems();
      await fetchDropdownOptions();
      resetForm();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(`Error saving item: ${err.message || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- Filtering / Sorting / Paging ----
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.sku} ${item.product_name} ${item.category ?? ""} ${
        item.subcategory ?? ""
      } ${item.unit ?? ""} ${item.size ?? ""}`.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered].sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paged = sorted.slice(
    (safePage - 1) * itemsPerPage,
    itemsPerPage * safePage
  );

  useEffect(() => setCurrentPage(1), [searchQuery, sortKey, sortDir]);

  // ---- Dropdown automation ----
  const subcategoryFiltered = useMemo(() => {
    const cat = (newItem.category || "").trim();
    if (!cat) return subcategoryOptions;
    const used = new Set(
      items
        .filter((it) => (it.category || "").trim() === cat)
        .map((it) => (it.subcategory || "").trim())
        .filter(Boolean)
    );
    const usedList = Array.from(used);
    const others = subcategoryOptions.filter((s) => !used.has((s || "").trim()));
    return [...usedList, ...others].filter(Boolean);
  }, [items, subcategoryOptions, newItem.category]);

  const unitSuggested = useMemo(() => {
    const cat = (newItem.category || "").trim();
    if (!cat) return [...FIXED_UNIT_OPTIONS, ...unitOptions];
    const used = new Set(
      items
        .filter((it) => (it.category || "").trim() === cat)
        .map((it) => (it.unit || "").trim())
        .filter(Boolean)
    );
    const fixed = FIXED_UNIT_OPTIONS.map(String);
    const usedList = Array.from(used);
    const extras = unitOptions.filter(
      (u) => !fixed.includes(u) && !used.has((u || "").trim())
    );
    return Array.from(new Set([...usedList, ...fixed, ...extras])).filter(Boolean);
  }, [items, unitOptions, newItem.category]);

  const sizeSuggested = useMemo(() => {
    if (!isPipe) return sizeOptions;
    const used = new Set(
      items
        .filter(
          (it) =>
            (it.category || "").trim().toLowerCase() === "plumbing" &&
            (it.subcategory || "").trim().toLowerCase() === "pipes"
        )
        .map((it) => (it.size || "").trim())
        .filter(Boolean)
    );
    const usedList = Array.from(used);
    const others = sizeOptions.filter((s) => !used.has((s || "").trim()));
    const common = ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"', '3"', '4"'];
    return Array.from(new Set([...usedList, ...common, ...others])).filter(Boolean);
  }, [isPipe, items, sizeOptions]);

  const categoryList = useMemo(
    () => categoryOptions.slice().sort((a, b) => a.localeCompare(b)),
    [categoryOptions]
  );

  /* ------------------------------ UI helpers ------------------------------ */
  const cell = "px-4 py-2 text-left align-middle";
  const cellNowrap = `${cell} whitespace-nowrap`;

  // ✅ Double click row opens edit modal
  const openEditModalFromRow = (item: InventoryItem) => {
    setShowForm(true);
    setEditingItemId(item.id);

    setNewItem({
      ...item,
      category: item.category || "",
      subcategory: item.subcategory || "",
      unit: item.unit || "",
      size: item.size ?? null,
      cost_price: item.cost_price ?? 0,
      markup_percent: Math.max(
        Number(item.markup_percent ?? LIMITS.MIN_MARKUP_PERCENT),
        LIMITS.MIN_MARKUP_PERCENT
      ),
      discount_percent: item.discount_percent ?? null,
      expiration_date: item.expiration_date ?? null,
      ceiling_qty: item.ceiling_qty ?? null,
      stock_level: item.stock_level ?? "In Stock",
      unit_price: item.unit_price ?? 0,
      total_weight_kg: item.total_weight_kg ?? null,
      amount: item.amount ?? 0,
      profit: item.profit ?? 0,
      image_url: item.image_url ?? null,
    });

    setIsCustomCategory(false);
    setIsCustomSubcategory(false);
    setIsCustomUnit(false);
    setIsCustomSize(false);
  };

  const openImageModal = (item: InventoryItem) => {
    setImageModalItem(item);
    setShowImageModal(true);
  };

  return (
    <>
      <div className="px-4 pb-4 pt-1">
        <h1 className="text-3xl font-bold mt-1">Inventory</h1>
        <p className="text-neutral-500 text-sm mb-4">
          Offline Inventory (Local PostgreSQL). Internet not required.
        </p>

        <div className="flex flex-wrap gap-4 mb-4 items-center">
          <input
            className="border px-4 py-2 w-full sm:max-w-md rounded"
            placeholder="Search by SKU, product, category, subcategory, unit, size"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <button
            className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
            onClick={() => {
              setShowForm(true);
              setEditingItemId(null);
              setNewItem({
                sku: "",
                product_name: "",
                category: "",
                subcategory: "",
                unit: "",
                size: null,
                quantity: 0,
                unit_price: 0,
                cost_price: 0,
                markup_percent: LIMITS.MIN_MARKUP_PERCENT,
                discount_percent: null,
                amount: 0,
                profit: 0,
                date_created: new Date().toISOString(),
                status: "",
                image_url: null,
                weight_per_piece_kg: null,
                pieces_per_unit: null,
                total_weight_kg: null,
                expiration_date: null,
                ceiling_qty: null,
                stock_level: "In Stock",
              });
              setIsCustomCategory(false);
              setIsCustomSubcategory(false);
              setIsCustomUnit(false);
              setIsCustomSize(false);
            }}
          >
            Add New Item
          </button>
        </div>

        <div className="overflow-auto rounded-lg shadow">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("sku")}>
                    SKU {sortArrow("sku")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("product_name")}>
                    Product {sortArrow("product_name")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("category")}>
                    Category {sortArrow("category")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("subcategory")}>
                    Subcategory {sortArrow("subcategory")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("unit")}>
                    Unit {sortArrow("unit")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("size")}>
                    Size {sortArrow("size")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("quantity")}>
                    Quantity {sortArrow("quantity")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("cost_price")}>
                    Cost Price {sortArrow("cost_price")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("markup_percent")}>
                    Markup % {sortArrow("markup_percent")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("discount_percent")}>
                    Discount % {sortArrow("discount_percent")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("unit_price")}>
                    Unit Price {sortArrow("unit_price")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("amount")}>
                    Total {sortArrow("amount")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("expiration_date")}>
                    Expiration Date {sortArrow("expiration_date")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("total_weight_kg")}>
                    Total Weight {sortArrow("total_weight_kg")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("stock_level")}>
                    Stock Level {sortArrow("stock_level")}
                  </button>
                </th>
                <th className={cellNowrap}>
                  <button className="font-semibold hover:underline" onClick={() => toggleSort("date_created")}>
                    Date {sortArrow("date_created")}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {paged.map((item) => (
                <tr
                  key={item.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onDoubleClick={() => openEditModalFromRow(item)}
                  title="Double click to edit"
                >
                  <td className={cellNowrap}>{item.sku}</td>

                  <td className="px-4 py-2 whitespace-normal break-words max-w-xs">
                    {item.image_url ? (
                      <button
                        className="text-blue-600 hover:underline font-medium text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          openImageModal(item);
                        }}
                        title="Click to view image"
                      >
                        {item.product_name}
                      </button>
                    ) : (
                      <span className="text-gray-800 font-medium text-left">
                        {item.product_name}
                      </span>
                    )}
                  </td>

                  <td className={cellNowrap}>{item.category || "—"}</td>
                  <td className={cellNowrap}>{item.subcategory || "—"}</td>
                  <td className={cellNowrap}>{item.unit || "—"}</td>
                  <td className={cellNowrap}>{item.size || "—"}</td>

                  <td className={cellNowrap}>{item.quantity}</td>
                  <td className={cellNowrap}>
                    {item.cost_price != null ? peso(Number(item.cost_price)) : "—"}
                  </td>
                  <td className={cellNowrap}>
                    {item.markup_percent != null ? `${Number(item.markup_percent)}%` : "—"}
                  </td>
                  <td className={cellNowrap}>
                    {item.discount_percent != null && Number(item.discount_percent) > 0
                      ? `${Number(item.discount_percent)}%`
                      : "—"}
                  </td>
                  <td className={cellNowrap}>
                    {item.unit_price != null ? peso(Number(item.unit_price)) : "—"}
                  </td>
                  <td className={cellNowrap}>{peso(Number(item.amount))}</td>

                  <td className={cellNowrap}>
                    {item.expiration_date
                      ? new Date(item.expiration_date).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })
                      : "—"}
                  </td>

                  <td className={cellNowrap}>
                    {item.total_weight_kg
                      ? `${Number(item.total_weight_kg).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })} kg`
                      : "—"}
                  </td>

                  <td className={cellNowrap}>
                    {(() => {
                      const lvl = item.stock_level || item.status || "In Stock";
                      const cls =
                        lvl === "Critical"
                          ? "bg-red-100 text-red-700"
                          : lvl === "Low"
                          ? "bg-yellow-100 text-yellow-800"
                          : lvl === "Out of Stock"
                          ? "bg-gray-200 text-gray-700"
                          : "bg-green-100 text-green-700";
                      return (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${cls}`}>
                          {lvl}
                        </span>
                      );
                    })()}
                  </td>

                  <td className={cellNowrap}>
                    {item.date_created ? new Date(item.date_created).toLocaleString("en-PH") : "—"}
                  </td>
                </tr>
              ))}

              {paged.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={16}>
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex justify-between items-center">
          <button
            disabled={safePage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {safePage} of {totalPages}
          </span>
          <button
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Next →
          </button>
        </div>

        {/* Image Modal (offline: just show stored URL) */}
        {showImageModal && imageModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-lg max-w-xl w-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold">{imageModalItem.product_name}</h3>
                <button
                  className="text-gray-500 hover:text-black"
                  onClick={() => {
                    setShowImageModal(false);
                    setImageModalItem(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="p-4">
                {imageModalItem.image_url ? (
                  <div className="w-full">
                    <div className="w-full h-72 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                      <img
                        src={imageModalItem.image_url}
                        alt={imageModalItem.product_name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="mt-3 text-xs text-gray-600 break-all">
                      URL: {imageModalItem.image_url}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 border rounded p-6">
                    No image_url saved for this item.
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t text-right">
                <button
                  onClick={() => {
                    setShowImageModal(false);
                    setImageModalItem(null);
                  }}
                  className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
            <div className="bg-white p-8 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4">
              <h2 className="text-lg font-semibold">
                {editingItemId ? "Edit Item" : "Add New Item"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* LEFT */}
                <div className="space-y-3">
                  <Row label="SKU" required>
                    <input
                      className="w-full border px-4 py-2 rounded"
                      placeholder="PRODUCT ID"
                      value={newItem.sku}
                      onChange={(e) =>
                        setNewItem((prev) => ({ ...prev, sku: e.target.value }))
                      }
                    />
                  </Row>

                  <Row label="Product Name" required>
                    <input
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.product_name ? "border-red-500" : ""
                      }`}
                      placeholder="e.g. Boysen"
                      value={newItem.product_name}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          product_name: e.target.value,
                        }))
                      }
                    />
                  </Row>

                  <Row label="Category" required>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        {isCustomCategory ? (
                          <input
                            className={`w-full border px-4 py-2 rounded ${
                              liveErrors.category ? "border-red-500" : ""
                            }`}
                            placeholder="Enter new category"
                            value={newItem.category || ""}
                            onChange={(e) =>
                              setNewItem((prev) => ({
                                ...prev,
                                category: e.target.value,
                                subcategory: "",
                                size: null,
                              }))
                            }
                          />
                        ) : (
                          <Popover open={catOpen} onOpenChange={setCatOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={catOpen}
                                className={`w-full justify-between ${
                                  liveErrors.category ? "border-red-500" : ""
                                }`}
                              >
                                <span className="truncate">
                                  {newItem.category ? newItem.category : "Select Category"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-[280px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search category..." />
                                <CommandList>
                                  <CommandEmpty>No category found.</CommandEmpty>
                                  <CommandGroup>
                                    {categoryList.map((c) => (
                                      <CommandItem
                                        key={c}
                                        value={c}
                                        onSelect={() => {
                                          setNewItem((prev) => ({
                                            ...prev,
                                            category: c,
                                            subcategory: "",
                                            size: null,
                                          }));
                                          setCatOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            newItem.category === c ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {c}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>

                      <label className="shrink-0 whitespace-nowrap text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isCustomCategory}
                          onChange={(e) => setIsCustomCategory(e.target.checked)}
                        />
                        New
                      </label>
                    </div>
                  </Row>

                  <Row label="Subcategory" required>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        {isCustomSubcategory ? (
                          <input
                            className={`w-full border px-4 py-2 rounded ${
                              liveErrors.subcategory ? "border-red-500" : ""
                            }`}
                            placeholder="Enter new subcategory"
                            value={newItem.subcategory || ""}
                            onChange={(e) =>
                              setNewItem((prev) => ({
                                ...prev,
                                subcategory: e.target.value,
                                size: null,
                              }))
                            }
                          />
                        ) : (
                          <Popover open={subOpen} onOpenChange={setSubOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={subOpen}
                                className={`w-full justify-between ${
                                  liveErrors.subcategory ? "border-red-500" : ""
                                }`}
                                disabled={!newItem.category}
                              >
                                <span className="truncate">
                                  {newItem.subcategory ? newItem.subcategory : "Select Subcategory"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-[280px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search subcategory..." />
                                <CommandList>
                                  <CommandEmpty>No subcategory found.</CommandEmpty>
                                  <CommandGroup>
                                    {subcategoryFiltered.map((s) => (
                                      <CommandItem
                                        key={s}
                                        value={s}
                                        onSelect={() => {
                                          setNewItem((prev) => ({
                                            ...prev,
                                            subcategory: s,
                                            size: null,
                                          }));
                                          setSubOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            newItem.subcategory === s ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {s}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>

                      <label className="shrink-0 whitespace-nowrap text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isCustomSubcategory}
                          onChange={(e) => setIsCustomSubcategory(e.target.checked)}
                        />
                        New
                      </label>
                    </div>
                  </Row>

                  <Row label="Unit" required>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        {isCustomUnit ? (
                          <input
                            className={`w-full border px-4 py-2 rounded ${
                              liveErrors.unit ? "border-red-500" : ""
                            }`}
                            placeholder="Enter new unit"
                            value={newItem.unit || ""}
                            onChange={(e) =>
                              setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                            }
                          />
                        ) : (
                          <Popover open={unitOpen} onOpenChange={setUnitOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={unitOpen}
                                className={`w-full justify-between ${
                                  liveErrors.unit ? "border-red-500" : ""
                                }`}
                              >
                                <span className="truncate">
                                  {newItem.unit ? newItem.unit : "Select Unit"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-[280px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search unit..." />
                                <CommandList>
                                  <CommandEmpty>No unit found.</CommandEmpty>
                                  <CommandGroup>
                                    {unitSuggested.map((u) => (
                                      <CommandItem
                                        key={u}
                                        value={u}
                                        onSelect={() => {
                                          setNewItem((prev) => ({ ...prev, unit: u }));
                                          setUnitOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            newItem.unit === u ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {u}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>

                      <label className="shrink-0 whitespace-nowrap text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isCustomUnit}
                          onChange={(e) => setIsCustomUnit(e.target.checked)}
                        />
                        New
                      </label>
                    </div>
                  </Row>

                  {isPipe && (
                    <Row label="Pipe Size" required>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          {isCustomSize ? (
                            <input
                              className={`w-full border px-4 py-2 rounded ${
                                liveErrors.size ? "border-red-500" : ""
                              }`}
                              placeholder='e.g. 1/2", 3/4", 1"'
                              value={newItem.size || ""}
                              onChange={(e) =>
                                setNewItem((prev) => ({ ...prev, size: e.target.value }))
                              }
                            />
                          ) : (
                            <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={sizeOpen}
                                  className={`w-full justify-between ${
                                    liveErrors.size ? "border-red-500" : ""
                                  }`}
                                >
                                  <span className="truncate">
                                    {newItem.size ? newItem.size : "Select Size"}
                                  </span>
                                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                                </Button>
                              </PopoverTrigger>

                              <PopoverContent className="w-[280px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search size..." />
                                  <CommandList>
                                    <CommandEmpty>No size found.</CommandEmpty>
                                    <CommandGroup>
                                      {sizeSuggested.map((s) => (
                                        <CommandItem
                                          key={s}
                                          value={s}
                                          onSelect={() => {
                                            setNewItem((prev) => ({ ...prev, size: s }));
                                            setSizeOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              newItem.size === s ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          {s}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>

                        <label className="shrink-0 whitespace-nowrap text-sm flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isCustomSize}
                            onChange={(e) => setIsCustomSize(e.target.checked)}
                          />
                          New
                        </label>
                      </div>
                    </Row>
                  )}

                  {/* Offline Image URL input */}
                  <Row label="Image URL">
                    <input
                      className="w-full border px-4 py-2 rounded"
                      placeholder="Optional (LAN URL / local hosted URL)"
                      value={newItem.image_url || ""}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          image_url: e.target.value ? e.target.value : null,
                        }))
                      }
                    />
                  </Row>
                </div>

                {/* RIGHT */}
                <div className="space-y-3">
                  <Row label="Weight / piece (kg)">
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_WEIGHT_PER_PIECE_KG}
                      step="0.001"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.weight_per_piece_kg ? "border-red-500" : ""
                      }`}
                      placeholder={newItem.unit === "Kg" ? "1 (auto for Kg items)" : "e.g. 0.45"}
                      value={newItem.unit === "Kg" ? 1 : newItem.weight_per_piece_kg ?? ""}
                      disabled={newItem.unit === "Kg"}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_WEIGHT_PER_PIECE_KG);
                        setNewItem((prev) => ({
                          ...prev,
                          weight_per_piece_kg: newItem.unit === "Kg" ? 1 : val,
                        }));
                      }}
                    />
                  </Row>

                  <Row label="Ceiling (Max Stock)">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.ceiling_qty ? "border-red-500" : ""
                      }`}
                      placeholder="Optional max stock (for Low/Critical)"
                      value={newItem.ceiling_qty ?? ""}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          ceiling_qty:
                            e.target.value === ""
                              ? null
                              : Math.max(0, parseInt(e.target.value || "0", 10)),
                        }))
                      }
                    />
                  </Row>

                  <Row label="Quantity" required>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_QUANTITY}
                      step="1"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.quantity ? "border-red-500" : ""
                      }`}
                      value={newItem.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value || "0", 10) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_QUANTITY);
                        setNewItem((prev) => ({ ...prev, quantity: val }));
                      }}
                    />
                  </Row>

                  <Row label="Cost Price" required>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_COST_PRICE}
                      step="0.01"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.cost_price ? "border-red-500" : ""
                      }`}
                      value={newItem.cost_price ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_COST_PRICE);
                        setNewItem((prev) => ({ ...prev, cost_price: val }));
                      }}
                    />
                  </Row>

                  <Row label="Markup (%)" required>
                    <input
                      type="number"
                      min={LIMITS.MIN_MARKUP_PERCENT}
                      max={LIMITS.MAX_MARKUP_PERCENT}
                      step="0.01"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.markup_percent ? "border-red-500" : ""
                      }`}
                      value={newItem.markup_percent ?? LIMITS.MIN_MARKUP_PERCENT}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value);
                        const val = clamp(
                          isNaN(raw) ? LIMITS.MIN_MARKUP_PERCENT : raw,
                          LIMITS.MIN_MARKUP_PERCENT,
                          LIMITS.MAX_MARKUP_PERCENT
                        );
                        setNewItem((prev) => ({ ...prev, markup_percent: val }));
                      }}
                    />
                  </Row>

                  <div className="text-xs text-gray-500 ml-44 -mt-2">
                    Minimum markup is {LIMITS.MIN_MARKUP_PERCENT}%.
                  </div>

                  <Row label="Discount (%)">
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_DISCOUNT_PERCENT}
                      step="0.01"
                      className={`w-full border px-4 py-2 rounded ${
                        liveErrors.discount_percent || liveErrors.pricing_below_cost
                          ? "border-red-500"
                          : ""
                      }`}
                      placeholder="Optional (0–100)"
                      value={newItem.discount_percent ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setNewItem((prev) => ({ ...prev, discount_percent: null }));
                          return;
                        }
                        const raw = parseFloat(v) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_DISCOUNT_PERCENT);
                        setNewItem((prev) => ({ ...prev, discount_percent: val }));
                      }}
                    />
                  </Row>

                  {liveErrors.pricing_below_cost && (
                    <div className="text-xs text-red-600 ml-44">
                      Discount is too high — selling price cannot go below cost price.
                    </div>
                  )}

                  <Row label="Expiration Date">
                    <input
                      type="date"
                      className="w-full border px-4 py-2 rounded"
                      value={newItem.expiration_date ? newItem.expiration_date.slice(0, 10) : ""}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          expiration_date: e.target.value ? e.target.value : null,
                        }))
                      }
                    />
                  </Row>
                </div>
              </div>

              {/* Summary */}
              <div className="border-t pt-4 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm text-gray-700">Unit Price (auto)</label>
                    <input
                      className="w-full border px-4 py-2 rounded bg-gray-100 text-gray-700 text-right"
                      value={peso(Number(computedPricing.unit_price || 0))}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm text-gray-700">Total Price</label>
                    <input
                      className="w-full border px-4 py-2 rounded bg-gray-100 text-gray-700 text-right"
                      value={peso(Number(computedPricing.amount || 0))}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm text-gray-700">Total Weight</label>
                    <input
                      className="w-full border px-4 py-2 rounded bg-gray-100 text-gray-700 text-right"
                      value={
                        computedWeight
                          ? `${Number(computedWeight).toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })} kg`
                          : "—"
                      }
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={resetForm} className="bg-gray-300 px-4 py-2 rounded">
                  Cancel
                </button>

                <button
                  onClick={handleSubmitItem}
                  disabled={saving}
                  className={`bg-black text-white px-4 py-2 rounded hover:text-[#ffba20] ${
                    saving ? "opacity-70 pointer-events-none" : ""
                  }`}
                >
                  {saving ? "Saving..." : editingItemId ? "Update Item" : "Add Item"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="mb-4">
              <h2 className="font-semibold text-lg mb-1">
                Rename {renameFieldType ? renameFieldType.toUpperCase() : ""}
              </h2>
              <p className="text-gray-500 text-sm mb-2">
                Rename <span className="font-bold">{renameOldValue}</span> to:
              </p>
              <input
                className="border px-3 py-2 rounded w-full focus:ring-2 focus:ring-blue-500"
                value={renameNewValue}
                autoFocus
                onChange={(e) => setRenameNewValue(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-200"
                onClick={() => setShowRenameModal(false)}
              >
                Cancel
              </button>

              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  renaming ||
                  !renameNewValue.trim() ||
                  renameNewValue.trim() === renameOldValue
                }
                onClick={async () => {
                  if (!renameFieldType || !renameOldValue || !renameNewValue.trim()) return;
                  try {
                    setRenaming(true);
                    await apiJSON<{ ok: true }>("/api/inventory/rename", {
                      method: "POST",
                      body: JSON.stringify({
                        field: renameFieldType,
                        oldValue: renameOldValue,
                        newValue: renameNewValue.trim(),
                      }),
                    });
                    toast.success(
                      `Renamed "${renameOldValue}" to "${renameNewValue.trim()}".`
                    );
                    setShowRenameModal(false);
                    await fetchDropdownOptions();
                    await fetchItems();
                  } catch (e: any) {
                    toast.error(`Failed to rename: ${e?.message || "Unknown error"}`);
                  } finally {
                    setRenaming(false);
                  }
                }}
              >
                {renaming ? "Renaming..." : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
