import { NextResponse } from "next/server";
import notifyAdmins, { type LowStockItem } from "@/lib/notify-admins";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* --- Supabase admin client --- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function handle() {
  try {
    // 1) Pull items with low/critical/out-of-stock
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

    if (!items.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        count: 0,
        message: "No low or critical stock items found.",
      });
    }

    const result = await notifyAdmins(items);
    return NextResponse.json({ ok: result.ok, sent: result.sent, count: items.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to trigger low stock alert" },
      { status: 500 }
    );
  }
}

export async function POST() { return handle(); }
// Allow Vercel cron via GET
export async function GET() { return handle(); }
