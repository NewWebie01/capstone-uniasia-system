// src/pages/api/tracking/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
);

function makeCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
  return out.replace(/(.{4})/g, "$1-").replace(/-$/, ""); // XXXX-XXXX
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Basic admin guard (replace with your admin auth)
    if (req.method !== "POST") return res.status(405).end();
    // expected input: { orderId: "uuid", customerId?: "uuid", ttlDays?: number }
    const { orderId, customerId, ttlDays = 7 } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const codePlain = makeCode(8);
    const codeHash = await bcrypt.hash(codePlain, 10);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    // Invalidate previous active code for this order
    await supabase
      .from("tracking_access_codes")
      .update({ is_active: false })
      .eq("order_id", orderId)
      .eq("is_active", true);

    // Insert new
    const { data, error } = await supabase.from("tracking_access_codes").insert({
      order_id: orderId,
      customer_id: customerId ?? null,
      code_hash: codeHash,
      expires_at: expiresAt,
      is_active: true,
    }).select().single();

    if (error) throw error;

    // Return the plaintext code once so you can email/SMS it
    return res.status(200).json({
      orderId,
      accessCode: codePlain, // DO NOT store this anywhere client-side long-term
      expiresAt: expiresAt,
      codeId: data.id,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
