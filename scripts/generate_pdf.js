const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const htmlPath = path.join(__dirname, '../site/downloads/guide.html');
  const pdfPath = path.join(__dirname, '../site/downloads/kyushu-road-trip-guide.pdf');

  console.log(`Loading HTML from: ${htmlPath}`);
  console.log(`Target PDF path: ${pdfPath}`);

  if (!fs.existsSync(htmlPath)) {
    console.error(`Error: HTML file does not exist at ${htmlPath}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    // Go to file URL
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    // Print to PDF
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true, // Crucial for CSS backgrounds to render!
      displayHeaderFooter: false
    });

    console.log('✅ PDF generated successfully!');
  } catch (err) {
    console.error('Error generating PDF:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
