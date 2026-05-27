// src/app/(admin)/purchase-products/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation"; // ✅ removed useSearchParams (can conflict on Vercel)
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

import Sidebar from "@/components/Sidebar";

import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/* ----------------------------- Money ------------------------------ */
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Apply sequential discounts: [50, 1] => 100 -> 50 -> 49.5 */
function applySequentialDiscounts(base: number, discounts: number[]) {
  let price = toNum(base);
  for (const d of discounts) {
    const pct = toNum(d);
    price = price * (1 - pct / 100);
  }
  return Math.round(price * 100) / 100;
}

/** Receipt-style "50% 1%" */
function formatDiscountDisplay(discounts: number[]) {
  const clean = discounts
    .map((d) => toNum(d))
    .filter((d) => Number.isFinite(d) && d !== 0);
  if (!clean.length) return "";
  return clean.map((d) => `${d}%`).join(" ");
}

/** Parse "50% 1%" or "50 1" => [50, 1] */
function parseDiscounts(input: string) {
  const s = (input || "").trim();
  if (!s) return [];
  const nums = s
    .replace(/%/g, " ")
    .split(/[\s,]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  return nums;
}

/* ------------------------------ Types ----------------------------- */
type InventoryPick = {
  id: number;
  sku: string;
  product_name: string;
  category: string | null;
  subcategory: string | null;
  unit: string | null;
  cost_price: number | null;
  unit_price: number | null;
  markup_percent: number | null;
  discount_percent: number | null;
  quantity: number;
};

type PurchaseRow = {
  key: string;

  qty: number;
  sku: string;

  inventory_id: number | null; // chosen existing inventory row
  is_new_item: boolean; // create new inventory row?

  product_name: string;
  category: string;
  subcategory: string;
  unit: string;

  cost_price: number; // base cost per unit
  discounts_raw: string; // "50% 1%"
  markup_percent: number; // selling markup

  net_unit_cost: number; // after sequential discounts
  amount: number; // qty * net_unit_cost

  // optional fields for new item insert
  expiration_date: string | null; // dd/mm/yyyy
  ceiling_qty: number | null;
  pieces_per_unit: number | null;
  weight_per_piece_kg: number | null;
};

type PurchaseSummaryRow = {
  purchase_id: string;
  supplier_name: string | null;
  purchase_date: string | null;
  total_amount: number | null;
  total_paid: number | null;
  balance: number | null;
};

type PurchaseReceiptRow = {
  id: string;
  purchase_id: string;
  file_path: string;
  file_url: string; // signed URL (generated fresh on fetch)
  label: string | null;
  created_at: string;
};

type SupplierPaymentRow = {
  id: string;
  purchase_id: string;
  supplier_name: string | null;
  amount: number | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  created_at: string | null;
};

type ReceiptCountRow = { purchase_id: string; receipt_count: number };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function makeEmptyRow(): PurchaseRow {
  return {
    key: uid(),
    qty: 0,
    sku: "",

    inventory_id: null,
    is_new_item: false,

    product_name: "",
    category: "Uncategorized",
    subcategory: "",
    unit: "Piece",

    cost_price: 0,
    discounts_raw: "",
    markup_percent: 20,

    net_unit_cost: 0,
    amount: 0,

    expiration_date: null,
    ceiling_qty: null,
    pieces_per_unit: null,
    weight_per_piece_kg: null,
  };
}

/* ----------------------------- Date helper ----------------------------- */
function toISODateFromDDMMYYYY(ddmmyyyy: string) {
  const s = (ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(
    2,
    "0"
  )}T00:00:00.000Z`;
}

/* ----------------------------- Portal helper ----------------------------- */
function ClientPortal({ children }: { children: any }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ✅ simple client-side query param helper (NO useSearchParams)
function getClientQueryParam(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get(key) || "";
  } catch {
    return "";
  }
}

export default function PurchaseProductsPage() {
  const router = useRouter();

  /* ----------------------------- Sidebar state ----------------------------- */
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ----------------------------- Header fields ----------------------------- */
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");

  // Customer (your company) details (for receipt/header)
  const [customerName, setCustomerName] = useState("UniAsia");
  const [customerAddress, setCustomerAddress] = useState("");

  const [consignmentNo, setConsignmentNo] = useState("");
  const [poNo, setPoNo] = useState("");
  const [terms, setTerms] = useState("C.O.D.");
  const [purchaseDate, setPurchaseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  ); // yyyy-mm-dd

  /* ----------------------------- Inventory list ----------------------------- */
  const [inventory, setInventory] = useState<InventoryPick[]>([]);
  const [invLoading, setInvLoading] = useState(true);

  const inventoryById = useMemo(() => {
    const m = new Map<number, InventoryPick>();
    for (const it of inventory) m.set(it.id, it);
    return m;
  }, [inventory]);

  /* ----------------------------- Purchase rows ----------------------------- */
  const [rows, setRows] = useState<PurchaseRow[]>([]);

  /* ----------------------------- per-row combobox open state ----------------------------- */
  const [openPickers, setOpenPickers] = useState<Record<string, boolean>>({});
  const setPickerOpen = (rowKey: string, open: boolean) =>
    setOpenPickers((p) => ({ ...p, [rowKey]: open }));

  /* ----------------------------- Modals / states ----------------------------- */
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);

  const [isSavingInventory, setIsSavingInventory] = useState(false);
  const [isPostingLedger, setIsPostingLedger] = useState(false);

  // ledger modal fields
  const [ledgerAmount, setLedgerAmount] = useState<number>(0);
  const [ledgerDate, setLedgerDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  ); // yyyy-mm-dd
  const [ledgerMethod, setLedgerMethod] = useState<string>("Cash");
  const [ledgerNotes, setLedgerNotes] = useState<string>("");

  /* ===================== Purchases & Payments (Bottom) ===================== */
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseSummaryRow[]>(
    []
  );
  const [receiptCounts, setReceiptCounts] = useState<Record<string, number>>(
    {}
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showPurchaseDetails, setShowPurchaseDetails] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(
    null
  );

  const [purchaseReceipts, setPurchaseReceipts] = useState<PurchaseReceiptRow[]>(
    []
  );
  const [purchasePayments, setPurchasePayments] = useState<SupplierPaymentRow[]>(
    []
  );

  // add partial payment form (inside modal)
  const [payAmount2, setPayAmount2] = useState<number>(0);
  const [payDate2, setPayDate2] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [payMethod2, setPayMethod2] = useState<string>("Cash");
  const [payNotes2, setPayNotes2] = useState<string>("");

  // upload receipt (private bucket)
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptLabel, setReceiptLabel] = useState<string>("Official Receipt");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  /* ----------------------------- Fetch inventory ----------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setInvLoading(true);
      const { data, error } = await supabase
        .from("inventory")
        .select(
          "id, sku, product_name, category, subcategory, unit, cost_price, unit_price, markup_percent, discount_percent, quantity"
        )
        .order("product_name", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error(error);
        toast.error(error.message);
        setInventory([]);
      } else {
        setInventory((data || []) as any);
      }
      setInvLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ----------------------------- Row helpers ----------------------------- */
  function recomputeRow(r: PurchaseRow): PurchaseRow {
    const discounts = parseDiscounts(r.discounts_raw);
    const net = applySequentialDiscounts(r.cost_price, discounts);
    const amt = Math.round(net * toNum(r.qty) * 100) / 100;
    return { ...r, net_unit_cost: net, amount: amt };
  }

  function setRow(key: string, patch: Partial<PurchaseRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        return recomputeRow({ ...r, ...patch });
      })
    );
  }

  function addRow() {
    setRows((p) => [...p, makeEmptyRow()]);
  }

  function removeRow(key: string) {
    setRows((p) => p.filter((r) => r.key !== key));
  }

  function resetAll() {
    setSupplier("");
    setAddress("");
    setCustomerName("UniAsia");
    setCustomerAddress("");
    setConsignmentNo("");
    setPoNo("");
    setTerms("C.O.D.");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setRows([]);
    toast.success("Reset.");
  }

  const purchaseTotal = useMemo(
    () => rows.reduce((sum, r) => sum + toNum(recomputeRow(r).amount), 0),
    [rows]
  );

  /* ----------------------------- Pick inventory item ----------------------------- */
  function onPickInventoryItem(rowKey: string, invIdStr: string) {
    const invId = invIdStr ? Number(invIdStr) : NaN;
    if (!Number.isFinite(invId)) {
      setRow(rowKey, {
        inventory_id: null,
        sku: "",
        product_name: "",
        category: "Uncategorized",
        subcategory: "",
        unit: "Piece",
        is_new_item: false,
      });
      return;
    }

    const it = inventoryById.get(invId);
    if (!it) return;

    setRow(rowKey, {
      inventory_id: it.id,
      sku: it.sku || "",
      product_name: it.product_name || "",
      category: it.category || "Uncategorized",
      subcategory: it.subcategory || "",
      unit: it.unit || "Piece",
      is_new_item: false,
      markup_percent: it.markup_percent ?? 20,
    });
  }

  /* ----------------------------- Validation: which rows are valid ----------------------------- */
  function getValidRowsForInsert() {
    const valid = rows
      .map((r) => recomputeRow(r))
      .filter((r) => {
        if (toNum(r.qty) <= 0) return false;
        if (!String(r.sku || "").trim()) return false;

        if (r.is_new_item) {
          if (!String(r.product_name || "").trim()) return false;
          if (!String(r.category || "").trim()) return false;
          if (!String(r.subcategory || "").trim()) return false;
          if (!String(r.unit || "").trim()) return false;
          return true;
        }

        if (!r.inventory_id) return false;
        return true;
      });

    return valid;
  }

  /* ----------------------------- Insert/Replenish Inventory ----------------------------- */
  async function handleConfirmInsertInventory() {
    const valid = getValidRowsForInsert();
    if (!valid.length) {
      toast.error("No valid rows. Check Qty + SKU + selection/New item fields.");
      return;
    }

    setIsSavingInventory(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) {
        toast.error("Not logged in.");
        return;
      }

      for (const r of valid) {
        const qty = toNum(r.qty);

        // selling price = net cost * (1 + markup%)
        const unitPrice =
          Math.round(
            r.net_unit_cost * (1 + toNum(r.markup_percent) / 100) * 100
          ) / 100;

        if (!r.is_new_item && r.inventory_id) {
          // Replenish qty only (keep existing pricing)
          const it = inventoryById.get(r.inventory_id);
          if (!it) {
            toast.error(`Inventory item not found for ${r.sku}`);
            continue;
          }

          const newQty = toNum(it.quantity) + qty;

          const { error: updErr } = await supabase
            .from("inventory")
            .update({ quantity: newQty })
            .eq("id", r.inventory_id);

          if (updErr) {
            console.error(updErr);
            toast.error(`Replenish failed (${r.sku}): ${updErr.message}`);
            continue;
          }

          continue;
        }

        if (r.is_new_item) {
          const payload: any = {
            sku: String(r.sku).trim(),
            product_name: String(r.product_name).trim(),
            category: String(r.category || "Uncategorized").trim(),
            subcategory: String(r.subcategory || "").trim() || null,
            unit: String(r.unit || "Piece").trim(),
            quantity: qty,

            // pricing fields
            cost_price: Math.round(toNum(r.cost_price) * 100) / 100, // base cost
            markup_percent: toNum(r.markup_percent),
            unit_price: unitPrice,
            amount: Math.round(qty * unitPrice * 100) / 100,

            // optional
            ceiling_qty: r.ceiling_qty == null ? null : Number(r.ceiling_qty),
            pieces_per_unit:
              r.pieces_per_unit == null ? null : Number(r.pieces_per_unit),
            weight_per_piece_kg:
              r.weight_per_piece_kg == null
                ? null
                : Number(r.weight_per_piece_kg),
            expiration_date: r.expiration_date
              ? toISODateFromDDMMYYYY(r.expiration_date)
              : null,
          };

          const { error: insErr } = await supabase.from("inventory").insert([
            payload,
          ]);

          if (insErr) {
            console.error(insErr, payload);
            toast.error(`Insert failed (${r.sku}): ${insErr.message}`);
            continue;
          }
        }
      }

      toast.success("Inventory updated.");
      setShowInsertModal(false);

      // refresh inventory list
      const { data, error } = await supabase
        .from("inventory")
        .select(
          "id, sku, product_name, category, subcategory, unit, cost_price, unit_price, markup_percent, discount_percent, quantity"
        )
        .order("product_name", { ascending: true });

      if (!error) setInventory((data || []) as any);
    } finally {
      setIsSavingInventory(false);
    }
  }

  /* ===================== Purchases History (Bottom Table) ===================== */
  async function fetchPurchaseHistory() {
    setHistoryLoading(true);
    try {
      // primary: use view
      const { data, error } = await supabase
        .from("v_purchase_payment_summary")
        .select("*")
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      setPurchaseHistory((data || []) as any);

      // receipt counts (view)
      const { data: rc, error: rcErr } = await supabase
        .from("v_purchase_receipt_count")
        .select("*");

      if (rcErr) throw rcErr;

      const map: Record<string, number> = {};
      for (const r of (rc || []) as any as ReceiptCountRow[]) {
        map[r.purchase_id] = r.receipt_count || 0;
      }
      setReceiptCounts(map);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load purchase history.");
      setPurchaseHistory([]);
      setReceiptCounts({});
    } finally {
      setHistoryLoading(false);
    }
  }

  async function fetchPurchaseDetails(purchaseId: string) {
    // payments
    const { data: payData, error: payErr } = await supabase
      .from("supplier_payments")
      .select("id,purchase_id,supplier_name,amount,paid_at,method,notes,created_at")
      .eq("purchase_id", purchaseId)
      .order("paid_at", { ascending: false });

    if (payErr) throw payErr;
    setPurchasePayments((payData || []) as any);

    // receipts (select path + label, then generate fresh signed URLs)
    const { data: rData, error: rErr } = await supabase
      .from("purchase_receipts")
      .select("id,purchase_id,file_path,label,created_at")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: false });

    if (rErr) throw rErr;

    const base = (rData || []) as any[];
    const withSigned = await Promise.all(
      base.map(async (row) => {
        const file_path = String(row.file_path || "");
        let signedUrl = "";
        if (file_path) {
          const { data: signed, error: sErr } = await supabase.storage
            .from("purchase-receipts")
            .createSignedUrl(file_path, 60 * 60 * 24 * 7); // 7 days
          if (!sErr) signedUrl = signed?.signedUrl || "";
        }

        return {
          id: row.id,
          purchase_id: row.purchase_id,
          file_path,
          file_url: signedUrl,
          label: row.label ?? null,
          created_at: row.created_at,
        } as PurchaseReceiptRow;
      })
    );

    setPurchaseReceipts(withSigned);
  }

  async function openPurchaseDetails(purchaseId: string) {
    try {
      setSelectedPurchaseId(purchaseId);
      setShowPurchaseDetails(true);

      await fetchPurchaseDetails(purchaseId);

      const row = purchaseHistory.find((x) => x.purchase_id === purchaseId);
      const bal = Math.round(toNum(row?.balance) * 100) / 100;
      setPayAmount2(bal > 0 ? bal : 0);
      setPayDate2(new Date().toISOString().slice(0, 10));
      setPayMethod2("Cash");
      setPayNotes2("");
      setReceiptFile(null);
      setReceiptLabel("Official Receipt");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to open purchase details.");
    }
  }

  async function addPartialPayment() {
    if (!selectedPurchaseId) return;

    const amt = Math.round(toNum(payAmount2) * 100) / 100;
    if (amt <= 0) {
      toast.error("Payment amount must be > 0.");
      return;
    }

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        toast.error("Not logged in.");
        return;
      }

      const row = purchaseHistory.find((x) => x.purchase_id === selectedPurchaseId);

      const payload: any = {
        purchase_id: selectedPurchaseId,
        supplier_name: String(row?.supplier_name || supplier || "").trim() || null,
        amount: amt,
        paid_at: payDate2 ? `${payDate2}T00:00:00.000Z` : new Date().toISOString(),
        status: "paid",
        method: String(payMethod2 || "Cash"),
        notes: String(payNotes2 || "").trim() || null,
        created_by: user.id,
      };

      const { error } = await supabase.from("supplier_payments").insert([payload]);
      if (error) throw error;

      toast.success("Payment added ✅");
      await fetchPurchaseDetails(selectedPurchaseId);
      await fetchPurchaseHistory();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to add payment.");
    }
  }

  async function uploadReceipt() {
    if (!selectedPurchaseId) return;
    if (!receiptFile) {
      toast.error("Choose an image file first.");
      return;
    }

    setUploadingReceipt(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        toast.error("Not logged in.");
        return;
      }

      const ext = receiptFile.name.split(".").pop() || "jpg";
      const uuid =
        typeof crypto !== "undefined" && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${selectedPurchaseId}/${uuid}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("purchase-receipts")
        .upload(path, receiptFile, { upsert: false });

      if (upErr) throw upErr;

      // store metadata in DB (file_path + label). (Signed URL is generated on fetch.)
      const receiptRow: any = {
        purchase_id: selectedPurchaseId,
        file_path: path,
        // If your table requires file_url NOT NULL, keep this line:
        // file_url will be refreshed anyway in fetchPurchaseDetails().
        file_url: "signed-on-fetch",
        label: String(receiptLabel || "").trim() || null,
        uploaded_by: user.id,
      };

      const { error: insErr } = await supabase.from("purchase_receipts").insert([
        receiptRow,
      ]);

      if (insErr) throw insErr;

      toast.success("Receipt uploaded ✅");
      setReceiptFile(null);

      await fetchPurchaseDetails(selectedPurchaseId);
      await fetchPurchaseHistory();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to upload receipt.");
    } finally {
      setUploadingReceipt(false);
    }
  }

  // load history on mount
  useEffect(() => {
    fetchPurchaseHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- Cash Ledger connection ----------------------------- */
  function openLedgerPostModal() {
    const total = Math.round(purchaseTotal * 100) / 100;
    setLedgerAmount(total);
    setLedgerDate(new Date().toISOString().slice(0, 10));
    setLedgerMethod("Cash");
    setLedgerNotes(
      [
        customerName ? `Customer: ${customerName}` : "",
        customerAddress ? `Addr: ${customerAddress}` : "",
        consignmentNo ? `Consignment ${consignmentNo}` : "",
        poNo ? `PO ${poNo}` : "",
      ]
        .filter(Boolean)
        .join(" • ")
    );
    setShowLedgerModal(true);
  }

  function basicHeaderValid() {
    if (!String(supplier || "").trim()) return false;
    return true;
  }

  async function postPurchaseToLedger() {
    const validRows = rows
      .map(recomputeRow)
      .filter((r) => toNum(r.qty) > 0 && String(r.sku || "").trim());
    if (!validRows.length) {
      toast.error("Add at least 1 valid row (Qty + SKU).");
      return;
    }
    if (!basicHeaderValid()) {
      toast.error("Supplier name is required.");
      return;
    }

    setIsPostingLedger(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        toast.error("Not logged in.");
        return;
      }

      const purchaseDateISO = purchaseDate
        ? `${purchaseDate}T00:00:00.000Z`
        : null;
      if (!purchaseDateISO) {
        toast.error("Invalid Date.");
        return;
      }

      // ✅ Notes for purchases header
      const headerNotes = [
        customerName ? `Customer: ${customerName}` : "",
        customerAddress ? `Customer Address: ${customerAddress}` : "",
        ledgerNotes ? `Ledger Notes: ${ledgerNotes}` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      // ✅ 1) Purchases header (matches your purchases columns)
      const purchaseHeader: any = {
        supplier_name: String(supplier).trim(),
        supplier_address: String(address || "").trim() || null,
        consignment_no: String(consignmentNo || "").trim() || null,
        po_no: String(poNo || "").trim() || null,
        reference_no:
          String(consignmentNo || "").trim() ||
          String(poNo || "").trim() ||
          null,
        terms: String(terms || "").trim() || null,
        notes: headerNotes || null,
        purchase_date: purchaseDateISO,
        total_amount: Math.round(purchaseTotal * 100) / 100,
        created_by: user.id,
      };

      const { data: pIns, error: pErr } = await supabase
        .from("purchases")
        .insert([purchaseHeader])
        .select("id")
        .single();

      if (pErr) {
        console.error(pErr);
        toast.error(`Failed to create purchase header: ${pErr.message}`);
        return;
      }

      const purchaseId = pIns?.id;
      if (!purchaseId) {
        toast.error("Purchase created but no ID returned.");
        return;
      }

      // ✅ 2) Purchase items (matches your purchase_items DDL)
      const itemsPayload = validRows.map((r) => {
        const discounts = parseDiscounts(r.discounts_raw);
        const discountDisplay = formatDiscountDisplay(discounts);

        const unitPrice =
          Math.round(
            r.net_unit_cost * (1 + toNum(r.markup_percent) / 100) * 100
          ) / 100;

        return {
          purchase_id: purchaseId,
          inventory_id: r.inventory_id ?? null,

          sku: String(r.sku).trim() || null,
          product_name: String(r.product_name || "").trim() || "—",
          category: String(r.category || "").trim() || null,
          subcategory: String(r.subcategory || "").trim() || null,
          unit: String(r.unit || "").trim() || null,
          size: null,

          qty: toNum(r.qty),

          cost_price: Math.round(toNum(r.cost_price) * 100) / 100,
          discount_percent: null,
          markup_percent: toNum(r.markup_percent) || null,
          unit_price: unitPrice,
          amount: Math.round(toNum(r.amount) * 100) / 100,

          remarks: null,

          supplier_discounts: discounts, // jsonb
          net_cost_price: Math.round(toNum(r.net_unit_cost) * 100) / 100,

          description: String(r.product_name || "").trim() || null,
          discounts_raw: String(r.discounts_raw || "").trim() || null,
          discounts_display: discountDisplay || null,
          net_unit_cost: Math.round(toNum(r.net_unit_cost) * 100) / 100,
        };
      });

      const { error: piErr } = await supabase
        .from("purchase_items")
        .insert(itemsPayload);

      if (piErr) {
        console.error(piErr);
        toast.error(`Failed to create purchase items: ${piErr.message}`);
        return;
      }

      // ✅ 3) supplier payment (Cash Out) so it appears in Cash Ledger view
      const payAmount = Math.round(toNum(ledgerAmount) * 100) / 100;
      if (payAmount <= 0) {
        toast.error("Ledger amount must be > 0.");
        return;
      }

      const paymentPayload: any = {
        purchase_id: purchaseId,
        supplier_name: String(supplier).trim(),
        amount: payAmount,
        paid_at: ledgerDate
          ? `${ledgerDate}T00:00:00.000Z`
          : new Date().toISOString(),
        status: "paid",
        method: String(ledgerMethod || "Cash"),
        notes: String(ledgerNotes || "").trim() || null,
        created_by: user.id,
      };

      const { data: spIns, error: spErr } = await supabase
        .from("supplier_payments")
        .insert([paymentPayload])
        .select("id")
        .single();

      if (spErr) {
        console.error(spErr);
        toast.error(
          `Purchase saved but supplier payment failed: ${spErr.message}`
        );
        return;
      }

      toast.success("Posted to Cash Ledger (Cash Out) ✅");
      setShowLedgerModal(false);
      setRows([]);

      // refresh bottom table
      await fetchPurchaseHistory();

      if (spIns?.id) {
        router.push(
          `/reports/cash-ledger?open=supplier_payments&id=${spIns.id}`
        );
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to post to cash ledger.");
    } finally {
      setIsPostingLedger(false);
    }
  }

  /* ----------------------------- Init: if opened from cash-ledger ----------------------------- */
  useEffect(() => {
    // ✅ replaced useSearchParams with client-only URLSearchParams
    const from = getClientQueryParam("from");
    if (
      rows.length === 0 &&
      (from.includes("cash-ledger") || from.includes("ledger"))
    ) {
      setRows([makeEmptyRow()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- UI (ADMIN STYLE) ----------------------------- */
  const titleRight = (
    <div className="flex flex-wrap items-center gap-2 justify-end">
      <Button
        onClick={addRow}
        className="bg-black text-white hover:bg-black/90"
        title="Add new receipt row"
      >
        + Add Row
      </Button>

      <Button
        onClick={() => setShowInsertModal(true)}
        className="bg-black text-white hover:bg-black/90"
        disabled={!rows.length}
        title="Replenish existing inventory or create new inventory items"
      >
        Insert to Inventory
      </Button>

      <Button
        onClick={openLedgerPostModal}
        className="bg-black text-white hover:bg-black/90"
        disabled={!rows.length}
        title="Save this purchase and create Cash Out record for Cash Ledger"
      >
        Post to Cash Ledger
      </Button>

      <Button
        variant="secondary"
        onClick={() => router.push("/reports/cash-ledger")}
        title="Go to Cash Ledger"
      >
        View Cash Ledger
      </Button>

      <Button
        variant="secondary"
        onClick={resetAll}
        title="Clear all fields and rows"
      >
        Reset
      </Button>
    </div>
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-black">
      {/* ✅ TOP BLACK BAR (full width like Inventory) */}
      <div className="h-10 w-full bg-black flex items-center justify-center">
        <span className="text-xs font-semibold text-white tracking-wide">
          UNIASIA – Reliable Hardware Supplier in the Philippines
        </span>
      </div>

      {/* ✅ BODY (sidebar + main) pushed down below the black bar */}
      <div className="flex h-[calc(100vh-40px)] w-full overflow-hidden">
        {/* Sidebar */}
        <div className="h-full">
          <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        </div>

        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          {/* ✅ EXACT Inventory gradient background */}
          <div className="min-h-full w-full bg-gradient-to-b from-[#EDEDED] via-[#F3D58A] to-[#FFC533]">
            <div className="px-4 pb-6 pt-3 md:px-6">
              {/* Card wrapper matches Inventory/Cash Ledger */}
              <div className="rounded-2xl bg-white/80 backdrop-blur border border-black/10 shadow-sm">
                <div className="px-4 pb-4 pt-4 md:px-6">
                  {/* Header row */}
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h1 className="text-3xl font-extrabold text-black">
                        Purchase Products
                      </h1>
                      <p className="text-sm text-black/60">
                        Receipt-style purchase encoding • Supports multiple
                        sequential discounts per item • Can post Cash Out to Cash
                        Ledger
                      </p>
                    </div>
                    {titleRight}
                  </div>

                  {/* Header card */}
                  <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                      <div className="md:col-span-4">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Supplier
                        </label>
                        <input
                          value={supplier}
                          onChange={(e) => setSupplier(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Supplier name"
                        />
                      </div>

                      <div className="md:col-span-8">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Address
                        </label>
                        <input
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Supplier address"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Customer
                        </label>
                        <input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="UniAsia"
                        />
                      </div>

                      <div className="md:col-span-8">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Customer Address
                        </label>
                        <input
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Your company address (optional)"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Consignment No.
                        </label>
                        <input
                          value={consignmentNo}
                          onChange={(e) => setConsignmentNo(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="e.g. 035508"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Date
                        </label>
                        <input
                          type="date"
                          value={purchaseDate}
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          Terms
                        </label>
                        <input
                          value={terms}
                          onChange={(e) => setTerms(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="C.O.D."
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1 block text-xs font-semibold text-black/70">
                          P.O.#
                        </label>
                        <input
                          value={poNo}
                          onChange={(e) => setPoNo(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-9 rounded-xl bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold text-black">
                        How supplier discounts work
                      </div>
                      <div className="mt-1 text-xs text-black/60 leading-relaxed">
                        Example: Cost 100 with discounts 10% then 10% → 100 → 90
                        → 81. Then multiplied by Qty.
                      </div>
                    </div>

                    <div className="md:col-span-3 rounded-xl bg-emerald-50 p-4 shadow-sm">
                      <p className="text-xs font-semibold text-black/60">
                        Purchase Total
                      </p>
                      <p className="text-2xl font-extrabold">
                        {peso(purchaseTotal)}
                      </p>
                      <p className="mt-1 text-[11px] text-black/50">
                        Computed from Qty × Net Unit Cost
                      </p>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="bg-amber-400 px-4 py-3">
                      <div className="grid grid-cols-7 gap-3 text-xs font-extrabold uppercase tracking-wide text-black">
                        <div>QTY</div>
                        <div>UNIT</div>
                        <div className="col-span-2">Item Description</div>
                        <div className="text-right">Price</div>
                        <div>Discount</div>
                        <div className="text-right">Amount</div>
                      </div>
                    </div>

                    {rows.length === 0 ? (
                      <div className="p-6 text-center text-sm text-black/60">
                        No rows yet. Click{" "}
                        <span className="font-semibold">+ Add Row</span>.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {rows.map((r) => {
                          const discounts = parseDiscounts(r.discounts_raw);
                          const display = formatDiscountDisplay(discounts);
                          const selectedInv = r.inventory_id
                            ? inventoryById.get(r.inventory_id) || null
                            : null;

                          return (
                            <div key={r.key} className="px-4 py-4">
                              <div className="grid grid-cols-7 items-start gap-3">
                                {/* QTY */}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRow(r.key, {
                                          qty: Math.max(0, toNum(r.qty) - 1),
                                        })
                                      }
                                      className="h-9 w-9 rounded-lg border bg-white text-sm font-bold hover:bg-black/5"
                                      title="Decrease quantity"
                                    >
                                      −
                                    </button>

                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={r.qty}
                                      onChange={(e) =>
                                        setRow(r.key, {
                                          qty: toNum(e.target.value),
                                        })
                                      }
                                      onWheel={(e) =>
                                        (e.currentTarget as any).blur?.()
                                      }
                                      className="w-full min-w-[110px] rounded-lg border px-3 py-2 text-sm text-center"
                                      min={0}
                                      placeholder="0"
                                    />

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRow(r.key, {
                                          qty: toNum(r.qty) + 1,
                                        })
                                      }
                                      className="h-9 w-9 rounded-lg border bg-white text-sm font-bold hover:bg-black/5"
                                      title="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>

                                  <button
                                    className="mt-2 text-[11px] text-red-600 hover:underline"
                                    onClick={() => removeRow(r.key)}
                                    title="Remove row"
                                  >
                                    Remove
                                  </button>
                                </div>

                                {/* UNIT */}
                                <div>
                                  <input
                                    value={r.unit}
                                    onChange={(e) =>
                                      setRow(r.key, { unit: e.target.value })
                                    }
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                    placeholder="Piece"
                                    disabled={!!r.inventory_id && !r.is_new_item}
                                  />
                                  <div className="mt-1 text-[11px] text-black/50">
                                    {r.inventory_id && !r.is_new_item
                                      ? "From inventory"
                                      : "Editable"}
                                  </div>
                                </div>

                                {/* DESCRIPTION */}
                                <div className="col-span-2">
                                  <div className="flex flex-col gap-2">
                                    <Popover
                                      open={!!openPickers[r.key]}
                                      onOpenChange={(open) =>
                                        setPickerOpen(r.key, open)
                                      }
                                    >
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          role="combobox"
                                          disabled={invLoading}
                                          className={cn(
                                            "w-full justify-between bg-white",
                                            invLoading && "opacity-70"
                                          )}
                                          title="Pick existing inventory item (optional). Or type manually then tick New item in Insert modal."
                                        >
                                          {selectedInv
                                            ? `${selectedInv.sku} — ${selectedInv.product_name}`
                                            : invLoading
                                            ? "Loading inventory..."
                                            : "Select inventory item (optional)"}
                                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                                        </Button>
                                      </PopoverTrigger>

                                      <PopoverContent
                                        className="w-[520px] p-0"
                                        align="start"
                                      >
                                        <Command>
                                          <CommandInput placeholder="Search SKU / product..." />
                                          <CommandEmpty>
                                            No inventory found.
                                          </CommandEmpty>

                                          <CommandGroup>
                                            <CommandList className="max-h-[260px] overflow-auto">
                                              <CommandItem
                                                value="__clear__"
                                                onSelect={() => {
                                                  onPickInventoryItem(r.key, "");
                                                  setPickerOpen(r.key, false);
                                                }}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4",
                                                    !r.inventory_id
                                                      ? "opacity-100"
                                                      : "opacity-0"
                                                  )}
                                                />
                                                — Clear selection —
                                              </CommandItem>

                                              {inventory.map((it) => {
                                                const isSelected =
                                                  r.inventory_id === it.id;
                                                const label = `${it.sku} — ${it.product_name} (stock: ${it.quantity})`;
                                                return (
                                                  <CommandItem
                                                    key={it.id}
                                                    value={`${it.sku} ${it.product_name}`}
                                                    onSelect={() => {
                                                      onPickInventoryItem(
                                                        r.key,
                                                        String(it.id)
                                                      );
                                                      setPickerOpen(
                                                        r.key,
                                                        false
                                                      );
                                                    }}
                                                  >
                                                    <Check
                                                      className={cn(
                                                        "mr-2 h-4 w-4",
                                                        isSelected
                                                          ? "opacity-100"
                                                          : "opacity-0"
                                                      )}
                                                    />
                                                    <span className="truncate">
                                                      {label}
                                                    </span>
                                                  </CommandItem>
                                                );
                                              })}
                                            </CommandList>
                                          </CommandGroup>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>

                                    <input
                                      value={r.product_name}
                                      onChange={(e) =>
                                        setRow(r.key, {
                                          product_name: e.target.value,
                                        })
                                      }
                                      className="w-full rounded-lg border px-3 py-2 text-sm"
                                      placeholder="Item description"
                                      disabled={!!r.inventory_id && !r.is_new_item}
                                    />

                                    <div className="text-[11px] text-black/50 leading-tight">
                                      {r.sku ? (
                                        <>
                                          SKU:{" "}
                                          <span className="font-semibold text-black">
                                            {r.sku}
                                          </span>{" "}
                                          {r.category ? `· ${r.category}` : ""}{" "}
                                          {r.subcategory
                                            ? `· ${r.subcategory}`
                                            : ""}
                                        </>
                                      ) : (
                                        "Tip: pick from inventory (optional), or type manually."
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* PRICE */}
                                <div className="text-right">
                                  <input
                                    type="number"
                                    value={r.cost_price}
                                    onChange={(e) =>
                                      setRow(r.key, {
                                        cost_price: toNum(e.target.value),
                                      })
                                    }
                                    className="w-full rounded-lg border px-3 py-2 text-sm text-right"
                                    min={0}
                                  />
                                  <div className="mt-1 text-[11px] text-black/50">
                                    Net:{" "}
                                    <span className="font-semibold text-black">
                                      {peso(r.net_unit_cost)}
                                    </span>
                                  </div>
                                </div>

                                {/* DISCOUNT */}
                                <div>
                                  <input
                                    value={r.discounts_raw}
                                    onChange={(e) =>
                                      setRow(r.key, {
                                        discounts_raw: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                    placeholder='e.g. "50% 1%"'
                                  />
                                  <div className="mt-1 text-[11px] text-black/50">
                                    {display || "—"}
                                  </div>
                                </div>

                                {/* AMOUNT */}
                                <div className="text-right">
                                  <div className="text-sm font-extrabold">
                                    {peso(r.amount)}
                                  </div>
                                  <div className="mt-1 text-[11px] text-black/50">
                                    Qty × Net Cost
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom actions */}
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Button
                      onClick={addRow}
                      className="bg-black text-white hover:bg-black/90"
                    >
                      + Add Row
                    </Button>

                    <div className="rounded-xl bg-white p-4 shadow-sm md:min-w-[360px] text-right">
                      <div className="text-xs font-semibold text-black/60">
                        Total
                      </div>
                      <div className="text-[11px] text-black/50 leading-tight">
                        Computed from Qty × (Net unit cost after supplier
                        discounts)
                      </div>
                      <div className="mt-1 text-2xl font-extrabold">
                        {peso(purchaseTotal)}
                      </div>
                    </div>
                  </div>

                  {/* ===================== Purchases & Payments (Bottom Table) ===================== */}
                  <div className="mt-6 rounded-2xl bg-white/80 backdrop-blur border border-black/10 shadow-sm">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-lg font-extrabold text-black">
                          Purchases & Payments
                        </div>
                        <div className="text-xs text-black/60">
                          Store partial payments and receipt images per purchase.
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={fetchPurchaseHistory}
                        disabled={historyLoading}
                      >
                        {historyLoading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-black text-white">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wide">
                              Supplier
                            </th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wide">
                              Date
                            </th>
                            <th className="text-right px-4 py-3 text-xs uppercase tracking-wide">
                              Total
                            </th>
                            <th className="text-right px-4 py-3 text-xs uppercase tracking-wide">
                              Paid
                            </th>
                            <th className="text-right px-4 py-3 text-xs uppercase tracking-wide">
                              Balance
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wide">
                              Receipts
                            </th>
                            <th className="text-right px-4 py-3 text-xs uppercase tracking-wide">
                              Action
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y">
                          {purchaseHistory.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-6 text-center text-black/60"
                              >
                                No purchases yet.
                              </td>
                            </tr>
                          ) : (
                            purchaseHistory.map((p) => {
                              const total = toNum(p.total_amount);
                              const paid = toNum(p.total_paid);
                              const bal = toNum(p.balance);
                              const rc = receiptCounts[p.purchase_id] || 0;

                              return (
                                <tr
                                  key={p.purchase_id}
                                  className="hover:bg-black/5"
                                >
                                  <td className="px-4 py-3 font-semibold">
                                    {p.supplier_name || "—"}
                                  </td>
                                  <td className="px-4 py-3">
                                    {(p.purchase_date || "").slice(0, 10) || "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold">
                                    {peso(total)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {peso(paid)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span
                                      className={
                                        bal > 0
                                          ? "font-bold text-red-600"
                                          : "font-bold text-emerald-700"
                                      }
                                    >
                                      {peso(bal)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                                      {rc}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button
                                      size="sm"
                                      className="bg-black text-white hover:bg-black/90"
                                      onClick={() =>
                                        openPurchaseDetails(p.purchase_id)
                                      }
                                    >
                                      View
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Insert Inventory Modal */}
                  {showInsertModal && (
                    <ClientPortal>
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-[1100px] max-w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
                          <div className="p-4 border-b flex items-center justify-between">
                            <div>
                              <div className="font-extrabold text-black">
                                Insert to Inventory
                              </div>
                              <div className="text-xs text-black/60">
                                Replenish if inventory item is selected. Mark
                                “New item” to create a new record.
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              onClick={() => setShowInsertModal(false)}
                            >
                              Close
                            </Button>
                          </div>

                          <div className="p-4">
                            <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                              {rows.map((r) => (
                                <div key={r.key} className="border rounded-xl p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-semibold">
                                      {r.sku || "—"} • Qty: {toNum(r.qty)} • Net:{" "}
                                      {peso(r.net_unit_cost)} • Amount:{" "}
                                      {peso(r.amount)}
                                    </div>

                                    <label className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={r.is_new_item}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            is_new_item: e.target.checked,
                                          })
                                        }
                                      />
                                      New item
                                    </label>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-3">
                                    <div className="md:col-span-1">
                                      <label className="text-[11px] text-black/60">
                                        SKU *
                                      </label>
                                      <input
                                        value={r.sku}
                                        onChange={(e) =>
                                          setRow(r.key, { sku: e.target.value })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="HW-123"
                                      />
                                    </div>

                                    <div className="md:col-span-2">
                                      <label className="text-[11px] text-black/60">
                                        Product Name *
                                      </label>
                                      <input
                                        value={r.product_name}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            product_name: e.target.value,
                                          })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Product name"
                                        disabled={!!r.inventory_id && !r.is_new_item}
                                      />
                                    </div>

                                    <div className="md:col-span-1">
                                      <label className="text-[11px] text-black/60">
                                        Category *
                                      </label>
                                      <input
                                        value={r.category}
                                        onChange={(e) =>
                                          setRow(r.key, { category: e.target.value })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Uncategorized"
                                        disabled={!!r.inventory_id && !r.is_new_item}
                                      />
                                    </div>

                                    <div className="md:col-span-1">
                                      <label className="text-[11px] text-black/60">
                                        Subcategory *
                                      </label>
                                      <input
                                        value={r.subcategory}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            subcategory: e.target.value,
                                          })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Subcategory"
                                        disabled={!!r.inventory_id && !r.is_new_item}
                                      />
                                    </div>

                                    <div className="md:col-span-1">
                                      <label className="text-[11px] text-black/60">
                                        Unit *
                                      </label>
                                      <input
                                        value={r.unit}
                                        onChange={(e) =>
                                          setRow(r.key, { unit: e.target.value })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Piece"
                                        disabled={!!r.inventory_id && !r.is_new_item}
                                      />
                                    </div>

                                    <div className="md:col-span-2">
                                      <label className="text-[11px] text-black/60">
                                        Ceiling Qty (optional)
                                      </label>
                                      <input
                                        value={r.ceiling_qty ?? ""}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            ceiling_qty:
                                              e.target.value === ""
                                                ? null
                                                : toNum(e.target.value),
                                          })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Optional"
                                        type="number"
                                      />
                                    </div>

                                    <div className="md:col-span-2">
                                      <label className="text-[11px] text-black/60">
                                        Expiration Date (optional)
                                      </label>
                                      <input
                                        value={r.expiration_date ?? ""}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            expiration_date: e.target.value || null,
                                          })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="dd/mm/yyyy"
                                      />
                                    </div>

                                    <div className="md:col-span-2">
                                      <label className="text-[11px] text-black/60">
                                        Markup %
                                      </label>
                                      <input
                                        value={r.markup_percent}
                                        onChange={(e) =>
                                          setRow(r.key, {
                                            markup_percent: toNum(e.target.value),
                                          })
                                        }
                                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                                        type="number"
                                        min={0}
                                      />
                                    </div>

                                    <div className="md:col-span-3">
                                      <label className="text-[11px] text-black/60">
                                        Pieces/Unit & Weight/Piece (optional)
                                      </label>
                                      <div className="mt-1 flex gap-2">
                                        <input
                                          value={r.pieces_per_unit ?? ""}
                                          onChange={(e) =>
                                            setRow(r.key, {
                                              pieces_per_unit:
                                                e.target.value === ""
                                                  ? null
                                                  : toNum(e.target.value),
                                            })
                                          }
                                          className="w-full border rounded-lg px-3 py-2 text-sm"
                                          placeholder="pcs/unit"
                                          type="number"
                                        />
                                        <input
                                          value={r.weight_per_piece_kg ?? ""}
                                          onChange={(e) =>
                                            setRow(r.key, {
                                              weight_per_piece_kg:
                                                e.target.value === ""
                                                  ? null
                                                  : toNum(e.target.value),
                                            })
                                          }
                                          className="w-full border rounded-lg px-3 py-2 text-sm"
                                          placeholder="kg/piece"
                                          type="number"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 text-xs text-black/60">
                                    Replenish: pick an inventory item. New item:
                                    tick “New item” then fill details.
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="p-4 border-t flex items-center justify-between">
                            <Button
                              variant="outline"
                              onClick={() => setShowInsertModal(false)}
                            >
                              Cancel
                            </Button>

                            <Button
                              onClick={handleConfirmInsertInventory}
                              disabled={isSavingInventory}
                              className="bg-black text-white hover:bg-black/90 disabled:opacity-60"
                            >
                              {isSavingInventory ? "Saving..." : "Confirm Insert"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </ClientPortal>
                  )}

                  {/* Post to Cash Ledger Modal */}
                  {showLedgerModal && (
                    <ClientPortal>
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
                          <div className="p-4 border-b flex items-center justify-between">
                            <div>
                              <div className="font-extrabold text-black">
                                Post to Cash Ledger
                              </div>
                              <div className="text-xs text-black/60">
                                This will save the purchase + items, and create a{" "}
                                <b>supplier_payments</b> Cash Out entry.
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => setShowLedgerModal(false)}
                            >
                              Close
                            </Button>
                          </div>

                          <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-black/70">
                                  Supplier *
                                </label>
                                <input
                                  value={supplier}
                                  onChange={(e) => setSupplier(e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2 text-sm"
                                  placeholder="Supplier name"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-semibold text-black/70">
                                  Payment Date
                                </label>
                                <input
                                  type="date"
                                  value={ledgerDate}
                                  onChange={(e) => setLedgerDate(e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2 text-sm"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-semibold text-black/70">
                                  Amount (Cash Out)
                                </label>
                                <input
                                  type="number"
                                  value={ledgerAmount}
                                  onChange={(e) =>
                                    setLedgerAmount(toNum(e.target.value))
                                  }
                                  className="w-full rounded-lg border px-3 py-2 text-sm"
                                  min={0}
                                />
                                <div className="mt-1 text-[11px] text-black/50">
                                  Suggested: Purchase Total ={" "}
                                  <b className="text-black">{peso(purchaseTotal)}</b>
                                </div>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-semibold text-black/70">
                                  Method
                                </label>
                                <select
                                  value={ledgerMethod}
                                  onChange={(e) => setLedgerMethod(e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2 text-sm"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="GCash">GCash</option>
                                  <option value="Bank Transfer">Bank Transfer</option>
                                  <option value="Cheque">Cheque</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-black/70">
                                  Notes
                                </label>
                                <input
                                  value={ledgerNotes}
                                  onChange={(e) => setLedgerNotes(e.target.value)}
                                  className="w-full rounded-lg border px-3 py-2 text-sm"
                                  placeholder="Optional notes"
                                />
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl bg-amber-50 border p-3 text-sm">
                              <div className="font-semibold text-black">
                                Will create:
                              </div>
                              <div className="text-black/70 text-xs mt-1 leading-relaxed">
                                • <b>purchases</b> header (supplier, date, terms,
                                total) <br />
                                • <b>purchase_items</b> (each row) <br />
                                • <b>supplier_payments</b> (Cash Out) → appears in{" "}
                                <b>Company Cash Ledger</b>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border-t flex items-center justify-between">
                            <Button
                              variant="outline"
                              onClick={() => setShowLedgerModal(false)}
                            >
                              Cancel
                            </Button>

                            <Button
                              onClick={postPurchaseToLedger}
                              disabled={isPostingLedger}
                              className="bg-black text-white hover:bg-black/90 disabled:opacity-60"
                            >
                              {isPostingLedger ? "Posting..." : "Confirm Post"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </ClientPortal>
                  )}

                  {/* Purchase Details Modal (Payments + Receipts) */}
                  {showPurchaseDetails && selectedPurchaseId && (
                    <ClientPortal>
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-[1100px] max-w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
                          <div className="p-4 border-b flex items-center justify-between">
                            <div>
                              <div className="font-extrabold text-black">
                                Purchase Details
                              </div>
                              <div className="text-xs text-black/60">
                                Partial payments + receipt images are stored under this purchase.
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => setShowPurchaseDetails(false)}
                            >
                              Close
                            </Button>
                          </div>

                          <div className="p-4 overflow-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* LEFT: Payments */}
                              <div className="rounded-xl border p-4">
                                <div className="flex items-center justify-between">
                                  <div className="font-bold">Payments</div>
                                  <div className="text-xs text-black/50">
                                    {purchasePayments.length} record(s)
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                                  <div className="md:col-span-1">
                                    <label className="text-[11px] text-black/60">Amount</label>
                                    <input
                                      type="number"
                                      value={payAmount2}
                                      onChange={(e) => setPayAmount2(toNum(e.target.value))}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                      min={0}
                                    />
                                  </div>

                                  <div className="md:col-span-1">
                                    <label className="text-[11px] text-black/60">Date</label>
                                    <input
                                      type="date"
                                      value={payDate2}
                                      onChange={(e) => setPayDate2(e.target.value)}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                    />
                                  </div>

                                  <div className="md:col-span-1">
                                    <label className="text-[11px] text-black/60">Method</label>
                                    <select
                                      value={payMethod2}
                                      onChange={(e) => setPayMethod2(e.target.value)}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                    >
                                      <option value="Cash">Cash</option>
                                      <option value="GCash">GCash</option>
                                      <option value="Bank Transfer">Bank Transfer</option>
                                      <option value="Cheque">Cheque</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  </div>

                                  <div className="md:col-span-1 flex items-end">
                                    <Button
                                      className="w-full bg-black text-white hover:bg-black/90"
                                      onClick={addPartialPayment}
                                    >
                                      Add Payment
                                    </Button>
                                  </div>

                                  <div className="md:col-span-4">
                                    <label className="text-[11px] text-black/60">Notes</label>
                                    <input
                                      value={payNotes2}
                                      onChange={(e) => setPayNotes2(e.target.value)}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                      placeholder="Optional"
                                    />
                                  </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                  {purchasePayments.length === 0 ? (
                                    <div className="text-sm text-black/60">No payments yet.</div>
                                  ) : (
                                    purchasePayments.map((p) => (
                                      <div key={p.id} className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="font-semibold">{peso(toNum(p.amount))}</div>
                                          <div className="text-xs text-black/60">
                                            {(p.paid_at || "").slice(0, 10) || "—"} • {p.method || "—"}
                                          </div>
                                        </div>
                                        {p.notes ? (
                                          <div className="mt-1 text-xs text-black/60">{p.notes}</div>
                                        ) : null}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* RIGHT: Receipts */}
                              <div className="rounded-xl border p-4">
                                <div className="flex items-center justify-between">
                                  <div className="font-bold">Receipt Images</div>
                                  <div className="text-xs text-black/50">
                                    {purchaseReceipts.length} file(s)
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-2">
                                  <div className="md:col-span-2">
                                    <label className="text-[11px] text-black/60">Label</label>
                                    <input
                                      value={receiptLabel}
                                      onChange={(e) => setReceiptLabel(e.target.value)}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                      placeholder="Official Receipt"
                                    />
                                  </div>

                                  <div className="md:col-span-3">
                                    <label className="text-[11px] text-black/60">Image</label>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                    />
                                  </div>

                                  <div className="md:col-span-1 flex items-end">
                                    <Button
                                      className="w-full bg-black text-white hover:bg-black/90 disabled:opacity-60"
                                      onClick={uploadReceipt}
                                      disabled={uploadingReceipt}
                                    >
                                      {uploadingReceipt ? "Uploading..." : "Upload"}
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {purchaseReceipts.length === 0 ? (
                                    <div className="col-span-full text-sm text-black/60">
                                      No receipts uploaded.
                                    </div>
                                  ) : (
                                    purchaseReceipts.map((r) => (
                                      <a
                                        key={r.id}
                                        href={r.file_url || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={cn(
                                          "group rounded-xl border overflow-hidden hover:shadow-sm",
                                          !r.file_url && "opacity-60 pointer-events-none"
                                        )}
                                        title={r.label || "Receipt"}
                                      >
                                        <div className="aspect-[4/3] bg-black/5 overflow-hidden">
                                          {r.file_url ? (
                                            <img
                                              src={r.file_url}
                                              alt={r.label || "Receipt"}
                                              className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                                            />
                                          ) : (
                                            <div className="h-full w-full flex items-center justify-center text-xs text-black/50">
                                              Signed URL failed
                                            </div>
                                          )}
                                        </div>
                                        <div className="p-2">
                                          <div className="text-xs font-semibold truncate">
                                            {r.label || "Receipt"}
                                          </div>
                                          <div className="text-[11px] text-black/60">
                                            {(r.created_at || "").slice(0, 10)}
                                          </div>
                                        </div>
                                      </a>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border-t flex items-center justify-between">
                            <Button
                              variant="outline"
                              onClick={() => setShowPurchaseDetails(false)}
                            >
                              Close
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                if (!selectedPurchaseId) return;
                                await fetchPurchaseDetails(selectedPurchaseId);
                                await fetchPurchaseHistory();
                                toast.success("Updated ✅");
                              }}
                            >
                              Refresh
                            </Button>
                          </div>
                        </div>
                      </div>
                    </ClientPortal>
                  )}

                  <div className="h-10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
