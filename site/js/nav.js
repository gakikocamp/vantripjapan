// ══════════════════════════════════════════════
// VanTripJapan — Shared Navigation & Utilities
// ══════════════════════════════════════════════

(function () {
  'use strict';

  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // Mobile hamburger menu
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('active');
      hamburger.classList.toggle('active', isOpen);
      document.body.classList.toggle('menu-open', isOpen);
    });

    // Close menu when a nav link is tapped
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });

    // Close menu on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });
  }

  // Back to Top button — positioned above WhatsApp button
  let backBtn = document.getElementById('backToTop');
  if (!backBtn) {
    backBtn = document.createElement('button');
    backBtn.id = 'backToTop';
    backBtn.innerHTML = '&uarr;';
    backBtn.setAttribute('aria-label', 'Back to top');
    backBtn.style.cssText =
      'position:fixed;bottom:90px;right:24px;width:40px;height:40px;' +
      'border-radius:50%;border:none;background:var(--color-text);' +
      'color:white;font-size:16px;cursor:pointer;opacity:0;' +
      'transition:all 0.3s;z-index:90;pointer-events:none;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.15);';
    document.body.appendChild(backBtn);
  }
  window.addEventListener('scroll', () => {
    backBtn.style.opacity = window.scrollY > 600 ? '1' : '0';
    backBtn.style.pointerEvents = window.scrollY > 600 ? 'auto' : 'none';
  });
  backBtn.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' })
  );

  // Reading progress bar (only on article pages)
  if (document.querySelector('.article-body')) {
    const progress = document.createElement('div');
    progress.className = 'reading-progress';
    document.body.prepend(progress);
    window.addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) progress.style.width = (window.scrollY / h) * 100 + '%';
    });
  }
})();
