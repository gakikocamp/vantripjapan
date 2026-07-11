#!/usr/bin/env node
/**
 * 🌍 Static i18n Page Builder — VanTripJapan
 *
 * Bakes the client-side i18n translations (site/js/i18n.js) into static
 * /fr/ and /de/ copies of the core pages so Google.fr / Google.de can
 * actually index French / German content (the runtime ?lang= switch is
 * invisible to search engines).
 *
 * What it does:
 *   1. Ensures EN source pages carry canonical + hreflang links and that
 *      the FR/DE language buttons link to the static pages (idempotent).
 *   2. Renders each page with Playwright (JavaScript DISABLED, so the DOM
 *      stays pristine), applies the fr/de dictionaries the same way
 *      switchLang() does, rewrites internal links / head metadata, and
 *      pins the language via window.VTJ_FORCE_LANG.
 *   3. Writes the result to site/fr/<page>/index.html and site/de/....
 *
 * Re-run whenever the EN pages or i18n.js change:
 *   node scripts/build-i18n-pages.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");

const SITE = path.join(__dirname, "..", "site");
const BASE = "https://vantripjapan.jp";
const LANGS = ["fr", "de", "zh", "he"];
const LANG_ATTR = { fr: "fr", de: "de", zh: "zh-Hant", he: "he" };
const HREFLANG = { fr: "fr", de: "de", zh: "zh-Hant", he: "he" };
const OG_LOCALE = { fr: "fr_FR", de: "de_DE", zh: "zh_TW", he: "he_IL" };

// Pages to bake. path is relative to site/, always with trailing slash ('' = root).
// Only pages with solid data-i18n coverage — /book/ and /contact/ are not
// tagged yet and would produce English duplicates under /fr/ URLs.
const PAGES = [
    "",
    "rent/",
    "faq/",
    "rent/bongo/",
    "rent/loft/",
    "rent/probox/",
    "road-trip-planner/",
    "contact/",
];

// SEO title / meta description per language and page.
// data-i18n only covers visible text, so head metadata is provided here.
const META = {
    fr: {
        "": {
            title: "Location de van aménagé à Fukuoka | VAN TRIP JAPAN — Road trips à Kyushu",
            desc: "Louez un van aménagé à Fukuoka à partir de 22 000 ¥/jour. Explorez les onsen, volcans et routes côtières de Kyushu à votre rythme. Entreprise familiale, tout inclus.",
        },
        "rent/": {
            title: "Location de campervan à Fukuoka — dès 22 000 ¥/jour | VAN TRIP JAPAN",
            desc: "Louez un van aménagé à Fukuoka — assurance, literie et équipement inclus. Prise en charge à 10 min de l'aéroport, explorez Kyushu à votre rythme. Entreprise familiale depuis 2022.",
        },
        "faq/": {
            title: "FAQ — Location de campervan au Japon | VAN TRIP JAPAN",
            desc: "Questions fréquentes sur la location d'un van au Japon : permis de conduire (traduction officielle obligatoire pour les permis français), coûts, stationnement de nuit, assurance et road trips à Kyushu.",
        },
        "rent/bongo/": {
            title: "Bongo avec lit intégré — Location de campervan à Fukuoka | VAN TRIP JAPAN",
            desc: "Notre cruiser aménagé à la main. Assez spacieux pour se détendre à l'intérieur même les jours de pluie. Sa largeur réduite le rend facile à conduire sur les routes japonaises.",
        },
        "rent/loft/": {
            title: "Loft à tente de toit — Location de campervan à Fukuoka | VAN TRIP JAPAN",
            desc: "Notre explorateur ultra-compact à tente de toit. Jusqu'à 4 couchages avec accès direct depuis l'habitacle. Le plus facile à conduire, tarifs de ferry les plus bas.",
        },
        "rent/probox/": {
            title: "Probox compact — Location de van à Fukuoka | VAN TRIP JAPAN",
            desc: "Consommation remarquable, très compact et facile à garer, 5 places et un immense espace bagages. Parfait pour les couples.",
        },
        "road-trip-planner/": {
            title: "Planificateur de road trip à Kyushu | VAN TRIP JAPAN",
            desc: "Planifiez votre road trip en van à Kyushu en 30 secondes. Itinéraires de 3 à 10 jours : onsen, volcan Aso, plages et campings.",
        },
        "contact/": {
            title: "Contact — VAN TRIP JAPAN | Location de campervan à Fukuoka",
            desc: "Des questions sur la location d'un van à Fukuoka ? Écrivez-nous sur WhatsApp, LINE ou via le formulaire. Réponse sous 24 h.",
        },
    },
    de: {
        "": {
            title: "Campervan mieten in Fukuoka | VAN TRIP JAPAN — Kyushu-Roadtrips",
            desc: "Campervan in Fukuoka mieten ab 22.000 ¥/Tag. Erkunden Sie Kyushus heiße Quellen, Vulkane und Küstenstraßen in Ihrem eigenen Tempo. Familienbetrieb, alles inklusive.",
        },
        "rent/": {
            title: "Campervan mieten in Fukuoka — ab 22.000 ¥/Tag | VAN TRIP JAPAN",
            desc: "Campervan in Fukuoka mieten — Versicherung, Bettzeug und Ausrüstung inklusive. Abholung 10 Min. vom Flughafen, Kyushu im eigenen Tempo erkunden. Familienbetrieb seit 2022.",
        },
        "faq/": {
            title: "FAQ — Campervan mieten in Japan | VAN TRIP JAPAN",
            desc: "Häufige Fragen zur Campervan-Miete in Japan: Führerschein (deutsche Führerscheine brauchen eine offizielle Übersetzung, kein internationaler Führerschein), Kosten, Übernachtungsparken, Versicherung und Kyushu-Roadtrips.",
        },
        "rent/bongo/": {
            title: "Bett-Bongo Brawny — Campervan mieten in Fukuoka | VAN TRIP JAPAN",
            desc: "Unser handgebauter Cruiser. Genug Platz zum Entspannen im Innenraum, auch an Regentagen. Dank geringer Breite leicht auf Japans Straßen zu fahren.",
        },
        "rent/loft/": {
            title: "Dachzelt-Loft — Campervan mieten in Fukuoka | VAN TRIP JAPAN",
            desc: "Unser ultrakompakter Dachzelt-Explorer. Schlafplätze für bis zu 4 Gäste mit direktem Zugang vom Innenraum. Am leichtesten zu fahren, günstigste Fährtarife.",
        },
        "rent/probox/": {
            title: "Kompakter Probox — Van mieten in Fukuoka | VAN TRIP JAPAN",
            desc: "Hervorragender Verbrauch, extrem kompakt und leicht zu parken, 5 Sitze und riesiger Stauraum. Perfekt für Paare.",
        },
        "road-trip-planner/": {
            title: "Kyushu-Roadtrip-Planer | VAN TRIP JAPAN",
            desc: "Planen Sie Ihren Kyushu-Campervan-Roadtrip in 30 Sekunden. Kuratierte Routen für 3–10 Tage: heiße Quellen, Vulkan Aso, Strände und Campingplätze.",
        },
        "contact/": {
            title: "Kontakt — VAN TRIP JAPAN | Campervan mieten in Fukuoka",
            desc: "Fragen zur Campervan-Miete in Fukuoka? Schreiben Sie uns auf WhatsApp, LINE oder über das Formular. Antwort innerhalb von 24 Stunden.",
        },
    },
    zh: {
        "": {
            title: "福岡露營車租借 | VAN TRIP JAPAN — 九州公路旅行",
            desc: "在福岡租露營車，每天22,000日圓起。以自己的步調探索九州的溫泉、火山與海岸公路。家族經營、全包式價格。",
        },
        "rent/": {
            title: "福岡露營車租借 — 每天22,000日圓起 | VAN TRIP JAPAN",
            desc: "福岡露營車租借 — 保險、寢具與裝備全包。機場10分鐘取車，以自己的步調探索九州。2022年起家族經營。",
        },
        "faq/": {
            title: "常見問題 — 日本露營車租借 | VAN TRIP JAPAN",
            desc: "日本露營車租借常見問題：駕照（台灣駕照需備日文譯本）、費用、過夜停車、保險與九州公路旅行。",
        },
        "rent/bongo/": {
            title: "Bed Bongo Brawny — 福岡露營車租借 | VAN TRIP JAPAN",
            desc: "我們手工打造的巡航車。雨天也能在車內舒適放鬆。車身窄，在日本道路上輕鬆駕駛。",
        },
        "rent/loft/": {
            title: "車頂帳Loft — 福岡露營車租借 | VAN TRIP JAPAN",
            desc: "超小型車頂帳探險車。最多可睡4人，車內直通車頂帳。最好開，渡輪費率最低。",
        },
        "rent/probox/": {
            title: "小型Probox — 福岡露營車租借 | VAN TRIP JAPAN",
            desc: "油耗表現出色，極致小巧好停車，5個座位與超大行李空間。情侶出遊首選。",
        },
        "road-trip-planner/": {
            title: "九州公路旅行規劃工具 | VAN TRIP JAPAN",
            desc: "30秒規劃您的九州露營車之旅。3〜10天精選路線：溫泉、阿蘇火山、海灘與露營地。",
        },
        "contact/": {
            title: "聯絡我們 — VAN TRIP JAPAN | 福岡露營車租借",
            desc: "關於福岡露營車租借的問題？透過WhatsApp、LINE或表單與我們聯繫。24小時內回覆。",
        },
    },
    he: {
        "": {
            title: "השכרת קרוואנים בפוקואוקה | VAN TRIP JAPAN — טיולי דרכים בקיושו",
            desc: "השכרת קרוואן בפוקואוקה החל מ-22,000 ין ליום. גלו את האונסנים, הרי הגעש וכבישי החוף של קיושו בקצב שלכם. עסק משפחתי, הכול כלול.",
        },
        "rent/": {
            title: "השכרת קרוואן בפוקואוקה — החל מ-22,000 ין ליום | VAN TRIP JAPAN",
            desc: "השכרת קרוואן בפוקואוקה — ביטוח, מצעים וציוד כלולים. איסוף 10 דקות משדה התעופה. עסק משפחתי מאז 2022.",
        },
        "faq/": {
            title: "שאלות נפוצות — השכרת קרוואן ביפן | VAN TRIP JAPAN",
            desc: "שאלות נפוצות על השכרת קרוואן ביפן: רישיון נהיגה (IDP ישראלי תקף!), עלויות, חניית לילה, ביטוח וטיולי קיושו.",
        },
        "rent/bongo/": {
            title: "בונגו עם מיטה — השכרת קרוואן בפוקואוקה | VAN TRIP JAPAN",
            desc: "הקרוזר בעבודת יד שלנו. מרווח מספיק להתרווח בפנים גם בימי גשם. צר וקל לנהיגה בכבישי יפן.",
        },
        "rent/loft/": {
            title: "לופט עם אוהל גג — השכרת קרוואן בפוקואוקה | VAN TRIP JAPAN",
            desc: "רכב חקר אולטרה-קומפקטי עם אוהל גג. עד 4 אורחים עם גישה ישירה מהרכב לאוהל. הכי קל לנהיגה, תעריפי המעבורת הזולים ביותר.",
        },
        "rent/probox/": {
            title: "פרובוקס קומפקטי — השכרת ואן בפוקואוקה | VAN TRIP JAPAN",
            desc: "חסכוני מאוד בדלק, קומפקטי וקל לחניה, 5 מושבים ותא מטען ענק. מושלם לזוגות.",
        },
        "road-trip-planner/": {
            title: "מתכנן טיול הדרכים בקיושו | VAN TRIP JAPAN",
            desc: "תכננו את טיול הקרוואן שלכם בקיושו ב-30 שניות. מסלולים ל-3–10 ימים: אונסנים, הר אסו, חופים ואתרי קמפינג.",
        },
        "contact/": {
            title: "צרו קשר — VAN TRIP JAPAN | השכרת קרוואנים בפוקואוקה",
            desc: "שאלות על השכרת קרוואן בפוקואוקה? כתבו לנו בוואטסאפ, ב-LINE או בטופס. מענה תוך 24 שעות.",
        },
    },
};

// JSON-LD専用の対訳（UI辞書に存在しないschema文字列。EN原文 → fr/de）
// 辞書由来のペアと合わせて、焼き込み時に ld+json 内の文字列を完全一致で置換する。
const LD_EXTRA = {
    "Home": { fr: "Accueil", de: "Startseite" },
    "Campervan & Camper Rental Fukuoka": {
        fr: "Location de campervan et van aménagé à Fukuoka",
        de: "Campervan- & Wohnmobil-Vermietung in Fukuoka",
    },
    "Rent a premium campervan or motorhome in Fukuoka, Japan. Perfect for road trips around Kyushu's hot springs, volcanoes, and coastal roads.": {
        fr: "Louez un campervan ou un camping-car premium à Fukuoka, au Japon. Idéal pour des road trips vers les onsen, volcans et routes côtières de Kyushu.",
        de: "Mieten Sie einen Premium-Campervan oder ein Wohnmobil in Fukuoka, Japan. Perfekt für Roadtrips zu Kyushus heißen Quellen, Vulkanen und Küstenstraßen.",
    },
    "Family-run camper and campervan rental in Fukuoka. Explore Kyushu by van — road trip guides, onsen maps, and local tips from real travellers.": {
        fr: "Location familiale de vans aménagés à Fukuoka. Explorez Kyushu en van — guides de road trip, cartes des onsen et conseils locaux de vrais voyageurs.",
        de: "Familiengeführte Campervan-Vermietung in Fukuoka. Erkunden Sie Kyushu im Van — Roadtrip-Guides, Onsen-Karten und lokale Tipps von echten Reisenden.",
    },
    "What driver's license is required to rent a campervan in Japan?": {
        fr: "Quel permis de conduire faut-il pour louer un campervan au Japon ?",
        de: "Welchen Führerschein braucht man, um in Japan einen Campervan zu mieten?",
    },
    "You need a valid driver's license from your home country and either an International Driving Permit (IDP) issued under the 1949 Geneva Convention, or an official Japanese translation of your license (required for drivers from Germany, Switzerland, France, Belgium, Monaco, and Taiwan).": {
        fr: "Il vous faut le permis de conduire valide de votre pays et soit un permis de conduire international (AIDP) délivré selon la Convention de Genève de 1949, soit une traduction japonaise officielle de votre permis (obligatoire pour les conducteurs de France, d'Allemagne, de Suisse, de Belgique, de Monaco et de Taïwan).",
        de: "Sie brauchen einen gültigen Führerschein Ihres Heimatlandes und entweder einen internationalen Führerschein (IDP) nach der Genfer Konvention von 1949 oder eine offizielle japanische Übersetzung Ihres Führerscheins (Pflicht für Fahrer aus Deutschland, der Schweiz, Frankreich, Belgien, Monaco und Taiwan).",
    },
    "Where is the pickup and drop-off location?": {
        fr: "Où se trouvent la prise en charge et la restitution ?",
        de: "Wo sind Abholung und Rückgabe?",
    },
    "Our main shop is located in Fukuoka. We offer pickup and return directly at Fukuoka Airport or Hakata Station for your convenience.": {
        fr: "Notre agence principale se trouve à Fukuoka. Nous proposons la prise en charge et la restitution directement à l'aéroport de Fukuoka ou à la gare de Hakata.",
        de: "Unser Hauptstandort liegt in Fukuoka. Abholung und Rückgabe sind direkt am Flughafen Fukuoka oder am Bahnhof Hakata möglich.",
    },
    "Are the campervans equipped with English navigation?": {
        fr: "Les vans sont-ils équipés d'un GPS en anglais ?",
        de: "Sind die Campervans mit englischer Navigation ausgestattet?",
    },
    "Yes, all our campervans are equipped with English-capable GPS navigation systems and mobile Wi-Fi routers or Bluetooth connectivity.": {
        fr: "Oui, tous nos vans disposent d'un GPS multilingue ainsi que d'un routeur Wi-Fi mobile ou d'une connexion Bluetooth.",
        de: "Ja, alle unsere Campervans haben ein englischfähiges GPS-Navigationssystem sowie mobile WLAN-Router oder Bluetooth.",
    },
    "What is included in the rental price?": {
        fr: "Qu'est-ce qui est inclus dans le prix de la location ?",
        de: "Was ist im Mietpreis enthalten?",
    },
    "The price includes campervan rental, insurance (standard CDW), camping gear (sleeping bags, stove, kitchen set, chairs, table), and free pickup service at Hakata Station/Fukuoka Airport.": {
        fr: "Le prix comprend la location du van, l'assurance (CDW standard), l'équipement de camping (sacs de couchage, réchaud, kit cuisine, chaises, table) et la prise en charge gratuite à la gare de Hakata ou à l'aéroport de Fukuoka.",
        de: "Der Preis umfasst die Van-Miete, Versicherung (Standard-CDW), Campingausrüstung (Schlafsäcke, Kocher, Küchenset, Stühle, Tisch) und den kostenlosen Abholservice am Bahnhof Hakata/Flughafen Fukuoka.",
    },
    "Can I rent a campervan in Fukuoka as a foreigner?": {
        fr: "Un étranger peut-il louer un campervan à Fukuoka ?",
        de: "Kann ich als Ausländer in Fukuoka einen Campervan mieten?",
    },
    "Yes! VAN TRIP JAPAN offers all-inclusive campervan rentals in Fukuoka for international travelers. You need a valid International Driving Permit (IDP) from a Geneva Convention country, or an official Japanese translation of your license from JAF for certain countries (Germany, France, Switzerland, Belgium, Taiwan, etc.).": {
        fr: "Oui ! VAN TRIP JAPAN propose des locations tout compris à Fukuoka pour les voyageurs internationaux. Il vous faut un permis international (AIDP) d'un pays de la Convention de Genève, ou une traduction japonaise officielle de votre permis via la JAF pour certains pays (France, Allemagne, Suisse, Belgique, Taïwan, etc.).",
        de: "Ja! VAN TRIP JAPAN bietet All-inclusive-Campervan-Vermietung in Fukuoka für internationale Reisende. Sie brauchen einen gültigen internationalen Führerschein (IDP) aus einem Land der Genfer Konvention oder für bestimmte Länder (Deutschland, Frankreich, Schweiz, Belgien, Taiwan usw.) eine offizielle japanische Übersetzung Ihres Führerscheins von der JAF.",
    },
    "How much does it cost to rent a campervan in Kyushu?": {
        fr: "Combien coûte la location d'un campervan à Kyushu ?",
        de: "Was kostet es, einen Campervan in Kyushu zu mieten?",
    },
    "VAN TRIP JAPAN offers all-inclusive pricing starting from ¥22,000/day. This includes insurance, bedding, cooking equipment, a portable Wi-Fi router, and an ETC card for highway tolls. No hidden fees.": {
        fr: "VAN TRIP JAPAN propose des tarifs tout compris à partir de 22 000 ¥/jour, incluant l'assurance, la literie, l'équipement de cuisine, un routeur Wi-Fi portable et une carte ETC pour les péages. Aucun frais caché.",
        de: "VAN TRIP JAPAN bietet All-inclusive-Preise ab 22.000 ¥/Tag. Darin enthalten: Versicherung, Bettzeug, Kochausrüstung, mobiler WLAN-Router und eine ETC-Karte für Autobahngebühren. Keine versteckten Kosten.",
    },
    "Where can I park a campervan overnight in Japan?": {
        fr: "Où peut-on passer la nuit en campervan au Japon ?",
        de: "Wo darf man in Japan im Campervan übernachten?",
    },
    "Japan has over 1,200 Michi-no-Eki (roadside stations) with free 24-hour parking. Many tolerate quiet overnight stays. Kyushu also has numerous campgrounds, RV parks, and auto-camping sites. We provide a recommended spots guide with every rental.": {
        fr: "Le Japon compte plus de 1 200 Michi-no-Eki (aires routières) avec parking gratuit 24 h/24, dont beaucoup tolèrent les nuits calmes. Kyushu offre aussi de nombreux campings, aires pour camping-cars et sites d'auto-camping. Un guide des meilleurs spots est fourni avec chaque location.",
        de: "Japan hat über 1.200 Michi-no-Eki (Raststationen) mit kostenlosen 24-Stunden-Parkplätzen, viele tolerieren ruhige Übernachtungen. Kyushu bietet zudem zahlreiche Campingplätze, Stellplätze und Autocamping-Anlagen. Ein Guide mit empfohlenen Spots liegt jeder Miete bei.",
    },
    "Is Kyushu a good place for a campervan road trip?": {
        fr: "Kyushu est-elle une bonne destination pour un road trip en campervan ?",
        de: "Ist Kyushu ein gutes Ziel für einen Campervan-Roadtrip?",
    },
    "Kyushu is one of Japan's best regions for campervan travel. It has the most onsen (hot springs) in the country, dramatic volcanic landscapes, beautiful coastlines, and far less traffic than mainland Honshu. The island is compact enough to explore in 5-7 days.": {
        fr: "Kyushu est l'une des meilleures régions du Japon pour voyager en van : plus grande concentration d'onsen du pays, paysages volcaniques spectaculaires, superbes côtes et bien moins de circulation qu'à Honshu. L'île se découvre en 5 à 7 jours.",
        de: "Kyushu ist eine der besten Regionen Japans fürs Reisen im Campervan: die meisten Onsen des Landes, dramatische Vulkanlandschaften, schöne Küsten und deutlich weniger Verkehr als auf Honshu. Die Insel lässt sich in 5–7 Tagen erkunden.",
    },
    "Yes! VAN TRIP JAPAN provides full English support — from booking to return. Our vehicles include English GPS navigation, and our team is available 24/7 via WhatsApp in English. We also support French, German, Chinese, Hebrew, and over 100 languages. All signage guides and recommended spot lists are provided in English.": {
        fr: "Oui ! VAN TRIP JAPAN offre un accompagnement complet en anglais — de la réservation à la restitution — et prend aussi en charge le français, l'allemand, le chinois, l'hébreu et plus de 100 langues. GPS en anglais à bord, équipe disponible 24 h/24 et 7 j/7 sur WhatsApp, guides et listes de spots recommandés fournis.",
        de: "Ja! VAN TRIP JAPAN bietet volle englischsprachige Betreuung — von der Buchung bis zur Rückgabe — und unterstützt auch Deutsch, Französisch, Chinesisch, Hebräisch und über 100 Sprachen. Englisches GPS an Bord, Team rund um die Uhr per WhatsApp erreichbar, Guides und Spot-Listen inklusive.",
    },
};

const stripHtml = (s) => String(s).replace(/<[^>]*>/g, "").trim();

/** ld+json 置換マップ: EN平文 → 対象言語平文（UI辞書由来 + LD_EXTRA） */
function buildLdMap(translations, lang) {
    const map = {};
    for (const [key, enVal] of Object.entries(translations.en)) {
        const langVal = translations[lang] && translations[lang][key];
        if (!langVal) continue;
        const enPlain = stripHtml(enVal);
        const langPlain = stripHtml(langVal);
        if (enPlain && langPlain && enPlain !== langPlain) map[enPlain] = langPlain;
    }
    for (const [en, byLang] of Object.entries(LD_EXTRA)) {
        if (byLang[lang]) map[en.trim()] = byLang[lang];
    }
    return map;
}

function log(emoji, msg) {
    console.log(`  ${emoji}  ${msg}`);
}

/** Extract the translations object from i18n.js without running its DOM logic */
function loadTranslations() {
    const src = fs.readFileSync(path.join(SITE, "js", "i18n.js"), "utf8");
    const dictSrc = src.split("// ── Language Switch Logic ──")[0];
    return vm.runInNewContext(dictSrc + ";translations");
}

/** Idempotently add canonical + hreflang + static FR/DE language links to an EN source page */
function ensureEnPage(pagePath) {
    const file = path.join(SITE, pagePath, "index.html");
    let html = fs.readFileSync(file, "utf8");
    const before = html;
    const url = `${BASE}/${pagePath}`;

    if (!html.includes('rel="canonical"')) {
        html = html.replace("</title>", `</title>\n    <link rel="canonical" href="${url}">`);
    }

    if (!html.includes('hreflang="fr"')) {
        const cluster =
            `\n    <link rel="alternate" hreflang="en" href="${url}">` +
            `\n    <link rel="alternate" hreflang="fr" href="${BASE}/fr/${pagePath}">` +
            `\n    <link rel="alternate" hreflang="de" href="${BASE}/de/${pagePath}">` +
            `\n    <link rel="alternate" hreflang="x-default" href="${url}">`;
        html = html.replace(/<link rel="canonical"[^>]*>/, (m) => m + cluster);
    }
    // zh/he は後追いで追加（fr/de クラスタが既にあるページにも冪等に挿入）
    if (!html.includes('hreflang="zh-Hant"')) {
        const extra =
            `\n    <link rel="alternate" hreflang="zh-Hant" href="${BASE}/zh/${pagePath}">` +
            `\n    <link rel="alternate" hreflang="he" href="${BASE}/he/${pagePath}">`;
        html = html.replace(/<link rel="alternate" hreflang="de"[^>]*>/, (m) => m + extra);
    }

    html = html.replace(
        /<a href="\?lang=fr" class="lang-btn" onclick="switchLang\('fr'\); return false;">FR<\/a>/,
        `<a href="/fr/${pagePath}" class="lang-btn">FR</a>`
    );
    html = html.replace(
        /<a href="\?lang=de" class="lang-btn" onclick="switchLang\('de'\); return false;">DE<\/a>/,
        `<a href="/de/${pagePath}" class="lang-btn">DE</a>`
    );
    html = html.replace(
        /<a href="\?lang=zh" class="lang-btn" onclick="switchLang\('zh'\); return false;">繁中<\/a>/,
        `<a href="/zh/${pagePath}" class="lang-btn">繁中</a>`
    );
    html = html.replace(
        /<a href="\?lang=he" class="lang-btn" onclick="switchLang\('he'\); return false;">HE<\/a>/,
        `<a href="/he/${pagePath}" class="lang-btn">HE</a>`
    );

    if (html !== before) {
        fs.writeFileSync(file, html);
        log("🔗", `EN source updated: /${pagePath}index.html`);
    }
}

async function bakePage(browser, translations, lang, pagePath) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("file://" + path.join(SITE, pagePath, "index.html"));

    await page.evaluate(
        ({ dict, lang, langAttr, ogLocale, pagePath, meta, BASE, BAKED, ldMap }) => {
            document.documentElement.setAttribute("lang", langAttr);

            document.querySelectorAll("[data-i18n]").forEach((el) => {
                const key = el.getAttribute("data-i18n");
                if (dict[key]) el.innerHTML = dict[key];
            });
            document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
                const key = el.getAttribute("data-i18n-placeholder");
                if (dict[key]) el.setAttribute("placeholder", dict[key]);
            });
            document.querySelectorAll("[data-i18n-wa]").forEach((el) => {
                const key = el.getAttribute("data-i18n-wa");
                if (dict[key]) el.setAttribute("href", "https://wa.me/817093757129?text=" + encodeURIComponent(dict[key]));
            });

            const ilCard = document.getElementById("license-card-il");
            if (ilCard) ilCard.style.display = lang === "he" ? "" : "none";

            const sorted = BAKED.slice().sort((a, b) => b.length - a.length);
            document.querySelectorAll("a[href]").forEach((a) => {
                const href = a.getAttribute("href");
                for (const p of sorted) {
                    const base = "/" + p;
                    if (href === base || href.startsWith(base + "#") || href.startsWith(base + "?")) {
                        a.setAttribute("href", "/" + lang + href);
                        break;
                    }
                }
            });

            document.querySelectorAll(".lang-btn").forEach((btn) => {
                const t = btn.textContent.trim().toLowerCase();
                let target = null, code = null;
                if (t === "en") { target = "/" + pagePath; code = "en"; }
                else if (t === "fr") { target = "/fr/" + pagePath; code = "fr"; }
                else if (t === "de") { target = "/de/" + pagePath; code = "de"; }
                else if (t.includes("繁")) { target = "/zh/" + pagePath; code = "zh"; }
                else if (t === "he") { target = "/he/" + pagePath; code = "he"; }
                if (target) {
                    btn.setAttribute("href", target);
                    btn.removeAttribute("onclick");
                    btn.classList.toggle("active", code === lang);
                }
            });

            const setMeta = (sel, val) => {
                const el = document.querySelector(sel);
                if (el && val) el.setAttribute("content", val);
            };
            if (meta) {
                const titleEl = document.querySelector("title");
                if (titleEl) {
                    titleEl.textContent = meta.title;
                    titleEl.removeAttribute("data-i18n");
                }
                setMeta('meta[name="description"]', meta.desc);
                setMeta('meta[property="og:title"]', meta.title);
                setMeta('meta[property="og:description"]', meta.desc);
            }

            const altUrl = BASE + "/" + lang + "/" + pagePath;
            setMeta('meta[property="og:url"]', altUrl);
            const ogl = document.querySelector('meta[property="og:locale"]');
            if (ogl) ogl.setAttribute("content", ogLocale);

            let canonical = document.querySelector('link[rel="canonical"]');
            if (!canonical) {
                canonical = document.createElement("link");
                canonical.setAttribute("rel", "canonical");
                document.head.appendChild(canonical);
            }
            canonical.setAttribute("href", altUrl);

            document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
            const cluster = [
                ["x-default", BASE + "/" + pagePath],
                ["he", BASE + "/he/" + pagePath],
                ["zh-Hant", BASE + "/zh/" + pagePath],
                ["de", BASE + "/de/" + pagePath],
                ["fr", BASE + "/fr/" + pagePath],
                ["en", BASE + "/" + pagePath],
            ];
            for (const [hl, hu] of cluster) {
                const l = document.createElement("link");
                l.setAttribute("rel", "alternate");
                l.setAttribute("hreflang", hl);
                l.setAttribute("href", hu);
                canonical.parentNode.insertBefore(l, canonical.nextSibling);
            }

            const i18nTag = document.querySelector('script[src*="i18n.js"]');
            const pin = document.createElement("script");
            pin.textContent = "window.VTJ_FORCE_LANG='" + lang + "';";
            if (i18nTag) i18nTag.parentNode.insertBefore(pin, i18nTag);
            else document.head.insertBefore(pin, document.head.firstChild);

            const translateLd = (node) => {
                if (typeof node === "string") {
                    return ldMap[node.trim()] || node;
                }
                if (Array.isArray(node)) return node.map(translateLd);
                if (node && typeof node === "object") {
                    const out = {};
                    for (const [k, v] of Object.entries(node)) out[k] = translateLd(v);
                    return out;
                }
                return node;
            };
            document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
                try {
                    let json = JSON.parse(s.textContent);
                    json = translateLd(json);
                    if (json["@type"] === "FAQPage" || json["@type"] === "WebSite") {
                        json.inLanguage = langAttr;
                    }
                    s.textContent = "\n" + JSON.stringify(json, null, 2) + "\n";
                } catch (e) { /* 壊れたJSON-LDはそのまま残す */ }
            });
        },
        {
            dict: translations[lang],
            lang,
            langAttr: LANG_ATTR[lang],
            ogLocale: OG_LOCALE[lang],
            pagePath,
            meta: META[lang][pagePath],
            BASE,
            BAKED: PAGES,
            ldMap: buildLdMap(translations, lang),
        }
    );

    let html = await page.content();
    await context.close();

    // 台湾(zh)向け: 常時表示のLINE問い合わせボタンを注入し、WhatsApp浮遊ボタンは隠す。
    // 台湾はLINEが主流でWhatsAppはほぼ使われないため、zhページのみ導線をLINE優先にする。
    if (lang === "zh") {
        const lineBtn =
            `<a href="https://lin.ee/YYyRz2f" target="_blank" rel="noopener" class="floating-line-zh" aria-label="LINE">` +
            `<span class="fl-icon" aria-hidden="true">💬</span><span>加LINE詢問</span></a>`;
        // 既存の浮遊WhatsAppを非表示化（あるページのみ）
        html = html.replace(/class="floating-whatsapp"/g, 'class="floating-whatsapp" style="display:none"');
        // スティッキーバーの主要WhatsAppボタンをLINEに差し替え（レンタルページの常時表示CTA）
        html = html.replace(
            /<a href="https:\/\/wa\.me\/[^"]*"([^>]*?)data-track="wa_sticky">[\s\S]*?<\/a>/,
            `<a href="https://lin.ee/YYyRz2f"$1data-track="line_sticky" style="background:#06C755;border-color:#06C755">💬 LINE</a>`
        );
        // </body> 直前に注入
        html = html.replace(/<\/body>/i, `    ${lineBtn}\n</body>`);
    }

    // Sanity assertions — refuse to write a page that isn't actually localized
    if (!html.includes(`lang="${LANG_ATTR[lang]}"`)) throw new Error(`lang attr missing: ${lang}/${pagePath}`);
    if ((html.match(/hreflang=/g) || []).length !== 6) throw new Error(`hreflang cluster wrong: ${lang}/${pagePath}`);
    if (!html.includes(`VTJ_FORCE_LANG='${lang}'`)) throw new Error(`FORCE_LANG pin missing: ${lang}/${pagePath}`);
    const marker = translations[lang]["nav.rental"];
    if (marker && !html.includes(marker)) throw new Error(`translated nav missing: ${lang}/${pagePath}`);

    const outDir = path.join(SITE, lang, pagePath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
    log("✅", `baked /${lang}/${pagePath}index.html`);
}

(async () => {
    log("🌍", "Static i18n build starting…");
    const translations = loadTranslations();

    for (const p of PAGES) ensureEnPage(p);

    const browser = await chromium.launch();
    try {
        for (const lang of LANGS) {
            for (const p of PAGES) {
                await bakePage(browser, translations, lang, p);
            }
        }
    } finally {
        await browser.close();
    }
    log("🎉", `Done: ${LANGS.length * PAGES.length} pages baked.`);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
