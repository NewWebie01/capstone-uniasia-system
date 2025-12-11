// src/app/api/notify-admin-order/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import supabase from "@/config/supabaseClient"; // 👈 reuse your existing client

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { orderId, transactionCode, customer, totals, items } = body as {
      orderId: number | string;
      transactionCode: string;
      customer: {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
      };
      totals: {
        subtotal: number;
        paymentType?: string;
        termsMonths?: number | null;
        interestPercent?: number | null;
      };
      items: {
        product_name: string;
        category?: string;
        subcategory?: string;
        quantity: number;
        unit_price: number;
      }[];
    };

    /* 1️⃣ Fetch ALL admin emails from the view */
    const { data: adminRows, error: adminErr } = await supabase
      .from("v_admin_emails")
      .select("email");

    if (adminErr) {
      console.error("Failed to fetch admin emails:", adminErr);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch admin emails" },
        { status: 500 }
      );
    }

    const adminEmails = adminRows?.map((r) => r.email).filter(Boolean) ?? [];

    if (!adminEmails.length) {
      console.error("No admin emails found in v_admin_emails");
      return NextResponse.json(
        { ok: false, error: "No admin recipients" },
        { status: 500 }
      );
    }

    /* 2️⃣ Build email HTML */
    const subtotalStr = (Number(totals.subtotal) || 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
    });

    const paymentBlock =
      totals.paymentType === "Credit"
        ? `
        <p>
          <strong>Payment Type:</strong> Credit<br/>
          <strong>Terms:</strong> ${totals.termsMonths ?? "-"} month(s)<br/>
          <strong>Interest:</strong> ${totals.interestPercent ?? 0}%
        </p>`
        : `
        <p>
          <strong>Payment Type:</strong> Cash
        </p>`;

    const itemsRows = items
      .map(
        (it) => `
        <tr>
          <td>${it.product_name}</td>
          <td>${it.category ?? ""}</td>
          <td>${it.subcategory ?? ""}</td>
          <td>${it.quantity}</td>
          <td>₱${(Number(it.unit_price) || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</td>
        </tr>`
      )
      .join("");

    /* 3️⃣ Send email to ALL admins from the view */
    await resend.emails.send({
      from: "UNIASIA System <no-reply@uniasia.shop>", // use your verified sender
      to: adminEmails,
      subject: `New Customer Order – ${transactionCode}`,
      html: `
        <h2>New Customer Order</h2>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Transaction Code:</strong> ${transactionCode}</p>

        <h3>Customer Info</h3>
        <p>
          <strong>Name:</strong> ${customer.name || "-"}<br/>
          <strong>Email:</strong> ${customer.email || "-"}<br/>
          <strong>Phone:</strong> ${customer.phone || "-"}<br/>
          <strong>Address:</strong> ${customer.address || "-"}
        </p>

        <h3>Order Summary</h3>
        ${paymentBlock}
        <p><strong>Subtotal:</strong> ${subtotalStr}</p>

        <h3>Items</h3>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Qty</th>
              <th>Unit Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify-admin-order] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send admin order email" },
      { status: 500 }
    );
  }
}
