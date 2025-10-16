import { NextRequest, NextResponse } from "next/server";
import supabase from "@/config/supabaseClient";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const DAYS_AHEAD = 7;
  const { data: items, error } = await supabase
    .from("inventory")
    .select("id, product_name, expiration_date")
    .gte("expiration_date", new Date().toISOString().slice(0, 10))
    .lte(
      "expiration_date",
      new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString().slice(0, 10)
    );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const newlyNotifiedItems: typeof items = [];

  for (const item of items) {
    const { data: existing } = await supabase
      .from("system_notifications")
      .select("id")
      .eq("item_id", item.id)
      .eq("type", "expiration")
      .eq("expires_at", item.expiration_date);

    if (!existing || existing.length === 0) {
      await supabase.from("system_notifications").insert([
        {
          type: "expiration",
          title: `Item Expiring Soon: ${item.product_name}`,
          message: `The item "${item.product_name}" is expiring on ${item.expiration_date}.`,
          item_id: item.id,
          item_name: item.product_name,
          expires_at: item.expiration_date,
        },
      ]);
      newlyNotifiedItems.push(item);
    }
  }

  console.log("Fetched expiring items:", items.length);
  console.log(
    "New notifications to send:",
    newlyNotifiedItems.length,
    newlyNotifiedItems.map((i) => i.product_name)
  );

  if (newlyNotifiedItems.length > 0) {
    const productList = newlyNotifiedItems
      .map(
        (item) =>
          `<li><strong>${item.product_name}</strong> — expires on <b>${item.expiration_date}</b></li>`
      )
      .join("");
    const htmlBody = `
      <h2>Expiration Alert: Items Expiring in the Next 7 Days</h2>
      <ul>${productList}</ul>
      <br />
      <small>This is an automated notification from the UniAsia Inventory System.</small>
    `;

    const adminEmails = [
      "harveyvoldan.hr@gmail.com",
      "jeffbarraca.hr@gmail.com",
      "jonasemil2bernabe@gmail.com",
      "admin1@gmail.com",
      "angelosrosario1011@gmail.com",
    ];
    console.log("Notifying admins:", adminEmails);

    try {
      await resend.emails.send({
        from: "UNI-ASIA Inventory <no-reply@uniasia.com>",
        to: adminEmails,
        subject: "Expiring Inventory Alert (Next 7 Days)",
        html: htmlBody,
      });
      console.log("Notification email sent successfully.");
    } catch (e) {
      console.error("Failed to send notification email:", e);
    }
  } else {
    console.log("No new expiring items to notify admins about.");
  }

  return NextResponse.json({ success: true, count: items.length });
}
