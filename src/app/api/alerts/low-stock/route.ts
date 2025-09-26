// src/app/api/alerts/low-stock/route.ts
import { NextRequest } from "next/server";
import { notifyAdminsLowStock } from "@/lib/notify-admins";

export async function POST(req: NextRequest) {
  try {
    const { productName, quantity } = await req.json();

    if (!productName || !quantity) {
      return Response.json({ ok: false, error: "Missing productName or quantity" }, { status: 400 });
    }

    const result = await notifyAdminsLowStock(productName, quantity);
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
