// src/components/ProductShowcase.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type InventoryItem = {
  id: number;
  sku?: string | null; // 👈 added so we can look up gallery by SKU
  product_name: string;
  category: string;
  subcategory: string;
  unit_price: number;
  image_url?: string | null;
};

/* --------------------------- Gallery helpers --------------------------- */
const BUCKET = "inventory-images";
const MAX_GALLERY = 5;

const safeSlug = (s: string) =>
  (s || "item").trim().replace(/\s+/g, "-").toLowerCase();

async function listGalleryUrls(
  skuOrName: string,
  primary?: string | null
): Promise<string[]> {
  const folder = safeSlug(skuOrName);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 50,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    console.warn("listGalleryUrls error:", error.message);
  }
  const fileUrls =
    data?.map((f) => {
      const { data } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`${folder}/${f.name}`);
      return data.publicUrl;
    }) || [];

  const all = [...(primary ? [primary] : []), ...fileUrls];
  return Array.from(new Set(all)).slice(0, MAX_GALLERY);
}

export function ProductShowcase() {
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [modalIndex, setModalIndex] = useState(0);

  const router = useRouter();

  // Load products (limit to 10 => 2 rows x 5 cols on md+)
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory")
        .select("id, sku, product_name, category, subcategory, unit_price, image_url")
        .limit(10);

      if (error) {
        console.error(error);
        toast.error("Failed to load products");
      } else {
        setProducts((data as any) || []);
      }
      setLoading(false);
    };
    fetchProducts();
  }, []);

  // Close modal with Esc
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    if (selected) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const openModal = useCallback(async (item: InventoryItem) => {
    setSelected(item);
    // Load gallery images (primary first, then bucket files)
    const imgs = await listGalleryUrls(
      (item.sku || item.product_name || "").toString(),
      item.image_url
    );
    setModalImages(imgs);
    setModalIndex(0);
  }, []);

  const closeModal = () => {
    setSelected(null);
    setModalImages([]);
    setModalIndex(0);
  };

  /** Handle Add to Cart — always go to Login (no cart add) */
  const handleAddToCart = (item: InventoryItem) => {
    toast.info("Please log in to continue.");
    router.push("/login?next=/customer/checkout");
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4">
        {loading ? (
          <p>Loading products...</p>
        ) : (
          // 2 columns on mobile, 5 columns on md+ → with 10 items => 2 rows x 5 cols
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {products.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -4 }}
                className="group bg-white rounded-lg shadow hover:shadow-lg overflow-hidden border border-gray-100 flex flex-col justify-between cursor-pointer"
                onClick={() => openModal(item)}
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

      {/* Modal with image gallery */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
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
                  {/* Left: Product Slideshow */}
                  <div className="bg-gray-50 p-4 flex flex-col items-center justify-center">
                    {modalImages.length > 0 ? (
                      <div className="w-full">
                        {/* Stage */}
                        <div className="relative w-full h-64 md:h-72 bg-white rounded-lg overflow-hidden flex items-center justify-center border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={modalImages[modalIndex]}
                            alt={`${selected.product_name} ${modalIndex + 1}`}
                            className="max-h-full max-w-full object-contain"
                          />
                          {modalImages.length > 1 && (
                            <>
                              <button
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded"
                                onClick={() =>
                                  setModalIndex(
                                    (i) =>
                                      (i - 1 + modalImages.length) % modalImages.length
                                  )
                                }
                                title="Previous"
                              >
                                ‹
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded"
                                onClick={() =>
                                  setModalIndex((i) => (i + 1) % modalImages.length)
                                }
                                title="Next"
                              >
                                ›
                              </button>
                            </>
                          )}
                        </div>

                        {/* Thumbs */}
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={u}
                                  alt={`thumb-${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : selected?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.image_url}
                        alt={selected.product_name}
                        className="w-full h-full object-contain max-h-[400px]"
                      />
                    ) : (
                      <div className="w-full h-[300px] flex items-center justify-center text-gray-400 text-sm">
                        No Image Available
                      </div>
                    )}
                  </div>

                  {/* Right: Details */}
                  <div className="p-5 md:p-6 flex flex-col">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                        {selected.product_name}
                      </h3>
                      <button
                        onClick={closeModal}
                        className="text-gray-500 hover:text-gray-700"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-2 text-sm text-gray-600">
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
                        onClick={closeModal}
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
