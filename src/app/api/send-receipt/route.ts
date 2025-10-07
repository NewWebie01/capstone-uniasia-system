// src/app/api/send-receipt/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { generateReceiptPdfBuffer } from "@/lib/generateReceiptPdfPuppeteer";
import supabase from "@/config/supabaseClient";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // 1. Fetch order, customer, and items
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        date_created,
        transaction_code,
        customers:customer_id (
          name, email, phone, address, contact_person, code, area, landmark, payment_type, customer_type,
          region_code, province_code, city_code, barangay_code, house_street
        ),
        order_items (
          quantity, price, inventory:inventory_id (
            product_name, category, subcategory, status, unit, unit_price
          )
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("[send-receipt] Supabase fetch error:", orderError);
      return NextResponse.json({ error: orderError?.message || "Order not found" }, { status: 500 });
    }

    let customer = order.customers as any;
    if (Array.isArray(customer)) customer = customer[0];
    if (!customer || !customer.email) {
      return NextResponse.json({ error: "Customer email not found." }, { status: 400 });
    }

    // Prepare PSGC/codes/address data (pass-thru for now)
    const regionCode = customer.region_code || "";
    const provinceCode = customer.province_code || "";
    const cityCode = customer.city_code || "";
    const barangayCode = customer.barangay_code || "";
    const houseStreet = customer.house_street || "";
    const transactionCode = order.transaction_code || customer.code || order.id;

    // Optional: fetch PSGC names for region/province/city/barangay (skipped for now)
    const regions: any[] = [];
    const provinces: any[] = [];
    const cities: any[] = [];
    const barangays: any[] = [];

    // Map order items
    const items = (order.order_items || []).map((oi: any) => ({
      item: {
        product_name: oi.inventory?.product_name || "-",
        category: oi.inventory?.category || "-",
        subcategory: oi.inventory?.subcategory || "-",
        unit: oi.inventory?.unit || "-",
        status: oi.inventory?.status || "-",
        unit_price: oi.inventory?.unit_price ?? oi.price ?? 0,
      },
      quantity: oi.quantity,
    }));

    // 2. Generate PDF (using Puppeteer)
    let attachments: any[] = [];
    try {
      const pdfBuffer = await generateReceiptPdfBuffer({
        customer,
        items,
        regions,
        provinces,
        cities,
        barangays,
        codes: { regionCode, provinceCode, cityCode, barangayCode },
        houseStreet,
        date: new Date(order.date_created || Date.now()).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
        transactionCode,
      });

      attachments.push({
        filename: `receipt-${order.id}.pdf`,
        content: Buffer.from(pdfBuffer).toString("base64"),
        type: "application/pdf",
      });
    } catch (e) {
      console.error("[send-receipt] PDF generation failed:", e);
    }

    // 3. Send Email via Resend (TXN/transactionCode in subject)
    try {
      await resend.emails.send({
        from: "UniAsia Sales <sales@uniasia.shop>",
        to: [customer.email],
        subject: `Order Approved! – ${transactionCode} – (*this is not a receipt*)`,
        text: `Hi ${customer.name || "Customer"},\n\nYour order has been approved. Please see your receipt attached.\nThank you for choosing UniAsia!`,
        attachments,
      });
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error("[send-receipt] Email send error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } catch (err: any) {
    // TOP-LEVEL fallback: print stack trace
    console.error("[send-receipt] UNHANDLED ERROR:", err);
    return NextResponse.json({ error: String(err?.stack || err?.message || err) }, { status: 500 });
  }
}
