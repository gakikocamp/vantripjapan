const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  
  // Desktop
  const pageDesktop = await browser.newPage({ viewport: { width: 1280, height: 1080 } });
  await pageDesktop.goto('https://vantripjapan.jp/rent/');
  await pageDesktop.waitForLoadState('networkidle');
  await pageDesktop.waitForTimeout(2000);
  await pageDesktop.screenshot({ path: 'artifacts/desktop_destinations.png', fullPage: true });
  console.log('Desktop screenshot saved');
  await pageDesktop.close();

  // Mobile
  const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pageMobile.goto('https://vantripjapan.jp/rent/');
  await pageMobile.waitForLoadState('networkidle');
  await pageMobile.waitForTimeout(2000);
  await pageMobile.screenshot({ path: 'artifacts/mobile_destinations.png', fullPage: true });
  console.log('Mobile screenshot saved');
  await pageMobile.close();
  
  await browser.close();
})();
