// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Cards from "@/components/Cards";
import BottomCards from "@/components/BottomCards";
import Bargraph from "@/components/Bargraph";
import RecentActivityLog from "@/components/RecentActivityLog";

/* ----------------------------- flatten helpers ----------------------------- */
function flatten(obj: any, prefix = "", out: Record<string, any> = {}) {
  if (obj === null || obj === undefined) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  if (typeof obj !== "object") {
    if (prefix) out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    if (prefix) out[prefix] = JSON.stringify(obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/* ---------------------------- Data fetchers (Supabase) ---------------------------- */
// async function fetchAll() {
//   const { data: inventory } = await supabase
//     .from("inventory")
//     .select(
//       "id, sku, product_name, category, subcategory, unit, quantity, unit_price, cost_price, profit, amount, date_created, status, image_url, weight_per_piece_kg, pieces_per_unit, total_weight_kg, markup_percent, expiration_date, ceiling_qty, stock_level",
//     )
//     .order("date_created", { ascending: false });

//   const { data: customers } = await supabase
//     .from("customers")
//     .select(
//       "id, code, name, email, phone, address, contact_person, area, landmark, customer_type, payment_type, order_count, created_at, region_code, province_code, city_code, barangay_code, house_street",
//     )
//     .order("created_at", { ascending: false });

//   const { data: profiles } = await supabase
//     .from("profiles")
//     .select(
//       "id, email, name, contact_number, role, created_at, first_name, last_name",
//     )
//     .order("created_at", { ascending: false });

//   const { data: orders } = await supabase
//     .from("orders")
//     .select(
//       `
//       id, customer_id, status, date_created, date_completed, processed_at,
//       salesman, forwarder, po_number,
//       terms, interest_percent, payment_terms, first_due_date, remaining_months,
//       grand_total_with_interest, shipping_fee, grand_total_with_shipping,
//       paid_amount, balance,
//       approved, date_approved,
//       customer:customer_id ( name, email, code )
//     `,
//     )
//     .order("date_created", { ascending: false });

//   const { data: order_items } = await supabase
//     .from("order_items")
//     .select(
//       `
//       id, order_id, inventory_id, quantity, price, fulfilled_quantity, discount_percent, remarks,
//       inventory:inventory_id ( product_name, sku, category, subcategory, unit )
//     `,
//     )
//     .order("id", { ascending: true });

//   const { data: payments } = await supabase
//     .from("payments")
//     .select(
//       "id, order_id, customer_id, amount, method, cheque_number, bank_name, cheque_date, image_url, status, created_at, received_at, received_by",
//     )
//     .order("created_at", { ascending: false });

//   const { data: truck_deliveries } = await supabase
//     .from("truck_deliveries")
//     .select(
//       "id, status, destination, plate_number, driver, participants, schedule_date, arrival_date, date_received, eta_date, shipping_fee, created_at",
//     )
//     .order("created_at", { ascending: false });

//   const { data: sales } = await supabase
//     .from("sales")
//     .select("id, inventory_id, quantity_sold, amount, earnings, date")
//     .order("date", { ascending: false });

//   const { data: returnsData } = await supabase
//     .from("returns")
//     .select(
//       "id, order_id, customer_id, code, reason, note, status, created_at, created_by",
//     )
//     .order("created_at", { ascending: false });

//   const { data: return_items } = await supabase
//     .from("return_items")
//     .select("id, return_id, order_item_id, inventory_id, quantity, photo_urls")
//     .order("id", { ascending: true });

//   const { data: v_transaction_history_full } = await supabase
//     .from("v_transaction_history_full")
//     .select("*")
//     .order("date_completed", { ascending: false });

//   return {
//     inventory: inventory || [],
//     customers: customers || [],
//     profiles: profiles || [],
//     orders: orders || [],
//     order_items: order_items || [],
//     payments: payments || [],
//     truck_deliveries: truck_deliveries || [],
//     sales: sales || [],
//     returns: returnsData || [],
//     return_items: return_items || [],
//     v_transaction_history_full: v_transaction_history_full || [],
//   };
// }

/* -------------------------- Excel format helpers ----------------------- */
type ColumnSpec = { header: string; key: string; width?: number; style?: any };

const currencyKeys = [
  "unit_price",
  "cost_price",
  "profit",
  "amount",
  "grand_total_with_interest",
  "grand_total_with_shipping",
  "shipping_fee",
  "paid_amount",
  "balance",
  "freight",
  "sales_tax",
  "earnings",
];

const integerKeys = [
  "quantity",
  "quantity_sold",
  "fulfilled_quantity",
  "pieces_per_unit",
  "ceiling_qty",
  "order_count",
  "payment_terms",
  "remaining_months",
];

function isDateKey(k: string) {
  return /date|created_at|processed_at|date_completed|first_due_date|eta/i.test(
    k,
  );
}

function autoFitColumns(
  rows: ReadonlyArray<Record<string, any>>,
  keys: readonly string[],
): ColumnSpec[] {
  const MIN = 8,
    MAX = 50;
  const cols: ColumnSpec[] = keys.map((k) => ({ header: k, key: k }));
  for (const col of cols) {
    const headerLen = col.header.length;
    let maxLen = headerLen;
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const v = rows[i]?.[col.key];
      const s = v === null || v === undefined ? "" : String(v);
      if (s.length > maxLen) maxLen = s.length;
    }
    col.width = Math.min(MAX, Math.max(MIN, Math.ceil(maxLen * 0.9)));
    if (currencyKeys.includes(col.key)) col.style = { numFmt: "₱#,##0.00" };
    else if (integerKeys.includes(col.key)) col.style = { numFmt: "0" };
    else if (isDateKey(col.key)) col.style = { numFmt: "yyyy-mm-dd hh:mm" };
  }
  return cols;
}

/* -------------------------------- Component ------------------------------- */
const DashboardPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.replace("/login");
          return;
        }

        const data = await res.json();
        if (data?.role !== "admin") {
          router.replace("/customer");
          return;
        }

        setLoading(false);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  // const handleExportExcel = async () => {
  //   try {
  //     setExporting(true);

  //     const all = await fetchAll();

  //     const ExcelJS = (await import("exceljs")).Workbook;
  //     const wb = new ExcelJS();

  //     const addSheet = (name: string, rawRows: any[]) => {
  //       const ws = wb.addWorksheet(name.slice(0, 31), {
  //         views: [{ state: "frozen", ySplit: 1 }],
  //       });

  //       const flat: Record<string, any>[] = rawRows.map(
  //         (r) => flatten(r) as Record<string, any>,
  //       );

  //       const keys: string[] = Array.from(
  //         flat.reduce<Set<string>>((set, r) => {
  //           for (const k of Object.keys(r)) set.add(k);
  //           return set;
  //         }, new Set<string>()),
  //       );

  //       const columns = autoFitColumns(flat, keys);
  //       (ws.columns as any) = columns;

  //       const header = ws.getRow(1);
  //       header.font = { bold: true, color: { argb: "FF1F2937" } };
  //       header.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FFE5E7EB" },
  //       };
  //       header.alignment = { vertical: "middle" };

  //       const lastCol = ws.columns[ws.columns.length - 1];
  //       if (lastCol && (lastCol as any).letter) {
  //         ws.autoFilter = {
  //           from: "A1",
  //           to: `${(lastCol as any).letter}1`,
  //         };
  //       }

  //       flat.forEach((row) => ws.addRow(row));

  //       ws.columns.forEach((col: any) => {
  //         if (col?.style?.numFmt) {
  //           for (let i = 2; i <= ws.rowCount; i++) {
  //             const c = ws.getCell(i, col.number);
  //             if (c.value !== null && c.value !== undefined && c.value !== "") {
  //               c.numFmt = col.style.numFmt;
  //             }
  //           }
  //         }
  //       });
  //     };

  //     Object.entries(all).forEach(([name, rows]) => {
  //       addSheet(name, rows as any[]);
  //     });

  //     const buf = await wb.xlsx.writeBuffer();
  //     const blob = new Blob([buf], {
  //       type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  //     });
  //     const url = URL.createObjectURL(blob);
  //     const a = document.createElement("a");
  //     const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  //     a.href = url;
  //     a.download = `uniasia-report-${stamp}.xlsx`;
  //     a.click();
  //     URL.revokeObjectURL(url);
  //   } catch (e) {
  //     console.error(e);
  //     alert("Excel export failed. See console for details.");
  //   } finally {
  //     setExporting(false);
  //   }
  // };

  if (loading)
    return <p className="text-center mt-10">Checking permissions...</p>;

  return (
    <>
      {/* Header — reserve space on the right for the floating bell */}
      <div className="no-print flex items-center justify-between gap-2 pr-24 lg:pr-36">
        <motion.h1
          className="pt-2 text-3xl font-bold tracking-tight text-neutral-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          Dashboard
        </motion.h1>

        {/* Right actions */}
        <div className="flex gap-2 pointer-events-auto z-10">
          {/* <button
            onClick={handleExportExcel}
            disabled={exporting}
            className={`px-3 py-2 rounded ${
              exporting
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-[#181918] text-white hover:text-[#ffba20]"
            }`}
            title="Download formatted Excel workbook"
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </button> */}
        </div>
      </div>

      <p className="text-neutral-500 mb-6 text-sm">
        Overview of sales performance, inventory status, and recent activity
        logs.
      </p>

      {/* Top summary cards */}
      <motion.div
        className="print-card"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Cards />
      </motion.div>

      {/* Bar graph */}
      <motion.div
        className="mt-4 print-card"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="bg-white rounded-xl shadow p-4">
          <Bargraph />
        </div>
      </motion.div>

      {/* Bottom row: recent orders + activity log */}
      <motion.div
        className="mt-6 print-card"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BottomCards />
          <RecentActivityLog />
        </div>
      </motion.div>
    </>
  );
};

export default DashboardPage;
