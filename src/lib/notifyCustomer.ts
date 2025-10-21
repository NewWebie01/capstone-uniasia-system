// src/lib/notifyCustomer.ts
import supabase from "@/config/supabaseClient";

type NotifyArgs = {
  recipientEmail: string;
  recipientName?: string | null;
  type:
    | "order_approved" | "order_rejected" | "order_completed"
    | "payment_received" | "payment_rejected"
    | "invoice_sent" | "receipt_sent"
    | "delivery_scheduled" | "delivery_to_ship" | "delivery_to_receive" | "delivery_delivered";
  title: string;
  message: string;
  href?: string | null;
  orderId?: string | null;
  transactionCode?: string | null;
  metadata?: Record<string, any> | null;
  actorEmail: string;                          // the admin
  actorRole?: "admin" | "customer";
  source?: "admin" | "system" | "customer";
};

export async function notifyCustomer(a: NotifyArgs) {
  const { error } = await supabase.from("system_notifications").insert([{
    type: a.type,
    title: a.title,
    message: a.message,
    href: a.href ?? null,
    order_id: a.orderId ?? null,
    transaction_code: a.transactionCode ?? null,
    recipient_email: a.recipientEmail,
    recipient_name: a.recipientName ?? null,
    actor_email: a.actorEmail,
    actor_role: a.actorRole ?? "admin",
    source: a.source ?? "admin",
    metadata: a.metadata ?? null,
  }]);
  if (error) throw error;
}
