"use client";

import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";
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
  cost_price: number | null;
  amount: number;
  profit: number | null;
  date_created: string;
  status: string;
  image_url?: string | null;
  weight_per_piece_kg: number | null;
  pieces_per_unit: number | null;
  total_weight_kg: number | null;
};

const FIXED_UNIT_OPTIONS = ["Piece", "Dozen", "Box", "Pack", "Kg"] as const;
type FixedUnit = (typeof FIXED_UNIT_OPTIONS)[number];

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    product_name: "",
    category: "",
    quantity: 0,
    subcategory: "",
    unit: "",
    unit_price: 0,
    cost_price: 0,
    amount: 0,
    profit: 0,
    date_created: new Date().toISOString(),
    status: "",
    image_url: null,
    weight_per_piece_kg: null,
    pieces_per_unit: null,
    total_weight_kg: null,
  });

  const [validationErrors, setValidationErrors] = useState({
    product_name: false,
    category: false,
    subcategory: false,
    unit: false,
    quantity: false,
    unit_price: false,
    cost_price: false,
    pieces_per_unit: false,
    weight_per_piece_kg: false,
  });

  useEffect(() => {
    const unit_price = Number(newItem.unit_price) || 0;
    const cost_price = Number(newItem.cost_price) || 0;
    const quantity = Number(newItem.quantity) || 0;
    const amount = unit_price * quantity;
    const profit = (unit_price - cost_price) * quantity;
    setNewItem((prev) => ({
      ...prev,
      amount,
      profit,
    }));
  }, [newItem.unit_price, newItem.cost_price, newItem.quantity]);

  useEffect(() => {
    setValidationErrors((prev) => ({
      ...prev,
      product_name: !newItem.product_name.trim(),
      category: !newItem.category.trim(),
      subcategory: !newItem.subcategory.trim(),
      unit: !newItem.unit.trim(),
      quantity: newItem.quantity < 0,
      unit_price: newItem.unit_price < 0,
      cost_price:
        newItem.cost_price === null ||
        newItem.cost_price === undefined ||
        newItem.cost_price < 0 ||
        (newItem.unit_price !== undefined &&
          newItem.cost_price > newItem.unit_price),
      pieces_per_unit:
        (newItem.unit === "Box" || newItem.unit === "Pack") &&
        (!newItem.pieces_per_unit || newItem.pieces_per_unit <= 0),
      weight_per_piece_kg:
        newItem.unit !== "Kg" && newItem.weight_per_piece_kg !== null
          ? newItem.weight_per_piece_kg < 0
          : false,
    }));
  }, [newItem]);

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
      setNewItem((prev) => ({
        ...prev,
        pieces_per_unit: 1,
      }));
      return;
    }
    if (u === "Dozen") {
      setNewItem((prev) => ({
        ...prev,
        pieces_per_unit: 12,
      }));
      return;
    }
  }, [newItem.unit]);

  useEffect(() => {
    const weightPerPiece =
      newItem.unit === "Kg" ? 1 : Number(newItem.weight_per_piece_kg) || 0;
    const piecesPerUnit =
      newItem.unit === "Kg"
        ? 1
        : Number(newItem.pieces_per_unit) ||
          (newItem.unit === "Piece" ? 1 : newItem.unit === "Dozen" ? 12 : 0);
    const qty = Number(newItem.quantity) || 0;
    const total =
      weightPerPiece > 0 && piecesPerUnit > 0 && qty > 0
        ? weightPerPiece * piecesPerUnit * qty
        : 0;
    setNewItem((prev) => ({
      ...prev,
      total_weight_kg: total || null,
    }));
  }, [
    newItem.unit,
    newItem.weight_per_piece_kg,
    newItem.pieces_per_unit,
    newItem.quantity,
  ]);

  const BUCKET = "inventory-images";

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("date_created", { ascending: false });
    if (error) {
      console.error(error);
    } else if (data) {
      setItems(data as InventoryItem[]);
    }
    setLoading(false);
  };

  const fetchDropdownOptions = async () => {
    const { data, error } = await supabase
      .from("inventory")
      .select("category, subcategory, unit");
    if (error) {
      console.error("Failed to fetch dropdown options:", error);
      return;
    }
    const unique = (values: (string | null)[]) =>
      [...new Set(values.filter(Boolean))] as string[];
    setCategoryOptions(unique(data.map((i) => i.category)));
    setSubcategoryOptions(unique(data.map((i) => i.subcategory)));
    setUnitOptions(unique(data.map((i) => i.unit)));
  };

  useEffect(() => {
    fetchItems();
    fetchDropdownOptions();
  }, []);

  const handleImageSelect = (file: File | null) => {
    setImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  };

  const uploadImageAndGetUrl = async (file: File, skuForName: string) => {
    const ext = file.name.split(".").pop() || "jpg";
    const safeSku = (skuForName || "item").replace(/\s+/g, "-").toLowerCase();
    const path = `${safeSku}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadErr) throw uploadErr;
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);
    return publicUrlData.publicUrl;
  };

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
      total_weight_kg,
    };
  };

  const handleSubmitItem = async () => {
    try {
      const errors = {
        product_name: !newItem.product_name,
        category: !newItem.category,
        subcategory: !newItem.subcategory,
        unit: !newItem.unit,
        quantity: newItem.quantity < 0,
        unit_price: newItem.unit_price < 0,
        cost_price:
          newItem.cost_price === null ||
          newItem.cost_price === undefined ||
          newItem.cost_price < 0 ||
          (newItem.unit_price !== undefined &&
            newItem.cost_price > newItem.unit_price),
        pieces_per_unit:
          (newItem.unit === "Box" || newItem.unit === "Pack") &&
          (!newItem.pieces_per_unit || newItem.pieces_per_unit <= 0),
        weight_per_piece_kg:
          newItem.unit !== "Kg" && newItem.weight_per_piece_kg !== null
            ? newItem.weight_per_piece_kg < 0
            : false,
      };
      setValidationErrors(errors);
      const hasErrors = Object.values(errors).some(Boolean);
      if (hasErrors) {
        toast.error("Costing Price should be lower than Unit Price.");
        return;
      }
      if (
        newItem.cost_price !== null &&
        newItem.unit_price !== null &&
        newItem.cost_price > newItem.unit_price
      ) {
        toast.error("Cost price cannot be greater than unit price. Please check your values.");
        return;
      }
      setSaving(true);
      let finalImageUrl = newItem.image_url || null;
      if (imageFile) {
        finalImageUrl = await uploadImageAndGetUrl(
          imageFile,
          newItem.sku || newItem.product_name
        );
      }
      const normalized = normalizeForSave();
      const profit = (Number(newItem.unit_price) - Number(newItem.cost_price)) * Number(newItem.quantity);
      const dataToSave = {
        ...newItem,
        ...normalized,
        image_url: finalImageUrl,
        date_created: new Date().toISOString(),
        profit,
      };
      if (editingItemId !== null) {
        const { error } = await supabase
          .from("inventory")
          .update(dataToSave)
          .eq("id", editingItemId);
        if (error) throw error;
        toast.success("Item updated successfully!");
        await supabase.from("activity_logs").insert([
          {
            user_email: (await supabase.auth.getUser()).data.user?.email,
            user_role: "admin",
            action: "Update Item",
            details: {
              item_id: editingItemId,
              sku: newItem.sku,
              product_name: newItem.product_name,
            },
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
            details: {
              sku: newItem.sku,
              product_name: newItem.product_name,
            },
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setNewItem({
        sku: "",
        product_name: "",
        category: "",
        quantity: 0,
        subcategory: "",
        unit: "",
        unit_price: 0,
        cost_price: 0,
        amount: 0,
        profit: 0,
        date_created: new Date().toISOString(),
        status: "",
        image_url: null,
        weight_per_piece_kg: null,
        pieces_per_unit: null,
        total_weight_kg: null,
      });
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      setEditingItemId(null);
      fetchItems();
      fetchDropdownOptions();
    } catch (err: any) {
      console.error("Update error:", err);
      toast.error(
        `Error saving item: ${err.message || JSON.stringify(err)}`
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items
    .filter((item) =>
      `${item.product_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);

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

  const cell = "px-4 py-2 text-left align-middle";
  const cellNowrap = `${cell} whitespace-nowrap`;

  return (
    <div className="px-4 pb-4 pt-1">
      <h1 className="text-3xl font-bold mt-1">Inventory</h1>
      <p className="text-neutral-500 text-sm mb-4">
        Manage and view all inventory items, categories, and stock levels.
      </p>
      <div className="flex gap-4 mb-4">
        <input
          className="border px-4 py-2 w-full max-w-md rounded"
          placeholder="Search by product name"
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
              quantity: 0,
              subcategory: "",
              unit: "",
              unit_price: 0,
              cost_price: 0,
              amount: 0,
              profit: 0,
              date_created: new Date().toISOString(),
              status: "",
              image_url: null,
              weight_per_piece_kg: null,
              pieces_per_unit: null,
              total_weight_kg: null,
            });
            setImageFile(null);
            setImagePreview(null);
          }}
        >
          Add New Item
        </button>
      </div>
      <div className="overflow-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className={cellNowrap}>SKU</th>
              <th className={cellNowrap}>Product</th>
              <th className={cellNowrap}>Category</th>
              <th className={cellNowrap}>Subcategory</th>
              <th className={cellNowrap}>Unit</th>
              <th className={cellNowrap}>Quantity</th>
              <th className={cellNowrap}>Unit Price</th>
              <th className={cellNowrap}>Cost Price</th>
              <th className={cellNowrap}>Total</th>
              <th className={cellNowrap}>Profit</th>
              <th className={cellNowrap}>Total Weight</th>
              <th className={cellNowrap}>Status</th>
              <th className={cellNowrap}>Date</th>
              <th className={cellNowrap}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
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
                    <span className="text-gray-800 font-medium text-left">
                      {item.product_name}
                    </span>
                  )}
                </td>
                <td className={cellNowrap}>{item.category}</td>
                <td className={cellNowrap}>{item.subcategory}</td>
                <td className={cellNowrap}>{item.unit}</td>
                <td className={cellNowrap}>{item.quantity}</td>
                <td className={cellNowrap}>
                  ₱{item.unit_price.toLocaleString()}
                </td>
                <td className={cellNowrap}>
                  {item.cost_price !== null && item.cost_price !== undefined
                    ? `₱${item.cost_price.toLocaleString()}`
                    : "—"}
                </td>
                <td className={cellNowrap}>₱{item.amount.toLocaleString()}</td>
                <td className={cellNowrap}>
                  ₱{(item.profit ?? (item.unit_price - (item.cost_price ?? 0)) * item.quantity).toLocaleString()}
                </td>
                <td className={cellNowrap}>
                  {item.total_weight_kg
                    ? `${item.total_weight_kg.toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })} kg`
                    : "—"}
                </td>
                <td className={cellNowrap}>
                  <span
                    className={`font-semibold px-2 py-1 rounded ${
                      item.status === "In Stock"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className={cellNowrap}>
                  {new Date(item.date_created).toLocaleString("en-PH")}
                </td>
                <td className={cellNowrap}>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setShowForm(true);
                      setEditingItemId(item.id);
                      setNewItem({
                        ...item,
                        cost_price:
                          item.cost_price !== null && item.cost_price !== undefined
                            ? item.cost_price
                            : 0,
                      });
                      setImageFile(null);
                      setImagePreview(item.image_url || null);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && !loading && (
              <tr>
                <td
                  className="px-4 py-6 text-center text-gray-500"
                  colSpan={14}
                >
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-between items-center">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>
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
                  <span className="font-medium">SKU:</span>{" "}
                  {imageModalItem.sku || "—"}
                </div>
                <div>
                  <span className="font-medium">Category:</span>{" "}
                  {imageModalItem.category || "—"}
                </div>
                <div>
                  <span className="font-medium">Subcategory:</span>{" "}
                  {imageModalItem.subcategory || "—"}
                </div>
                <div>
                  <span className="font-medium">Unit:</span>{" "}
                  {imageModalItem.unit || "—"}
                </div>
                <div>
                  <span className="font-medium">Quantity:</span>{" "}
                  {imageModalItem.quantity}
                </div>
                <div>
                  <span className="font-medium">Pieces/Unit:</span>{" "}
                  {imageModalItem.pieces_per_unit ?? "—"}
                </div>
                <div>
                  <span className="font-medium">Weight/Piece:</span>{" "}
                  {imageModalItem.weight_per_piece_kg
                    ? `${imageModalItem.weight_per_piece_kg} kg`
                    : "—"}
                </div>
                <div>
                  <span className="font-medium">Total Weight:</span>{" "}
                  {imageModalItem.total_weight_kg
                    ? `${imageModalItem.total_weight_kg.toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 3,
                        }
                      )} kg`
                    : "—"}
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
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold">
              {editingItemId ? "Edit Item" : "Add New Item"}
            </h2>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                SKU<span className="text-red-500">*</span>
              </label>
              <input
                className="flex-1 border px-4 py-2 rounded"
                placeholder="PRODUCT ID"
                value={newItem.sku}
                onChange={(e) =>
                  setNewItem((prev) => ({ ...prev, sku: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                className="flex-1 border px-4 py-2 rounded"
                placeholder="e.g. Boysen"
                value={newItem.product_name}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    product_name: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Category<span className="text-red-500">*</span>
              </label>
              <div className="flex-1 flex gap-2">
                {isCustomCategory ? (
                  <input
                    className="flex-1 border px-4 py-2 rounded"
                    placeholder="Enter new category"
                    value={newItem.category}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <select
                    value={newItem.category}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        category: e.target.value,
                        subcategory: "",
                      }))
                    }
                    className="flex-1 border px-4 py-2 rounded"
                  >
                    <option value="">Select Category</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomCategory}
                    onChange={(e) => setIsCustomCategory(e.target.checked)}
                  />{" "}
                  New
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Subcategory<span className="text-red-500">*</span>
              </label>
              <div className="flex-1 flex gap-2">
                {isCustomSubcategory ? (
                  <input
                    className="flex-1 border px-4 py-2 rounded"
                    placeholder="Enter new subcategory"
                    value={newItem.subcategory}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        subcategory: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <select
                    value={newItem.subcategory}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        subcategory: e.target.value,
                      }))
                    }
                    disabled={!newItem.category}
                    className="flex-1 border px-4 py-2 rounded"
                  >
                    <option value="">Select Subcategory</option>
                    {subcategoryOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomSubcategory}
                    onChange={(e) => setIsCustomSubcategory(e.target.checked)}
                  />{" "}
                  New
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Unit<span className="text-red-500">*</span>
              </label>
              <div className="flex-1 flex gap-2">
                {isCustomUnit ? (
                  <input
                    className="flex-1 border px-4 py-2 rounded"
                    placeholder="Enter new unit"
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                    }
                  />
                ) : (
                  <select
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                    }
                    className="flex-1 border px-4 py-2 rounded"
                  >
                    <option value="">Select Unit</option>
                    {FIXED_UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    {unitOptions
                      .filter((u) => !FIXED_UNIT_OPTIONS.includes(u as FixedUnit))
                      .map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                  </select>
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomUnit}
                    onChange={(e) => setIsCustomUnit(e.target.checked)}
                  />{" "}
                  New
                </label>
              </div>
            </div>
            {newItem.unit &&
              newItem.unit !== "Piece" &&
              newItem.unit !== "Dozen" &&
              newItem.unit !== "Kg" && (
                <div className="flex items-center gap-2">
                  <label className="w-36 text-sm text-gray-700">
                    Pieces per {newItem.unit}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    className={`flex-1 border px-4 py-2 rounded ${
                      validationErrors.pieces_per_unit ? "border-red-500" : ""
                    }`}
                    placeholder={`e.g. 24 pieces per ${newItem.unit.toLowerCase()}`}
                    value={newItem.pieces_per_unit ?? ""}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        pieces_per_unit: Math.max(
                          1,
                          parseInt(e.target.value) || 0
                        ),
                      }))
                    }
                  />
                </div>
              )}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Weight / piece (kg)
              </label>
              <input
                type="number"
                min={0}
                step="0.001"
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.weight_per_piece_kg ? "border-red-500" : ""
                }`}
                placeholder={
                  newItem.unit === "Kg" ? "1 (auto for Kg items)" : "e.g. 0.45"
                }
                value={newItem.unit === "Kg" ? 1 : newItem.weight_per_piece_kg ?? ""}
                disabled={newItem.unit === "Kg"}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    weight_per_piece_kg: Math.max(
                      0,
                      parseFloat(e.target.value) || 0
                    ),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Quantity<span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.quantity ? "border-red-500" : ""
                }`}
                placeholder={
                  newItem.unit === "Kg"
                    ? "Enter kilograms"
                    : `Enter quantity (${newItem.unit || "unit"})`
                }
                value={newItem.quantity}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    quantity: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Unit Price<span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.unit_price ? "border-red-500" : ""
                }`}
                placeholder="₱ per unit"
                value={newItem.unit_price}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    unit_price: Math.max(0, parseFloat(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">
                Cost Price<span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.cost_price ? "border-red-500" : ""
                }`}
                placeholder="₱ cost per unit"
                value={newItem.cost_price ?? ""}
                onFocus={e => e.target.select()}
                onChange={e =>
                  setNewItem(prev => ({
                    ...prev,
                    cost_price: Math.max(0, parseFloat(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Total Price</label>
              <input
                type="text"
                className="flex-1 border px-4 py-2 rounded bg-gray-100 text-gray-600"
                value={`₱${newItem.amount.toLocaleString()}`}
                readOnly
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Profit</label>
              <input
                type="text"
                className="flex-1 border px-4 py-2 rounded bg-gray-100 text-gray-600"
                value={`₱${(
                  (newItem.unit_price - (newItem.cost_price ?? 0)) * newItem.quantity
                ).toLocaleString()}`}
                readOnly
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Total Weight</label>
              <input
                type="text"
                className="flex-1 border px-4 py-2 rounded bg-gray-100 text-gray-600"
                value={
                  newItem.total_weight_kg
                    ? `${newItem.total_weight_kg.toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })} kg`
                    : "—"
                }
                readOnly
                disabled
              />
            </div>
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp, image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (!f) {
                  handleImageSelect(null);
                  return;
                }
                const ALLOWED = new Set([
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/gif",
                ]);
                if (!ALLOWED.has(f.type)) {
                  toast.error(
                    "Please upload an image file (JPG, PNG, WEBP, or GIF)."
                  );
                  e.currentTarget.value = "";
                  handleImageSelect(null);
                  return;
                }
                const MAX_BYTES = 5 * 1024 * 1024;
                if (f.size > MAX_BYTES) {
                  toast.error("Image too large. Max size is 5 MB.");
                  e.currentTarget.value = "";
                  handleImageSelect(null);
                  return;
                }
                handleImageSelect(f);
              }}
              className="block w-full text-sm text-gray-700"
            />
            <p className="text-xs text-gray-500 mt-1">
              Accepted formats: JPG, PNG, WEBP, GIF · Max 5MB
            </p>
            {imagePreview && (
              <button
                type="button"
                onClick={() => handleImageSelect(null)}
                className="mt-2 text-xs text-red-600 underline"
              >
                Remove selected image
              </button>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => {
                  setShowForm(false);
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitItem}
                disabled={saving}
                className={`bg-black text-white px-4 py-2 rounded hover:text-[#ffba20] 
                  ${saving ? "opacity-70 pointer-events-none" : ""}`}
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    {editingItemId ? "Updating..." : "Adding..."}
                  </span>
                ) : (
                  <>{editingItemId ? "Update Item" : "Add Item"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
