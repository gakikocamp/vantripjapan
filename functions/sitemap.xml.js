/**
 * VanTripJapan — Dynamic Sitemap Generator
 * GET /sitemap.xml — builds sitemap from D1 database
 */

const BASE_URL = 'https://vantripjapan.jp';

const STATIC_PAGES = [
  { loc: '/',          changefreq: 'weekly',  priority: '1.0', hreflang: false },
  { loc: '/rent/',     changefreq: 'monthly', priority: '0.9', hreflang: true  },
  { loc: '/category/', changefreq: 'monthly', priority: '0.7', hreflang: false },
  { loc: '/contact/',  changefreq: 'monthly', priority: '0.6', hreflang: false },
  { loc: '/privacy/',  changefreq: 'yearly',  priority: '0.4', hreflang: false },
];

const HREFLANG_LANGS = ['en', 'fr', 'de', 'zh-Hant'];
const HREFLANG_PARAMS = { en: '', fr: '?lang=fr', de: '?lang=de', 'zh-Hant': '?lang=zh' };

function hreflangLinks(loc) {
  return HREFLANG_LANGS.map(lang =>
    `    <xhtml:link rel="alternate" hreflang="${lang}" href="${BASE_URL}${loc}${HREFLANG_PARAMS[lang]}"/>`
  ).join('\n');
}

function urlEntry({ loc, lastmod, changefreq, priority, withHreflang }) {
  const lines = [
    '  <url>',
    `    <loc>${BASE_URL}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    withHreflang ? hreflangLinks(loc) : null,
    '  </url>',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function onRequest(context) {
  const { env } = context;

  // Fetch all published articles from D1
  let articles = [];
  try {
    const result = await env.DB.prepare(
      `SELECT slug, updated_at, published_at FROM articles
       WHERE site = 'vantrip' AND status = 'published'
       ORDER BY published_at DESC`
    ).all();
    articles = result.results || [];
  } catch (err) {
    // On DB error, serve sitemap with static pages only
  }

  const today = new Date().toISOString().slice(0, 10);

  const staticEntries = STATIC_PAGES.map(p =>
    urlEntry({
      loc: p.loc,
      lastmod: today,
      changefreq: p.changefreq,
      priority: p.priority,
      withHreflang: p.hreflang,
    })
  );

  const articleEntries = articles.map(a => {
    const lastmod = (a.updated_at || a.published_at || today).slice(0, 10);
    return urlEntry({
      loc: `/posts/${a.slug}/`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.8',
      withHreflang: false,
    });
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...staticEntries,
    ...articleEntries,
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
