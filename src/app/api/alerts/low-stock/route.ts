// src/app/api/alerts/low-stock/route.ts
import { NextResponse } from "next/server";
import notifyAdmins, { type LowStockItem } from "@/lib/notify-admins";

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const incoming = Array.isArray(payload?.items) ? payload.items : [];
    const items: LowStockItem[] = incoming.filter((x: any) => x && typeof x === "object");

    const result = await notifyAdmins(items);
    if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason ?? "unknown" }, { status: 400 });

    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
