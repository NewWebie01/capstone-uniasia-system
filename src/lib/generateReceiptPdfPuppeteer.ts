import puppeteer from "puppeteer";
import { generateReceiptHtml } from "./generateReceiptHtml";

export async function generateReceiptPdfBuffer(opts: any): Promise<Buffer> {
  const html = generateReceiptHtml(opts);
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "25px", right: "20px", bottom: "25px", left: "20px" },
    });

    // Ensure Buffer type
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } catch (err) {
    console.error("[generateReceiptPdfBuffer] Error:", err);
    throw err;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
