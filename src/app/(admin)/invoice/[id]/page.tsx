"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import supabase from "@/config/supabaseClient";
import DeliveryReceiptLikeInvoice, {
  InvoiceItem,
  CustomerInfo,
} from "@/components/DeliveryReceiptLikeInvoice";

type OrderItemRow = {
  id: string;
  quantity: number;
  unit?: string;
  description?: string;
  unit_price?: number;
  discount?: number;
  inventory: {
    product_name: string;
    unit?: string;
    unit_price?: number;
  } | null;
};

type OrderRow = {
  id: string;
  created_at: string;
  customers: { name: string; address?: string } | null;
  order_items: OrderItemRow[];
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [items, setItems] = useState<InvoiceItem[] | null>(null);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const fetchOne = async () => {
      setLoading(true);

      // NOTE: joins mirror your older code style:
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id, created_at,
          customers ( name, address ),
          order_items (
            id, quantity, unit, description, unit_price, discount,
            inventory:inventory_id ( product_name, unit, unit_price )
          )
        `
        )
        .eq("id", orderId)
        .single();

      if (!error && data) {
        const row = data as unknown as OrderRow;

        setCustomer({
          name: row.customers?.name ?? "—",
          address: row.customers?.address ?? "",
        });
        setDate(row.created_at?.slice(0, 10));

        // prefer order_items.unit_price when present; otherwise fallback to inventory.unit_price
        const mapped: InvoiceItem[] = (row.order_items || []).map((it) => ({
          id: it.id,
          qty: it.quantity,
          unit: it.unit || it.inventory?.unit || "pcs",
          description: it.description || it.inventory?.product_name || "",
          unitPrice: Number(
            typeof it.unit_price === "number"
              ? it.unit_price
              : it.inventory?.unit_price || 0
          ),
          discount: Number(it.discount || 0),
        }));

        setItems(
          mapped.length
            ? mapped
            : [
                {
                  id: "empty",
                  qty: 1,
                  unit: "pcs",
                  description: "No items found.",
                  unitPrice: 0,
                  discount: 0,
                },
              ]
        );
      } else {
        setCustomer({ name: "—", address: "" });
        setItems([
          {
            id: "fallback",
            qty: 1,
            unit: "pcs",
            description: "Invoice not found.",
            unitPrice: 0,
            discount: 0,
          },
        ]);
      }

      setLoading(false);
    };

    fetchOne();
  }, [orderId]);

  if (loading || !items || !customer) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-neutral-600">
        Loading invoice…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6 print:bg-white">
      <div className="mx-auto max-w-4xl bg-white p-6 shadow print:shadow-none">
        <div className="mb-4">
          <a
            href="/invoice"
            className="text-sm underline underline-offset-2 text-neutral-600 hover:text-neutral-800"
          >
            ← Back to list
          </a>
        </div>

        <DeliveryReceiptLikeInvoice
          customer={customer}
          initialItems={items}
          initialDate={date}
        />
      </div>
    </div>
  );
}
