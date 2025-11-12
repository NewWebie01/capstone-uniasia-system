// src/app/api/webhooks/low-stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import notifyAdmins, { type LowStockItem } from "@/lib/notify-admins";

export const runtime = "nodejs";           // supabase-js needs Node runtime
export const dynamic = "force-dynamic";    // don't cache webhook responses

const WEBHOOK_SECRET = process.env.LOW_STOCK_WEBHOOK_SECRET!;
const THRESHOLD = 5; // tweak as needed

type AnyRec = Record<string, any>;

export async function POST(req: NextRequest) {
  try {
    // 1) Verify webhook secret
    const secret = req.headers.get("x-webhook-secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) Parse Supabase payload (works for insert/update)
    const payload = (await req.json().catch(() => ({}))) as {
      record?: AnyRec;
      old_record?: AnyRec;
      new?: AnyRec;
      old?: AnyRec;
      type?: string;
      table?: string;
    };

    const newRec: AnyRec | undefined = payload.record ?? payload.new ?? undefined;
    const oldRec: AnyRec | undefined = payload.old_record ?? payload.old ?? undefined;

    if (!newRec) {
      return NextResponse.json({ ok: true, note: "No record in payload" });
    }

    // 3) Extract fields safely
    const sku = String(newRec.sku ?? "");
    const product_name = String(
      newRec.product_name ?? newRec.name ?? newRec.title ?? ""
    );
    const qtyNow = Number(newRec.quantity ?? newRec.qty ?? 0);
    const qtyBefore = Number(
      oldRec?.quantity ?? oldRec?.qty ?? Number.POSITIVE_INFINITY
    );

    // 4) Only notify when crossing threshold downward, or if already below with no previous value
    const crossedDown =
      Number.isFinite(qtyBefore) && qtyBefore > THRESHOLD && qtyNow <= THRESHOLD;
    const alreadyLow = !Number.isFinite(qtyBefore) && qtyNow <= THRESHOLD;

    if (crossedDown || alreadyLow) {
      const items: LowStockItem[] = [{ sku, name: product_name, qty: qtyNow }];
      await notifyAdmins(items);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unhandled error" },
      { status: 500 }
    );
  }
}
