// /lib/generateReceiptHtml.ts

export function generateReceiptHtml(order: any) {
  const items = order.items || order.order_items || [];
  const customer = order.customer || order.customers || {};
  const totalAmount = items.reduce(
    (sum: number, item: any) => sum + ((item.item?.unit_price ?? item.unit_price ?? item.price ?? 0) * (item.quantity ?? 1)),
    0
  );
  const date = order.date || order.date_created || new Date().toISOString().slice(0, 10);

  const formatPeso = (n: number) =>
    (Number(n) || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

  return `
  <html>
    <head>
      <style>
        body {
          font-family: 'DM Sans', Arial, sans-serif;
          background: #fff;
          color: #111;
          padding: 0; margin: 0;
        }
        .container {
          max-width: 820px;
          margin: 30px auto;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 4px 20px #0001;
          padding: 24px 28px 28px 28px;
          border: 1.5px solid #eee;
        }
        .header {
          text-align: center;
          margin-bottom: 13px;
        }
        .header-title {
          font-size: 1.55rem;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .header-desc {
          color: #888;
          font-size: 0.95rem;
          letter-spacing: 1px;
          margin-bottom: 2px;
        }
        .receipt-label {
          color: #ffba20;
          font-size: 0.98rem;
          font-weight: 700;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }
        .info-section {
          display: flex;
          flex-wrap: wrap;
          border-radius: 8px;
          border: 1px solid #eee;
          background: #fafafc;
          padding: 13px 16px 11px 16px;
          margin-bottom: 13px;
          font-size: 0.93rem;
          gap: 13px;
          justify-content: space-between;
        }
        .info-left, .info-right {
          flex: 1 1 260px;
          min-width: 160px;
          max-width: 48%;
        }
        .info-field {
          font-weight: bold;
        }
        .table-section {
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 11px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.91rem;
        }
        thead {
          background: #ffba20;
          color: #fff;
        }
        th, td {
          padding: 7px 5px;
          border-bottom: 1px solid #f1e3bd;
          text-align: left;
        }
        th { font-weight: 700; text-transform: uppercase; font-size: 0.92rem; }
        td:last-child, th:last-child {
          text-align: right;
        }
        tr:last-child td { border-bottom: none; }
        .total-row td {
          font-size: 1.01rem;
          font-weight: bold;
          background: #f7e6bb;
          border-top: 2px solid #ffba20;
        }
        .footer-note {
          color: #ffba20;
          font-size: 0.92rem;
          margin-top: 13px;
          margin-bottom: 2px;
        }
        .disclaimer {
          color: #a98c2a;
          font-size: .88rem;
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-title">UNIASIA</div>
          <div class="header-desc">SITIO II MANGGAHAN BAHAY PARE, MEYCAUAYAN CITY BULACAN</div>
          <div class="receipt-label">DELIVERY RECEIPT</div>
        </div>
        <div class="info-section">
          <div class="info-left">
            <div><span class="info-field">CUSTOMER:</span> ${customer.name || "-"}</div>
            <div><span class="info-field">ADDRESS:</span> ${customer.address || "-"}</div>
            <div><span class="info-field">EMAIL:</span> ${customer.email || "-"}</div>
          </div>
          <div class="info-right">
            <div><span class="info-field">DATE:</span> ${typeof date === "string" && date.length > 10 ? date.slice(0, 10) : date || "-"}</div>
            <div><span class="info-field">TRANSACTION CODE:</span> ${order.transactionCode || order.transaction_code || order.id || "-"}</div>
            <div><span class="info-field">PHONE:</span> ${customer.phone || "-"}</div>
          </div>
        </div>
        <div class="table-section">
          <table>
            <thead>
              <tr>
                <th>QTY</th>
                <th>UNIT</th>
                <th>DESCRIPTION</th>
                <th>REMARKS</th>
                <th>UNIT PRICE</th>
                <th>TOTAL AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${
                items.length
                  ? items
                      .map(
                        (ci: any) => `
                  <tr>
                    <td>${ci.quantity ?? ci.item?.quantity ?? ci.qty ?? 1}</td>
                    <td>${ci.item?.unit || ci.unit || "-"}</td>
                    <td><b>${ci.item?.product_name || ci.product_name || ci.description || "-"}</b></td>
                    <td>${ci.remarks || ""}</td>
                    <td>${formatPeso(ci.item?.unit_price ?? ci.unit_price ?? ci.price ?? ci.unitPrice ?? 0)}</td>
                    <td>${formatPeso(
                      (ci.item?.unit_price ?? ci.unit_price ?? ci.price ?? ci.unitPrice ?? 0) *
                        (ci.quantity ?? ci.item?.quantity ?? ci.qty ?? 1)
                    )}</td>
                  </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="6" style="text-align:center;">No items found</td></tr>`
              }
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="5" style="text-align: right;">Total Amount:</td>
                <td>${formatPeso(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="footer-note">NOTES:</div>
        <div style="margin-left:3px; font-size:0.90rem;">
          1. All goods are checked in good condition and complete after received and signed.<br/>
          2. Cash advances to salesman not allowed.<br/>
          3. All checks payable to By-Grace Trading only.
        </div>
        <div class="disclaimer">
          * Final price may change if an admin applies a discount during order processing.
        </div>
      </div>
    </body>
  </html>
  `;
}
