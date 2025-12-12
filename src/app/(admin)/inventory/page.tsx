// src/app/(admin)/inventory/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
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
  quantity: number;
  unit_price: number | null; // Selling price (auto from cost+markup; discount is optional)
  cost_price: number | null; // Capital
  markup_percent: number | null; // REQUIRED
  discount_percent: number | null; // OPTIONAL
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

const FIXED_UNIT_OPTIONS = ["Piece", "Dozen", "Box", "Pack", "Kg"] as const;
type FixedUnit = (typeof FIXED_UNIT_OPTIONS)[number];

const LIMITS = {
  MAX_WEIGHT_PER_PIECE_KG: 100,
  MAX_QUANTITY: 999_999,
  MAX_COST_PRICE: 1_000_000,
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

/* ---------- Sorting types/state/helpers ---------- */
type SortKey =
  | "sku"
  | "product_name"
  | "category"
  | "subcategory"
  | "unit"
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

const BUCKET = "inventory-images";
const MAX_GALLERY = 5;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const safeSlug = (s: string) => (s || "item").trim().replace(/\s+/g, "-").toLowerCase();

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
  const [renameFieldType, setRenameFieldType] = useState<"category" | "subcategory" | "unit" | null>(null);
  const [renameOldValue, setRenameOldValue] = useState("");
  const [renameNewValue, setRenameNewValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [sendingLowStock, setSendingLowStock] = useState(false);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalItem, setImageModalItem] = useState<InventoryItem | null>(null);
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [modalIndex, setModalIndex] = useState(0);

  // searchable dropdowns (shadcn command)
  const [catOpen, setCatOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);

  // ---- Sorting state ----
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

  const sortArrow = (key: SortKey) => (sortKey !== key ? "↕" : sortDir === "asc" ? "▲" : "▼");

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

    return String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
  };

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    product_name: "",
    category: "",
    subcategory: "",
    unit: "",
    quantity: 0,
    unit_price: 0,
    cost_price: 0,
    markup_percent: 0, // REQUIRED (0..100)
    discount_percent: null, // OPTIONAL (0..100)
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

  const [validationErrors, setValidationErrors] = useState({
    product_name: false,
    category: false,
    subcategory: false,
    unit: false,
    quantity: false,
    cost_price: false,
    markup_percent: false,
    discount_percent: false,
    pieces_per_unit: false,
    weight_per_piece_kg: false,
    ceiling_qty: false,
    pricing_below_cost: false,
  });

  /* -------------------- Low stock manual sender -------------------- */
  async function triggerLowStockEmail() {
    try {
      setSendingLowStock(true);
      const res = await fetch("/api/alerts/low-stock/run", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        toast.error(`Low-stock email failed: ${j?.reason || j?.error || "Unknown error"}`);
        return;
      }
      if ((j.count || 0) === 0) toast.info("No low/zero stock items found.");
      else toast.success(`Low-stock email sent. Included ${j.count} item(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send low-stock email.");
    } finally {
      setSendingLowStock(false);
    }
  }

  /* ---------------------- Fetching ---------------------- */
  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select(
        "id, sku, product_name, category, subcategory, unit, quantity, unit_price, cost_price, markup_percent, discount_percent, amount, profit, date_created, status, image_url, weight_per_piece_kg, pieces_per_unit, total_weight_kg, expiration_date, ceiling_qty, stock_level"
      )
      .order("date_created", { ascending: false });

    if (error) console.error(error);
    else if (data) setItems(data as InventoryItem[]);
    setLoading(false);
  };

  const fetchDropdownOptions = async () => {
    const { data, error } = await supabase.from("inventory").select("category, subcategory, unit");
    if (error) {
      console.error("Failed to fetch dropdown options:", error);
      return;
    }
    const unique = (values: (string | null)[]) => [...new Set(values.filter(Boolean))] as string[];
    setCategoryOptions(unique(data.map((i) => i.category)));
    setSubcategoryOptions(unique(data.map((i) => i.subcategory)));
    setUnitOptions(unique(data.map((i) => i.unit)));
  };

  useEffect(() => {
    fetchItems();
    fetchDropdownOptions();
  }, []);

  /* ---------------------- Realtime subscription --------------------- */
  useEffect(() => {
    const channel = supabase
      .channel("realtime-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        fetchItems();
        fetchDropdownOptions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* --------------------- Auto defaults for some units -------------------- */
  useEffect(() => {
    const u = newItem.unit;
    if (u === "Kg") {
      setNewItem((prev) => ({ ...prev, pieces_per_unit: 1, weight_per_piece_kg: 1 }));
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

  /* --------------------------- Compute weight ---------------------------- */
  useEffect(() => {
    const weightPerPiece = newItem.unit === "Kg" ? 1 : Number(newItem.weight_per_piece_kg) || 0;
    const piecesPerUnit =
      newItem.unit === "Kg"
        ? 1
        : Number(newItem.pieces_per_unit) || (newItem.unit === "Piece" ? 1 : newItem.unit === "Dozen" ? 12 : 0);
    const qty = Number(newItem.quantity) || 0;
    const total = weightPerPiece > 0 && piecesPerUnit > 0 && qty > 0 ? weightPerPiece * piecesPerUnit * qty : 0;
    setNewItem((prev) => ({ ...prev, total_weight_kg: total || null }));
  }, [newItem.unit, newItem.weight_per_piece_kg, newItem.pieces_per_unit, newItem.quantity]);

  /* -------------------- PRICE LOGIC (Markup required, Discount optional) -------------------- */
  useEffect(() => {
    const cost = Number(newItem.cost_price) || 0;

    const markup = clamp(Number(newItem.markup_percent) || 0, 0, LIMITS.MAX_MARKUP_PERCENT);

    const baseSelling = cost + (cost * markup) / 100; // selling before discount

    const discountRaw = newItem.discount_percent;
    const discount = discountRaw === null || discountRaw === undefined || discountRaw === ("" as any)
      ? 0
      : clamp(Number(discountRaw) || 0, 0, LIMITS.MAX_DISCOUNT_PERCENT);

    const discountedSelling = baseSelling * (1 - discount / 100);

    const qty = Number(newItem.quantity) || 0;

    const belowCost = discountedSelling + 1e-9 < cost; // allow tiny float

    setNewItem((prev) => ({
      ...prev,
      markup_percent: markup,
      discount_percent: discountRaw === null || discountRaw === undefined || discountRaw === ("" as any) ? null : discount,
      unit_price: parseFloat((belowCost ? cost : discountedSelling).toFixed(2)),
      amount: (belowCost ? cost : discountedSelling) * qty,
      profit: ((belowCost ? cost : discountedSelling) - cost) * qty,
    }));

    setValidationErrors((prev) => ({ ...prev, pricing_below_cost: belowCost }));
  }, [newItem.cost_price, newItem.markup_percent, newItem.discount_percent, newItem.quantity]);

  /* ----------------------------- Validation ----------------------------- */
  useEffect(() => {
    setValidationErrors((prev) => ({
      ...prev,
      product_name: !newItem.product_name.trim(),
      category: !(newItem.category || "").trim(),
      subcategory: !(newItem.subcategory || "").trim(),
      unit: !(newItem.unit || "").trim(),
      quantity: newItem.quantity < 0 || newItem.quantity > LIMITS.MAX_QUANTITY,
      cost_price:
        newItem.cost_price === null || newItem.cost_price < 0 || newItem.cost_price > LIMITS.MAX_COST_PRICE,
      markup_percent:
        newItem.markup_percent === null ||
        newItem.markup_percent < 0 ||
        newItem.markup_percent > LIMITS.MAX_MARKUP_PERCENT,
      discount_percent:
        newItem.discount_percent !== null &&
        (newItem.discount_percent < 0 || newItem.discount_percent > LIMITS.MAX_DISCOUNT_PERCENT),
      pieces_per_unit:
        (newItem.unit === "Box" || newItem.unit === "Pack") && (!newItem.pieces_per_unit || newItem.pieces_per_unit <= 0),
      weight_per_piece_kg:
        newItem.unit !== "Kg" && newItem.weight_per_piece_kg !== null
          ? newItem.weight_per_piece_kg < 0 || newItem.weight_per_piece_kg > LIMITS.MAX_WEIGHT_PER_PIECE_KG
          : false,
      ceiling_qty: newItem.ceiling_qty != null && newItem.ceiling_qty < 0,
    }));
  }, [newItem]);

  // Optional guard: quantity must not exceed ceiling if set
  useEffect(() => {
    const over = newItem.ceiling_qty != null && newItem.ceiling_qty > 0 && newItem.quantity > newItem.ceiling_qty;
    if (over) toast.error("Quantity cannot exceed ceiling stock.");
  }, [newItem.quantity, newItem.ceiling_qty]);

  /* ------------------------------ Uploads -------------------------------- */
  const handleImageSelect = (file: File | null) => {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const uploadImageAndGetUrl = async (file: File, skuForName: string) => {
    const ext = file.name.split(".").pop() || "jpg";
    const safeSku = (skuForName || "item").replace(/\s+/g, "-").toLowerCase();
    const path = `${safeSku}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadErr) throw uploadErr;
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrlData.publicUrl;
  };

  const handleGallerySelect = (files: FileList | null) => {
    const arr = files ? Array.from(files) : [];
    const filtered: File[] = [];
    for (const f of arr) {
      if (!ALLOWED_MIME.has(f.type)) {
        toast.error(`"${f.name}" is not a supported image type.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" is larger than 5MB.`);
        continue;
      }
      filtered.push(f);
      if (filtered.length >= MAX_GALLERY) break;
    }
    setGalleryFiles(filtered);
    setGalleryPreviews(filtered.map((f) => URL.createObjectURL(f)));
  };

  const uploadGalleryAndReturnUrls = async (files: File[], skuForName: string) => {
    const folder = safeSlug(skuForName);
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split(".").pop() || "jpg";
      const path = `${folder}/${Date.now()}-${i}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  };

  const listGalleryUrls = async (skuOrName: string, primary?: string | null) => {
    const folder = safeSlug(skuOrName);
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
      limit: 50,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) console.warn("List gallery error:", error.message);

    const fileUrls =
      data?.map((f) => {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${folder}/${f.name}`);
        return data.publicUrl;
      }) || [];

    const all = [...(primary ? [primary] : []), ...fileUrls];
    return Array.from(new Set(all)).slice(0, MAX_GALLERY);
  };

  const openImageModal = async (item: InventoryItem) => {
    setImageModalItem(item);
    const imgs = await listGalleryUrls(item.sku || item.product_name, item.image_url);
    setModalImages(imgs);
    setModalIndex(0);
    setShowImageModal(true);
  };

  /* ------------------------------- Save ---------------------------------- */
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
        ? Number(pieces_per_unit) * Number(weight_per_piece_kg) * Number(quantity || 0)
        : null;
    return {
      pieces_per_unit: pieces_per_unit ?? null,
      weight_per_piece_kg: weight_per_piece_kg ?? null,
      total_weight_kg,
    };
  };

  const handleSubmitItem = async () => {
    try {
      const errors = {
        product_name: !newItem.product_name.trim(),
        category: !(newItem.category || "").trim(),
        subcategory: !(newItem.subcategory || "").trim(),
        unit: !(newItem.unit || "").trim(),
        quantity: newItem.quantity < 0 || newItem.quantity > LIMITS.MAX_QUANTITY,
        cost_price:
          newItem.cost_price === null || newItem.cost_price < 0 || newItem.cost_price > LIMITS.MAX_COST_PRICE,
        markup_percent:
          newItem.markup_percent === null ||
          newItem.markup_percent < 0 ||
          newItem.markup_percent > LIMITS.MAX_MARKUP_PERCENT,
        discount_percent:
          newItem.discount_percent !== null &&
          (newItem.discount_percent < 0 || newItem.discount_percent > LIMITS.MAX_DISCOUNT_PERCENT),
        pieces_per_unit:
          (newItem.unit === "Box" || newItem.unit === "Pack") && (!newItem.pieces_per_unit || newItem.pieces_per_unit <= 0),
        weight_per_piece_kg:
          newItem.unit !== "Kg" && newItem.weight_per_piece_kg !== null
            ? newItem.weight_per_piece_kg < 0 || newItem.weight_per_piece_kg > LIMITS.MAX_WEIGHT_PER_PIECE_KG
            : false,
        ceiling_qty: newItem.ceiling_qty != null && newItem.ceiling_qty < 0,
        pricing_below_cost: validationErrors.pricing_below_cost,
      };

      setValidationErrors((prev) => ({ ...prev, ...errors }));

      const hasErrors = Object.values(errors).some(Boolean);
      if (hasErrors) {
        if (errors.pricing_below_cost) {
          toast.error("Discount is too high. Selling price cannot go below Cost Price.");
        } else {
          toast.error("Please fill all required fields correctly.");
        }
        return;
      }

      if (newItem.ceiling_qty != null && newItem.ceiling_qty > 0 && newItem.quantity > newItem.ceiling_qty) {
        toast.error("Quantity cannot exceed ceiling stock.");
        return;
      }

      setSaving(true);

      let finalImageUrl = newItem.image_url || null;
      if (imageFile) {
        finalImageUrl = await uploadImageAndGetUrl(imageFile, newItem.sku || newItem.product_name);
      }

      if (galleryFiles.length) {
        try {
          await uploadGalleryAndReturnUrls(galleryFiles, newItem.sku || newItem.product_name);
        } catch (e: any) {
          console.warn("Gallery upload error:", e?.message || e);
          toast.error("Some additional photos failed to upload.");
        }
      }

      const normalized = normalizeForSave();
      const dataToSave = {
        ...newItem,
        ...normalized,
        image_url: finalImageUrl,
        date_created: new Date().toISOString(),
      };

      if (editingItemId !== null) {
        const { error } = await supabase.from("inventory").update(dataToSave).eq("id", editingItemId);
        if (error) throw error;
        toast.success("Item updated successfully!");

        await supabase.from("activity_logs").insert([
          {
            user_email: (await supabase.auth.getUser()).data.user?.email,
            user_role: "admin",
            action: "Update Item",
            details: { item_id: editingItemId, sku: newItem.sku, product_name: newItem.product_name },
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        const { error } = await supabase.from("inventory").insert([dataToSave]);
        if (error) throw error;
        toast.success("New item added successfully!");

        await supabase.from("activity_logs").insert([
          {
            user_email: (await supabase.auth.getUser()).data.user?.email,
            user_role: "admin",
            action: "Add Item",
            details: { sku: newItem.sku, product_name: newItem.product_name },
            created_at: new Date().toISOString(),
          },
        ]);
      }

      // reset
      setNewItem({
        sku: "",
        product_name: "",
        category: "",
        subcategory: "",
        unit: "",
        quantity: 0,
        unit_price: 0,
        cost_price: 0,
        markup_percent: 0,
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

      setImageFile(null);
      setImagePreview(null);
      setGalleryFiles([]);
      setGalleryPreviews([]);
      setShowForm(false);
      setEditingItemId(null);

      await fetchItems();
      await fetchDropdownOptions();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(`Error saving item: ${err.message || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------ Filtering / Sorting / Paging ------------------------------ */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.sku} ${item.product_name} ${item.category ?? ""} ${item.subcategory ?? ""} ${item.unit ?? ""}`
        .toLowerCase()
        .includes(q)
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
  const paged = sorted.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  useEffect(() => setCurrentPage(1), [searchQuery, sortKey, sortDir]);

  /* ---------------------- Options automation (3 features) ---------------------- */
  // 1) Subcategory filtered by category
  const subcategoryFiltered = useMemo(() => {
    const cat = (newItem.category || "").trim();
    if (!cat) return subcategoryOptions;
    // Because your DB stores subcategory alone (no mapping), we approximate:
    // show all subcategories BUT keep the UX “filtered” by prioritizing those used with this category
    // by scanning existing items.
    const used = new Set(
      items.filter((it) => (it.category || "").trim() === cat).map((it) => (it.subcategory || "").trim()).filter(Boolean)
    );
    const usedList = Array.from(used);
    const others = subcategoryOptions.filter((s) => !used.has((s || "").trim()));
    return [...usedList, ...others].filter(Boolean);
  }, [items, subcategoryOptions, newItem.category]);

  // 2) Unit autosuggest by category
  const unitSuggested = useMemo(() => {
    const cat = (newItem.category || "").trim();
    if (!cat) return [...FIXED_UNIT_OPTIONS, ...unitOptions];
    const used = new Set(
      items.filter((it) => (it.category || "").trim() === cat).map((it) => (it.unit || "").trim()).filter(Boolean)
    );
    const fixed = FIXED_UNIT_OPTIONS.map(String);
    const usedList = Array.from(used);
    const extras = unitOptions.filter((u) => !fixed.includes(u) && !used.has((u || "").trim()));
    return Array.from(new Set([...usedList, ...fixed, ...extras])).filter(Boolean);
  }, [items, unitOptions, newItem.category]);

  // 3) Searchable dropdowns via shadcn Command (Category/Subcategory/Unit)
  const categoryList = useMemo(() => categoryOptions.slice().sort((a, b) => a.localeCompare(b)), [categoryOptions]);

  /* ------------------------------ UI helpers ------------------------------ */
  const cell = "px-4 py-2 text-left align-middle";
  const cellNowrap = `${cell} whitespace-nowrap`;

  return (
    <>
      <div className="px-4 pb-4 pt-1">
        <h1 className="text-3xl font-bold mt-1">Inventory</h1>
        <p className="text-neutral-500 text-sm mb-4">Manage and view all inventory items, categories, and stock levels.</p>

        <div className="flex flex-wrap gap-4 mb-4 items-center">
          <input
            className="border px-4 py-2 w-full sm:max-w-md rounded"
            placeholder="Search by SKU, product, category, subcategory, unit"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <button
            onClick={triggerLowStockEmail}
            disabled={sendingLowStock}
            className="px-4 py-2 rounded bg-black text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {sendingLowStock ? "Sending..." : "Send Low-Stock Alert"}
          </button>

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
                quantity: 0,
                unit_price: 0,
                cost_price: 0,
                markup_percent: 0,
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
              setImageFile(null);
              setImagePreview(null);
              setGalleryFiles([]);
              setGalleryPreviews([]);
              setIsCustomCategory(false);
              setIsCustomSubcategory(false);
              setIsCustomUnit(false);
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
                <th className={cellNowrap}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className={cellNowrap}>{item.sku}</td>

                  <td className="px-4 py-2 whitespace-normal break-words max-w-xs">
                    {item.image_url ? (
                      <button
                        className="text-blue-600 hover:underline font-medium text-left"
                        onClick={() => openImageModal(item)}
                        title="Click to view image"
                      >
                        {item.product_name}
                      </button>
                    ) : (
                      <span className="text-gray-800 font-medium text-left">{item.product_name}</span>
                    )}
                  </td>

                  <td className={cellNowrap}>{item.category || "—"}</td>
                  <td className={cellNowrap}>{item.subcategory || "—"}</td>
                  <td className={cellNowrap}>{item.unit || "—"}</td>

                  <td className={cellNowrap}>
                    <div className="flex items-center gap-2">
                      <span>{item.quantity}</span>
                      {item.ceiling_qty ? (
                        <div className="w-24 h-2 bg-gray-200 rounded overflow-hidden">
                          <div
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((item.quantity / Math.max(1, item.ceiling_qty)) * 100)
                              )}%`,
                            }}
                            className={`h-full ${
                              item.quantity / Math.max(1, item.ceiling_qty) <= 0.05
                                ? "bg-red-500"
                                : item.quantity / Math.max(1, item.ceiling_qty) <= 0.15
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            title={`${Math.round((item.quantity / Math.max(1, item.ceiling_qty)) * 100)}%`}
                          />
                        </div>
                      ) : null}
                    </div>
                  </td>

                  <td className={cellNowrap}>{item.cost_price != null ? peso(Number(item.cost_price)) : "—"}</td>
                  <td className={cellNowrap}>{item.markup_percent != null ? `${Number(item.markup_percent)}%` : "—"}</td>
                  <td className={cellNowrap}>
                    {item.discount_percent != null && Number(item.discount_percent) > 0 ? `${Number(item.discount_percent)}%` : "—"}
                  </td>

                  <td className={cellNowrap}>{item.unit_price != null ? peso(Number(item.unit_price)) : "—"}</td>
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
                      ? `${Number(item.total_weight_kg).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`
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
                      return <span className={`px-2 py-1 rounded text-xs font-semibold ${cls}`}>{lvl}</span>;
                    })()}
                  </td>

                  <td className={cellNowrap}>{new Date(item.date_created).toLocaleString("en-PH")}</td>

                  <td className={cellNowrap}>
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setShowForm(true);
                        setEditingItemId(item.id);
                        setNewItem({
                          ...item,
                          category: item.category || "",
                          subcategory: item.subcategory || "",
                          unit: item.unit || "",
                          cost_price: item.cost_price ?? 0,
                          markup_percent: item.markup_percent ?? 0,
                          discount_percent: item.discount_percent ?? null,
                          expiration_date: item.expiration_date ?? null,
                          ceiling_qty: item.ceiling_qty ?? null,
                          stock_level: item.stock_level ?? "In Stock",
                          unit_price: item.unit_price ?? 0,
                        });
                        setImageFile(null);
                        setImagePreview(item.image_url || null);
                        setGalleryFiles([]);
                        setGalleryPreviews([]);
                        setIsCustomCategory(false);
                        setIsCustomSubcategory(false);
                        setIsCustomUnit(false);
                      }}
                    >
                      Edit
                    </button>
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

        {/* Image Modal (slideshow) */}
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
                    setModalImages([]);
                    setModalIndex(0);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="p-3">
                {modalImages.length > 0 ? (
                  <div className="w-full">
                    <div className="relative w-full h-64 md:h-72 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                      <img
                        src={modalImages[modalIndex]}
                        alt={`${imageModalItem.product_name} ${modalIndex + 1}`}
                        className="max-h-full max-w-full object-contain"
                      />
                      {modalImages.length > 1 && (
                        <>
                          <button
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded"
                            onClick={() => setModalIndex((i) => (i - 1 + modalImages.length) % modalImages.length)}
                            title="Previous"
                          >
                            ‹
                          </button>
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded"
                            onClick={() => setModalIndex((i) => (i + 1) % modalImages.length)}
                            title="Next"
                          >
                            ›
                          </button>
                        </>
                      )}
                    </div>

                    {modalImages.length > 1 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {modalImages.map((u, idx) => (
                          <button
                            key={u + idx}
                            className={`h-12 w-16 flex-shrink-0 border rounded overflow-hidden ${
                              idx === modalIndex ? "ring-2 ring-[#ffba20]" : ""
                            }`}
                            onClick={() => setModalIndex(idx)}
                            title={`Image ${idx + 1}`}
                          >
                            <img src={u} alt={`thumb-${idx + 1}`} className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 border rounded p-6">No images found for this item.</div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">SKU:</span> {imageModalItem.sku || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Category:</span> {imageModalItem.category || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Subcategory:</span> {imageModalItem.subcategory || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Unit:</span> {imageModalItem.unit || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Quantity:</span> {imageModalItem.quantity}
                  </div>
                  <div>
                    <span className="font-medium">Pieces/Unit:</span> {imageModalItem.pieces_per_unit ?? "—"}
                  </div>
                  <div>
                    <span className="font-medium">Weight/Piece:</span>{" "}
                    {imageModalItem.weight_per_piece_kg ? `${imageModalItem.weight_per_piece_kg} kg` : "—"}
                  </div>
                  <div>
                    <span className="font-medium">Total Weight:</span>{" "}
                    {imageModalItem.total_weight_kg
                      ? `${Number(imageModalItem.total_weight_kg).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t text-right">
                <button
                  onClick={() => {
                    setShowImageModal(false);
                    setImageModalItem(null);
                    setModalImages([]);
                    setModalIndex(0);
                  }}
                  className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white p-8 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4">
              <h2 className="text-lg font-semibold">{editingItemId ? "Edit Item" : "Add New Item"}</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT */}
                <div className="space-y-3">
                  {/* SKU */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      SKU<span className="text-red-500">*</span>
                    </label>
                    <input
                      className="flex-1 border px-4 py-2 rounded"
                      placeholder="PRODUCT ID"
                      value={newItem.sku}
                      onChange={(e) => setNewItem((prev) => ({ ...prev, sku: e.target.value }))}
                    />
                  </div>

                  {/* Product Name */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="flex-1 border px-4 py-2 rounded"
                      placeholder="e.g. Boysen"
                      value={newItem.product_name}
                      onChange={(e) => setNewItem((prev) => ({ ...prev, product_name: e.target.value }))}
                    />
                  </div>

                  {/* Category (searchable) */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Category<span className="text-red-500">*</span>
                    </label>
                    <div className="flex-1 flex gap-2 items-center">
                      {isCustomCategory ? (
                        <input
                          className="flex-1 border px-4 py-2 rounded"
                          placeholder="Enter new category"
                          value={newItem.category || ""}
                          onChange={(e) =>
                            setNewItem((prev) => ({
                              ...prev,
                              category: e.target.value,
                              subcategory: "",
                            }))
                          }
                        />
                      ) : (
                        <Popover open={catOpen} onOpenChange={setCatOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={catOpen} className="w-full justify-between">
                              {newItem.category ? newItem.category : "Select Category"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
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
                                        setNewItem((prev) => ({ ...prev, category: c, subcategory: "" }));
                                        setCatOpen(false);
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", newItem.category === c ? "opacity-100" : "opacity-0")} />
                                      {c}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}

                      {!isCustomCategory && newItem.category && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                          onClick={() => {
                            setRenameFieldType("category");
                            setRenameOldValue(newItem.category || "");
                            setRenameNewValue(newItem.category || "");
                            setShowRenameModal(true);
                          }}
                        >
                          Rename option
                        </button>
                      )}

                      <label className="text-sm flex items-center gap-1">
                        <input type="checkbox" checked={isCustomCategory} onChange={(e) => setIsCustomCategory(e.target.checked)} /> New
                      </label>
                    </div>
                  </div>

                  {/* Subcategory (searchable; prioritized by category usage) */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Subcategory<span className="text-red-500">*</span>
                    </label>
                    <div className="flex-1 flex gap-2 items-center">
                      {isCustomSubcategory ? (
                        <input
                          className="flex-1 border px-4 py-2 rounded"
                          placeholder="Enter new subcategory"
                          value={newItem.subcategory || ""}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, subcategory: e.target.value }))}
                        />
                      ) : (
                        <Popover open={subOpen} onOpenChange={setSubOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={subOpen} className="w-full justify-between" disabled={!newItem.category}>
                              {newItem.subcategory ? newItem.subcategory : "Select Subcategory"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
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
                                        setNewItem((prev) => ({ ...prev, subcategory: s }));
                                        setSubOpen(false);
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", newItem.subcategory === s ? "opacity-100" : "opacity-0")} />
                                      {s}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}

                      {!isCustomSubcategory && newItem.subcategory && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                          onClick={() => {
                            setRenameFieldType("subcategory");
                            setRenameOldValue(newItem.subcategory || "");
                            setRenameNewValue(newItem.subcategory || "");
                            setShowRenameModal(true);
                          }}
                        >
                          Rename option
                        </button>
                      )}

                      <label className="text-sm flex items-center gap-1">
                        <input type="checkbox" checked={isCustomSubcategory} onChange={(e) => setIsCustomSubcategory(e.target.checked)} /> New
                      </label>
                    </div>
                  </div>

                  {/* Unit (searchable; suggested by category usage) */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Unit<span className="text-red-500">*</span>
                    </label>
                    <div className="flex-1 flex gap-2 items-center">
                      {isCustomUnit ? (
                        <input
                          className="flex-1 border px-4 py-2 rounded"
                          placeholder="Enter new unit"
                          value={newItem.unit || ""}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
                        />
                      ) : (
                        <Popover open={unitOpen} onOpenChange={setUnitOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={unitOpen} className="w-full justify-between">
                              {newItem.unit ? newItem.unit : "Select Unit"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
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
                                      <Check className={cn("mr-2 h-4 w-4", newItem.unit === u ? "opacity-100" : "opacity-0")} />
                                      {u}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}

                      {!isCustomUnit && newItem.unit && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                          onClick={() => {
                            setRenameFieldType("unit");
                            setRenameOldValue(newItem.unit || "");
                            setRenameNewValue(newItem.unit || "");
                            setShowRenameModal(true);
                          }}
                        >
                          Rename option
                        </button>
                      )}

                      <label className="text-sm flex items-center gap-1">
                        <input type="checkbox" checked={isCustomUnit} onChange={(e) => setIsCustomUnit(e.target.checked)} /> New
                      </label>
                    </div>
                  </div>

                  {/* Pieces per Unit (conditional) */}
                  {newItem.unit && newItem.unit !== "Piece" && newItem.unit !== "Dozen" && newItem.unit !== "Kg" && (
                    <div className="flex items-center gap-2">
                      <label className="w-40 md:w-44 text-sm text-gray-700">
                        Pieces per {newItem.unit}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={`flex-1 border px-4 py-2 rounded ${validationErrors.pieces_per_unit ? "border-red-500" : ""}`}
                        placeholder={`e.g. 24 pieces per ${(newItem.unit || "").toLowerCase()}`}
                        value={newItem.pieces_per_unit ?? ""}
                        onChange={(e) =>
                          setNewItem((prev) => ({
                            ...prev,
                            pieces_per_unit: Math.max(1, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  )}
                </div>

                {/* RIGHT */}
                <div className="space-y-3">
                  {/* Weight / piece */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">Weight / piece (kg)</label>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_WEIGHT_PER_PIECE_KG}
                      step="0.001"
                      inputMode="decimal"
                      title={`Max ${LIMITS.MAX_WEIGHT_PER_PIECE_KG} kg per piece`}
                      className={`flex-1 border px-4 py-2 rounded ${validationErrors.weight_per_piece_kg ? "border-red-500" : ""}`}
                      placeholder={newItem.unit === "Kg" ? "1 (auto for Kg items)" : "e.g. 0.45"}
                      value={newItem.unit === "Kg" ? 1 : newItem.weight_per_piece_kg ?? ""}
                      disabled={newItem.unit === "Kg"}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_WEIGHT_PER_PIECE_KG);
                        setNewItem((prev) => ({ ...prev, weight_per_piece_kg: newItem.unit === "Kg" ? 1 : val }));
                      }}
                    />
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Quantity<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_QUANTITY}
                      step="1"
                      inputMode="numeric"
                      title={`Max ${LIMITS.MAX_QUANTITY.toLocaleString()} units`}
                      className={`flex-1 border px-4 py-2 rounded ${validationErrors.quantity ? "border-red-500" : ""}`}
                      value={newItem.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value || "0", 10) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_QUANTITY);
                        setNewItem((prev) => ({ ...prev, quantity: val }));
                      }}
                    />
                  </div>

                  {/* Ceiling */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">Ceiling (Max Stock)</label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      className={`flex-1 border px-4 py-2 rounded ${validationErrors.ceiling_qty ? "border-red-500" : ""}`}
                      placeholder="Optional max stock (for Low/Critical)"
                      value={newItem.ceiling_qty ?? ""}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          ceiling_qty: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value || "0", 10)),
                        }))
                      }
                    />
                  </div>

                  {/* Cost Price */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Cost Price<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_COST_PRICE}
                      step="0.01"
                      inputMode="decimal"
                      className={`flex-1 border px-4 py-2 rounded ${validationErrors.cost_price ? "border-red-500" : ""}`}
                      placeholder="₱ capital per unit"
                      value={newItem.cost_price ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_COST_PRICE);
                        setNewItem((prev) => ({ ...prev, cost_price: val }));
                      }}
                    />
                  </div>

                  {/* Markup (REQUIRED) */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">
                      Markup (%)<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_MARKUP_PERCENT}
                      step="0.01"
                      inputMode="decimal"
                      className={`flex-1 border px-4 py-2 rounded ${validationErrors.markup_percent ? "border-red-500" : ""}`}
                      placeholder="e.g. 20"
                      value={newItem.markup_percent ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const val = clamp(raw, 0, LIMITS.MAX_MARKUP_PERCENT);
                        setNewItem((prev) => ({ ...prev, markup_percent: val }));
                      }}
                    />
                  </div>

                  {/* Discount (OPTIONAL) */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">Discount (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={LIMITS.MAX_DISCOUNT_PERCENT}
                      step="0.01"
                      inputMode="decimal"
                      className={`flex-1 border px-4 py-2 rounded ${
                        validationErrors.discount_percent || validationErrors.pricing_below_cost ? "border-red-500" : ""
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
                  </div>

                  {validationErrors.pricing_below_cost && (
                    <div className="text-xs text-red-600 ml-[11.25rem]">
                      Discount is too high — selling price cannot go below cost price.
                    </div>
                  )}

                  {/* Expiration Date */}
                  <div className="flex items-center gap-2">
                    <label className="w-40 md:w-44 text-sm text-gray-700">Expiration Date</label>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="date"
                        className="flex-1 border px-4 py-2 rounded"
                        value={newItem.expiration_date ? newItem.expiration_date.slice(0, 10) : ""}
                        onChange={(e) =>
                          setNewItem((prev) => ({
                            ...prev,
                            expiration_date: e.target.value ? e.target.value : null,
                          }))
                        }
                      />
                      {newItem.expiration_date && (
                        <button
                          className="text-xs text-red-500 underline"
                          type="button"
                          onClick={() => setNewItem((prev) => ({ ...prev, expiration_date: null }))}
                          title="Clear date"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="border-t pt-4 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2 justify-center">
                    <label className="w-40 text-sm text-gray-700 text-right">Unit Price (auto)</label>
                    <input type="text" className="border px-4 py-2 rounded bg-gray-100 text-gray-600 w-48" value={peso(Number(newItem.unit_price || 0))} readOnly disabled />
                  </div>
                  <div className="flex items-center gap-2 justify-center">
                    <label className="w-40 text-sm text-gray-700 text-right">Total Price</label>
                    <input type="text" className="border px-4 py-2 rounded bg-gray-100 text-gray-600 w-48" value={peso(Number(newItem.amount || 0))} readOnly disabled />
                  </div>
                  <div className="flex items-center gap-2 justify-center">
                    <label className="w-40 text-sm text-gray-700 text-right">Total Weight</label>
                    <input
                      type="text"
                      className="border px-4 py-2 rounded bg-gray-100 text-gray-600 w-48"
                      value={
                        newItem.total_weight_kg
                          ? `${Number(newItem.total_weight_kg).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`
                          : "—"
                      }
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* Image upload */}
              <div>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (!f) return handleImageSelect(null);
                    if (!ALLOWED_MIME.has(f.type)) {
                      toast.error("Please upload an image file (JPG, PNG, WEBP, or GIF).");
                      e.currentTarget.value = "";
                      return handleImageSelect(null);
                    }
                    if (f.size > MAX_BYTES) {
                      toast.error("Image too large. Max size is 5 MB.");
                      e.currentTarget.value = "";
                      return handleImageSelect(null);
                    }
                    handleImageSelect(f);
                  }}
                  className="block w-full text-sm text-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">Accepted formats: JPG, PNG, WEBP, GIF · Max 5MB</p>

                {imagePreview && (
                  <button type="button" onClick={() => handleImageSelect(null)} className="mt-2 text-xs text-red-600 underline">
                    Remove selected image
                  </button>
                )}
              </div>

              {/* Gallery */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Photos (up to {MAX_GALLERY})
                </label>
                <input type="file" multiple accept="image/png, image/jpeg, image/webp, image/gif" onChange={(e) => handleGallerySelect(e.target.files)} className="block w-full text-sm text-gray-700" />
                <p className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP, GIF · Max 5MB each</p>

                {galleryPreviews.length > 0 && (
                  <>
                    <div className="mt-2 text-xs text-gray-600">
                      Selected {galleryPreviews.length}/{MAX_GALLERY}
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {galleryPreviews.map((src, i) => (
                        <div key={i} className="h-20 w-24 border rounded overflow-hidden">
                          <img src={src} className="h-full w-full object-cover" alt={`preview-${i + 1}`} />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGalleryFiles([]);
                        setGalleryPreviews([]);
                      }}
                      className="mt-2 text-xs text-red-600 underline"
                    >
                      Clear additional photos
                    </button>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setImageFile(null);
                    setImagePreview(null);
                    setGalleryFiles([]);
                    setGalleryPreviews([]);
                  }}
                  className="bg-gray-300 px-4 py-2 rounded"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSubmitItem}
                  disabled={saving}
                  className={`bg-black text-white px-4 py-2 rounded hover:text-[#ffba20] ${saving ? "opacity-70 pointer-events-none" : ""}`}
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
                Rename{" "}
                {renameFieldType && renameFieldType.charAt(0).toUpperCase() + renameFieldType.slice(1)}
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
              <button className="px-4 py-2 rounded bg-gray-200" onClick={() => setShowRenameModal(false)}>
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                disabled={renaming || !renameNewValue.trim() || renameNewValue.trim() === renameOldValue}
                onClick={async () => {
                  if (!renameFieldType || !renameOldValue || !renameNewValue.trim()) return;
                  setRenaming(true);
                  const { error } = await supabase
                    .from("inventory")
                    .update({ [renameFieldType]: renameNewValue.trim() })
                    .eq(renameFieldType, renameOldValue);
                  setRenaming(false);

                  if (error) {
                    toast.error(`Failed to rename: ${error.message}`);
                  } else {
                    toast.success(`Renamed "${renameOldValue}" to "${renameNewValue.trim()}".`);
                    setShowRenameModal(false);
                    await fetchDropdownOptions();
                    await fetchItems();

                    setNewItem((prev) =>
                      renameFieldType === "category"
                        ? { ...prev, category: renameNewValue.trim(), subcategory: "" }
                        : renameFieldType === "subcategory"
                        ? { ...prev, subcategory: renameNewValue.trim() }
                        : { ...prev, unit: renameNewValue.trim() }
                    );
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
