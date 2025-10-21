import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { generateReceiptPdfBuffer } from "@/lib/generateReceiptPdfPuppeteer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const resend = new Resend(RESEND_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // Fetch order + related
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        id,
        date_created,
        total_amount,
        status,
        customers:customer_id (
          id, name, email, phone, address, contact_person,
          code, area, payment_type, customer_type
        ),
        order_items (
          quantity, price,
          inventory:inventory_id (
            product_name, category, subcategory, unit, unit_price, status
          )
        )
      `
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("[send-receipt] Supabase fetch error:", orderError);
      return NextResponse.json(
        { error: orderError?.message || "Order not found" },
        { status: 404 }
      );
    }

    const customer: any = Array.isArray(order.customers)
      ? order.customers[0]
      : order.customers;

    if (!customer?.email) {
      return NextResponse.json(
        { error: "Customer email not found" },
        { status: 400 }
      );
    }

    const transactionCode = customer.code || order.id;

    const items =
      order.order_items?.map((oi: any) => ({
        item: {
          product_name: oi.inventory?.product_name ?? "-",
          category: oi.inventory?.category ?? "-",
          subcategory: oi.inventory?.subcategory ?? "-",
          unit: oi.inventory?.unit ?? "-",
          status: oi.inventory?.status ?? "-",
          unit_price: oi.inventory?.unit_price ?? oi.price ?? 0,
        },
        quantity: oi.quantity,
      })) ?? [];

    // Try to generate PDF
    const attachments: {
      filename: string;
      content: string;
      contentType?: string;
    }[] = [];
    try {
      const pdfBuffer = await generateReceiptPdfBuffer({
        customer,
        items,
        date: new Date(order.date_created || Date.now()).toLocaleString(
          "en-PH",
          { timeZone: "Asia/Manila" }
        ),
        transactionCode,
      });

      const b64 = pdfBuffer.toString("base64");
      console.log("[send-receipt] PDF generated, bytes:", pdfBuffer.length);

      attachments.push({
        filename: `receipt-${order.id}.pdf`,
        content: b64,
        contentType: "application/pdf",
      });
    } catch (pdfErr) {
      console.error(
        "[send-receipt] PDF generation failed (sending without attachment):",
        pdfErr
      );
    }

    // Send email via Resend
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: "UniAsia Sales <sales@uniasia.shop>",
      to: [customer.email],
      subject: `Order Approved – ${transactionCode}`,
      text: `Hi ${
        customer.name || "Customer"
      },\n\nYour order has been approved. Your receipt is attached.\n\nThank you for choosing UniAsia!`,
      attachments,
    });

    if (sendError) {
      console.error("[send-receipt] Resend send error:", sendError);
      return NextResponse.json(
        { error: sendError.message || "Email send failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, id: sendData?.id ?? null });
  } catch (err: any) {
    console.error("[send-receipt] UNHANDLED ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
