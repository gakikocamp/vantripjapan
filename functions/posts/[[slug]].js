/**
 * VanTripJapan — Dynamic Article Renderer
 * GET /posts/{slug}/ — serves article from D1 database
 * Falls back to static file if article not found in D1
 */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // YYYY-MM-DD → YYYY.MM.DD
  return dateStr.slice(0, 10).replace(/-/g, '.');
}

function estimateReadTime(body) {
  if (!body) return '5 min read';
  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(2, Math.round(words / 200));
  return `${mins} min read`;
}

function renderArticlePage(article) {
  const dateFormatted = formatDate(article.published_at);
  const readTime = estimateReadTime(article.body);
  const canonicalUrl = `https://vantripjapan.jp/posts/${article.slug}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(article.title)} — VanTripJapan</title>
  <meta name="description" content="${escHtml(article.excerpt)}">
  <meta property="og:title" content="${escHtml(article.title)}">
  <meta property="og:description" content="${escHtml(article.excerpt)}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="${escHtml(article.cover_image)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/article.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escHtml(article.title).replace(/"/g, '\\"')}",
    "description": "${escHtml(article.excerpt).replace(/"/g, '\\"')}",
    "image": "${escHtml(article.cover_image)}",
    "author": {"@type": "Organization", "name": "VanTripJapan"},
    "publisher": {"@type": "Organization", "name": "VanTripJapan", "logo": {"@type": "ImageObject", "url": "https://vantripjapan.jp/images/hero-vanlife.png"}},
    "datePublished": "${article.published_at || ''}",
    "dateModified": "${article.updated_at || article.published_at || ''}",
    "url": "${canonicalUrl}"
  }
  </script>
</head>
<body>

  <!-- Navigation -->
  <nav class="nav" id="navbar">
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <div class="logo-icon">V</div>
        <div><span>VAN TRIP JAPAN</span><span class="magazine-tag">Magazine</span></div>
      </a>
      <div class="nav-links" id="navLinks">
        <a href="/">Stories</a>
        <a href="/#stories">Destinations</a>
        <a href="/#tips">Tips</a>
        <a href="/contact/">Contact</a>
        <a href="/rent/" class="nav-cta">Rent a Van</a>
      </div>
      <button class="nav-hamburger" id="hamburger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <!-- Hero Image -->
  <div class="article-hero">
    <img src="${escHtml(article.cover_image)}" loading="lazy" alt="${escHtml(article.title)}">
    <div class="article-hero-overlay"></div>
  </div>

  <!-- Article Header -->
  <div class="article-header">
    <div class="article-meta">
      <span class="article-category-tag">${escHtml(article.category)}</span>
      <span class="article-date">${dateFormatted}</span>
    </div>
    <h1 class="article-page-title">${escHtml(article.title)}</h1>
    <p class="article-excerpt-text">${escHtml(article.excerpt)}</p>
    <div class="article-author-info">
      <div class="article-author-avatar">✍️</div>
      <div>
        <div class="article-author-name">VANTRIPJAPAN Team</div>
        <div class="article-author-role">${readTime}</div>
      </div>
    </div>
  </div>

  <!-- Article Body -->
  <article class="article-body">
    ${article.body || ''}
  </article>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="footer-logo">VAN TRIP JAPAN</div>
        <p>Real stories from the road. Travel guides, tips, and campervan rental in Fukuoka, Japan.</p>
        <div class="footer-social">
          <a href="https://instagram.com/vantripjapan" aria-label="Instagram">📷</a>
          <a href="https://pinterest.com/vantripjapan" aria-label="Pinterest">📌</a>
          <a href="https://wa.me/817093757129" target="_blank" aria-label="WhatsApp">💬</a>
          <a href="https://lin.ee/YYyRz2f" target="_blank" aria-label="LINE">💚</a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <a href="/">Stories</a>
        <a href="/#stories">Destinations</a>
        <a href="/#tips">Tips</a>
      </div>
      <div class="footer-col">
        <h4>Rental</h4>
        <a href="/rent/">Campervan Rentals</a>
        <a href="/rent/#vehicles">Our Vehicles</a>
        <a href="/rent/#pricing">Pricing</a>
      </div>
      <div class="footer-col">
        <h4>About</h4>
        <a href="/contact/">Contact</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2025 VanTripJapan. A service by JDLTC. All rights reserved.</span>
      <span>Fukuoka, Japan</span>
    </div>
  </footer>

  <script>
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
    const backBtn = document.createElement('button');
    backBtn.id = 'backToTop';
    backBtn.innerHTML = '&uarr;';
    backBtn.setAttribute('aria-label', 'Back to top');
    backBtn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:44px;height:44px;border-radius:50%;border:none;background:var(--color-text);color:white;font-size:18px;cursor:pointer;opacity:0;transition:all 0.3s;z-index:90;box-shadow:0 4px 16px rgba(0,0,0,0.15);';
    document.body.appendChild(backBtn);
    window.addEventListener('scroll', () => {
      backBtn.style.opacity = window.scrollY > 600 ? '1' : '0';
      backBtn.style.pointerEvents = window.scrollY > 600 ? 'auto' : 'none';
    });
    backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  </script>

</body>
</html>`;
}

export async function onRequest(context) {
  const { env, params } = context;

  // Extract slug from URL params
  const slugParts = params.slug;
  if (!slugParts || slugParts.length === 0) {
    return context.next();
  }
  const slug = slugParts[0];

  try {
    const article = await env.DB.prepare(
      `SELECT * FROM articles WHERE site = 'vantrip' AND slug = ? AND status = 'published'`
    ).bind(slug).first();

    if (!article) {
      // Fall back to static file if exists
      return context.next();
    }

    const html = renderArticlePage(article);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    // On DB error, fall back to static
    return context.next();
  }
}
