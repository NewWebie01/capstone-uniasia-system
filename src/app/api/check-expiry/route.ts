// /app/api/check-expiry/route.ts
import { NextRequest, NextResponse } from "next/server";
import supabase from "@/config/supabaseClient";

export async function GET(req: NextRequest) {
  const DAYS_AHEAD = 7; // notify for items expiring in next 7 days
  const { data: items, error } = await supabase
    .from("inventory")
    .select("id, product_name, expiration_date")
    .gte("expiration_date", new Date().toISOString().slice(0, 10))
    .lte(
      "expiration_date",
      new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString().slice(0, 10)
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert notification for each expiring item (if not already inserted)
  for (const item of items) {
    // Check if notification already exists for this item and expiration
    const { data: existing } = await supabase
      .from("system_notifications")
      .select("id")
      .eq("item_id", item.id)
      .eq("type", "expiration")
      .eq("expires_at", item.expiration_date);

    if (!existing || existing.length === 0) {
      await supabase.from("system_notifications").insert([
        {
          type: "expiration",
          title: `Item Expiring Soon: ${item.product_name}`,
          message: `The item "${item.product_name}" is expiring on ${item.expiration_date}.`,
          item_id: item.id,
          item_name: item.product_name,
          expires_at: item.expiration_date,
        },
      ]);
    }
  }

  return NextResponse.json({ success: true, count: items.length });
}
