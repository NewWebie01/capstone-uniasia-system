import { NextResponse } from "next/server";
import { pool } from "@/lib/db"; // Import from your db.ts

export async function GET() {
  try {
    // Using pool.query to fetch from your XAMPP database
    const [rows]: any = await pool.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email 
       FROM orders o 
       LEFT JOIN customers c ON o.customer_id = c.id 
       ORDER BY o.date_created DESC`
    );
    
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e: any) {
    console.error("Orders Fetch Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}