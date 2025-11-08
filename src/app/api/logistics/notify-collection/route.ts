import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = `UniAsia Hardware <${process.env.RESEND_FROM!}>`;

export async function POST(req: Request) {
  try {
    const { orderId, eta } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "Missing orderId" },
        { status: 400 }
      );
    }

    // 1) Pull order + customer + items
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        status,
        terms,
        grand_total_with_interest,
        shipping_fee,
        customer:customer_id ( id, name, email, code, address ),
        order_items (
          quantity,
          price,
          inventory:inventory_id ( product_name )
        )
      `
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { ok: false, error: "Order not found", detail: orderErr },
        { status: 404 }
      );
    }

    const customer = Array.isArray(order.customer)
      ? order.customer[0]
      : order.customer;
    const toEmail = customer?.email;
    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: "Customer has no email" },
        { status: 400 }
      );
    }

    // compute totals
    const items = order.order_items || [];
    const subtotal = items.reduce(
      (s: number, it: any) =>
        s + (Number(it.price) || 0) * (Number(it.quantity) || 0),
      0
    );
    const ship = Number(order.shipping_fee || 0);
    // prefer stored grand total (with interest/tax) if available, else fallback
    const chequeAmount = Number(
      order.grand_total_with_interest ?? subtotal + ship
    );

    // 2) Compose email
    const subject = `Cheque Collection Notice – TXN ${
      customer.code ?? order.id
    }`;
    const lines = items
      .map((it: any) => {
        const name = it?.inventory?.product_name ?? "Item";
        return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${name}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${
                it.quantity
              }</td>
              <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">₱${Number(
                it.price || 0
              ).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}</td></tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 8px">Cheque Collection Notice</h2>
        <p>Hello ${customer.name ?? "Customer"},</p>
        <p>Our agent is scheduled to collect your cheque on <b>${
          eta ? new Date(eta).toLocaleDateString("en-PH") : "the scheduled date"
        }</b>.</p>
        <p><b>Transaction:</b> ${customer.code ?? order.id}<br/>
           <b>Address:</b> ${customer.address ?? "—"}</p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0 8px">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc">Item</th>
              <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #ccc">Qty</th>
              <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #ccc">Price</th>
            </tr>
          </thead>
          <tbody>${
            lines ||
            `<tr><td colspan="3" style="padding:8px">Summary unavailable.</td></tr>`
          }</tbody>
        </table>
        <p style="margin:8px 0"><b>Shipping Fee:</b> ₱${ship.toLocaleString(
          "en-PH",
          { minimumFractionDigits: 2 }
        )}</p>
        <p style="font-size:16px;margin:8px 0"><b>Cheque Amount to prepare: ₱${chequeAmount.toLocaleString(
          "en-PH",
          { minimumFractionDigits: 2 }
        )}</b></p>
        <p>Thank you,<br/>UniAsia Hardware</p>
      </div>
    `;

    // 3) Send email (STRICT: throw if not accepted)
    const sendRes = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
    });

    if ((sendRes as any).error) {
      // Resend returns { error } on failure
      return NextResponse.json(
        { ok: false, error: (sendRes as any).error },
        { status: 502 }
      );
    }

    // 4) Log in system_notifications (optional)
    await supabaseAdmin.from("system_notifications").insert([
      {
        type: "delivery_scheduled",
        title: "Cheque collection scheduled",
        message: `We will collect your cheque on ${
          eta ? new Date(eta).toLocaleDateString("en-PH") : "the scheduled date"
        }. Amount: ₱${chequeAmount.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
        })}`,
        recipient_email: toEmail,
        recipient_name: customer?.name ?? null,
        order_id: order.id,
        transaction_code: customer?.code ?? null,
        actor_email: "system@uniasia",
        actor_role: "admin",
        source: "admin",
        metadata: { chequeAmount, shipping_fee: ship, eta: eta ?? null },
      },
    ]);

    return NextResponse.json({
      ok: true,
      resendId: (sendRes as any).id ?? null,
      chequeAmount,
      shipping_fee: ship,
    });
  } catch (err: any) {
    console.error("notify-collection fatal:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
