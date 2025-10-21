// src/app/api/notify-customer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force Node runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Use service role so we can insert regardless of RLS
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Body coming from your fetch() calls in SalesPage
    const {
      recipientEmail,
      recipientName,
      type,
      title,
      message,
      href = null,
      orderId = null,
      transactionCode = null,
      metadata = null,
      actorEmail = "admin@system",
      actorRole = "admin",
      source = "admin",
    } = body || {};

    if (!recipientEmail || !type) {
      return NextResponse.json(
        { ok: false, error: "recipientEmail and type are required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("customer_notifications").insert({
      type,
      title,
      message,
      href,
      order_id: orderId,
      transaction_code: transactionCode,
      recipient_email: recipientEmail,       // 🔴 critical for customer bell filtering
      recipient_name: recipientName ?? null,
      actor_email: actorEmail ?? null,
      actor_role: actorRole ?? "admin",
      source: source ?? "admin",
      metadata: metadata ?? null,
    });

    if (error) {
      console.error("insert customer_notifications failed:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("notify-customer route error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
