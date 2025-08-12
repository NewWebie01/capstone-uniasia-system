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
  const [loading, setLoading] = useState(true);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

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

  const [validationErrors, setValidationErrors] = useState({
    product_name: false,
    category: false,
    subcategory: false,
    unit: false,
    quantity: false,
    unit_price: false,
  });

const fetchItems = async () => {
  setLoading(true);

const { data, error } = await supabase
  .from("inventory")
  .select(`
    id,
    sku,
    product_name,
    category,
    subcategory,
    unit,
    quantity,
    unit_price,
    amount,
    status,
    date_created,
    inventory_batches:inventory_batches!inventory_batches_inventory_id_fkey (
      qty_remaining,
      unit_price,
      date_received
    )
  `)
  .order("date_created", { ascending: false });


  if (error) {
    console.error("Error fetching items:", error.message || error);
    setLoading(false);
    return;
  }

  console.log("Fetched inventory:", data);
  setItems(data || []);
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

    setCategoryOptions(unique(data.map((item) => item.category)));
    setSubcategoryOptions(unique(data.map((item) => item.subcategory)));
    setUnitOptions(unique(data.map((item) => item.unit)));
  };

  useEffect(() => {
    fetchItems();
    fetchDropdownOptions();
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
        quantity: newItem.quantity <= 0,
        unit_price: newItem.unit_price <= 0,
      };

      setValidationErrors(errors);
      const hasErrors = Object.values(errors).some((v) => v);
      if (hasErrors) return;

      const dataToSave = {
        ...newItem,
        date_created: new Date().toISOString(),
      };

      if (editingItemId !== null) {
        const { error } = await supabase
          .from("inventory")
          .update(dataToSave)
          .eq("id", editingItemId);
        if (error) throw error;
      } else {
        const { data: existingItem } = await supabase
          .from("inventory")
          .select("id")
          .eq("sku", newItem.sku)
          .single();

        if (existingItem) {
          const { error: batchError } = await supabase
            .from("inventory_batches")
            .insert([
              {
                inventory_id: existingItem.id,
                qty_received: newItem.quantity,
                qty_remaining: newItem.quantity,
                unit_price: newItem.unit_price,
                unit_cost: newItem.unit_price, // ✅ FIX: Send unit_cost value
                date_received: new Date().toISOString(),
              },
            ]);
          if (batchError) throw batchError;
        } else {
          const { data, error } = await supabase
            .from("inventory")
            .insert([dataToSave])
            .select();
          if (error) throw error;

          if (data && data.length > 0) {
            const newInventoryId = data[0].id;
            const { error: batchError } = await supabase
              .from("inventory_batches")
              .insert([
                {
                  inventory_id: newInventoryId,
                  qty_received: newItem.quantity,
                  qty_remaining: newItem.quantity,
                  unit_price: newItem.unit_price,
                  unit_cost: newItem.unit_price, // ✅ FIX: Send unit_cost value
                  date_received: new Date().toISOString(),
                },
              ]);
            if (batchError) throw batchError;
          }
        }
      }

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
      });

      setShowForm(false);
      setEditingItemId(null);

      fetchItems();
      fetchDropdownOptions();
    } catch (err: any) {
      console.error(err);
      alert("Error saving item: " + err.message);
    }
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
              subcategory: "",
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
                <td className="px-4 py-2">₱{item.unit_price.toLocaleString()}</td>
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
            {/* SKU */}
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
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
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
                    {subcategoryOptions.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
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
                      setNewItem((prev) => ({
                        ...prev,
                        unit: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <select
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        unit: e.target.value,
                      }))
                    }
                    className="flex-1 border px-4 py-2 rounded"
                  >
                    <option value="">Select Unit</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
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
            {/* QUANTITY */}
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
            {/* UNIT PRICE */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit Price</label>
              <input
                type="number"
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.unit_price ? "border-red-500" : ""
                }`}
                placeholder="Enter price"
                value={newItem.unit_price}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    unit_price: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            {/* TOTAL */}
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Total</label>
              <input
                type="number"
                className="flex-1 border px-4 py-2 rounded bg-gray-100"
                readOnly
                value={newItem.amount}
              />
            </div>
            {/* BUTTONS */}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-gray-300 rounded"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-black text-white rounded hover:text-[#ffba20]"
                onClick={handleSubmitItem}
              >
                {editingItemId ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
