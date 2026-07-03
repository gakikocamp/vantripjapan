/**
 * VanTripJapan — Dynamic Sitemap Generator
 * GET /sitemap.xml — builds sitemap from D1 database
 */

const BASE_URL = 'https://vantripjapan.jp';

// hreflang: true のページは scripts/build-i18n-pages.js が /fr/ /de/ /zh/ /he/ に静的版を生成している
const STATIC_PAGES = [
  { loc: '/',                  changefreq: 'weekly',  priority: '1.0', hreflang: true  },
  { loc: '/rent/',             changefreq: 'monthly', priority: '0.9', hreflang: true  },
  { loc: '/category/',         changefreq: 'monthly', priority: '0.7', hreflang: false },
  { loc: '/faq/',              changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/contact/',          changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/rent/bongo/',       changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/rent/loft/',        changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/rent/probox/',      changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/road-trip-planner/', changefreq: 'weekly', priority: '0.7', hreflang: true  },
];

// 静的言語ディレクトリ（hreflangコード → URLプレフィックス）
const LANG_DIRS = { fr: '/fr', de: '/de', 'zh-Hant': '/zh', he: '/he' };

function hreflangLinks(baseLoc) {
  const alts = [
    ['x-default', `${BASE_URL}${baseLoc}`],
    ['en', `${BASE_URL}${baseLoc}`],
    ...Object.entries(LANG_DIRS).map(([code, dir]) => [code, `${BASE_URL}${dir}${baseLoc}`]),
  ];
  return alts.map(([lang, href]) =>
    `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`
  ).join('\n');
}

function urlEntry({ loc, lastmod, changefreq, priority, hreflangBase }) {
  const lines = [
    '  <url>',
    `    <loc>${BASE_URL}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    hreflangBase ? hreflangLinks(hreflangBase) : null,
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
         AND published_at <= datetime('now')
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
      hreflangBase: p.hreflang ? p.loc : null,
    })
  );

  // 静的言語ページ（/fr/ /de/ /zh/ /he/）— EN版と同じ hreflang クラスタを持つ
  const langEntries = STATIC_PAGES.filter(p => p.hreflang).flatMap(p =>
    Object.values(LANG_DIRS).map(dir =>
      urlEntry({
        loc: `${dir}${p.loc}`,
        lastmod: today,
        changefreq: p.changefreq,
        priority: p.loc === '/' ? '0.8' : '0.5',
        hreflangBase: p.loc,
      })
    )
  );

  const articleEntries = articles.map(a => {
    const lastmod = (a.updated_at || a.published_at || today).slice(0, 10);
    return urlEntry({
      loc: `/posts/${a.slug}/`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.8',
    });
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...staticEntries,
    ...langEntries,
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
