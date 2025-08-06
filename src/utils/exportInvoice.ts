// src/utils/exportInvoice.ts
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function generatePDFBlob(id: string): Promise<Blob | null> {
  const element = document.getElementById(id);
  if (!element) return null;

  const canvas = await html2canvas(element);
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");
  const width = pdf.internal.pageSize.getWidth();
  const height = (canvas.height * width) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, width, height);

  const blob = pdf.output("blob");
  return blob;
}
