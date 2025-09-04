"use client";

import { useEffect, useState } from "react";
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
  date_created: string;
  status: string;
  image_url?: string | null;
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [loading, setLoading] = useState(true);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  // Image upload state
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
    amount: 0,
    date_created: new Date().toISOString(),
    status: "",
    image_url: null,
  });

  const [validationErrors, setValidationErrors] = useState({
    product_name: false,
    category: false,
    subcategory: false,
    unit: false,
    quantity: false,
    unit_price: false,
  });

  const BUCKET = "inventory-images";

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("date_created", { ascending: false });
    if (!error && data) setItems(data as InventoryItem[]);
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

  useEffect(() => {
    const amount = newItem.unit_price * newItem.quantity;
    setNewItem((prev) => ({ ...prev, amount }));
  }, [newItem.unit_price, newItem.quantity]);

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

  const handleSubmitItem = async () => {
    try {
      const errors = {
        product_name: !newItem.product_name,
        category: !newItem.category,
        subcategory: !newItem.subcategory,
        unit: !newItem.unit,
        quantity: newItem.quantity < 0,
        unit_price: newItem.unit_price <= 0,
      };
      setValidationErrors(errors);
      const hasErrors = Object.values(errors).some(Boolean);
      if (hasErrors) {
        alert("Please fill in all required fields correctly.");
        return;
      }

      let finalImageUrl = newItem.image_url || null;
      if (imageFile) {
        finalImageUrl = await uploadImageAndGetUrl(
          imageFile,
          newItem.sku || newItem.product_name
        );
      }

      const dataToSave = {
        ...newItem,
        image_url: finalImageUrl,
        date_created: new Date().toISOString(),
      };

      if (editingItemId !== null) {
        // Update existing item
        const { error } = await supabase
          .from("inventory")
          .update(dataToSave)
          .eq("id", editingItemId);
        if (error) throw error;

        // Log update activity
        // Log activity (for both Add and Update)
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const userEmail = user?.email || "unknown";
        const userRole = user?.user_metadata?.role || "unknown"; // <-- GET THE ROLE

        await supabase.from("activity_logs").insert([
          {
            user_email: userEmail,
            user_role: userRole, // <-- LOG THE ROLE!
            action:
              editingItemId !== null
                ? "Update Inventory Item"
                : "Add Inventory Item",
            details: {
              sku: dataToSave.sku,
              product_name: dataToSave.product_name,
              category: dataToSave.category,
              subcategory: dataToSave.subcategory,
              unit: dataToSave.unit,
              quantity: dataToSave.quantity,
              unit_price: dataToSave.unit_price,
              status: dataToSave.status,
            },
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        // Insert new item
        const { error } = await supabase.from("inventory").insert([dataToSave]);
        if (error) throw error;

        // Log add activity
        // Log activity (for both Add and Update)
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const userEmail = user?.email || "unknown";
        const userRole = user?.user_metadata?.role || "unknown"; // <-- GET THE ROLE

        await supabase.from("activity_logs").insert([
          {
            user_email: userEmail,
            user_role: userRole, // <-- LOG THE ROLE!
            action:
              editingItemId !== null
                ? "Update Inventory Item"
                : "Add Inventory Item",
            details: {
              sku: dataToSave.sku,
              product_name: dataToSave.product_name,
              category: dataToSave.category,
              subcategory: dataToSave.subcategory,
              unit: dataToSave.unit,
              quantity: dataToSave.quantity,
              unit_price: dataToSave.unit_price,
              status: dataToSave.status,
            },
            created_at: new Date().toISOString(),
          },
        ]);
      }

      // Reset form, modal, and reload items
      setNewItem({
        sku: "",
        product_name: "",
        category: "",
        quantity: 0,
        subcategory: "",
        unit: "",
        unit_price: 0,
        amount: 0,
        date_created: new Date().toISOString(),
        status: "",
        image_url: null,
      });
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      setEditingItemId(null);

      fetchItems();
      fetchDropdownOptions();
    } catch (err: any) {
      console.error("Update error:", err);
      alert("Error saving item: " + (err.message || JSON.stringify(err)));
    }
  };

  const filteredItems = items
    .filter((item) =>
      `${item.product_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  // Image modal state
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

  // Cell utility classes for consistent alignment
  const cell = "px-4 py-2 text-left align-middle";
  const cellNowrap = `${cell} whitespace-nowrap`;

  return (
    <div className="px-4 pb-4 pt-1">
      <h1 className="text-3xl font-bold mb-6 mt-1">Inventory</h1>

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
              amount: 0,
              date_created: new Date().toISOString(),
              status: "",
              image_url: null,
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
              <th className={`${cellNowrap}`}>SKU</th>
              <th className={`${cellNowrap}`}>Product</th>
              <th className={`${cellNowrap}`}>Category</th>
              <th className={`${cellNowrap}`}>Subcategory</th>
              <th className={`${cellNowrap}`}>Unit</th>
              <th className={`${cellNowrap}`}>Quantity</th>
              <th className={`${cellNowrap}`}>Unit Price</th>
              <th className={`${cellNowrap}`}>Total</th>
              <th className={`${cellNowrap}`}>Status</th>
              <th className={`${cellNowrap}`}>Date</th>
              <th className={`${cellNowrap}`}>Actions</th>
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
                <td className={cellNowrap}>₱{item.amount.toLocaleString()}</td>

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
                      setNewItem({ ...item });
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
                  colSpan={11}
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

      {/* IMAGE MODAL */}
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

      {/* ADD/EDIT FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold">
              {editingItemId ? "Edit Item" : "Add New Item"}
            </h2>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">SKU</label>
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
              <label className="w-36 text-sm text-gray-700">Product Name</label>
              <input
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.product_name ? "border-red-500" : ""
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
            </div>

            {/* CATEGORY */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Category</label>
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

            {/* SUBCATEGORY */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Subcategory</label>
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

            {/* UNIT */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit</label>
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
                    {unitOptions.map((u) => (
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

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Quantity</label>
              <input
                type="number"
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.quantity ? "border-red-500" : ""
                }`}
                placeholder="Enter quantity"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit Price</label>
              <input
                type="number"
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.unit_price ? "border-red-500" : ""
                }`}
                placeholder="₱ per unit"
                value={newItem.unit_price}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    unit_price: parseFloat(e.target.value) || 0,
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

            {/* Image upload + preview */}
            <div className="flex items-start gap-2">
              <label className="w-36 text-sm text-gray-700 mt-2">
                Item Image
              </label>
              <div className="flex-1">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-48 object-contain rounded border mb-2"
                  />
                ) : newItem.image_url ? (
                  <img
                    src={newItem.image_url}
                    alt="Current"
                    className="w-full max-h-48 object-contain rounded border mb-2"
                  />
                ) : (
                  <div className="text-sm text-gray-500 border rounded p-3 mb-2">
                    No image selected
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageSelect(e.target.files?.[0] || null)
                  }
                  className="block w-full text-sm text-gray-700"
                />
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => handleImageSelect(null)}
                    className="mt-2 text-xs text-red-600 underline"
                  >
                    Remove selected image
                  </button>
                )}
              </div>
            </div>

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
                className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
              >
                {editingItemId ? "Update Item" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
