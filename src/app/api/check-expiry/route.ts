import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import supabase from "@/config/supabaseClient";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  try {
    // 1. Find items expiring in the next 7 days
    const today = new Date();
    const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { data: items, error } = await supabase
      .from("inventory")
      .select("id, product_name, expiration_date, quantity")
      .gte("expiration_date", today.toISOString().slice(0, 10))
      .lte("expiration_date", in7.toISOString().slice(0, 10));
    if (error) throw error;

    if (!items?.length) {
      return NextResponse.json({ message: "No expiring items." });
    }

    // 2. Get all admin emails (adjust for your schema/roles)
    const { data: admins, error: adminErr } = await supabase
      .from("users")
      .select("email, role")
      .eq("role", "admin");
    if (adminErr) throw adminErr;

    const emails = admins?.map((a: any) => a.email).filter(Boolean);
    if (!emails?.length) throw new Error("No admin emails found.");

    // 3. Send the email(s)
    const subject = `Inventory Expiry Alert – ${items.length} Item(s)`;
    const html = `
      <div style="font-family:DM Sans,Arial,sans-serif;">
        <h2 style="color:#f39c12;margin-bottom:4px;">Expiry Warning</h2>
        <p>The following inventory item(s) will expire within 7 days:</p>
        <ul>
          ${items
            .map(
              (item: any) =>
                `<li><b>${item.product_name}</b> – Qty: ${
                  item.quantity
                } – Expiry: <b>${item.expiration_date?.slice(0, 10)}</b></li>`
            )
            .join("")}
        </ul>
        <hr/>
        <div style="color:#888;font-size:0.97rem">UniAsia Inventory Alert</div>
      </div>
    `;

    await resend.emails.send({
      from: "UniAsia <sales@uniasia.shop>",
      to: emails,
      subject,
      html,
      text: `Expiring soon: ${items
        .map(
          (i: any) =>
            `${i.product_name} (expires ${i.expiration_date?.slice(0, 10)})`
        )
        .join(", ")}`,
    });

    return NextResponse.json({ success: true, sentTo: emails });
  } catch (err: any) {
    console.error("[check-expiry] ERROR:", err);
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
