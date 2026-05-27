import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = `UniAsia Hardware <${process.env.RESEND_FROM!}>`;

/** Set to 0.12 for 12% VAT. Set to 0 if you don't want tax added. */
const TAX_PERCENT: number = 0.12;

const php = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

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

    const toEmail: string | null = customer?.email ?? null;
    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: "Customer has no email" },
        { status: 400 }
      );
    }

    // 2) Compute totals (subtotal, tax, shipping, cheque)
    const items = order.order_items || [];
    const subtotal = items.reduce(
      (s: number, it: any) =>
        s + (Number(it.price) || 0) * (Number(it.quantity) || 0),
      0
    );

    const ship = Number(order.shipping_fee || 0);

    // Preferred: stored grand total (often includes discounts/interest/tax).
    const storedGrand = Number(order.grand_total_with_interest || 0);

    // Compute tax if TAX_PERCENT > 0. If you rely on storedGrand, we won't double-add tax.
    const computedTax =
      TAX_PERCENT > 0 ? +(subtotal * TAX_PERCENT).toFixed(2) : 0;

    // Base total to show (before shipping):
    // - If a stored grand total exists, we show that (so we don't double-count).
    // - Otherwise we show subtotal + computedTax.
    const baseTotal = storedGrand > 0 ? storedGrand : subtotal + computedTax;

    // Amount the customer should prepare on the cheque
    const chequeAmount = baseTotal + ship;

    // For the email "Tax" line:
    // - If TAX_PERCENT > 0 and we didn't use storedGrand, show computedTax.
    // - If TAX_PERCENT == 0 but storedGrand > subtotal, we can show the inferred difference as "Tax/Adj."
    const showTaxValue =
      storedGrand > 0
        ? // inferred (may include tax/interest). Show only if positive and you want a row.
          Math.max(0, +(storedGrand - subtotal).toFixed(2))
        : computedTax;

    // 3) Compose email
    const subject = `Cheque Collection Notice – TXN ${
      customer.code ?? order.id
    }`;
    const lines = items
      .map((it: any) => {
        const name = it?.inventory?.product_name ?? "Item";
        return `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${name}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">
            ${Number(it.quantity) || 0}
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">
            ${php(Number(it.price || 0))}
          </td>
        </tr>`;
      })
      .join("");

    // Summary rows under the table
    const taxRow =
      showTaxValue > 0
        ? `<tr>
             <td colspan="2" style="padding:6px 8px;text-align:right;border-top:1px solid #ddd">
               <b>${
                 storedGrand > 0 && TAX_PERCENT === 0
                   ? "Tax/Adj."
                   : `Sales Tax (${Math.round(TAX_PERCENT * 100)}%)`
               }</b>
             </td>
             <td style="padding:6px 8px;text-align:right;border-top:1px solid #ddd">${php(
               showTaxValue
             )}</td>
           </tr>`
        : "";

    const baseRowLabel =
      storedGrand > 0 ? "Grand Total (stored)" : "Subtotal + Tax";

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 8px">Cheque Collection Notice</h2>
        <p>Hello ${customer.name ?? "Customer"},</p>
        <p>Our agent is scheduled to collect your cheque on <b>${
          eta ? new Date(eta).toLocaleDateString("en-PH") : "the scheduled date"
        }</b>.</p>

        <p style="margin:0 0 6px"><b>Transaction:</b> ${
          customer.code ?? order.id
        }</p>
        <p style="margin:0 0 12px"><b>Address:</b> ${
          customer.address ?? "—"
        }</p>

        <table style="border-collapse:collapse;width:100%;margin:12px 0 4px">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">Item</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc">Qty</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc">Price</th>
            </tr>
          </thead>
          <tbody>
            ${
              lines ||
              `<tr><td colspan="3" style="padding:8px">Summary unavailable.</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:6px 8px;text-align:right;border-top:1px solid #ddd"><b>Subtotal</b></td>
              <td style="padding:6px 8px;text-align:right;border-top:1px solid #ddd">${php(
                subtotal
              )}</td>
            </tr>
            ${taxRow}
            <tr>
              <td colspan="2" style="padding:6px 8px;text-align:right;border-top:1px solid #ddd"><b>${baseRowLabel}</b></td>
              <td style="padding:6px 8px;text-align:right;border-top:1px solid #ddd">${php(
                baseTotal
              )}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:6px 8px;text-align:right;border-top:1px solid #ddd"><b>Shipping Fee</b></td>
              <td style="padding:6px 8px;text-align:right;border-top:1px solid #ddd">${php(
                ship
              )}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:8px;text-align:right;border-top:2px solid #000"><b>Cheque Amount to prepare</b></td>
              <td style="padding:8px;text-align:right;border-top:2px solid #000"><b>${php(
                chequeAmount
              )}</b></td>
            </tr>
          </tfoot>
        </table>

        <p style="margin:14px 0 0">Thank you,<br/>UniAsia Hardware</p>
      </div>
    `;

    // 4) Send email (STRICT: throw if not accepted)
    const sendRes = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
    });

    if ((sendRes as any).error) {
      return NextResponse.json(
        { ok: false, error: (sendRes as any).error },
        { status: 502 }
      );
    }

    // 5) Log in system_notifications (optional)
    await supabaseAdmin.from("system_notifications").insert([
      {
        type: "delivery_scheduled",
        title: "Cheque collection scheduled",
        message: `We will collect your cheque on ${
          eta ? new Date(eta).toLocaleDateString("en-PH") : "the scheduled date"
        }. Amount: ${php(chequeAmount)}`,
        recipient_email: toEmail,
        recipient_name: customer?.name ?? null,
        order_id: order.id,
        transaction_code: customer?.code ?? null,
        actor_email: "system@uniasia",
        actor_role: "admin",
        source: "admin",
        metadata: {
          eta: eta ?? null,
          subtotal,
          tax: showTaxValue,
          base_total: baseTotal,
          shipping_fee: ship,
          cheque_total: chequeAmount,
        },
      },
    ]);

    return NextResponse.json({
      ok: true,
      resendId: (sendRes as any).id ?? null,
      subtotal,
      tax: showTaxValue,
      baseTotal,
      shipping_fee: ship,
      chequeAmount,
    });
  } catch (err: any) {
    console.error("notify-collection fatal:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
