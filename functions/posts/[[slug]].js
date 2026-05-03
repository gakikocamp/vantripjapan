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

function detectLang(article) {
  const tags = (article.tags || '').toLowerCase();
  // Explicit lang tags take priority: lang-de, lang-fr, lang-he, lang-zh
  if (tags.includes('lang-de')) return 'de';
  if (tags.includes('lang-fr')) return 'fr';
  if (tags.includes('lang-he')) return 'he';
  if (tags.includes('lang-zh')) return 'zh-Hant';
  return 'en';
}

function resolveImageUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `https://vantripjapan.jp${src.startsWith('/') ? '' : '/'}${src}`;
}

function extractFaqSchema(body) {
  if (!body) return '';
  // Look for FAQ data attribute in article body
  const faqMatch = body.match(/<!--FAQ_SCHEMA:(.*?)-->/s);
  if (!faqMatch) return '';
  try {
    const faqData = JSON.parse(faqMatch[1]);
    return `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": ${JSON.stringify(faqData)}
  }
  </script>`;
  } catch (e) {
    return '';
  }
}

function renderArticlePage(article) {
  const dateFormatted = formatDate(article.published_at);
  const readTime = estimateReadTime(article.body);
  const canonicalUrl = `https://vantripjapan.jp/posts/${article.slug}/`;
  const lang = detectLang(article);
  const imageUrl = resolveImageUrl(article.cover_image);
  const faqSchema = extractFaqSchema(article.body);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(article.title)} — VanTripJapan</title>
  <meta name="description" content="${escHtml(article.excerpt)}">
  <meta property="og:title" content="${escHtml(article.title)}">
  <meta property="og:description" content="${escHtml(article.excerpt)}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/png" href="/images/favicon.png">
  <link rel="stylesheet" href="/css/style.css?v=20260504">
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-RC4937NTHC"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-RC4937NTHC');</script>
  <link rel="stylesheet" href="/css/article.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escHtml(article.title).replace(/"/g, '\\"')}",
    "description": "${escHtml(article.excerpt).replace(/"/g, '\\"')}",
    "image": "${imageUrl}",
    "author": {"@type": "Organization", "name": "VanTripJapan"},
    "publisher": {"@type": "Organization", "name": "VanTripJapan", "logo": {"@type": "ImageObject", "url": "https://vantripjapan.jp/images/hero-vanlife.png"}},
    "datePublished": "${article.published_at || ''}",
    "dateModified": "${article.updated_at || article.published_at || ''}",
    "url": "${canonicalUrl}",
    "articleSection": "${escHtml(article.category || '').replace(/"/g, '\\"')}",
    "inLanguage": "${lang}"
  }
  </script>${faqSchema}
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
        <a href="/">Home</a>
        <a href="/category/">Guides</a>
        <a href="/rent/">Rental</a>
        <a href="/contact/">Contact</a>
        <a href="/rent/" class="nav-cta">Rent a Van →</a>
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

  <!-- CTA -->
  <div class="article-cta">
    <div class="article-cta-box">
      <h3>Ready to explore Japan by campervan?</h3>
      <p>All-inclusive rental from Fukuoka. 10 min from the airport.</p>
      <a href="/rent/" class="article-cta-btn">View Rental Options →</a>
    </div>
  </div>

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
        <a href="/">Home</a>
        <a href="/category/">Travel Guides</a>
        <a href="/posts/best-scenic-drives-kyushu/">Scenic Drives</a>
        <a href="/posts/kyushu-road-trip-7-days/">7-Day Itinerary</a>
      </div>
      <div class="footer-col">
        <h4>Rental</h4>
        <a href="/rent/">Campervan Rentals</a>
        <a href="/rent/#vehicles">Our Vehicles</a>
        <a href="/rent/#pricing">Pricing</a>
        <a href="/rent/#faq">FAQ</a>
      </div>
      <div class="footer-col">
        <h4>About</h4>
        <a href="/contact/">Contact</a>
        <a href="/privacy/">Privacy Policy</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 VanTripJapan. Operated by <a href="https://www.camjyo.com/" target="_blank" style="color:inherit;text-decoration:underline;">キャンプ女子株式会社</a>. All rights reserved.</span>
      <span>Fukuoka, Japan</span>
    </div>
  </footer>

  <!-- Floating WhatsApp Button -->
  <a href="https://wa.me/817093757129?text=Hi!%20I'm%20interested%20in%20renting%20a%20campervan%20in%20Fukuoka." 
     class="floating-whatsapp" target="_blank" aria-label="Chat on WhatsApp">
    💬
  </a>

  <script src="/js/nav.js?v=20260413"></script>

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
