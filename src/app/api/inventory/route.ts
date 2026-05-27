// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // mysql2 returns [rows, fields], so we destructure an array instead of an object
    const [rows] = await pool.query(
      `SELECT *
       FROM inventory
       ORDER BY date_created DESC, id DESC`
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
      "min_order_qty"
    ];

    const values = cols.map((c) => item[c] ?? null);

    // MySQL uses '?' for placeholders instead of '$1, $2'
    const placeholders = cols.map(() => "?").join(", ");
    const colList = cols.join(", ");

    await pool.query(
      `INSERT INTO inventory (${colList})
       VALUES (${placeholders})`,
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