// src/app/api/customer-notifications/payment-received/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PaymentRow = {
  id: string;
  customer_id: string;
  order_id: string | null;
  amount: number;
  method: string | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_date: string | null;
};

export async function POST(req: Request) {
  try {
    const { paymentId, adminEmail } = await req.json();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1) Load payment
    const { data: pay, error: pErr } = await supabase
      .from("payments")
      .select("id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date")
      .eq("id", paymentId)
      .maybeSingle();

    if (pErr || !pay) {
      return NextResponse.json({ error: pErr?.message || "Payment not found." }, { status: 400 });
    }

    const payment = pay as PaymentRow;

    // 2) Load customer info for recipient
    // Prefer customers table; if missing email/code/name, fallback to orders->customer
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;
    let txnCode: string | null = null;

    const { data: cust } = await supabase
      .from("customers")
      .select("email, name, code")
      .eq("id", payment.customer_id)
      .maybeSingle();

    if (cust) {
      recipientEmail = (cust.email ?? null) && String(cust.email).toLowerCase();
      recipientName = cust.name ?? null;
      txnCode = cust.code ?? null;
    }

    if ((!recipientEmail || !txnCode || !recipientName) && payment.order_id) {
      const { data: ord } = await supabase
        .from("orders")
        .select("id, customer:customer_id ( email, name, code )")
        .eq("id", payment.order_id)
        .maybeSingle();

      const raw = (ord as any)?.customer;
      const c = Array.isArray(raw) ? raw[0] : raw;
      if (c) {
        recipientEmail = recipientEmail || (c.email ? String(c.email).toLowerCase() : null);
        recipientName = recipientName ?? (c.name ?? null);
        txnCode = txnCode ?? (c.code ?? null);
      }
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Recipient email not found on customer/order." },
        { status: 400 }
      );
    }

    const prettyAmount = `₱${Number(payment.amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    // 3) Insert customer notification
    const { error: nErr } = await supabase.from("customer_notifications").insert([
      {
        type: "payment_received",
        title: "Payment Received",
        message: `We received your payment of ${prettyAmount}${txnCode ? ` for TXN ${txnCode}` : ""}. Thank you!`,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        transaction_code: txnCode,
        actor_email: adminEmail || null,
        actor_role: "admin",
        source: "admin",
        metadata: {
          payment_id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          method: payment.method,
          cheque_number: payment.cheque_number,
          bank_name: payment.bank_name,
          cheque_date: payment.cheque_date,
        },
      },
    ]);

    if (nErr) {
      return NextResponse.json({ error: nErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}
