// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `select *
       from inventory
       order by date_created desc nulls last, id desc`
    );
    return NextResponse.json({ items: rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch inventory." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const item = b?.item || {};

    // NOTE: This assumes your inventory table columns match these names.
    // If your local schema is missing some columns, tell me the columns and I’ll adjust fast.
    const cols = [
      "sku",
      "product_name",
      "category",
      "subcategory",
      "unit",
      "size",
      "quantity",
      "unit_price",
      "cost_price",
      "markup_percent",
      "discount_percent",
      "amount",
      "profit",
      "date_created",
      "status",
      "image_url",
      "weight_per_piece_kg",
      "pieces_per_unit",
      "total_weight_kg",
      "expiration_date",
      "ceiling_qty",
      "stock_level",
    ];

    const values = cols.map((c) => item[c] ?? null);

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colList = cols.join(", ");

    await pool.query(
      `insert into inventory (${colList})
       values (${placeholders})`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to insert item." },
      { status: 500 }
    );
  }
}
