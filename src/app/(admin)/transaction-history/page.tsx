// // app/transaction-history/page.tsx
// "use client";

// import { useEffect, useMemo, useState } from "react";
// import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";

// type OrderWithCustomer = {
//   id: string;
//   date_created: string;
//   customer: {
//     contact_person: string;
//     code: string;
//   }[];
// };

// type Transaction = {
//   id: string;
//   date_created: string;
//   code: string;
//   customer: string;
// };

// export default function TransactionHistoryPage() {
//   const supabase = createPagesBrowserClient();
//   const [searchQuery, setSearchQuery] = useState("");
//   const [transactions, setTransactions] = useState<Transaction[]>([]);

//   useEffect(() => {
//     async function load() {
//      const { data, error } = await supabase
//   .from("orders")
//   .select(`
//     id,
//     date_created,
//     customer:customer_id (
//       contact_person,
//       code
//     )
//   `)
//   .order("date_created", { ascending: false });


//       if (error) {
//         console.error("Error loading orders:", error);
//         return;
//       }

//       setTransactions(
//         data.map((o) => ({
//           id: o.id,
//           date_created: o.date_created,
//           code: o.customer[0]?.code ?? "—",
//           customer: o.customer[0]?.contact_person ?? "—",
//         }))
//       );
//     }

//     load();
//   }, [supabase]);

//   const filtered = useMemo(
//     () =>
//       transactions.filter((t) =>
//         [t.date_created, t.code, t.customer]
//           .join(" ")
//           .toLowerCase()
//           .includes(searchQuery.toLowerCase())
//       ),
//     [searchQuery, transactions]
//   );

//   return (
//     <div className="p-6">
//       <h1 className="text-3xl font-bold mb-6">Transaction History</h1>

//       <input
//         type="search"
//         aria-label="Search by date, code or customer"
//         placeholder="Search by date, code or customer…"
//         value={searchQuery}
//         onChange={(e) => setSearchQuery(e.target.value)}
//         className="border px-4 py-2 mb-4 w-full md:w-1/3 rounded-full"
//       />

//       <div className="overflow-x-auto rounded-lg shadow">
//         <table className="min-w-full bg-white text-sm">
//           <thead className="bg-[#ffba20] text-black text-left">
//             <tr>
//               <th className="px-4 py-3">Date</th>
//               <th className="px-4 py-3">Transaction Code</th>
//               <th className="px-4 py-3">Customer Name</th>
//             </tr>
//           </thead>
//           <tbody>
//             {filtered.map((t) => (
//               <tr key={t.id} className="border-b hover:bg-gray-100">
//                 <td className="px-4 py-3">
//                   {new Date(t.date_created).toISOString().slice(0, 10)}
//                 </td>
//                 <td className="px-4 py-3">{t.code}</td>
//                 <td className="px-4 py-3">{t.customer}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
