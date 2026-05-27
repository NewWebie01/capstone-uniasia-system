import { generateReceiptHtml } from "./generateReceiptHtml";
import type { Browser } from "puppeteer-core";

/**
 * Generates a receipt PDF Buffer.
 * - Local dev: puppeteer
 * - Vercel/serverless: puppeteer-core + @sparticuz/chromium
 */
export async function generateReceiptPdfBuffer(opts: any): Promise<Buffer> {
  const html = generateReceiptHtml(opts);
  const isServerless = !!process.env.AWS_REGION || !!process.env.VERCEL;

  let browser: Browser | null = null;

  try {
    if (isServerless) {
      // -------- Serverless (Vercel, AWS, etc.)
      const chromium = (await import("@sparticuz/chromium")).default;
      const pcoreMod: any = await import("puppeteer-core");
      const puppeteerCore = pcoreMod.default ?? pcoreMod;

      const b: Browser = await puppeteerCore.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
      browser = b;
    } else {
      // -------- Local development (downloads Chrome)
      const puppeteerMod: any = await import("puppeteer");
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const b = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      // cast to Browser to keep a single type
      browser = b as unknown as Browser;
    }

    if (!browser) throw new Error("Failed to launch browser");

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "25px", right: "20px", bottom: "25px", left: "20px" },
    });

    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
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
