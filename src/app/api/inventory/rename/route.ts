// src/app/api/inventory/rename/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED_FIELDS = new Set(["category", "subcategory", "unit", "size"]);

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const field = String(b.field || "");
    const oldValue = String(b.oldValue || "");
    const newValue = String(b.newValue || "");

    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: "Invalid field." }, { status: 400 });
    }
    if (!oldValue.trim() || !newValue.trim()) {
      return NextResponse.json({ error: "Missing values." }, { status: 400 });
    }

    // allow-list column name only
    const sql = `update inventory set ${field} = $1 where ${field} = $2`;
    await pool.query(sql, [newValue.trim(), oldValue]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to rename." },
      { status: 500 }
    );
  }
}
