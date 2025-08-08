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
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<any[]>([]);
  const [unitOptions, setUnitOptions] = useState<any[]>([]);

  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [customUnit, setCustomUnit] = useState("");

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
  });

  const fetchDropdowns = async () => {
    const [cat, subcat, unit] = await Promise.all([
      supabase.from("categories").select("*"),
      supabase.from("subcategories").select("*"),
      supabase.from("units").select("*"),
    ]);
    setCategoryOptions(cat.data || []);
    setSubcategoryOptions(subcat.data || []);
    setUnitOptions(unit.data || []);
  };

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("date_created", { ascending: false });

    if (!error) setItems(data || []);
  };

  useEffect(() => {
    fetchItems();
    fetchDropdowns();

    const channel = supabase
      .channel("inventory-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        fetchItems
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const amount = newItem.unit_price * newItem.quantity;
    setNewItem((prev) => ({ ...prev, amount }));
  }, [newItem.unit_price, newItem.quantity]);

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

      const hasErrors = Object.values(errors).some((v) => v);
      if (hasErrors) {
        return;
      }

      const dataToSave = {
        ...newItem,
        date_created: new Date().toISOString(),
      };

      const { error } =
        editingItemId !== null
          ? await supabase
              .from("inventory")
              .update(dataToSave)
              .eq("id", editingItemId)
          : await supabase.from("inventory").insert([dataToSave]);

      if (error) throw error;

      setNewItem({
        sku: "",
        product_name: "",
        category: "",
        quantity: 0,
        subcategory: "", // ✅ add this
        unit: "",
        unit_price: 0,
        amount: 0,
        date_created: new Date().toISOString(),
        status: "",
      });

      setShowForm(false);
      setEditingItemId(null);
      setCustomCategory("");
      setCustomSubcategory("");
      setCustomUnit("");
      setIsCustomCategory(false);
      setIsCustomSubcategory(false);
      setIsCustomUnit(false);

      fetchItems();
      fetchDropdowns();
    } catch (err: any) {
      console.error(err);
      alert("Error saving item: " + err.message);
    }
  };

  const getStatus = (qty: number, max: number) => {
    if (qty >= max) return "In Stock";
    if (qty > 0) return "Low Stock";
    return "Out of Stock";
  };

  const filteredItems = items
    .filter((item) =>
      `${item.product_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Inventory</h1>

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
              subcategory: "", // ✅ add this
              unit: "",
              unit_price: 0,
              amount: 0,
              date_created: new Date().toISOString(),
              status: "",
            });
          }}
        >
          Add New Item
        </button>
      </div>

      <div className="overflow-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Subcategory</th>
              <th className="px-4 py-3">Unit</th>

              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Unit Price</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{item.sku}</td>
                <td className="px-4 py-2">{item.product_name}</td>
                <td className="px-4 py-2">{item.category}</td>
                <td className="px-4 py-2">{item.subcategory}</td>
                <td className="px-4 py-2">{item.unit}</td>
                <td className="px-4 py-2">{item.quantity}</td>
                <td className="px-4 py-2">
                  ₱{item.unit_price.toLocaleString()}
                </td>
                <td className="px-4 py-2">₱{item.amount.toLocaleString()}</td>
                <td className="px-4 py-2">
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
                <td className="px-4 py-2">
                  {new Date(item.date_created).toLocaleString("en-PH")}
                </td>
                <td className="px-4 py-2">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setShowForm(true);
                      setEditingItemId(item.id);
                      setNewItem({ ...item });
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-xl w-full space-y-4">
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

            {/* Product Name */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Product Name</label>
              <input
                className="flex-1 border px-4 py-2 rounded"
                placeholder="e.g. Boysen Paint"
                value={newItem.product_name}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    product_name: e.target.value,
                  }))
                }
              />
            </div>

            {/* Category */}
            <div className="flex items-start gap-2">
              <label className="w-36 text-sm text-gray-700 pt-2">
                Category
              </label>
              <div className="flex-1 space-y-1">
                {!isCustomCategory ? (
                  <select
                    className="w-full border px-4 py-2 rounded"
                    value={newItem.category_id}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        category_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select Category</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border px-4 py-2 rounded"
                    placeholder="Enter new category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  />
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomCategory}
                    onChange={() => setIsCustomCategory((prev) => !prev)}
                    className="mr-2"
                  />
                  Add new category
                </label>
              </div>
            </div>

            {/* Subcategory */}
            <div className="flex items-start gap-2">
              <label className="w-36 text-sm text-gray-700 pt-2">
                Subcategory
              </label>
              <div className="flex-1 space-y-1">
                {!isCustomSubcategory ? (
                  <select
                    className="w-full border px-4 py-2 rounded"
                    value={newItem.subcategory_id}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        subcategory_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select Subcategory</option>
                    {subcategoryOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border px-4 py-2 rounded"
                    placeholder="Enter new subcategory"
                    value={customSubcategory}
                    onChange={(e) => setCustomSubcategory(e.target.value)}
                  />
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomSubcategory}
                    onChange={() => setIsCustomSubcategory((prev) => !prev)}
                    className="mr-2"
                  />
                  Add new subcategory
                </label>
              </div>
            </div>

            {/* Unit */}
            <div className="flex items-start gap-2">
              <label className="w-36 text-sm text-gray-700 pt-2">Unit</label>
              <div className="flex-1 space-y-1">
                {!isCustomUnit ? (
                  <select
                    className="w-full border px-4 py-2 rounded"
                    value={newItem.unit_id}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        unit_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select Unit</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border px-4 py-2 rounded"
                    placeholder="Enter new unit"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                  />
                )}
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomUnit}
                    onChange={() => setIsCustomUnit((prev) => !prev)}
                    className="mr-2"
                  />
                  Add new unit
                </label>
              </div>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Quantity</label>
              <input
                type="number"
                className="flex-1 border px-4 py-2 rounded"
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

            {/* Unit Price */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit Price</label>
              <input
                type="number"
                className="flex-1 border px-4 py-2 rounded"
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

            {/* Total Price (readonly) */}
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

            {/* Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setShowForm(false)}
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
