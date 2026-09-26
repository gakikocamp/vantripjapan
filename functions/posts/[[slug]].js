import { CONSOLIDATED, isConsolidated } from '../lib/consolidated.js';

/**
 * VanTripJapan — Dynamic Article Renderer
 * GET /posts/{slug}/ — serves article from D1 database
 * Falls back to static file if article not found in D1
 */

/**
 * 薄い量産記事(pSEO)の重複判定。
 * 「{campervan|camping-car|motorhome|rv}-rental-{location}-for-{segment}」のうち、
 * 同義語(campervan以外)・地名重複(fukuoka-airport / hakata) を「薄い重複」とみなす。
 * campervan の fukuoka/itoshima/kyushu 版だけを正規版として残す（indexする）。
 * → 該当は noindex,follow でインデックスから外し、サイト全体の評価希釈を止める。
 * 完全に可逆（このファイルと sitemap.xml.js の判定を消すだけで元に戻る）。
 */
function isThinRentalDuplicate(slug) {
  const m = /^(campervan|camping-car|motorhome|rv)-rental-(fukuoka-airport|hakata|fukuoka|itoshima|kyushu)-for-(couples|families|solo-travelers|surfers)$/.exec(slug || '');
  if (!m) return false;
  const syn = m[1], loc = m[2];
  const isCanonical = syn === 'campervan' && (loc === 'fukuoka' || loc === 'itoshima' || loc === 'kyushu');
  return !isCanonical;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON-LD文字列用エスケープ（escHtmlはHTML用なのでJSONには使わない）
function jsonEsc(str) {
  return JSON.stringify(String(str == null ? '' : str)).slice(1, -1);
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

// 記事CTAの多言語辞書（detectLangのキーに対応。zh-HantはLINEファースト）
const CTA_I18N = {
  en: {
    ready: 'Ready to explore Kyushu by campervan?',
    body: 'Campervan rental from Fukuoka, from ¥22,000 a day. Insurance, bedding, and 24/7 English support included. An ETC card is available on advance request; tolls are charged separately. Pickup 10 min from Fukuoka Airport.',
    searchTitle: 'Check real availability for your trip',
    pickup: 'Pickup date',
    return: 'Return date',
    guests: 'Travelers',
    guestOptions: ['1 traveler', '2 travelers', '3 travelers', '4 travelers', '5 travelers'],
    search: 'Check dates & prices',
    view: 'View Rental Options →',
    wa: '💬 Ask on WhatsApp',
    waText: "Hi Karen! I just read your article and I'm interested in renting a campervan.",
    book: 'No-risk booking request. No payment needed',
    faq: 'Frequently asked questions',
    floatBadge: 'Fukuoka Airport Pickup',
    floatTitle: 'Explore Japan by Campervan',
    floatBody: 'All-inclusive rental from ¥22,000/day',
    floatBtn: 'View Rates →',
  },
  fr: {
    ready: 'Prêt à explorer Kyushu en camping-car ?',
    body: "Location de camping-car au départ de Fukuoka, à partir de ¥22 000/jour (≈134 €). Assurance, literie et assistance 24h/24 incluses. Carte ETC disponible sur demande préalable ; péages facturés séparément. Prise en charge à 10 min de l'aéroport de Fukuoka.",
    searchTitle: 'Vérifiez les disponibilités pour votre voyage',
    pickup: 'Date de départ',
    return: 'Date de retour',
    guests: 'Voyageurs',
    guestOptions: ['1 voyageur', '2 voyageurs', '3 voyageurs', '4 voyageurs', '5 voyageurs'],
    search: 'Voir les dates et les prix',
    view: 'Voir les camping-cars →',
    wa: '💬 Écrivez-nous sur WhatsApp',
    waText: 'Bonjour Karen ! Je viens de lire votre article et je souhaite louer un camping-car.',
    book: 'Demande de réservation sans engagement',
    faq: 'Questions fréquentes',
    floatBadge: "Départ aéroport de Fukuoka",
    floatTitle: 'Le Japon en camping-car',
    floatBody: 'Tout compris dès ¥22 000/jour (≈134 €)',
    floatBtn: 'Voir les tarifs →',
  },
  de: {
    ready: 'Bereit, Kyushu im Campervan zu entdecken?',
    body: 'Campervan-Vermietung ab Fukuoka, ab ¥22.000/Tag (≈134 €). Versicherung, Bettwäsche und 24/7-Support inklusive. Eine ETC-Karte ist nach vorheriger Anfrage verfügbar; Mautgebühren werden separat berechnet. Abholung 10 Min. vom Flughafen Fukuoka.',
    searchTitle: 'Verfügbarkeit für Ihre Reise prüfen',
    pickup: 'Abholdatum',
    return: 'Rückgabedatum',
    guests: 'Reisende',
    guestOptions: ['1 Reisender', '2 Reisende', '3 Reisende', '4 Reisende', '5 Reisende'],
    search: 'Termine & Preise prüfen',
    view: 'Fahrzeuge ansehen →',
    wa: '💬 Auf WhatsApp fragen',
    waText: 'Hallo Karen! Ich habe gerade euren Artikel gelesen und möchte einen Campervan mieten.',
    book: 'Unverbindliche Buchungsanfrage',
    faq: 'Häufige Fragen',
    floatBadge: 'Abholung am Flughafen Fukuoka',
    floatTitle: 'Japan im Campervan erleben',
    floatBody: 'All-inclusive ab ¥22.000/Tag (≈134 €)',
    floatBtn: 'Preise ansehen →',
  },
  'zh-Hant': {
    ready: '準備好開露營車遊九州了嗎？',
    body: '福岡出發露營車出租——每日¥22,000起。含保險、寢具與24小時支援。ETC卡可提前申請，過路費另計。福岡機場10分鐘即可取車。',
    searchTitle: '查詢旅程的實際空車與價格',
    pickup: '取車日期',
    return: '還車日期',
    guests: '旅客人數',
    guestOptions: ['1位旅客', '2位旅客', '3位旅客', '4位旅客', '5位旅客'],
    search: '查詢日期與價格',
    view: '查看車輛與價格 →',
    line: 'LINE 諮詢（台灣旅客首選）',
    wa: '💬 WhatsApp 諮詢',
    waText: 'Hi Karen! I read your article and would like to rent a campervan.',
    book: '免付款預約申請',
    faq: '常見問題',
    floatBadge: '福岡機場取車',
    floatTitle: '開露營車環遊九州',
    floatBody: '全包式每日¥22,000起',
    floatBtn: '查看價格 →',
  },
  he: {
    ready: 'מוכנים לטייל בקיושו בקרוואן?',
    body: 'השכרת קרוואן מפוקואוקה — החל מ-¥22,000 ליום (≈₪543). ביטוח, מצעים ותמיכה באנגלית 24/7 כלולים. כרטיס ETC זמין בהזמנה מראש; אגרות הכביש מחויבות בנפרד. איסוף 10 דקות משדה התעופה פוקואוקה.',
    searchTitle: 'בדקו זמינות אמיתית לתאריכי הנסיעה',
    pickup: 'תאריך איסוף',
    return: 'תאריך החזרה',
    guests: 'נוסעים',
    guestOptions: ['נוסע אחד', '2 נוסעים', '3 נוסעים', '4 נוסעים', '5 נוסעים'],
    search: 'בדיקת תאריכים ומחירים',
    view: 'לצפייה ברכבים →',
    wa: '💬 שאלו אותנו בוואטסאפ',
    waText: "Hi Karen! I just read your article and I'm interested in renting a campervan.",
    book: 'בקשת הזמנה ללא תשלום',
    faq: 'שאלות נפוצות',
    floatBadge: 'איסוף משדה התעופה פוקואוקה',
    floatTitle: 'יפן בקרוואן',
    floatBody: 'הכל כלול החל מ-¥22,000 ליום',
    floatBtn: 'למחירים →',
  },
};

function resolveImageUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `https://vantripjapan.jp${src.startsWith('/') ? '' : '/'}${src}`;
}

// 本文中の <!--FAQ_SCHEMA:[...]--> を取り出す（壊れていれば空）
function parseFaq(body) {
  if (!body) return [];
  const faqMatch = body.match(/<!--FAQ_SCHEMA:(.*?)-->/s);
  if (!faqMatch) return [];
  try {
    const data = JSON.parse(faqMatch[1]);
    return Array.isArray(data) ? data.filter((q) => q && q.name && q.acceptedAnswer && q.acceptedAnswer.text) : [];
  } catch (e) {
    return [];
  }
}

function extractFaqSchema(body) {
  const faqData = parseFaq(body);
  if (!faqData.length) return '';
  return `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": ${JSON.stringify(faqData)}
  }
  </script>`;
}

// FAQPage の中身はページ上に見えていなければならない（Googleの構造化データ要件）。
// FAQ_SCHEMA はHTMLコメントなので、本文に質問が出ていない記事ではここで表示する。
// 本文にすでにFAQ欄がある記事（質問の過半数が本文に見える）では二重にしない。
function renderFaqSection(body, heading) {
  const faq = parseFaq(body);
  if (!faq.length) return '';
  const plain = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const shown = faq.filter((q) => plain.includes(String(q.name).slice(0, 40))).length;
  if (shown * 2 > faq.length) return '';
  const items = faq.map((q) => `
      <h3>${escHtml(q.name)}</h3>
      <p>${escHtml(q.acceptedAnswer.text)}</p>`).join('');
  return `
    <section class="article-faq">
      <h2>${escHtml(heading)}</h2>${items}
    </section>`;
}

function renderArticlePage(article) {
  const dateFormatted = formatDate(article.published_at);
  const readTime = estimateReadTime(article.body);
  const canonicalUrl = `https://vantripjapan.jp/posts/${article.slug}/`;
  const lang = detectLang(article);
  const imageUrl = resolveImageUrl(article.cover_image);
  const faqSchema = extractFaqSchema(article.body);
  const t = CTA_I18N[lang] || CTA_I18N.en;
  const isZh = lang === 'zh-Hant';
  const routeLang = lang === 'zh-Hant' ? 'zh' : lang;
  const rentalPath = lang === 'en' ? '/rent/' : `/${routeLang}/rent/`;

  return `<!DOCTYPE html>
<html lang="${lang}"${lang === 'he' ? ' dir="rtl"' : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(article.title)} | VAN TRIP JAPAN</title>
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
  <link rel="stylesheet" href="/css/style.css?v=20260810a">
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-RC4937NTHC"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-RC4937NTHC');</script>
  <link rel="stylesheet" href="/css/article.css?v=20260810a">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escHtml(article.title).replace(/"/g, '\\"')}",
    "description": "${escHtml(article.excerpt).replace(/"/g, '\\"')}",
    "image": "${imageUrl}",
    "author": {"@type": "Organization", "name": "VanTripJapan"},
    "publisher": {"@type": "Organization", "name": "VanTripJapan", "logo": {"@type": "ImageObject", "url": "https://vantripjapan.jp/images/hero-vanlife.jpg"}},
    "datePublished": "${article.published_at || ''}",
    "dateModified": "${article.updated_at || article.published_at || ''}",
    "url": "${canonicalUrl}",
    "articleSection": "${escHtml(article.category || '').replace(/"/g, '\\"')}",
    "inLanguage": "${lang}"
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantripjapan.jp/" },
      { "@type": "ListItem", "position": 2, "name": "Journal", "item": "https://vantripjapan.jp/category/" },
      { "@type": "ListItem", "position": 3, "name": "${escHtml(article.title).replace(/"/g, '\\"')}", "item": "${canonicalUrl}" }
    ]
  }
  </script>${faqSchema}
  ${article.structured_data ? `\n  <script type="application/ld+json">\n  ${article.structured_data}\n  </script>` : ''}
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
    ${article.body || ''}${renderFaqSection(article.body || '', t.faq || CTA_I18N.en.faq)}
  </article>

  <!-- CTA (多言語・zhはLINEファースト) -->
  <div class="article-cta">
    <div class="article-cta-box">
      <h3>${t.ready}</h3>
      <p>${t.body}</p>
      <form class="article-rental-search search-widget" action="${rentalPath}" method="get">
        <strong class="article-rental-search-title">${t.searchTitle}</strong>
        <div class="article-rental-search-fields">
          <label>
            <span>${t.pickup}</span>
            <input type="date" name="from" required>
          </label>
          <label>
            <span>${t.return}</span>
            <input type="date" name="to" required>
          </label>
          <label>
            <span>${t.guests}</span>
            <select name="guests" required>
              ${t.guestOptions.map((label, index) => `<option value="${index + 1}"${index === 1 ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <button type="submit">${t.search} →</button>
        </div>
      </form>
      <div class="article-cta-actions">
      ${isZh
        ? `<a href="https://lin.ee/YYyRz2f" class="article-cta-btn article-cta-btn-secondary" data-track="article_line" target="_blank" rel="noopener">💚 ${t.line}</a>
      <a href="${rentalPath}" class="article-cta-btn article-cta-btn-secondary" data-track="book_article_view">${t.view}</a>`
        : `<a href="${rentalPath}" class="article-cta-btn article-cta-btn-secondary" data-track="book_article_view">${t.view}</a>
      <a href="https://wa.me/817093757129?text=${encodeURIComponent(t.waText)}" class="article-cta-btn article-cta-btn-secondary" data-track="article_whatsapp" target="_blank" rel="noopener">${t.wa}</a>`}
      </div>
      <div><a href="/book/" class="article-book-link" data-track="book_article_direct">📝 ${t.book}</a></div>
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
      <div class="footer-col">
        <h4>Related Services</h4>
        <a href="https://drive-japan-license.com/" target="_blank">JDLTC · License Translation</a>
        <a href="https://crystalinsence.com/" target="_blank">Crystal Incense · Incense</a>
        <a href="https://wagyuninja.tokyo/" target="_blank">WAGYU NINJA · Premium Exports</a>
        <a href="https://www.camjyo.com/" target="_blank">キャンプ女子株式会社</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 VanTripJapan. Operated by <a href="https://www.camjyo.com/" target="_blank" style="color:inherit;text-decoration:underline;">キャンプ女子株式会社</a>. All rights reserved.</span>
      <span>Fukuoka, Japan</span>
    </div>
  </footer>

  <!-- Floating Chat Button (zh=LINE / others=WhatsApp) -->
  ${isZh
    ? `<a href="https://lin.ee/YYyRz2f" class="floating-whatsapp" target="_blank" rel="noopener" aria-label="LINE" style="background:#06C755;">💚</a>`
    : `<a href="https://wa.me/817093757129?text=${encodeURIComponent(t.waText)}"
     class="floating-whatsapp" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
    💬
  </a>`}

  <!-- Floating Sticky CTA for Campervan Rental -->
  <div class="floating-cta" id="floatingCta">
    <button class="floating-cta-close" id="closeCta" aria-label="Close CTA">×</button>
    <div class="floating-cta-content">
      <span class="floating-cta-badge">${t.floatBadge}</span>
      <h4>${t.floatTitle}</h4>
      <p>${t.floatBody}</p>
    </div>
    <a href="${rentalPath}" class="floating-cta-btn" data-track="book_article_floating">${t.floatBtn}</a>
  </div>

  <script>
    // Floating CTA Visibility & Interaction
    const floatingCta = document.getElementById('floatingCta');
    const closeCta = document.getElementById('closeCta');
    
    // Hide CTA if user closed it in this session
    if (sessionStorage.getItem('hideCampervanCta') === 'true') {
      floatingCta.style.display = 'none';
    } else {
      window.addEventListener('scroll', () => {
        // Show after scrolling 600px
        if (window.scrollY > 600) {
          floatingCta.classList.add('visible');
        } else {
          floatingCta.classList.remove('visible');
        }
      });
    }
    
    closeCta.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      floatingCta.classList.remove('visible');
      // Store closed state for session to avoid annoying the user on other articles
      sessionStorage.setItem('hideCampervanCta', 'true');
      setTimeout(() => {
        floatingCta.style.display = 'none';
      }, 300); // Wait for transition
    });
  </script>

  <script src="/js/nav.js?v=20260719"></script>

  <script>
    // Keep date inputs valid without guessing the visitor's travel dates.
    (function(){
      var form = document.querySelector('.article-rental-search');
      if (form) {
        var from = form.querySelector('[name="from"]');
        var to = form.querySelector('[name="to"]');
        var today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        var minDate = today.toISOString().slice(0, 10);
        from.min = minDate;
        to.min = minDate;
        from.addEventListener('change', function(){
          to.min = from.value || minDate;
          if (to.value && to.value < to.min) to.value = '';
        });
        form.addEventListener('submit', function(){
          if (typeof gtag !== 'function') return;
          var data = new FormData(form);
          gtag('event', 'rental_search_submitted', {
            pickup_date: String(data.get('from') || ''),
            return_date: String(data.get('to') || ''),
            guests: Number(data.get('guests') || 0),
            page_path: location.pathname,
            page_section: 'article_cta'
          });
        });
      }

      // GA4 CTA clicks use the same intent definitions as the rental funnel.
      document.addEventListener('click', function(e){
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a || typeof gtag !== 'function') return;
        var href = a.getAttribute('href') || '';
        var trackId = a.getAttribute('data-track') || '';
        var params = {
          cta_id: trackId || a.getAttribute('aria-label') || 'article_link',
          cta_text: (a.textContent || '').trim().slice(0, 80),
          page_path: location.pathname,
          page_section: a.closest('.article-cta') ? 'article_cta' : (a.closest('.floating-cta') ? 'floating_cta' : 'other')
        };
        if (href.indexOf('wa.me/') !== -1 || href.indexOf('lin.ee/') !== -1) {
          params.channel = href.indexOf('lin.ee/') !== -1 ? 'line' : 'whatsapp';
          gtag('event', 'contact_channel_click', params);
        } else if (trackId.indexOf('book_') === 0) {
          gtag('event', 'booking_cta_click', params);
        }
      }, true);
    })();
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

  // 統合した記事は統合先へ（functions/lib/consolidated.js）
  if (isConsolidated(slug)) {
    return Response.redirect(new URL(`/posts/${CONSOLIDATED[slug]}/`, context.request.url).toString(), 301);
  }

  try {
    // First check for redirect articles
    const redirectArticle = await env.DB.prepare(
      `SELECT slug FROM articles WHERE site = 'vantrip' AND slug = ? AND status = 'redirect'`
    ).bind(slug).first();

    if (redirectArticle) {
      // Let Cloudflare _redirects handle it, or fallback
      return context.next();
    }

    // Check for noindex articles — serve them but with noindex
    const noindexArticle = await env.DB.prepare(
      `SELECT * FROM articles WHERE site = 'vantrip' AND slug = ? AND status = 'noindex'`
    ).bind(slug).first();

    if (noindexArticle) {
      const html = renderArticlePage(noindexArticle).replace(
        '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
        '<meta name="robots" content="noindex, follow">'
      );
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'X-Robots-Tag': 'noindex, follow',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const article = await env.DB.prepare(
      `SELECT * FROM articles WHERE site = 'vantrip' AND slug = ? AND status = 'published'
         AND published_at <= datetime('now')`
    ).bind(slug).first();

    if (!article) {
      // Fall back to static file if exists
      return context.next();
    }

    // 薄い量産記事の重複は published のままでも noindex,follow で配信（インデックス希釈を止める）
    if (isThinRentalDuplicate(slug)) {
      const html = renderArticlePage(article).replace(
        '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
        '<meta name="robots" content="noindex, follow">'
      );
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'X-Robots-Tag': 'noindex, follow',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      });
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
