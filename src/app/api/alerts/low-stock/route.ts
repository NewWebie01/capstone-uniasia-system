// src/app/api/webhooks/low-stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { notifyAdminsLowStock } from "@/lib/notify-admins";

export const runtime = "nodejs";          // supabase-js requires Node runtime
export const dynamic = "force-dynamic";   // don't cache webhook responses

const WEBHOOK_SECRET = process.env.LOW_STOCK_WEBHOOK_SECRET!;
const THRESHOLD = 5; // tweak as needed

type AnyRec = Record<string, any>;

export async function POST(req: NextRequest) {
  try {
    // 1) Verify webhook secret (only Supabase should call this)
    const secret = req.headers.get("x-webhook-secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse Supabase payload (handles insert/update)
    const payload = (await req.json().catch(() => ({}))) as {
      record?: AnyRec;
      old_record?: AnyRec;
      type?: string;
      table?: string;
    };

    const rec = payload.record ?? {};
    const old = payload.old_record ?? {};

    // safe fields
    const sku: string = rec.sku ?? old.sku ?? "";
    const product_name: string = rec.product_name ?? old.product_name ?? "";
    const qtyNow: number = Number.isFinite(rec.quantity) ? Number(rec.quantity) : 0;
    const qtyWas: number = Number.isFinite(old.quantity) ? Number(old.quantity) : qtyNow;

    // 3) Decide when to notify
    const crossedDown = qtyWas > THRESHOLD && qtyNow <= THRESHOLD;
    const alreadyLow = qtyNow <= THRESHOLD && qtyWas !== qtyNow;

    if (crossedDown || alreadyLow) {
      // send with expected keys and as an array
      await notifyAdminsLowStock([
        {
          sku,
          name: product_name,
          qty: qtyNow,
        },
      ]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[low-stock webhook] error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
