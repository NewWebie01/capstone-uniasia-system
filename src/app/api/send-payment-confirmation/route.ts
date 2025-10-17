import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

/** Ensure server runtime on Vercel */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------- Env helpers ------------------------- */
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

const SUPABASE_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_KEY = need("RESEND_API_KEY");

/* ------------------------- Clients ------------------------- */
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resend = new Resend(RESEND_KEY);

/* ------------------------- Types & utils ------------------------- */
type Action = "receive" | "reject";
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });

/* ------------------------- Handler ------------------------- */
export async function POST(req: NextRequest) {
  try {
    const { paymentId, action }: { paymentId?: string; action?: Action } =
      await req.json().catch(() => ({} as any));

    if (!paymentId || !action || !["receive", "reject"].includes(action)) {
      return NextResponse.json({ error: "Missing or invalid payload" }, { status: 400 });
    }

    // Fetch payment + customer using service role (bypass RLS)
    const { data: payment, error } = await db
      .from("payments")
      .select(
        `
        id,
        amount,
        cheque_number,
        bank_name,
        status,
        created_at,
        customer_id,
        customers:customer_id (name, email)
      `
      )
      .eq("id", paymentId)
      .single();

    if (error || !payment) {
      return NextResponse.json(
        { error: error?.message || "Payment not found" },
        { status: 404 }
      );
    }

    // Safety: only email if DB status matches the intended action
    const s = String(payment.status || "").toLowerCase();
    if ((action === "receive" && s !== "received") || (action === "reject" && s !== "rejected")) {
      return NextResponse.json(
        { error: `Payment is not marked as ${action}.` },
        { status: 409 }
      );
    }

    // Normalize nested customer
    const customerRaw = Array.isArray(payment.customers)
      ? payment.customers[0]
      : payment.customers;
    const customerEmail: string | undefined = customerRaw?.email || undefined;
    const customerName: string = customerRaw?.name || "Customer";

    if (!customerEmail) {
      return NextResponse.json({ error: "Customer email not found." }, { status: 400 });
    }

    const subject =
      action === "receive" ? "Your Payment Has Been Received" : "Your Payment Has Been Rejected";

    const html =
      action === "receive"
        ? `
        <div style="font-family:DM Sans,Arial,sans-serif;">
          <h2 style="color:#1b8838;margin-bottom:4px;">Payment Received</h2>
          <p>Dear <b>${customerName}</b>,</p>
          <p>We have received your payment for cheque <b>${payment.cheque_number || "-"}</b> from
          <b>${payment.bank_name || "-"}</b>, amounting to <b>₱${peso(payment.amount)}</b>.</p>
          <p>Thank you for trusting <b>UniAsia</b>!</p>
          <hr/><div style="color:#888;font-size:0.97rem">Questions? sales@uniasia.shop</div>
        </div>`
        : `
        <div style="font-family:DM Sans,Arial,sans-serif;">
          <h2 style="color:#e54848;margin-bottom:4px;">Payment Rejected</h2>
          <p>Dear <b>${customerName}</b>,</p>
          <p>Your cheque payment <b>${payment.cheque_number || "-"}</b> from <b>${payment.bank_name || "-"}</b>
          (₱${peso(payment.amount)}) has been <b>rejected</b>. Please contact UniAsia for details or try another method.</p>
          <hr/><div style="color:#888;font-size:0.97rem">Questions? sales@uniasia.shop</div>
        </div>`;

    const text =
      action === "receive"
        ? `Hi ${customerName},\n\nWe have received your payment. Thank you for trusting UniAsia!`
        : `Hi ${customerName},\n\nYour cheque payment was rejected. Please contact UniAsia for details.`;

    // Send email via Resend
    const { data: sent, error: sendErr } = await resend.emails.send({
      from: "UniAsia <sales@uniasia.shop>",
      to: [customerEmail],
      subject,
      html,
      text,
      replyTo: ["sales@uniasia.shop"],
    });

    if (sendErr) {
      console.error("[Resend] send error:", sendErr);
      return NextResponse.json(
        { error: `Resend: ${sendErr.name ?? "Error"} - ${sendErr.message ?? "send failed"}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, id: sent?.id ?? null });
  } catch (e: any) {
    console.error("[send-payment-confirmation] ERROR:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
