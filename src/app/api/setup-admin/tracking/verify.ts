// src/pages/api/tracking/verify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    // expected input: { orderNumber: string, code: string }
    const { orderNumber, code } = req.body || {};
    if (!orderNumber || !code) return res.status(400).json({ error: "orderNumber and code are required" });

    // 1) Find order by public order_number
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, delivery_eta, updated_at")
      .eq("order_number", orderNumber)
      .single();
    if (orderErr || !order) return res.status(404).json({ error: "Order not found" });

    // 2) Get active, non-expired code
    const nowIso = new Date().toISOString();
    const { data: codeRow, error: codeErr } = await supabase
      .from("tracking_access_codes")
      .select("id, code_hash, attempts, max_attempts, expires_at, is_active")
      .eq("order_id", order.id)
      .eq("is_active", true)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (codeErr || !codeRow) return res.status(403).json({ error: "Code invalid or expired" });
    if (codeRow.attempts >= codeRow.max_attempts) {
      await supabase.from("tracking_access_codes").update({ is_active: false }).eq("id", codeRow.id);
      return res.status(403).json({ error: "Too many attempts. Code locked." });
    }

    // 3) Compare
    const ok = await bcrypt.compare(code.replaceAll("-", "").toUpperCase(), codeRow.code_hash);
    if (!ok) {
      await supabase.from("tracking_access_codes").update({ attempts: codeRow.attempts + 1 }).eq("id", codeRow.id);
      return res.status(403).json({ error: "Code invalid" });
    }

    // (Optional) mark first use
    if (!codeRow.attempts) {
      await supabase.from("tracking_access_codes").update({ used_at: new Date().toISOString() }).eq("id", codeRow.id);
    }

    // 4) Fetch sanitized tracking data (add what you want to show)
    const { data: items } = await supabase
      .from("order_items")
      .select("product_name, quantity, unit, status")
      .eq("order_id", order.id);

    // 5) Return tracking info (NO internal IDs)
    return res.status(200).json({
      order: {
        orderNumber,
        status: order.status,
        deliveryETA: order.delivery_eta,
        lastUpdated: order.updated_at,
      },
      items: items || [],
      // You can add timeline scans, driver, truck plate, etc. if available
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
