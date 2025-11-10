// src/components/ProductShowcase.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  subcategory: string;
  unit_price: number;
  image_url?: string | null;
};

export function ProductShowcase() {
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const router = useRouter();

  // Load sample products
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_name, category, subcategory, unit_price, image_url")
        .limit(12);

      if (error) {
        console.error(error);
        toast.error("Failed to load products");
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    };
    fetchProducts();
  }, []);

  // Close modal with Esc
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    if (selected) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [selected]);

  /** Handle Add to Cart — if not logged in → redirect to login */
  const handleAddToCart = async (item: InventoryItem) => {
    const { data } = await supabase.auth.getSession();
    const isLoggedIn = !!data?.session;

    if (!isLoggedIn) {
      toast.info("Please log in to add items to your cart.");
      router.push("/login?next=/customer/checkout");
      return;
    }

    // If logged in, you can later replace this with your modal open logic
    toast.success(`${item.product_name} added to cart.`);
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4">
        {loading ? (
          <p>Loading products...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {products.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -4 }}
                className="group bg-white rounded-lg shadow hover:shadow-lg overflow-hidden border border-gray-100 flex flex-col justify-between cursor-pointer"
                onClick={() => setSelected(item)}
              >
                <div>
                  <div className="relative w-full h-40 bg-gray-100 overflow-hidden">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        No Image
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/10 to-transparent" />
                  </div>

                  <div className="p-3">
                    <h3
                      className="text-sm font-medium text-gray-800 line-clamp-2 mb-1"
                      title={item.product_name}
                    >
                      {item.product_name}
                    </h3>

                    <p className="text-xs text-gray-500 mb-1">
                      {item.category} • {item.subcategory || "General"}
                    </p>

                    <p className="font-semibold text-[#ffba20]">
                      ₱
                      {Number(item.unit_price || 0).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                <div
                  className="p-3 pt-0"
                  onClick={(e) => e.stopPropagation()} // prevent opening modal
                >
                  <button
                    onClick={() => handleAddToCart(item)}
                    className="w-full text-sm font-medium py-2 rounded-md bg-[#181918] text-white hover:text-[#ffba20] transition"
                  >
                    Add to Cart
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for viewing item details */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden">
                <div className="grid md:grid-cols-2">
                  {/* Image side */}
                  <div className="relative bg-gray-100">
                    {selected.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.image_url}
                        alt={selected.product_name}
                        className="h-64 md:h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-64 md:h-full w-full flex items-center justify-center text-gray-400">
                        No Image
                      </div>
                    )}
                    <button
                      onClick={() => setSelected(null)}
                      className="absolute top-3 right-3 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 transition rounded-full w-8 h-8 flex items-center justify-center"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Details side */}
                  <div className="p-5 md:p-6">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                      {selected.product_name}
                    </h3>

                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      <p>
                        <span className="font-medium text-gray-700">Category:</span>{" "}
                        {selected.category}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Subcategory:</span>{" "}
                        {selected.subcategory || "General"}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-2xl font-bold text-[#ffba20]">
                        ₱
                        {Number(selected.unit_price || 0).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelected(null)}
                        className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md py-2 font-medium"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => handleAddToCart(selected)}
                        className="bg-[#181918] text-white hover:text-[#ffba20] rounded-md py-2 font-medium"
                      >
                        Add to Cart
                      </button>
                    </div>

                    <p className="mt-3 text-xs text-gray-400">
                      * Please log in to proceed.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}

export default ProductShowcase;
