// src/app/api/alerts/low-stock/route.ts
import { NextRequest } from "next/server";
import { notifyAdminsLowStock } from "@/lib/notify-admins";

export async function POST(req: NextRequest) {
  try {
    const { productName, quantity, level, sku } = await req.json();

    if (!productName || quantity === undefined) {
      return Response.json(
        { ok: false, error: "Missing productName or quantity" },
        { status: 400 }
      );
    }

    const result = await notifyAdminsLowStock(
      String(productName),
      Number(quantity),
      level,
      sku
    );
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
