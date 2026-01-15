// src/app/api/inventory/options/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function uniqSorted(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export async function GET() {
  try {
    const { rows } = await pool.query(
      `select category, subcategory, unit, size
       from inventory`
    );

    const categories = uniqSorted(rows.map((r: any) => (r.category || "").trim()));
    const subcategories = uniqSorted(
      rows.map((r: any) => (r.subcategory || "").trim())
    );
    const units = uniqSorted(rows.map((r: any) => (r.unit || "").trim()));
    const sizes = uniqSorted(rows.map((r: any) => (r.size || "").trim()));

    return NextResponse.json({ categories, subcategories, units, sizes });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch options." },
      { status: 500 }
    );
  }
}
