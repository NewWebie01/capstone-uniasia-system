"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_price: number;
  status: string;
  date_added: string;
};

export default function CustomerInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("inventory").select("*");
      if (error) {
        console.error("Error fetching inventory:", error.message);
      } else {
        setInventory(data);
      }
      setLoading(false);
    };

    fetchInventory();
  }, []);

  return (
    <div className="pt-2 p-4">
      <motion.h1
        className="text-3xl font-bold mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Product Catalog
      </motion.h1>

      {loading ? (
        <motion.div
          className="p-4 text-center text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Loading inventory...
        </motion.div>
      ) : (
        <motion.div
          className="overflow-x-auto rounded-lg shadow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-3 px-5">SKU</th>
                <th className="py-3 px-5">Product Name</th>
                <th className="py-3 px-5">Category</th>
                <th className="py-3 px-5">Subcategory</th>
                <th className="py-3 px-5">Quantity</th>
                <th className="py-3 px-5">Unit Price</th>
                <th className="py-3 px-5">Total Price</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length > 0 ? (
                inventory.map((item) => (
                  <motion.tr
                    key={item.id}
                    className="border-b hover:bg-gray-100 transition duration-150"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <td className="py-3 px-5">{item.sku}</td>
                    <td className="py-3 px-5">{item.product_name}</td>
                    <td className="py-3 px-5">{item.category}</td>
                    <td className="py-3 px-5">{item.subcategory}</td>
                    <td className="py-3 px-5">{item.quantity}</td>
                    <td className="py-3 px-5">₱{item.unit_price}</td>
                    <td className="py-3 px-5">
                      ₱{(item.quantity * item.unit_price).toFixed(2)}
                    </td>
                    <td
                      className={`py-3 px-5 ${
                        item.status === "In Stock"
                          ? "text-green-600"
                          : item.status === "Low Stock"
                          ? "text-yellow-500"
                          : "text-red-500"
                      }`}
                    >
                      {item.status}
                    </td>
                    <td className="py-3 px-5">
                      {new Date(item.date_added).toLocaleDateString()}
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
                    No inventory data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
