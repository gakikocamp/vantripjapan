const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright validation script...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to http://localhost:8899/rent/ ...');
    await page.goto('http://localhost:8899/rent/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Page loaded.');

    // 1. Verify user-select computed styles on .hero-slideshow
    console.log('Verifying user-select styles...');
    const computedUserSelect = await page.evaluate(() => {
      const slideshow = document.querySelector('.hero-slideshow');
      if (!slideshow) return null;
      const style = window.getComputedStyle(slideshow);
      return {
        userSelect: style.userSelect || style.webkitUserSelect || style.mozUserSelect || style.msUserSelect
      };
    });
    console.log('Computed user-select for .hero-slideshow:', computedUserSelect);
    if (computedUserSelect && (computedUserSelect.userSelect === 'none' || computedUserSelect.userSelect.includes('none'))) {
      console.log('✅ PASS: user-select is successfully set to "none"');
    } else {
      console.error('❌ FAIL: user-select is not "none"', computedUserSelect);
    }

    // 2. Verify initial aria-hidden state
    console.log('Verifying initial aria-hidden state of slides...');
    const initialSlidesState = await page.evaluate(() => {
      const slides = document.querySelectorAll('.hero-slide');
      return Array.from(slides).map((s, idx) => ({
        index: idx,
        classes: s.className,
        ariaHidden: s.getAttribute('aria-hidden')
      }));
    });
    console.log('Initial slides state:', initialSlidesState);
    if (initialSlidesState[0].ariaHidden === 'false' && initialSlidesState[1].ariaHidden === 'true' && initialSlidesState[2].ariaHidden === 'true') {
      console.log('✅ PASS: Initial aria-hidden attributes match expectations');
    } else {
      console.error('❌ FAIL: Initial aria-hidden attributes do not match', initialSlidesState);
    }

    // 3. Wait 6 seconds and verify slideshow toggles aria-hidden
    console.log('Waiting for slideshow transition (6 seconds)...');
    await page.waitForTimeout(6000);

    const transitionSlidesState = await page.evaluate(() => {
      const slides = document.querySelectorAll('.hero-slide');
      return Array.from(slides).map((s, idx) => ({
        index: idx,
        classes: s.className,
        ariaHidden: s.getAttribute('aria-hidden')
      }));
    });
    console.log('Slides state after transition:', transitionSlidesState);
    const activeSlide = transitionSlidesState.find(s => s.classes.includes('active'));
    if (activeSlide && activeSlide.index === 1 && activeSlide.ariaHidden === 'false') {
      console.log('✅ PASS: Slide transitioned and updated aria-hidden correctly');
    } else {
      console.warn('⚠️ WARNING: Active slide index is not 1 after 6 seconds, let us check current active:', activeSlide);
    }

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await browser.close();
    console.log('Playwright validation script finished.');
  }
})();
