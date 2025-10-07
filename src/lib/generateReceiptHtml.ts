// lib/generateReceiptHtml.ts
export function generateReceiptHtml(order: any) {
  return `
  <html>
    <head>
      <style>
        body { font-family: 'DM Sans', Arial, sans-serif; padding: 32px; }
        .header { text-align: center; }
        .brand { font-size: 2.4rem; font-weight: bold; letter-spacing: 2px; }
        .subtitle { color: #888; margin-bottom: 12px; }
        .receipt-title { color: #FFA726; font-size: 1.2rem; margin-bottom: 32px; font-weight: bold; }
        .info-table { width: 100%; margin-bottom: 24px; border: 1px solid #ddd; border-radius: 10px; padding: 20px; font-size: 1rem; }
        .info-table td { padding: 4px 8px; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td { padding: 8px 10px; border: 1px solid #FFA726; font-size: 0.98rem; }
        .data-table th { background: #FFA726; color: #fff; }
        .bold { font-weight: bold; }
        .notes { margin-top: 24px; font-size: 0.97rem; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">UNIASIA</div>
        <div class="subtitle">SITIO II MANGGAHAN BAHAY PARE, MEYCAUAYAN CITY BULACAN</div>
        <div class="receipt-title">DELIVERY RECEIPT</div>
      </div>
      <table class="info-table">
        <tr>
          <td><span class="bold">CUSTOMER:</span> ${order.customers?.name ?? ""}</td>
          <td><span class="bold">DATE:</span> ${order.date_created ?? ""}</td>
        </tr>
        <tr>
          <td><span class="bold">ADDRESS:</span> ${order.customers?.address ?? ""}</td>
          <td><span class="bold">TERMS:</span> Net 1 Monthly</td>
        </tr>
        <tr>
          <td><span class="bold">FORWARDER:</span> </td>
          <td><span class="bold">PO NO:</span> 222222</td>
        </tr>
        <tr>
          <td><span class="bold">SALESMAN:</span> ${order.salesman ?? "n/a"}</td>
          <td><span class="bold">STATUS:</span> <span style="color:green;">Completed</span></td>
        </tr>
        <tr>
          <td><span class="bold">EMAIL:</span> ${order.customers?.email ?? ""}</td>
          <td><span class="bold">PHONE:</span> ${order.customers?.phone ?? ""}</td>
        </tr>
      </table>
      <table class="data-table">
        <thead>
          <tr>
            <th>QTY</th>
            <th>UNIT</th>
            <th>ITEM DESCRIPTION</th>
            <th>REMARKS</th>
            <th>UNIT PRICE</th>
            <th>DISCOUNT/ADD (%)</th>
            <th>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
        ${
          (order.order_items || [])
            .map(
              (item: any, idx: number) => `
            <tr>
              <td>${item.quantity}</td>
              <td>${item.inventory?.unit || ""}</td>
              <td><b>${item.inventory?.product_name || ""}</b></td>
              <td>${item.remarks || ""}</td>
              <td>₱${Number(item.price || 0).toLocaleString()}</td>
              <td>${item.discount_percent ?? ""}</td>
              <td>₱${Number(item.amount || item.price || 0).toLocaleString()}</td>
            </tr>`
            )
            .join("")
        }
        </tbody>
      </table>
      <div class="notes">
        <div>NOTES:</div>
        <div>1. All goods are checked in good condition and complete after received and signed.</div>
        <div>2. Cash advances to salesman not allowed.</div>
        <div>3. All checks payable to By-Grace Trading only.</div>
      </div>
    </body>
  </html>
  `;
}
