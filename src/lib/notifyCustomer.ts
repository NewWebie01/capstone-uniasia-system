import { supabaseAdmin } from "./supabaseAdmin";

type AdminNotifType =
  | "order_approved"
  | "order_rejected"
  | "order_completed"
  | "payment_received"
  | "payment_rejected"
  | "invoice_sent"
  | "receipt_sent"
  | "delivery_scheduled"
  | "delivery_to_ship"
  | "delivery_to_receive"
  | "delivery_delivered"
  | "collection_notice";

export async function notifyCustomer(args: {
  recipientEmail: string;
  recipientName?: string | null;
  type: AdminNotifType;
  title: string;
  message: string;
  href?: string | null;
  orderId?: string | null;
  transactionCode?: string | null;
  metadata?: Record<string, any> | null;
  actorEmail: string; // admin email
}) {
  const { error } = await supabaseAdmin.from("system_notifications").insert([
    {
      type: args.type,
      title: args.title,
      message: args.message,
      href: args.href ?? null,
      order_id: args.orderId ?? null,
      transaction_code: args.transactionCode ?? null,
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      actor_email: args.actorEmail,
      actor_role: "admin",
      source: "admin",
      metadata: args.metadata ?? null,
    },
  ]);
  if (error) throw error;
}
