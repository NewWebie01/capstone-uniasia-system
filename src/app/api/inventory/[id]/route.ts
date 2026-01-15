// src/app/api/inventory/[id]/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

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
    ];

    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const values = cols.map((c) => item[c] ?? null);
    values.push(id);

    await pool.query(
      `update inventory
       set ${setClause}
       where id = $${cols.length + 1}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update item." },
      { status: 500 }
    );
  }
}
