import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { generatePdfFromHtml } from "@/lib/generateReceiptPdfPuppeteer";
import supabase from "@/config/supabaseClient";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { orderId } = await req.json();
  if (!orderId)
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  // Fetch order and customer data...
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id, date_created,
      customers:customer_id (name, email, phone, address),
      order_items (quantity, price, inventory:inventory_id (product_name, sku, unit))
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order)
    return NextResponse.json({ error: orderError?.message || "Order not found" }, { status: 500 });

  let customer = order.customers as any;
  if (Array.isArray(customer)) customer = customer[0];
  if (!customer || !customer.email)
    return NextResponse.json({ error: "Customer email not found." }, { status: 400 });

  // ---- Render HTML for the receipt (simple demo) ----
  // Replace this with your real invoice HTML template!
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; }
          h1 { color: #111; text-align: center; }
          .subtitle { color: #C48A12; text-align: center; letter-spacing: 2px; }
          .info-table { width: 100%; margin-bottom: 24px; }
          .info-table td { padding: 4px 10px; }
          table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          table.items th, table.items td { border: 1px solid #ddd; padding: 8px; font-size: 13px; }
          table.items th { background: #ffbe4a; color: #333; }
        </style>
      </head>
      <body>
        <h1>UNIASIA</h1>
        <div class="subtitle">DELIVERY RECEIPT</div>
        <table class="info-table">
          <tr>
            <td><b>Customer:</b> ${customer.name}</td>
            <td><b>Date:</b> ${order.date_created?.slice(0, 10) || ""}</td>
          </tr>
          <tr>
            <td><b>Address:</b> ${customer.address}</td>
            <td><b>Status:</b> Completed</td>
          </tr>
          <tr>
            <td><b>Email:</b> ${customer.email}</td>
            <td><b>Phone:</b> ${customer.phone || ""}</td>
          </tr>
        </table>
        <table class="items">
          <tr>
            <th>QTY</th>
            <th>UNIT</th>
            <th>ITEM DESCRIPTION</th>
            <th>UNIT PRICE</th>
            <th>AMOUNT</th>
          </tr>
          ${
            order.order_items
              .map(
                (item: any) => `
            <tr>
              <td>${item.quantity}</td>
              <td>${item.inventory.unit}</td>
              <td>${item.inventory.product_name}</td>
              <td>₱${Number(item.price).toLocaleString("en-PH", {minimumFractionDigits:2})}</td>
              <td>₱${(item.price * item.quantity).toLocaleString("en-PH", {minimumFractionDigits:2})}</td>
            </tr>
          `
              )
              .join("")
          }
        </table>
        <div style="margin-top:30px;font-size:12px;">
          <b>Notes:</b>
          <ol>
            <li>All goods are checked in good condition and complete after received and signed.</li>
            <li>Cash advances to salesman not allowed.</li>
            <li>All checks payable to By–Grace Trading only.</li>
          </ol>
        </div>
      </body>
    </html>
  `;

  // ---- Generate PDF ----
  let attachments: any[] = [];
  try {
    const pdfBuffer = await generatePdfFromHtml(html);
    attachments.push({
      filename: `receipt-${order.id}.pdf`,
      content: pdfBuffer.toString("base64"),
      type: "application/pdf",
    });
  } catch (e) {
    console.error("Failed to generate PDF receipt:", e);
  }

  // ---- Send email via Resend ----
  try {
    await resend.emails.send({
      from: "UniAsia Sales <sales@uniasia.shop>",
      to: [customer.email],
      subject: `Order Approved! [#${order.id}] – UniAsia Sales Receipt`,
      text: `Hi ${customer.name || "Customer"},\n\nYour order has been approved. Please see your receipt attached.\nThank you for choosing UniAsia!`,
      attachments,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
