// src/app/customer/checkout/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { useCart, CartItem } from "@/context/CartContext";
import { motion } from "framer-motion";

/* ----------------------------- Helpers ----------------------------- */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const formatPHDate = (d?: string | Date | number) =>
  d ? new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).format(new Date(d)) : "";

function clampQty(n: number) {
  return Math.max(1, Math.floor(n) || 1);
}

/* ----------------------------- Component ----------------------------- */
export default function CheckoutPage() {
  const router = useRouter();

  // shared cart/context
  const { cart, updateQty, removeItem, clearCart, cartCount, cartTotal, addItem } = useCart();

  // customer info (prefill from Supabase user metadata if available)
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // page state
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [fetchingOrders, setFetchingOrders] = useState(false);

useEffect(() => {
  let mounted = true;
  const loadOrdersForUser = async () => {
    if (!userId) {
      setOrders([]);
      return;
    }

    setFetchingOrders(true);

    try {
      // 1) Try direct orders lookup by customer_id == auth user id (fast path)
      try {
        const { data: ordersByAuth, error: errOrdersByAuth } = await supabase
          .from("orders")
          .select("id, status, grand_total_with_interest, created_at, transaction_code")
          .eq("customer_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!errOrdersByAuth && ordersByAuth && ordersByAuth.length > 0) {
          if (mounted) setOrders(ordersByAuth);
          setFetchingOrders(false);
          return; // done
        }
      } catch (err) {
        console.warn("[checkout] orders by authId lookup failed:", err);
        // continue to fallback attempts
      }

      // 2) Fallback: try to find a customers row (by user_id or by email) and use that id
      let customerRow: any = null;
      try {
        // first try user_id column (if you store auth.user.id in customers.user_id)
        const { data: c1, error: errC1 } = await supabase
          .from("customers")
          .select("id, name, email, user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!errC1 && c1) {
          customerRow = c1;
        }
      } catch (err) {
        console.warn("[checkout] customers user_id lookup error", err);
      }

      if (!customerRow) {
        // second try: lookup by email (safe fallback)
        try {
          // robust handling for supabase.auth.getUser() which may return { data: { user } } or { user }
const _getUserResult: any = await supabase.auth.getUser();
const authUser = _getUserResult?.data?.user ?? _getUserResult?.user ?? null;
const userEmail = authUser?.email ?? null;

          if (userEmail) {
            const { data: c2, error: errC2 } = await supabase
              .from("customers")
              .select("id, name, email")
              .eq("email", userEmail)
              .maybeSingle();

            if (!errC2 && c2) {
              customerRow = c2;
            }
          }
        } catch (err) {
          console.warn("[checkout] customers email lookup error", err);
        }
      }

      // 3) If we found a customers row use that id to fetch orders
      if (customerRow && customerRow.id) {
        try {
          const { data: ordersByCustomer, error: errOrdersByCustomer } = await supabase
            .from("orders")
            .select("id, status, grand_total_with_interest, created_at, transaction_code")
            .eq("customer_id", customerRow.id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (!errOrdersByCustomer) {
            if (mounted) setOrders(ordersByCustomer ?? []);
            setFetchingOrders(false);
            return;
          } else {
            console.warn("[checkout] orders by customers.id query error", errOrdersByCustomer);
          }
        } catch (err) {
          console.warn("[checkout] orders by customers.id error", err);
        }
      }

      // 4) No customer row found -> friendly information, not an error
      if (mounted) {
        setOrders([]);
        // show an info toast once (not an error) so user understands why "no orders"
        toast.info("No customer profile found yet. Orders will appear after you place one.");
      }
    } catch (err) {
      // unexpected global error: report to console and show generic message
      console.error("[checkout] Error while loading orders (unexpected):", err);
      // avoid spamming error toasts on every dev reload; show a subtle message
      toast.error("Unable to load past orders. See console for details.");
    } finally {
      if (mounted) setFetchingOrders(false);
    }
  };

  loadOrdersForUser();

  return () => {
    mounted = false;
  };
}, [userId]); // run when userId changes





  // fetch existing orders for this user (if logged in)
// replace your current "fetch existing orders for this user" useEffect with this block
useEffect(() => {
  if (!userId) {
    setOrders([]);
    return;
  }

  let mounted = true;
  (async () => {
    setFetchingOrders(true);
    try {
      // fetch latest auth user (get email + id)
      const { data: userData, error: getUserErr } = await supabase.auth.getUser();
      if (getUserErr) {
        console.error("supabase.auth.getUser error:", getUserErr);
        // Show friendly toast only for real errors (not for empty results)
        toast.error("Unable to fetch your past orders.");
        if (mounted) setOrders([]);
        return;
      }
      const authUser = userData?.user;
      const authUserId = authUser?.id ?? userId; // fallback to userId state
      const authEmail = authUser?.email ?? "";

      // 1) Try direct query assuming orders.customer_id === auth.user.id
      let { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("id, status, grand_total, created_at, transaction_code")
        .eq("customer_id", authUserId)
        .order("created_at", { ascending: false })
        .limit(50);

      // 2) If the direct query failed or returned an auth/permission error, try to resolve via customers table
      if (ordersErr) {
        console.warn("orders fetch by auth id failed, will attempt via customers table:", ordersErr);
        // Try to find the customers row either by user_id or by email
        const orClauseParts: string[] = [];
        if (authUserId) orClauseParts.push(`user_id.eq.${authUserId}`);
        if (authEmail) orClauseParts.push(`email.eq.${authEmail}`);
        if (orClauseParts.length === 0) {
          // no way to find customers row
          console.warn("No auth user id or email available to lookup customers row.");
          throw ordersErr;
        }
        const orClause = orClauseParts.join(",");

        const { data: customerRow, error: custErr } = await supabase
          .from("customers")
          .select("id")
          .or(orClause)
          .maybeSingle();

        if (custErr) {
          console.error("Failed to query customers table:", custErr);
          throw custErr;
        }

        if (!customerRow || !customerRow.id) {
          // No customers row found — not an exception, just no orders to fetch
          console.info("No customers row found for user; skipping orders fetch.");
          if (mounted) setOrders([]);
          return;
        }

        // Now try fetching orders by the customers.id
        const custId = customerRow.id;
        const { data: ordersByCust, error: ordersByCustErr } = await supabase
          .from("orders")
          .select("id, status, grand_total, created_at, transaction_code")
          .eq("customer_id", custId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (ordersByCustErr) {
          console.error("Failed to fetch orders by customers.id:", ordersByCustErr);
          throw ordersByCustErr;
        }
        ordersData = ordersByCust;
      }

      // success: ordersData may be [] or an array
      if (mounted) setOrders((ordersData as any[]) ?? []);
    } catch (err: any) {
      // Log full error to console for debugging
      console.error("Error while loading orders (checkout):", err);
      // show friendly toast (only for errors)
      toast.error("Unable to fetch your past orders.");
      if (mounted) setOrders([]);
    } finally {
      if (mounted) setFetchingOrders(false);
    }
  })();

  return () => {
    mounted = false;
  };
}, [userId]);


  const handleUpdateQty = (ci: CartItem, nextRaw: number) => {
    const next = clampQty(Number.isFinite(nextRaw) ? nextRaw : 1);
    updateQty(ci.item.id, next);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }

    // simple validation for customer info
    if (!customerName || !customerEmail) {
      toast.error("Please enter your name and email.");
      return;
    }

    setSubmitting(true);

    try {
      // 1) insert into orders
      // adjust column names to match your DB if needed
      const grand_total = Number(cartTotal || 0);

      const orderPayload: any = {
        customer_id: userId, // may be null if guest; adjust if your schema requires customers table
        status: "pending",
        grand_total,
        shipping_fee: 0,
      };

      // optional transaction_code generator
      orderPayload.transaction_code = `TXN-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

      const { data: createdOrders, error: orderError } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select()
        .limit(1);

      if (orderError) {
        console.error("Order insert failed:", orderError);
        toast.error("Failed to create order. Try again.");
        setSubmitting(false);
        return;
      }

      const createdOrder = Array.isArray(createdOrders) ? createdOrders[0] : createdOrders;
      const orderId = createdOrder?.id;

      if (!orderId) {
        toast.error("Could not determine created order id.");
        setSubmitting(false);
        return;
      }

      // 2) insert order_items
      const itemsPayload = cart.map((ci) => ({
        order_id: orderId,
        inventory_id: ci.item.id, // adjust column name if necessary
        product_name: ci.item.product_name ?? null,
        quantity: ci.quantity,
        unit_price: ci.item.unit_price ?? 0,
        subtotal: (ci.item.unit_price ?? 0) * ci.quantity,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(itemsPayload);

      if (itemsError) {
        console.error("order_items insert failed:", itemsError);
        toast.error("Order created but failed to save items. Contact support.");
        // still consider clearing cart? usually no
        setSubmitting(false);
        return;
      }

      // 3) optionally: decrement inventory stock (careful, do this with RPC or server-side logic in real app)
      // Here we'll attempt a best-effort update but keep it simple: loop updates (not transactional).
      for (const ci of cart) {
        try {
          await supabase
            .from("inventory")
            .update({ quantity: Math.max(0, (ci.item.quantity ?? 0) - ci.quantity) })
            .eq("id", ci.item.id);
        } catch (e) {
          // ignore per-item update errors for now
          console.warn("Inventory update failed for item", ci.item.id, e);
        }
      }

      // 4) clear cart and navigate to orders (or order details)
      clearCart();
      toast.success("Order placed successfully.");
      router.push("/customer/orders");
    } catch (err) {
      console.error("Place order error:", err);
      toast.error("Unexpected error creating order.");
    } finally {
      setSubmitting(false);
    }
  };

  const subtotal = useMemo(() => cart.reduce((s, ci) => s + (Number(ci.item.unit_price || 0) * ci.quantity), 0), [cart]);
  const tax = 0; // add tax logic if needed
  const shipping = 0;
  const grandTotal = subtotal + tax + shipping;

  return (
    <div className="p-4">
      <header className="h-14 flex items-center gap-3">
        <motion.h1 className="text-3xl font-bold tracking-tight text-neutral-800" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Cart / Checkout
        </motion.h1>
      </header>

      <div className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Cart Items */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-lg mb-3">Your Cart</h3>

            {cart.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-600 mb-3">Your cart is empty.</div>
                <div className="flex justify-center gap-3">
                  <button onClick={() => router.push("/customer/product-catalog")} className="px-4 py-2 rounded bg-[#181918] text-white">Shop Products</button>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b">
                      <tr>
                        <th className="py-2">Product</th>
                        <th className="py-2 w-40">Qty</th>
                        <th className="py-2 w-40">Unit Price</th>
                        <th className="py-2 w-40">Line</th>
                        <th className="py-2 w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((ci) => (
                        <tr key={ci.item.id} className="border-b">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 bg-gray-100 overflow-hidden rounded">
                                {ci.item.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={ci.item.image_url} alt={ci.item.product_name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No Image</div>
                                )}
                              </div>
                              <div>
                                <div className="font-medium">{ci.item.product_name}</div>
                                <div className="text-xs text-gray-500">{ci.item.category ?? ""} • {ci.item.subcategory ?? ""}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => updateQty(ci.item.id, clampQty(ci.quantity - 1))} className="px-2 py-1 border rounded">−</button>
                              <input type="number" value={ci.quantity} onChange={(e) => handleUpdateQty(ci, Number(e.target.value) || 1)} className="w-16 text-center border rounded px-1 py-1" min={1} />
                              <button onClick={() => updateQty(ci.item.id, clampQty(ci.quantity + 1))} className="px-2 py-1 border rounded">+</button>
                            </div>
                          </td>

                          <td className="py-3">{formatCurrency(Number(ci.item.unit_price || 0))}</td>
                          <td className="py-3">{formatCurrency((Number(ci.item.unit_price || 0) * ci.quantity))}</td>

                          <td className="py-3">
                            <button onClick={() => removeItem(ci.item.id)} className="px-3 py-1 rounded bg-red-500 text-white">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* totals */}
                <div className="mt-4 flex justify-end">
                  <div className="w-full max-w-md bg-gray-50 p-4 rounded">
                    <div className="flex justify-between text-sm text-gray-600 mb-1"><div>Subtotal</div><div>{formatCurrency(subtotal)}</div></div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1"><div>Shipping</div><div>{formatCurrency(shipping)}</div></div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1"><div>Tax</div><div>{formatCurrency(tax)}</div></div>
                    <div className="h-px bg-gray-200 my-2" />
                    <div className="flex justify-between font-semibold text-lg"><div>Grand Total</div><div>{formatCurrency(grandTotal)}</div></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Customer details & actions */}
        <aside>
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h3 className="font-semibold mb-2">Customer Details</h3>

            <label className="text-xs text-gray-600">Name</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" />

            <label className="text-xs text-gray-600">Email</label>
            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" />

            <label className="text-xs text-gray-600">Phone</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" />

            <label className="text-xs text-gray-600">Address</label>
            <textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" rows={3} />

            <div className="flex gap-2 mt-2">
              <button onClick={handlePlaceOrder} className="flex-1 px-3 py-2 rounded bg-[#ffba20] text-black font-semibold" disabled={submitting || cart.length === 0}>
                {submitting ? "Placing order..." : `Place Order (${formatCurrency(grandTotal)})`}
              </button>

              <button onClick={() => { clearCart(); toast("Cart cleared."); }} className="px-3 py-2 rounded border">Clear</button>
            </div>
          </div>

          {/* Past orders for this customer */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Your Orders</h3>
            {fetchingOrders ? (
              <div className="text-sm text-gray-500">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-sm text-gray-500">No orders yet. Place your first order!</div>
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className="border rounded p-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">#{o.transaction_code ?? o.id}</div>
                        <div className="text-xs text-gray-500">{formatPHDate(o.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(Number(o.grand_total ?? 0))}</div>
                        <div className="text-xs text-gray-500">{o.status}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
