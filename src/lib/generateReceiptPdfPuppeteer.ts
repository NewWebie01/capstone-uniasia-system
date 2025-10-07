import puppeteer from "puppeteer";

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
 const browser = await puppeteer.launch({
  headless: true, // ← change "new" to true
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "25px", bottom: "25px", left: "20px", right: "20px" },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}
