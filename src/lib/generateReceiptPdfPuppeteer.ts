// /lib/generateReceiptPdfPuppeteer.ts
import puppeteer from "puppeteer";
import { generateReceiptHtml } from "./generateReceiptHtml";

export async function generateReceiptPdfBuffer(opts: any) {
  const html = generateReceiptHtml(opts);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "25px", left: "20px", right: "20px", bottom: "25px" },
  });
  await browser.close();
  return pdfBuffer;
}
