import { NextResponse } from "next/server";
import { pool } from "@/lib/db"; // Import from your db.ts

export async function GET() {
  try {
    // We use 'pool' because that is what you exported in db.ts
    const [rows]: any = await pool.query(
      `SELECT * FROM inventory ORDER BY date_created DESC`
    );
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e: any) {
    console.error("Inventory Fetch Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}