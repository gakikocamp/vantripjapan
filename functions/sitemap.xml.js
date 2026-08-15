/**
 * VanTripJapan — Dynamic Sitemap Generator
 * GET /sitemap.xml — builds sitemap from D1 database
 */

import { OVERNIGHT_URLS, OVERNIGHT_LASTMOD } from './lib/overnight-urls.js';

const BASE_URL = 'https://vantripjapan.jp';

// 薄い量産記事(pSEO)の重複判定（functions/posts/[[slug]].js と同一ロジック）
function isThinRentalDuplicate(slug) {
  const m = /^(campervan|camping-car|motorhome|rv)-rental-(fukuoka-airport|hakata|fukuoka|itoshima|kyushu)-for-(couples|families|solo-travelers|surfers)$/.exec(slug || '');
  if (!m) return false;
  const syn = m[1], loc = m[2];
  const isCanonical = syn === 'campervan' && (loc === 'fukuoka' || loc === 'itoshima' || loc === 'kyushu');
  return !isCanonical;
}

// hreflang: true のページは scripts/build-i18n-pages.js が /fr/ /de/ /zh/ /he/ に静的版を生成している
const STATIC_PAGES = [
  { loc: '/',                  changefreq: 'weekly',  priority: '1.0', hreflang: true  },
  { loc: '/rent/',             changefreq: 'monthly', priority: '0.9', hreflang: true  },
  { loc: '/category/',         changefreq: 'monthly', priority: '0.7', hreflang: false },
  { loc: '/faq/',              changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/contact/',          changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/support/',          changefreq: 'monthly', priority: '0.7', hreflang: true  },
  { loc: '/rent/bongo/',       changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/rent/loft/',        changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/rent/probox/',      changefreq: 'monthly', priority: '0.6', hreflang: true  },
  { loc: '/road-trip-planner/', changefreq: 'weekly', priority: '0.7', hreflang: true  },
];

// 静的言語ディレクトリ（hreflangコード → URLプレフィックス）
const LANG_DIRS = { fr: '/fr', de: '/de', 'zh-Hant': '/zh', he: '/he' };

// Overnight DB (scripts/build-overnight-pages.js 生成) は he なしの4言語クラスタ
const OVN_LANG_DIRS = { fr: '/fr', de: '/de', 'zh-Hant': '/zh' };

function ovnHreflangLinks(baseLoc) {
  const alts = [
    ['x-default', `${BASE_URL}${baseLoc}`],
    ['en', `${BASE_URL}${baseLoc}`],
    ...Object.entries(OVN_LANG_DIRS).map(([code, dir]) => [code, `${BASE_URL}${dir}${baseLoc}`]),
  ];
  return alts.map(([lang, href]) =>
    `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`
  ).join('\n');
}

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

  // 薄い量産記事の重複(pSEO同義語/地名重複)はサイトマップから除外（noindex方針と一致）
  articles = articles.filter(a => !isThinRentalDuplicate(a.slug));

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

  // 車中泊DB（overnight DB）— 4言語クラスタ、lastmod はDB更新日
  const ovnEntries = OVERNIGHT_URLS.flatMap(loc => {
    const isIndex = loc === '/overnight-parking/michi-no-eki/';
    return ['', ...Object.values(OVN_LANG_DIRS)].map(dir => [
      '  <url>',
      `    <loc>${BASE_URL}${dir}${loc}</loc>`,
      `    <lastmod>${OVERNIGHT_LASTMOD}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${isIndex ? (dir ? '0.7' : '0.8') : (dir ? '0.5' : '0.6')}</priority>`,
      ovnHreflangLinks(loc),
      '  </url>',
    ].join('\n'));
  });

  // 公開オープンデータ本体（CC BY 4.0）。AI・研究者がDBそのものを取得する入口なので
  // sitemap にも載せて発見可能にする。言語クラスタは無いので hreflang は付けない
  ovnEntries.push([
    '  <url>',
    `    <loc>${BASE_URL}/overnight-parking/michi-no-eki/data.json</loc>`,
    `    <lastmod>${OVERNIGHT_LASTMOD}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>0.6</priority>',
    '  </url>',
  ].join('\n'));

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
    ...ovnEntries,
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
