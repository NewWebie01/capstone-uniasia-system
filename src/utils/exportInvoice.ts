// utils/exportInvoice.ts
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Named export
export async function generatePDFBlob(targetId: string): Promise<Blob | null> {
  const el = document.getElementById(targetId) as HTMLElement | null;
  if (!el) return null;

  // (optional) wait for fonts for crisp text
  try {
    await (document as any).fonts?.ready;
  } catch {}

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const iw = pw;
  const ih = (canvas.height * iw) / canvas.width;

  let remaining = ih;
  let y = 0;
  while (remaining > 0) {
    pdf.addImage(img, "PNG", 0, y, iw, ih);
    remaining -= ph;
    if (remaining > 0) {
      pdf.addPage();
      y -= ph;
    }
  }

  return pdf.output("blob");
}
