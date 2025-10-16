import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import supabase from "@/config/supabaseClient";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { paymentId, action } = await req.json();
    if (!paymentId || !action) {
      return NextResponse.json(
        { error: "Missing paymentId or action" },
        { status: 400 }
      );
    }

    // Fetch payment & customer
    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        `
        id, amount, cheque_number, bank_name, status, created_at, customer_id,
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

    let customer = payment.customers as any;
    if (Array.isArray(customer)) customer = customer[0];
    if (!customer || !customer.email) {
      return NextResponse.json(
        { error: "Customer email not found." },
        { status: 400 }
      );
    }

    // Email variables
    let subject = "";
    let html = "";
    let text = "";

    if (action === "receive") {
      subject = `Your Payment Has Been Received`;
      html = `
        <div style="font-family:DM Sans,Arial,sans-serif;">
          <h2 style="color:#1b8838;margin-bottom:4px;">Payment Received</h2>
          <p>Dear <b>${customer.name || "Customer"}</b>,</p>
          <p>We have received your payment for cheque <b>${
            payment.cheque_number || "-"
          }</b> from <b>${
        payment.bank_name || "-"
      }</b>, amounting to <b>₱${Number(payment.amount).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
      })}</b>.<br/>
          Thank you for trusting <b>UniAsia</b>!</p>
          <hr/>
          <div style="color:#888;font-size:0.97rem">If you have questions, contact us at sales@uniasia.shop</div>
        </div>
      `;
      text = `Hi ${
        customer.name || "Customer"
      },\n\nWe have received your payment.\nThank you for trusting UniAsia!`;
    } else if (action === "reject") {
      subject = `Your Payment Has Been Rejected`;
      html = `
        <div style="font-family:DM Sans,Arial,sans-serif;">
          <h2 style="color:#e54848;margin-bottom:4px;">Payment Rejected</h2>
          <p>Dear <b>${customer.name || "Customer"}</b>,</p>
          <p>Unfortunately, your cheque payment <b>${
            payment.cheque_number || "-"
          }</b> from <b>${payment.bank_name || "-"}</b> (₱${Number(
        payment.amount
      ).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
      })}) has been <b>rejected</b> by our staff.<br/>
          Please contact UniAsia for further details or try another payment method.</p>
          <hr/>
          <div style="color:#888;font-size:0.97rem">If you have questions, contact us at sales@uniasia.shop</div>
        </div>
      `;
      text = `Hi ${
        customer.name || "Customer"
      },\n\nWe regret to inform you that your cheque payment has been rejected. Please contact UniAsia for details.`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await resend.emails.send({
      from: "UniAsia <sales@uniasia.shop>",
      to: [customer.email],
      subject,
      html,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[send-payment-confirmation] ERROR:", err);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
