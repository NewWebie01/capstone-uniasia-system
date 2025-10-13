import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { generateReceiptHtml } from "./generateReceiptHtml";

export async function generateReceiptPdfBuffer(opts: any) {
  const html = generateReceiptHtml(opts);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true, // 'chromium.headless' does not exist; just use true!
    // defaultViewport is not required
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
