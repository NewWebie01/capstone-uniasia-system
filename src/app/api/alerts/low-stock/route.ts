import { NextResponse } from "next/server";
import notifyAdmins, { type LowStockItem } from "@/lib/notify-admins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req?: Request) {
  try {
    const payload: any = req ? await req.json().catch(() => ({})) : {};
    const incoming = Array.isArray(payload?.items) ? payload.items : [];
    const items: LowStockItem[] = incoming.filter((x: any) => x && typeof x === "object");

    const result = await notifyAdmins(items);
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason ?? "unknown" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
// Optional: GET with no body just returns a 200 probe
export async function GET()  { return NextResponse.json({ ok: true }); }
