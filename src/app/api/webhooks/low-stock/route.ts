// src/app/api/webhooks/low-stock/route.ts
import { NextRequest } from "next/server";
import { notifyAdminsLowStock } from "@/lib/notify-admins";

const WEBHOOK_SECRET = process.env.LOW_STOCK_WEBHOOK_SECRET!;
const THRESHOLD = 5;

export async function POST(req: NextRequest) {
  // 1. Security check (so only Supabase can call this)
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse payload (Supabase sends {record, old_record,...})
  const payload = await req.json().catch(() => ({}));
  const newRec = payload?.record;
  const oldRec = payload?.old_record;

  const productName =
    newRec?.product_name ?? payload?.productName ?? newRec?.name;
  const quantity =
    typeof newRec?.quantity === "number"
      ? newRec.quantity
      : Number(payload?.quantity);

  if (!productName || Number.isNaN(quantity)) {
    return Response.json(
      { ok: false, error: "Missing productName or quantity" },
      { status: 400 }
    );
  }

  // 3. Only fire when stock crosses from >THRESHOLD → <=THRESHOLD
  const wasAbove =
    typeof oldRec?.quantity === "number" ? oldRec.quantity > THRESHOLD : true;
  const nowLow = quantity <= THRESHOLD;

  if (!(wasAbove && nowLow)) {
    return Response.json({ ok: true, skipped: true });
  }

  // 4. Send email notification
  try {
    const result = await notifyAdminsLowStock(productName, quantity);
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
