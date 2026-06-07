const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err));
  
  await page.goto('https://vantripjapan.jp/rent/');
  
  await page.waitForLoadState('networkidle');
  console.log('Page loaded');
  
  const title1 = await page.locator('[data-i18n="hero.title1"]').textContent();
  console.log('Title before click:', title1);
  
  await page.click('text=FR');
  console.log('Clicked FR');
  
  await page.waitForTimeout(2000);
  console.log('Current URL:', page.url());
  
  const title2 = await page.locator('[data-i18n="hero.title1"]').textContent();
  console.log('Title after click:', title2);
  
  await browser.close();
})();
