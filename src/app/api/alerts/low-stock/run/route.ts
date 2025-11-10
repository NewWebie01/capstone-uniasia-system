import { NextResponse } from "next/server";
import notifyAdmins, { type LowStockItem } from "@/lib/notify-admins";
import { createClient } from "@supabase/supabase-js";

/* --- Supabase admin client --- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST() {
  try {
    // 1️⃣ Pull all items with low, critical, or out-of-stock levels
    const { data, error } = await supabase
      .from("inventory")
      .select("sku, product_name, quantity, stock_level")
      .in("stock_level", ["Low", "Critical", "Out of Stock"]);

    if (error) throw error;

    const items: LowStockItem[] = (data ?? []).map((r) => ({
      sku: r.sku,
      name: r.product_name,
      qty: r.quantity,
    }));

    // 2️⃣ If none found, respond gracefully
    if (!items.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        count: 0,
        message: "No low or critical stock items found.",
      });
    }

    // 3️⃣ Send email to all admins
    const result = await notifyAdmins(items);

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      count: items.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? "Failed to trigger low stock alert" },
      { status: 500 }
    );
  }
}
