#!/usr/bin/env node
/**
 * 🏕️ Michi-no-Eki Overnight Database — Static Page Builder
 *
 * Reads content/overnight-stations.json and generates the full
 * /overnight-parking/michi-no-eki/ section in 4 languages:
 *
 *   site/overnight-parking/michi-no-eki/                      (EN index)
 *   site/overnight-parking/michi-no-eki/{pref}/               (EN prefecture hub)
 *   site/overnight-parking/michi-no-eki/{pref}/{station}/     (EN station page)
 *   site/{fr,de,zh}/overnight-parking/michi-no-eki/...        (baked translations)
 *   site/overnight-parking/michi-no-eki/data.json             (open data, CC BY 4.0)
 *   functions/lib/overnight-urls.js                           (sitemap source)
 *
 * Unlike build-i18n-pages.js (Playwright over EN sources), these pages are
 * rendered directly from data + dictionaries — no browser needed.
 *
 *   node scripts/build-overnight-pages.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "site");
const BASE = "https://vantripjapan.jp";
const ASSET_V = "20260720j"; // must match the sitewide ?v= (see CLAUDE.md cache rule)
const SECTION = "overnight-parking/michi-no-eki";

const LANGS = ["en", "fr", "de", "zh"];
const LANG_DIR = { en: "", fr: "/fr", de: "/de", zh: "/zh" };
const LANG_ATTR = { en: "en", fr: "fr", de: "de", zh: "zh-Hant" };
const HREFLANG = { en: "en", fr: "fr", de: "de", zh: "zh-Hant" };
const OG_LOCALE = { en: "en_US", fr: "fr_FR", de: "de_DE", zh: "zh_TW" };

const DATA = JSON.parse(
    fs.readFileSync(path.join(ROOT, "content", "overnight-stations.json"), "utf8")
);
const YEAR = DATA.meta.updated.slice(0, 4);

/** Reuse nav/footer strings from the runtime i18n dictionary (same trick as build-i18n-pages.js) */
function loadSiteDict() {
    const src = fs.readFileSync(path.join(SITE, "js", "i18n.js"), "utf8");
    const dictSrc = src.split("// ── Language Switch Logic ──")[0];
    return vm.runInNewContext(dictSrc + ";translations");
}
const SITE_DICT = loadSiteDict();
const nav = (lang, key) =>
    (SITE_DICT[lang] && SITE_DICT[lang][key]) || SITE_DICT.en[key] || "";

/* ────────────────────────────────────────────────────────────────────────────
 * Page-specific dictionary (en / fr / de / zh-Hant)
 * ──────────────────────────────────────────────────────────────────────────── */
const T = {
    en: {
        db_name: "Michi-no-Eki Overnight Database",
        db_tag: "OVERNIGHT DB",
        index_title: `Michi-no-Eki Overnight Parking Rules ${YEAR} — Station-by-Station Database (Kyushu) | VAN TRIP JAPAN`,
        index_desc: `Which Michi-no-Eki roadside stations allow overnight campervan parking in ${YEAR}? Station-by-station rules for Kyushu — explicit bans, RV parks and etiquette, verified with sources and dates.`,
        index_h1: "Michi-no-Eki Overnight Parking Rules — Station by Station",
        index_sub: `Japan's roadside stations are a lifeline for campervan travelers — but the rules differ at every station and they change. This database tracks the overnight policy of Michi-no-Eki across Kyushu, station by station — with sources and verification dates. Updated regularly.`,
        national_h: "The official national rule (read this first)",
        national_p: "Michi-no-Eki are government-designated rest stops with free 24-hour parking. The Ministry of Land, Infrastructure, Transport and Tourism (MLIT) position: <strong>resting and napping in your vehicle is accepted — using the parking lot as accommodation is not</strong>. In practice, a quiet one-night rest in your campervan is tolerated at most stations, while camping behavior (chairs, tables, awnings, BBQ, long stays) is not. Individual stations can and do post their own explicit bans — that is exactly what this database tracks.",
        legend_h: "How to read the statuses",
        st_prohibited: "Overnight stay explicitly prohibited",
        st_prohibited_rv: "Free lot: overnight prohibited — use the RV park",
        st_no_ban: "Quiet overnight rest generally tolerated — no explicit ban found",
        st_rv: "Official RV park on site",
        rv_banner: "Official RV park on site — overnight welcome (paid, reservation recommended)",
        st_prohibited_short: "Explicit ban",
        st_no_ban_short: "Rest tolerated",
        st_rv_short: "RV park",
        src_onsite: "Confirmed on site by the VAN TRIP JAPAN team",
        legend_prohibited: "The station has posted or published an explicit no-overnight rule. Please respect it — use a nearby campground or RV park instead.",
        legend_no_ban: "No explicit prohibition found as of the verification date — under Japan's national rule, a quiet one-night rest in your vehicle is generally tolerated here. Not a guarantee: no camping behavior, and always check signs on site.",
        legend_rv: "The station has an official paid RV park (Japan RV Association or equivalent) — the one case where overnight stay is explicitly welcome.",
        stats_line: (p, n, r, total) =>
            `Currently tracking <strong>${total} stations</strong> in Kyushu: <span class="c-red">${p === 1 ? "1 free lot with an explicit overnight ban" : `${p} free lots with explicit overnight bans`}</span> and ${n} where a quiet rest is tolerated (no explicit ban found) — plus <span class="c-green">${r === 1 ? "1 official RV park" : `${r} official RV parks`}</span> where paid overnight stay is always welcome.`,
        method_h: "How we verify",
        method_p: "Each entry links its sources — official station websites, the Japan RV Association register, and reports from the Japanese vanlife community — and carries the date we last checked it. Our rental fleet drives these routes weekly, and guest reports flow back into the database. Rules change; when we learn of a change, the entry and its date are updated.",
        pref_h_prefix: "Stations by prefecture",
        pref_title: (pref) => `Michi-no-Eki Overnight Rules in ${pref} ${YEAR} — Station List | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Overnight campervan parking rules for every tracked Michi-no-Eki in ${pref}, Japan — explicit bans, RV parks and verified dates.`,
        pref_h1: (pref) => `Michi-no-Eki Overnight Rules — ${pref}`,
        station_title: (name) => `${name} — Overnight Parking Rules ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Can you sleep overnight at ${name}? Current status: ${statusLabel}. Rules, sources, verification date and nearby legal alternatives for campervan travelers.`,
        station_h1: (name) => `Can you sleep overnight at ${name}?`,
        verified_label: "Last verified",
        updated_label: "Database updated",
        what_h: "What this means for you",
        what_prohibited: "This station explicitly prohibits overnight stays. Please don't sleep here — every ignored sign leads to new bans for everyone. Use an official RV park or campground in the area instead, where you are genuinely welcome — or ask us on WhatsApp for nearby spots.",
        what_no_ban: "Good news: a quiet overnight rest is generally tolerated here — we found no explicit prohibition as of the verification date, so Japan's national default applies. But you are a guest in a parking lot — not a campsite. Follow the etiquette below, and if staff or signs on site say otherwise, that always wins.",
        what_prohibited_rv: "This station prohibits overnight stays in its free parking lot — but it also has an official RV park, so you can still sleep here legally by booking a paid spot. In a way this is the clearest setup in Japan: free lot = no, official RV park = yes. Book ahead in high season.",
        what_rv: "This station has an official RV park: a reserved, paid space where overnight stay is explicitly welcome, usually with power hookups. On the free lot, we found no explicit ban as of the verification date, so the national rule applies — a quiet rest is generally tolerated, camping behavior is not. For a guaranteed, welcomed stay, book the RV park.",
        etiquette_h: "Overnight etiquette (non-negotiable)",
        etiquette: [
            "One night only — this is a rest stop, not a campsite",
            "Engine off, no idling (many prefectures ban idling by ordinance)",
            "Nothing outside the van: no chairs, tables, awnings or clotheslines",
            "No BBQ, no open flames",
            "Park at the far end, away from the shop entrance",
            "Quiet after 21:00 — doors, voices, music",
            "Take all trash with you",
            "Buy something from the shop or restaurant — it keeps stations camper-friendly",
        ],
        details_h: "Station details",
        d_pref: "Prefecture",
        d_city: "City / Town",
        d_official: "Official website",
        d_map: "Map",
        d_map_open: "Open in Google Maps",
        d_rvpark: "RV park",
        sources_h: "Sources",
        src_type: { official: "Official", blog: "Community report", wiki: "Community wiki", sign: "On-site sign", assoc: "RV association" },
        faq_h: "Frequently asked questions",
        faq_q1: (name) => `Is overnight parking allowed at ${name}?`,
        faq_a1_prohibited: (name) => `No. ${name} explicitly prohibits overnight stays (sources are listed on this page). Use a nearby RV park or campground instead — sleeping here risks trouble and hurts the reputation of all campervan travelers.`,
        faq_a1_no_ban: (name, date) => `We found no explicit prohibition at ${name} as of our last check (${date}). Japan's national rule for roadside stations applies: quiet in-vehicle rest is tolerated, camping behavior is not. Always follow signs on site.`,
        faq_a1_rv: (name) => `Yes — ${name} has an official paid RV park where overnight stay is explicitly welcome (reservation recommended). Outside the RV park spaces, the standard Michi-no-Eki rules apply.`,
        faq_a1_prohibited_rv: (name) => `Not in the free parking lot — ${name} explicitly prohibits overnight stays there (sources are listed on this page). But yes via its official RV park: book a paid spot and you are explicitly welcome to stay the night.`,
        faq_q2: "What are the rules for sleeping at a Michi-no-Eki?",
        faq_a2: "One quiet night maximum, engine off, nothing outside the vehicle, no flames, park away from the entrance, keep quiet after 21:00, take your trash, and support the shop. Individual stations may post stricter rules — signs on site always override this database.",
        faq_q3: "Where can I legally stay overnight nearby?",
        faq_a3: "Official RV parks (typically ¥1,000–4,500/night, bookable), auto-campgrounds (¥1,000–5,000), and some onsen facilities with overnight parking plans. Every VAN TRIP JAPAN rental includes a curated overnight spot map for Kyushu with legal, welcoming places to sleep.",
        cta_h: "Planning a Kyushu campervan trip?",
        cta_p: "We're a family-run campervan rental in Fukuoka, 10 minutes from the airport. Insurance, bedding, gear and a curated overnight-spots map — all included. And if your license is from France, Germany, Switzerland, Belgium, Taiwan or Monaco, you'll need an official translation to drive in Japan — our partner JDLTC handles it online before you land.",
        cta_rent: "See our campervans →",
        cta_jdltc: "Get your license translation",
        report_h: "Seen something different on site?",
        report_p: "Rules change faster than any database. If you saw a new sign or a changed policy at this station, tell us on WhatsApp — we'll verify and update the entry with credit to you.",
        report_btn: "💬 Report a change",
        rf_type: "What did you see?",
        rf_opt_ban: "A no-overnight sign / notice",
        rf_opt_rv: "RV park info (price, spaces…)",
        rf_opt_noban: "No ban signs on site",
        rf_opt_other: "Something else changed",
        rf_msg_ph: "What did you see, and when? (e.g. “New sign at the entrance, July 2026”)",
        rf_contact_ph: "Email (optional — for credit on this page)",
        rf_send: "Send report",
        rf_min: "Please describe what you saw (at least 5 characters).",
        rf_sent: "Thank you! We'll verify and update this page.",
        rf_err: "Could not send — please use WhatsApp below.",
        rf_or_wa: "or message us directly:",
        related_h: "Related guides",
        guide_michi: "Michi-no-Eki 101 — how Japan's roadside stations work",
        guide_parking: "Where can you park overnight legally in Japan?",
        guide_7days: "Kyushu in 7 days — the classic campervan itinerary",
        opendata_h: "Open data",
        opendata_p: `This database is published as open data (CC BY 4.0). Use it in your app, blog or map — just link back to this page as the source.`,
        opendata_btn: "Download data.json",
        disclaimer: "This page is informational, based on public sources and site checks on the dates shown. It is not legal advice and not a guarantee — station policies can change at any time, and on-site signs and staff instructions always take precedence.",
        back_to_pref: (pref) => `← All stations in ${pref}`,
        back_to_index: "← Full station database",
        home: "Home",
        stations_count: (n) => `${n} stations tracked`,
        no_ban_note: (date) => `as of ${date}`,
    },

    fr: {
        db_name: "Base de données : nuit en Michi-no-Eki",
        db_tag: "BASE NUITÉES",
        index_title: `Michi-no-Eki : règles de stationnement de nuit ${YEAR} — base station par station (Kyushu) | VAN TRIP JAPAN`,
        index_desc: `Dans quelles stations Michi-no-Eki peut-on passer la nuit en van en ${YEAR} ? Règles station par station pour Kyushu — interdictions explicites, RV parks et étiquette, avec sources et dates de vérification.`,
        index_h1: "Michi-no-Eki : règles de nuit, station par station",
        index_sub: "Les stations routières japonaises sont vitales pour les voyageurs en van — mais les règles diffèrent d'une station à l'autre et évoluent. Cette base suit les règles de nuitée des Michi-no-Eki de Kyushu, station par station — avec sources et dates de vérification. Mise à jour régulière.",
        national_h: "La règle nationale officielle (à lire d'abord)",
        national_p: "Les Michi-no-Eki sont des aires de repos publiques avec parking gratuit 24 h/24. Position du ministère des Transports (MLIT) : <strong>se reposer et dormir dans son véhicule est accepté — utiliser le parking comme hébergement ne l'est pas</strong>. En pratique, une nuit calme dans le van est tolérée dans la plupart des stations ; le comportement « camping » (chaises, tables, auvents, barbecue, longs séjours) ne l'est pas. Chaque station peut afficher sa propre interdiction explicite — c'est exactement ce que cette base recense.",
        legend_h: "Comment lire les statuts",
        st_prohibited: "Nuitée explicitement interdite",
        st_prohibited_rv: "Parking gratuit : nuitée interdite — utilisez le RV park",
        st_no_ban: "Nuit de repos discrète généralement tolérée — aucune interdiction explicite trouvée",
        st_rv: "RV park officiel sur place",
        rv_banner: "RV park officiel sur place — nuitée bienvenue (payant, réservation recommandée)",
        st_prohibited_short: "Interdiction explicite",
        st_no_ban_short: "Repos toléré",
        st_rv_short: "RV park",
        src_onsite: "Constaté sur place par l'équipe VAN TRIP JAPAN",
        legend_prohibited: "La station affiche ou publie une interdiction explicite de nuitée. Respectez-la — préférez un camping ou un RV park à proximité.",
        legend_no_ban: "Aucune interdiction explicite trouvée à la date de vérification — selon la règle nationale, une nuit de repos discrète dans le véhicule y est généralement tolérée. Ce n'est pas une garantie : aucun comportement de camping, et vérifiez toujours les panneaux sur place.",
        legend_rv: "La station dispose d'un RV park officiel payant (Japan RV Association ou équivalent) — le seul cas où la nuitée est explicitement bienvenue.",
        stats_line: (p, n, r, total) =>
            `<strong>${total} stations</strong> suivies à Kyushu : <span class="c-red">${p === 1 ? "1 parking gratuit avec interdiction explicite de nuitée" : `${p} parkings gratuits avec interdiction explicite de nuitée`}</span> et ${n} où le repos discret est toléré (aucune interdiction explicite trouvée) — plus <span class="c-green">${r === 1 ? "1 RV park officiel" : `${r} RV parks officiels`}</span> où la nuitée payante est toujours bienvenue.`,
        method_h: "Notre méthode de vérification",
        method_p: "Chaque fiche cite ses sources — sites officiels des stations, registre de la Japan RV Association, remontées de la communauté vanlife japonaise — et porte la date de notre dernière vérification. Notre flotte de location parcourt ces routes chaque semaine et les retours de nos clients alimentent la base. Les règles changent ; dès qu'un changement est connu, la fiche et sa date sont mises à jour.",
        pref_h_prefix: "Stations par préfecture",
        pref_title: (pref) => `Michi-no-Eki : règles de nuit — ${pref} ${YEAR} | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Règles de stationnement de nuit en van pour chaque Michi-no-Eki suivie de la préfecture de ${pref} (Japon) — interdictions explicites, RV parks, dates vérifiées.`,
        pref_h1: (pref) => `Michi-no-Eki : règles de nuit — ${pref}`,
        station_title: (name) => `${name} — peut-on y passer la nuit ? Règles ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Peut-on dormir en van à ${name} ? Statut actuel : ${statusLabel}. Règles, sources, date de vérification et alternatives légales à proximité.`,
        station_h1: (name) => `Peut-on passer la nuit à ${name} ?`,
        verified_label: "Dernière vérification",
        updated_label: "Base mise à jour le",
        what_h: "Ce que cela signifie pour vous",
        what_prohibited: "Cette station interdit explicitement la nuitée. N'y dormez pas — chaque panneau ignoré entraîne de nouvelles interdictions pour tous. Utilisez plutôt un RV park officiel ou un camping du secteur, où vous êtes réellement les bienvenus — ou demandez-nous des spots proches sur WhatsApp.",
        what_no_ban: "Bonne nouvelle : une nuit de repos discrète est généralement tolérée ici — aucune interdiction explicite trouvée à la date de vérification, la règle nationale s'applique donc. Mais vous êtes sur un parking — pas dans un camping. Suivez l'étiquette ci-dessous ; si le personnel ou un panneau dit autre chose, c'est lui qui a raison.",
        what_prohibited_rv: "Cette station interdit la nuitée sur son parking gratuit — mais elle dispose d'un RV park officiel : vous pouvez donc y dormir légalement en réservant un emplacement payant. C'est en réalité la configuration la plus claire du Japon : parking gratuit = non, RV park officiel = oui. Réservez en haute saison.",
        what_rv: "Cette station dispose d'un RV park officiel : un emplacement payant et réservable où la nuitée est explicitement bienvenue, souvent avec électricité. Sur le parking gratuit, aucune interdiction explicite trouvée à la date de vérification : la règle nationale s'applique — repos discret généralement toléré, comportement de camping interdit. Pour une nuit garantie et bienvenue, réservez le RV park.",
        etiquette_h: "Étiquette de nuit (non négociable)",
        etiquette: [
            "Une seule nuit — c'est une aire de repos, pas un camping",
            "Moteur coupé, pas de ralenti (interdit par arrêté dans de nombreuses préfectures)",
            "Rien à l'extérieur du van : ni chaises, ni tables, ni auvent, ni linge",
            "Pas de barbecue, pas de flamme",
            "Garez-vous au fond, loin de l'entrée de la boutique",
            "Silence après 21 h — portières, voix, musique",
            "Remportez tous vos déchets",
            "Achetez quelque chose à la boutique — c'est ce qui garde les stations accueillantes",
        ],
        details_h: "Informations sur la station",
        d_pref: "Préfecture",
        d_city: "Ville",
        d_official: "Site officiel",
        d_map: "Carte",
        d_map_open: "Ouvrir dans Google Maps",
        d_rvpark: "RV park",
        sources_h: "Sources",
        src_type: { official: "Officiel", blog: "Signalement communautaire", wiki: "Wiki communautaire", sign: "Panneau sur place", assoc: "Association RV" },
        faq_h: "Questions fréquentes",
        faq_q1: (name) => `Peut-on stationner la nuit à ${name} ?`,
        faq_a1_prohibited: (name) => `Non. ${name} interdit explicitement la nuitée (les sources sont listées sur cette page). Y dormir vous expose à des ennuis et nuit à tous les voyageurs en van — préférez un RV park ou un camping proche.`,
        faq_a1_no_ban: (name, date) => `Aucune interdiction explicite à ${name} lors de notre dernière vérification (${date}). La règle nationale s'applique : repos discret dans le véhicule toléré, comportement de camping interdit. Suivez toujours les panneaux sur place.`,
        faq_a1_rv: (name) => `Oui — ${name} dispose d'un RV park officiel payant où la nuitée est explicitement bienvenue (réservation recommandée). En dehors des emplacements du RV park, les règles habituelles des Michi-no-Eki s'appliquent.`,
        faq_a1_prohibited_rv: (name) => `Pas sur le parking gratuit — ${name} y interdit explicitement la nuitée (les sources sont listées sur cette page). Mais oui via son RV park officiel : réservez un emplacement payant et vous êtes explicitement le bienvenu pour la nuit.`,
        faq_q2: "Quelles sont les règles pour dormir dans une Michi-no-Eki ?",
        faq_a2: "Une seule nuit, moteur coupé, rien à l'extérieur du véhicule, pas de flamme, stationnement loin de l'entrée, silence après 21 h, déchets remportés, et un achat à la boutique. Certaines stations affichent des règles plus strictes — les panneaux sur place priment toujours sur cette base.",
        faq_q3: "Où passer la nuit légalement à proximité ?",
        faq_a3: "RV parks officiels (généralement 1 000–4 500 ¥/nuit, réservables), campings auto (1 000–5 000 ¥) et certains onsen avec forfait nuit sur parking. Chaque location VAN TRIP JAPAN inclut une carte des spots de nuit recommandés à Kyushu — des lieux légaux où l'on vous accueille volontiers.",
        cta_h: "Vous préparez un road trip en van à Kyushu ?",
        cta_p: "Nous sommes un loueur familial de vans aménagés à Fukuoka, à 10 minutes de l'aéroport. Assurance, literie, équipement et carte des spots de nuit — tout est inclus. Et si votre permis est français, suisse, belge ou monégasque, une traduction officielle est obligatoire pour conduire au Japon — notre partenaire JDLTC s'en charge en ligne avant votre arrivée.",
        cta_rent: "Voir nos vans →",
        cta_jdltc: "Obtenir la traduction du permis",
        report_h: "Vous avez vu autre chose sur place ?",
        report_p: "Les règles changent plus vite que n'importe quelle base de données. Nouveau panneau, politique modifiée ? Dites-le-nous sur WhatsApp — nous vérifions et mettons à jour la fiche, en vous créditant.",
        report_btn: "💬 Signaler un changement",
        rf_type: "Qu'avez-vous constaté ?",
        rf_opt_ban: "Un panneau ou avis d'interdiction",
        rf_opt_rv: "Infos RV park (prix, places…)",
        rf_opt_noban: "Aucun panneau d'interdiction sur place",
        rf_opt_other: "Autre changement",
        rf_msg_ph: "Qu'avez-vous vu, et quand ? (ex. : « nouveau panneau à l'entrée, juillet 2026 »)",
        rf_contact_ph: "E-mail (facultatif — pour être crédité sur cette page)",
        rf_send: "Envoyer le signalement",
        rf_min: "Décrivez ce que vous avez vu (5 caractères minimum).",
        rf_sent: "Merci ! Nous allons vérifier et mettre à jour cette page.",
        rf_err: "Échec de l'envoi — utilisez WhatsApp ci-dessous.",
        rf_or_wa: "ou écrivez-nous directement :",
        related_h: "Guides associés",
        guide_michi: "Michi-no-Eki 101 — comment fonctionnent les stations routières (en anglais)",
        guide_parking: "Où stationner la nuit légalement au Japon ? (en anglais)",
        guide_7days: "Kyushu en 7 jours — l'itinéraire classique en van (en anglais)",
        opendata_h: "Données ouvertes",
        opendata_p: "Cette base est publiée en open data (CC BY 4.0). Utilisez-la dans votre appli, blog ou carte — en citant cette page comme source.",
        opendata_btn: "Télécharger data.json",
        disclaimer: "Page informative, fondée sur des sources publiques et des vérifications aux dates indiquées. Ce n'est ni un conseil juridique ni une garantie — les politiques peuvent changer à tout moment ; les panneaux et le personnel sur place priment toujours.",
        back_to_pref: (pref) => `← Toutes les stations — ${pref}`,
        back_to_index: "← Base complète des stations",
        home: "Accueil",
        stations_count: (n) => `${n} stations suivies`,
        no_ban_note: (date) => `au ${date}`,
    },

    de: {
        db_name: "Michi-no-Eki-Übernachtungsdatenbank",
        db_tag: "ÜBERNACHTUNGS-DB",
        index_title: `Michi-no-Eki-Übernachtungsregeln ${YEAR} — Datenbank Station für Station (Kyushu) | VAN TRIP JAPAN`,
        index_desc: `An welchen Michi-no-Eki darf man ${YEAR} im Campervan übernachten? Regeln Station für Station für Kyushu — ausdrückliche Verbote, RV-Parks und Etikette, mit Quellen und Prüfdatum.`,
        index_h1: "Michi-no-Eki-Übernachtungsregeln — Station für Station",
        index_sub: "Japans Raststationen sind die Lebensader für Campervan-Reisende — doch die Regeln unterscheiden sich von Station zu Station und ändern sich. Diese Datenbank erfasst die Übernachtungsregeln von Michi-no-Eki in ganz Kyushu — Station für Station, mit Quellen und Prüfdatum. Regelmäßig aktualisiert.",
        national_h: "Die offizielle nationale Regel (zuerst lesen)",
        national_p: "Michi-no-Eki sind staatlich ausgewiesene Raststationen mit kostenlosem 24-Stunden-Parkplatz. Position des Verkehrsministeriums (MLIT): <strong>Ausruhen und Schlafen im Fahrzeug wird akzeptiert — den Parkplatz als Unterkunft zu nutzen nicht</strong>. In der Praxis wird eine ruhige Nacht im Campervan an den meisten Stationen toleriert; Camping-Verhalten (Stühle, Tische, Markisen, Grillen, lange Aufenthalte) nicht. Einzelne Stationen können eigene ausdrückliche Verbote aushängen — genau das erfasst diese Datenbank.",
        legend_h: "So lesen Sie die Statusangaben",
        st_prohibited: "Übernachtung ausdrücklich verboten",
        st_prohibited_rv: "Kostenloser Parkplatz: Übernachten verboten — nutzen Sie den RV-Park",
        st_no_ban: "Ruhige Übernachtung in der Regel toleriert — kein ausdrückliches Verbot gefunden",
        st_rv: "Offizieller RV-Park vor Ort",
        rv_banner: "Offizieller RV-Park vor Ort — Übernachten willkommen (kostenpflichtig, Reservierung empfohlen)",
        st_prohibited_short: "Ausdrückliches Verbot",
        st_no_ban_short: "Übernachten toleriert",
        st_rv_short: "RV-Park",
        src_onsite: "Vor Ort bestätigt durch das VAN-TRIP-JAPAN-Team",
        legend_prohibited: "Die Station hat ein ausdrückliches Übernachtungsverbot ausgehängt oder veröffentlicht. Bitte respektieren Sie es — nutzen Sie stattdessen einen Campingplatz oder RV-Park in der Nähe.",
        legend_no_ban: "Zum Prüfdatum kein ausdrückliches Verbot gefunden — nach der nationalen Regel wird eine ruhige Nacht im Fahrzeug hier in der Regel toleriert. Keine Garantie: kein Camping-Verhalten, und beachten Sie immer die Schilder vor Ort.",
        legend_rv: "Die Station hat einen offiziellen, kostenpflichtigen RV-Park (Japan RV Association o. ä.) — der eine Fall, in dem Übernachten ausdrücklich willkommen ist.",
        stats_line: (p, n, r, total) =>
            `Aktuell erfasst: <strong>${total} Stationen</strong> in Kyushu — <span class="c-red">${p === 1 ? "1 kostenloser Parkplatz mit ausdrücklichem Übernachtungsverbot" : `${p} kostenlose Parkplätze mit ausdrücklichem Übernachtungsverbot`}</span>; bei ${n} wird ruhiges Übernachten toleriert (kein ausdrückliches Verbot gefunden) — dazu <span class="c-green">${r === 1 ? "1 offizieller RV-Park" : `${r} offizielle RV-Parks`}</span>, wo bezahltes Übernachten immer willkommen ist.`,
        method_h: "So verifizieren wir",
        method_p: "Jeder Eintrag verlinkt seine Quellen — offizielle Stations-Websites, das Register der Japan RV Association und Meldungen aus der japanischen Vanlife-Community — und trägt das Datum unserer letzten Prüfung. Unsere Mietflotte fährt diese Routen wöchentlich, und Rückmeldungen unserer Gäste fließen in die Datenbank ein. Regeln ändern sich; sobald wir von einer Änderung erfahren, werden Eintrag und Datum aktualisiert.",
        pref_h_prefix: "Stationen nach Präfektur",
        pref_title: (pref) => `Michi-no-Eki-Übernachtungsregeln in ${pref} ${YEAR} — Stationsliste | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Übernachtungsregeln für jede erfasste Michi-no-Eki in der Präfektur ${pref}, Japan — ausdrückliche Verbote, RV-Parks und Prüfdaten.`,
        pref_h1: (pref) => `Michi-no-Eki-Übernachtungsregeln — ${pref}`,
        station_title: (name) => `${name} — Übernachtungsregeln ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Darf man am ${name} im Campervan übernachten? Aktueller Status: ${statusLabel}. Regeln, Quellen, Prüfdatum und legale Alternativen in der Nähe.`,
        station_h1: (name) => `Darf man am ${name} übernachten?`,
        verified_label: "Zuletzt geprüft",
        updated_label: "Datenbank aktualisiert",
        what_h: "Was das für Sie bedeutet",
        what_prohibited: "Diese Station verbietet Übernachtungen ausdrücklich. Bitte schlafen Sie nicht hier — jedes ignorierte Schild führt zu neuen Verboten für alle. Nutzen Sie stattdessen einen offiziellen RV-Park oder Campingplatz in der Umgebung, wo Sie wirklich willkommen sind — oder fragen Sie uns auf WhatsApp nach Plätzen in der Nähe.",
        what_no_ban: "Gute Nachricht: Eine ruhige Nacht im Fahrzeug wird hier in der Regel toleriert — zum Prüfdatum haben wir kein ausdrückliches Verbot gefunden, es gilt also Japans nationaler Standard. Aber Sie sind Gast auf einem Parkplatz, nicht auf einem Campingplatz. Halten Sie sich an die Etikette unten; sagen Schilder oder Personal vor Ort etwas anderes, gilt immer das.",
        what_prohibited_rv: "Diese Station verbietet Übernachtungen auf ihrem kostenlosen Parkplatz — sie hat aber auch einen offiziellen RV-Park: Sie können also legal hier übernachten, indem Sie einen kostenpflichtigen Stellplatz buchen. Eigentlich die klarste Regelung in Japan: kostenloser Parkplatz = nein, offizieller RV-Park = ja. In der Hochsaison vorab buchen.",
        what_rv: "Diese Station hat einen offiziellen RV-Park: ein reservierbarer, kostenpflichtiger Stellplatz, auf dem Übernachten ausdrücklich willkommen ist — meist mit Stromanschluss. Auf dem kostenlosen Parkplatz haben wir zum Prüfdatum kein ausdrückliches Verbot gefunden; es gilt die nationale Regel — ruhiges Ausruhen wird in der Regel toleriert, Camping-Verhalten nicht. Für eine garantierte, willkommene Nacht buchen Sie den RV-Park.",
        etiquette_h: "Übernachtungs-Etikette (nicht verhandelbar)",
        etiquette: [
            "Nur eine Nacht — es ist eine Raststation, kein Campingplatz",
            "Motor aus, kein Leerlauf (in vielen Präfekturen per Verordnung verboten)",
            "Nichts außerhalb des Vans: keine Stühle, Tische, Markisen, keine Wäscheleine",
            "Kein Grillen, kein offenes Feuer",
            "Am hinteren Ende parken, weit weg vom Ladeneingang",
            "Ruhe ab 21 Uhr — Türen, Stimmen, Musik",
            "Allen Müll wieder mitnehmen",
            "Etwas im Laden oder Restaurant kaufen — das hält die Stationen camperfreundlich",
        ],
        details_h: "Stationsdaten",
        d_pref: "Präfektur",
        d_city: "Stadt / Gemeinde",
        d_official: "Offizielle Website",
        d_map: "Karte",
        d_map_open: "In Google Maps öffnen",
        d_rvpark: "RV-Park",
        sources_h: "Quellen",
        src_type: { official: "Offiziell", blog: "Community-Meldung", wiki: "Community-Wiki", sign: "Schild vor Ort", assoc: "RV-Verband" },
        faq_h: "Häufige Fragen",
        faq_q1: (name) => `Ist Übernachten am ${name} erlaubt?`,
        faq_a1_prohibited: (name) => `Nein. ${name} verbietet Übernachtungen ausdrücklich (siehe Quellen auf dieser Seite). Nutzen Sie einen RV-Park oder Campingplatz in der Nähe — hier zu schlafen bedeutet Ärger und schadet allen Campervan-Reisenden.`,
        faq_a1_no_ban: (name, date) => `Bei unserer letzten Prüfung (${date}) haben wir am ${name} kein ausdrückliches Verbot gefunden. Es gilt Japans nationale Regel für Raststationen: ruhiges Ausruhen im Fahrzeug wird toleriert, Camping-Verhalten nicht. Beachten Sie immer die Schilder vor Ort.`,
        faq_a1_rv: (name) => `Ja — ${name} hat einen offiziellen, kostenpflichtigen RV-Park, auf dem Übernachten ausdrücklich willkommen ist (Reservierung empfohlen). Außerhalb der RV-Park-Stellplätze gelten die üblichen Michi-no-Eki-Regeln.`,
        faq_a1_prohibited_rv: (name) => `Nicht auf dem kostenlosen Parkplatz — dort verbietet ${name} Übernachtungen ausdrücklich (siehe Quellen auf dieser Seite). Aber ja über den offiziellen RV-Park: Buchen Sie einen kostenpflichtigen Stellplatz, dort sind Sie über Nacht ausdrücklich willkommen.`,
        faq_q2: "Welche Regeln gelten beim Schlafen an einem Michi-no-Eki?",
        faq_a2: "Maximal eine ruhige Nacht, Motor aus, nichts außerhalb des Fahrzeugs, kein Feuer, abseits des Eingangs parken, Ruhe ab 21 Uhr, Müll mitnehmen und den Laden unterstützen. Einzelne Stationen können strengere Regeln aushängen — Schilder vor Ort haben immer Vorrang vor dieser Datenbank.",
        faq_q3: "Wo kann ich in der Nähe legal übernachten?",
        faq_a3: "Offizielle RV-Parks (in der Regel 1.000–4.500 ¥/Nacht, reservierbar), Auto-Campingplätze (1.000–5.000 ¥) und manche Onsen mit Übernachtungs-Parkplatz. Jede Miete bei VAN TRIP JAPAN enthält eine kuratierte Übernachtungskarte für Kyushu — legale Plätze, an denen man Sie gern empfängt.",
        cta_h: "Sie planen einen Kyushu-Roadtrip im Campervan?",
        cta_p: "Wir sind eine familiengeführte Campervan-Vermietung in Fukuoka, 10 Minuten vom Flughafen. Versicherung, Bettzeug, Ausrüstung und Übernachtungskarte — alles inklusive. Und mit einem deutschen oder schweizerischen Führerschein brauchen Sie in Japan eine offizielle Übersetzung — unser Partner JDLTC erledigt das online vor Ihrer Ankunft.",
        cta_rent: "Unsere Campervans ansehen →",
        cta_jdltc: "Führerschein-Übersetzung bestellen",
        report_h: "Vor Ort etwas anderes gesehen?",
        report_p: "Regeln ändern sich schneller als jede Datenbank. Neues Schild, geänderte Regelung? Schreiben Sie uns auf WhatsApp — wir prüfen es, aktualisieren den Eintrag und nennen Sie als Quelle.",
        report_btn: "💬 Änderung melden",
        rf_type: "Was haben Sie gesehen?",
        rf_opt_ban: "Ein Verbotsschild / einen Aushang",
        rf_opt_rv: "RV-Park-Infos (Preis, Stellplätze …)",
        rf_opt_noban: "Keine Verbotsschilder vor Ort",
        rf_opt_other: "Etwas anderes hat sich geändert",
        rf_msg_ph: "Was haben Sie gesehen, und wann? (z. B. „Neues Schild am Eingang, Juli 2026“)",
        rf_contact_ph: "E-Mail (optional — für die Namensnennung auf dieser Seite)",
        rf_send: "Meldung senden",
        rf_min: "Bitte beschreiben Sie, was Sie gesehen haben (mindestens 5 Zeichen).",
        rf_sent: "Danke! Wir prüfen es und aktualisieren diese Seite.",
        rf_err: "Senden fehlgeschlagen — bitte nutzen Sie WhatsApp unten.",
        rf_or_wa: "oder schreiben Sie uns direkt:",
        related_h: "Passende Guides",
        guide_michi: "Michi-no-Eki 101 — so funktionieren Japans Raststationen (auf Englisch)",
        guide_parking: "Wo darf man in Japan legal über Nacht parken? (auf Englisch)",
        guide_7days: "Kyushu in 7 Tagen — die klassische Campervan-Route (auf Englisch)",
        opendata_h: "Open Data",
        opendata_p: "Diese Datenbank ist als Open Data (CC BY 4.0) veröffentlicht. Nutzen Sie sie in Ihrer App, Ihrem Blog oder Ihrer Karte — mit Link auf diese Seite als Quelle.",
        opendata_btn: "data.json herunterladen",
        disclaimer: "Diese Seite dient der Information und beruht auf öffentlichen Quellen und Prüfungen zum jeweils angegebenen Datum. Sie ist keine Rechtsberatung und keine Garantie — Regeln können sich jederzeit ändern; Schilder und Personal vor Ort haben immer Vorrang.",
        back_to_pref: (pref) => `← Alle Stationen in ${pref}`,
        back_to_index: "← Zur vollständigen Datenbank",
        home: "Startseite",
        stations_count: (n) => `${n} Stationen erfasst`,
        no_ban_note: (date) => `Stand ${date}`,
    },

    zh: {
        db_name: "道之驛過夜規則資料庫",
        db_tag: "過夜資料庫",
        index_title: `道之驛過夜規則 ${YEAR} — 九州各站完整資料庫 | VAN TRIP JAPAN`,
        index_desc: `${YEAR}年哪些道之驛可以露營車過夜？九州各站逐一整理 — 明文禁止、RV Park、過夜禮儀，附來源與查證日期。`,
        index_h1: "道之驛過夜規則 — 逐站整理",
        index_sub: "道之驛是露營車旅行者的生命線 — 但每一站的規則都不同，而且會變動。本資料庫逐站追蹤九州各道之驛的過夜政策，附來源與查證日期，定期更新。",
        national_h: "全國官方規則（請先讀這裡）",
        national_p: "道之驛是政府指定的休息站，提供24小時免費停車。日本國土交通省的立場：<strong>在車內休息、小睡是被接受的 — 把停車場當作住宿設施則不行</strong>。實務上，多數站點容許在露營車內安靜過一夜；但露營行為（桌椅、天幕、烤肉、長期停留）不被容許。個別站點可能公告自己的明文禁止規定 — 本資料庫追蹤的正是這些。",
        legend_h: "狀態說明",
        st_prohibited: "明文禁止過夜",
        st_prohibited_rv: "免費停車場禁止過夜 — 請利用RV Park",
        st_no_ban: "一般容許車內安靜休息過夜 — 未發現明文禁止",
        st_rv: "設有官方RV Park",
        rv_banner: "設有官方RV Park — 歡迎過夜（付費・建議預約）",
        st_prohibited_short: "明文禁止",
        st_no_ban_short: "可安靜休息",
        st_rv_short: "RV Park",
        src_onsite: "由VAN TRIP JAPAN團隊現地確認",
        legend_prohibited: "該站已公告或發布明文禁止過夜。請務必遵守 — 改用附近的露營場或RV Park。",
        legend_no_ban: "截至查證日期未發現明文禁止 — 依全國規則，在車內安靜休息一晚在此通常被容許。但這不是保證：不做露營行為，並一律以現場告示為準。",
        legend_rv: "該站設有官方付費RV Park（日本RV協會等認證）— 這是唯一明確歡迎過夜的情況。",
        stats_line: (p, n, r, total) =>
            `目前追蹤九州 <strong>${total} 座道之驛</strong>：<span class="c-red">${p} 座的免費停車場明文禁止過夜</span>、${n} 座容許安靜休息（未發現明文禁止）— 另有 <span class="c-green">${r} 座設有官方RV Park</span>，付費過夜隨時歡迎。`,
        method_h: "我們如何查證",
        method_p: "每筆資料都附上來源 — 各站官方網站、日本RV協會登錄名單、日本車中泊社群的回報 — 並標註最後查證日期。我們的租賃車隊每週行駛這些路線，客人的回報也會回饋到資料庫。規則會變；一旦得知變動，就會更新該筆資料與日期。",
        pref_h_prefix: "依縣份瀏覽",
        pref_title: (pref) => `${pref}道之驛過夜規則 ${YEAR} — 站點清單 | VAN TRIP JAPAN`,
        pref_desc: (pref) => `${pref}每座已收錄道之驛的露營車過夜規則 — 明文禁止、RV Park與查證日期。`,
        pref_h1: (pref) => `道之驛過夜規則 — ${pref}`,
        station_title: (name) => `${name} — 可以過夜嗎？${YEAR}年規則 | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `${name}可以車中泊過夜嗎？目前狀態：${statusLabel}。規則、來源、查證日期與附近合法替代地點。`,
        station_h1: (name) => `${name} 可以過夜嗎？`,
        verified_label: "最後查證",
        updated_label: "資料庫更新日",
        what_h: "這對你的意義",
        what_prohibited: "本站明文禁止過夜。請不要在此過夜 — 每一次無視告示，都會為所有人帶來新的禁令。請改用附近的官方RV Park或露營場，那裡真心歡迎你 — 也可以透過WhatsApp問我們附近的推薦地點。",
        what_no_ban: "好消息：在此一般容許在車內安靜休息過夜 — 截至查證日期我們未發現明文禁止，因此適用日本全國預設規則。但你是停車場的客人 — 不是露營場的。請遵守下方禮儀；若現場告示或工作人員另有指示，一律以現場為準。",
        what_prohibited_rv: "本站禁止在免費停車場過夜 — 但設有官方RV Park，只要預訂付費車位仍可合法過夜。這其實是日本最清楚的規則：免費停車場＝不行，官方RV Park＝可以。旺季請提前預約。",
        what_rv: "本站設有官方RV Park：付費、可預約、明確歡迎過夜的車位，通常附電源。至於免費停車場，截至查證日期我們未發現明文禁止，因此適用全國規則 — 安靜休息通常被容許，露營行為不行。想要有保障、受歡迎的過夜體驗，請預訂RV Park。",
        etiquette_h: "過夜禮儀（必須遵守）",
        etiquette: [
            "只住一晚 — 這是休息站，不是露營場",
            "熄火、禁止怠速（許多縣有條例明文禁止）",
            "車外不擺任何東西：桌椅、天幕、曬衣繩都不行",
            "禁止烤肉、禁止明火",
            "停在遠離商店入口的角落",
            "21:00後保持安靜 — 車門、談話、音樂",
            "垃圾全部帶走",
            "在商店或餐廳消費 — 這是讓道之驛持續歡迎露營車的關鍵",
        ],
        details_h: "站點資訊",
        d_pref: "縣份",
        d_city: "市町村",
        d_official: "官方網站",
        d_map: "地圖",
        d_map_open: "在Google地圖開啟",
        d_rvpark: "RV Park",
        sources_h: "資料來源",
        src_type: { official: "官方", blog: "社群回報", wiki: "社群Wiki", sign: "現場告示", assoc: "RV協會" },
        faq_h: "常見問題",
        faq_q1: (name) => `${name}可以過夜停車嗎？`,
        faq_a1_prohibited: (name) => `不可以。${name}明文禁止過夜（見本頁來源）。請改用附近的RV Park或露營場 — 在此過夜可能惹上麻煩，也會損害所有露營車旅行者的形象。`,
        faq_a1_no_ban: (name, date) => `截至最後查證（${date}），我們未發現${name}有明文禁止。適用日本全國規則：車內安靜休息被容許，露營行為不被容許。請一律以現場告示為準。`,
        faq_a1_rv: (name) => `可以 — ${name}設有官方付費RV Park，明確歡迎過夜（建議預約）。RV Park以外的一般停車場，仍適用道之驛的一般規則。`,
        faq_a1_prohibited_rv: (name) => `免費停車場不行 — ${name}明文禁止在此過夜（見本頁來源）。但可以利用官方RV Park：預訂付費車位即可安心過夜，明確受歡迎。`,
        faq_q2: "在道之驛過夜要遵守哪些規則？",
        faq_a2: "最多安靜住一晚、熄火、車外不擺東西、禁明火、停遠離入口、21:00後安靜、垃圾帶走、在商店消費支持站點。個別站點可能有更嚴格的公告 — 現場告示永遠優先於本資料庫。",
        faq_q3: "附近哪裡可以合法過夜？",
        faq_a3: "官方RV Park（一般每晚1,000–4,500日圓、可預約）、汽車露營場（1,000–5,000日圓）、部分附過夜停車方案的溫泉設施。VAN TRIP JAPAN每筆租賃都附九州精選過夜地圖 — 合法且歡迎你的地點。",
        cta_h: "正在計劃九州露營車之旅嗎？",
        cta_p: "我們是位於福岡、家族經營的露營車出租公司，距機場僅10分鐘。保險、寢具、裝備、過夜地圖 — 全部包含。持台灣駕照在日本開車需要JAF官方翻譯文件 — 我們的夥伴JDLTC可在你出發前線上辦妥。",
        cta_rent: "查看我們的露營車 →",
        cta_jdltc: "辦理駕照日文譯本",
        report_h: "現場看到不一樣的告示？",
        report_p: "規則的變化永遠比資料庫快。看到新告示或政策變動？用WhatsApp告訴我們 — 查證後即更新，並註明你的貢獻。",
        report_btn: "💬 回報變動",
        rf_type: "你看到了什麼？",
        rf_opt_ban: "禁止過夜的告示",
        rf_opt_rv: "RV Park資訊（價格、車位…）",
        rf_opt_noban: "現場沒有禁止告示",
        rf_opt_other: "其他變動",
        rf_msg_ph: "你看到了什麼？何時？（例：2026年7月，入口有新告示）",
        rf_contact_ph: "Email（選填 — 用於在本頁註明你的貢獻）",
        rf_send: "送出回報",
        rf_min: "請描述你看到的內容（至少5個字）。",
        rf_sent: "謝謝！我們會查證並更新本頁。",
        rf_err: "送出失敗 — 請改用下方WhatsApp。",
        rf_or_wa: "或直接聯絡我們：",
        related_h: "延伸閱讀",
        guide_michi: "道之驛入門 — 日本公路休息站的運作方式（英文）",
        guide_parking: "在日本哪裡可以合法過夜停車？（英文）",
        guide_7days: "九州7天 — 經典露營車路線（英文）",
        opendata_h: "開放資料",
        opendata_p: "本資料庫以開放資料（CC BY 4.0）發布。歡迎用於你的App、部落格或地圖 — 只需連結本頁作為來源。",
        opendata_btn: "下載 data.json",
        disclaimer: "本頁為資訊性內容，根據公開來源與標示日期的查證整理。不構成法律建議，也不是保證 — 各站政策隨時可能變動，一律以現場告示與工作人員指示為準。",
        back_to_pref: (pref) => `← ${pref}的所有站點`,
        back_to_index: "← 完整站點資料庫",
        home: "首頁",
        stations_count: (n) => `已收錄 ${n} 站`,
        no_ban_note: (date) => `截至 ${date}`,
    },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */
const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripTags = (s) => String(s).replace(/<[^>]+>/g, "");

function prefName(prefKey, lang) {
    const p = DATA.prefectures[prefKey];
    return p[lang] || p.en;
}

function stationName(st, lang) {
    if (lang === "zh") return st.name.zh || st.name.ja; // 漢字圏は日本語名で案内
    return st.name.en; // fr/de use the romaji name
}

function cityName(st, lang) {
    if (lang === "zh") return st.city.zh || st.city.ja;
    return st.city.en;
}

function sectionPath(lang, sub = "") {
    return `${LANG_DIR[lang]}/${SECTION}/${sub}`;
}

function pageUrl(lang, sub = "") {
    return `${BASE}${sectionPath(lang, sub)}`;
}

function hreflangBlock(sub) {
    const links = LANGS.map(
        (l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${pageUrl(l, sub)}">`
    );
    links.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl("en", sub)}">`);
    return links.join("\n    ");
}

function langSwitcher(lang, sub) {
    const labels = { en: "EN", fr: "FR", de: "DE", zh: "繁中" };
    return `<div class="lang-switcher">
        ${LANGS.map(
            (l) =>
                `<a href="${sectionPath(l, sub)}" class="lang-btn${l === lang ? " active" : ""}">${labels[l]}</a>`
        ).join("\n        ")}
    </div>`;
}

// 言語別コロン（fr=直前にnbsp、zh=全角）
const COLON = { en: ": ", fr: "&nbsp;: ", de: ": ", zh: "：" };

// status は無料の一般駐車場のポリシー。rv_park は直交（併設の有無）。
const STATUS_META = {
    prohibited: { cls: "prohibited" },
    no_explicit_ban: { cls: "noban" },
};

function statusLabel(st, lang, short = false) {
    const t = T[lang];
    if (st.status === "prohibited") {
        if (short) return t.st_prohibited_short;
        return st.rv_park ? t.st_prohibited_rv : t.st_prohibited;
    }
    return short ? t.st_no_ban_short : t.st_no_ban;
}

function badge(st, lang) {
    const m = STATUS_META[st.status];
    return `<span class="badge badge-${m.cls}"><span class="dot"></span>${esc(statusLabel(st, lang, true))}</span>`;
}

function rvChip(lang) {
    return `<span class="badge badge-rv"><span class="dot"></span>${esc(T[lang].st_rv_short)}</span>`;
}

/* ── Shared page chrome (apple-design: tinted status surfaces, size-specific
      tracking, whole-row tap targets, press feedback, reduced-motion) ── */
const SHARED_CSS = `
        :root {
            --st-red: #c93028; --st-red-text: #8e1f17; --st-red-tint: #fbedec;
            --st-teal: #12808a; --st-teal-text: #0e5a61; --st-teal-tint: #e7f4f5;
            --st-green: #2c9a44; --st-green-text: #1e5c28; --st-green-tint: #eaf6ec;
        }
        .ovn-hero { background: linear-gradient(160deg, #1a3a2a, #2d5a3d); color: #fff; padding: 128px 20px 72px; text-align: center; }
        .ovn-hero h1 { font-family: var(--font-serif); font-size: clamp(1.75rem, 4.5vw, 2.75rem); margin-bottom: 16px; letter-spacing: -0.02em; line-height: 1.08; }
        .ovn-hero p { color: rgba(255,255,255,0.82); font-size: 1.02rem; max-width: 680px; margin: 0 auto; line-height: 1.65; }
        .ovn-hero .crumbs { font-size: 0.78rem; letter-spacing: 0.02em; margin-bottom: 20px; color: rgba(255,255,255,0.65); }
        .ovn-hero .crumbs a { color: rgba(255,255,255,0.85); text-decoration: none; }
        .ovn-hero .crumbs a:hover { text-decoration: underline; }
        .ovn-wrap { max-width: 860px; margin: -30px auto 64px; padding: 0 20px; }
        .ovn-card { background: #fff; border-radius: 20px; padding: 28px 32px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .ovn-card h2 { font-family: var(--font-serif); font-size: 1.3rem; letter-spacing: -0.01em; margin-bottom: 14px; color: var(--color-text); }
        .ovn-card p, .ovn-card li { font-size: 0.95rem; color: var(--color-text-secondary); line-height: 1.7; }
        .ovn-card ul { padding-left: 1.2em; margin-top: 8px; }
        .ovn-card li { margin-bottom: 8px; }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 100px; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; }
        .badge-prohibited { background: var(--st-red-tint); color: var(--st-red-text); } .badge-prohibited .dot { background: var(--st-red); }
        .badge-noban { background: var(--st-teal-tint); color: var(--st-teal-text); } .badge-noban .dot { background: var(--st-teal); }
        .badge-rv { background: var(--st-green-tint); color: var(--st-green-text); } .badge-rv .dot { background: var(--st-green); }
        .c-red { color: var(--st-red-text); font-weight: 700; } .c-green { color: var(--st-green-text); font-weight: 700; }
        .status-banner { border-radius: 20px; padding: 26px 32px; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05); animation: ovn-rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .status-banner.prohibited { background: var(--st-red-tint); color: var(--st-red-text); }
        .status-banner.noban { background: var(--st-teal-tint); color: var(--st-teal-text); }
        .status-banner.rv { background: var(--st-green-tint); color: var(--st-green-text); }
        .status-banner .st-label { display: flex; align-items: center; gap: 12px; font-size: 1.35rem; font-weight: 800; font-family: var(--font-serif); letter-spacing: -0.01em; line-height: 1.2; }
        .status-banner .st-label .dot { width: 12px; height: 12px; }
        .status-banner.prohibited .dot { background: var(--st-red); } .status-banner.noban .dot { background: var(--st-teal); } .status-banner.rv .dot { background: var(--st-green); }
        .status-banner .st-verified { margin-top: 8px; font-size: 0.85rem; opacity: 0.8; font-variant-numeric: tabular-nums; }
        @keyframes ovn-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .station-list { display: block; }
        .station-list .station-row + .station-row { border-top: 1px solid var(--color-border-light); }
        a.station-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 12px; margin: 0 -12px; border-radius: 12px; text-decoration: none; transition: background-color 120ms ease-out, transform 100ms ease-out; }
        a.station-row:hover { background: rgba(0,0,0,0.035); }
        a.station-row:active { transform: scale(0.99); }
        a.station-row .st-main { min-width: 0; }
        a.station-row .st-name { display: block; font-weight: 650; color: var(--color-text); font-size: 0.97rem; line-height: 1.35; }
        a.station-row .st-city { display: block; font-size: 0.82rem; color: var(--color-text-secondary); margin-top: 2px; }
        a.station-row .st-side { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
        a.station-row .chev { color: rgba(0,0,0,0.25); font-size: 1.05rem; transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1); }
        a.station-row:hover .chev { transform: translateX(2px); color: rgba(0,0,0,0.4); }
        .pref-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .pref-chip { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid rgba(0,0,0,0.08);
            border-radius: 100px; padding: 8px 16px; font-size: 0.85rem; font-weight: 650; color: var(--color-text);
            text-decoration: none; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 150ms ease-out, border-color 150ms; }
        .pref-chip:hover { transform: translateY(-1px); border-color: rgba(45,90,61,0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .pref-chip:active { transform: scale(0.97); transition-duration: 100ms; }
        .pref-chip .chip-n { font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); font-variant-numeric: tabular-nums;
            background: var(--color-bg-secondary, #f4f4f2); border-radius: 100px; padding: 1px 8px; }
        .pref-block { scroll-margin-top: 90px; }
        .legend-item { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0; }
        .legend-item + .legend-item { border-top: 1px solid var(--color-border-light); }
        .legend-item .badge { margin-top: 2px; }
        .legend-item p { flex: 1; margin: 0; }
        .ovn-table { width: 100%; border-collapse: collapse; }
        .ovn-table th, .ovn-table td { text-align: left; padding: 12px 4px; border-bottom: 1px solid var(--color-border-light); font-size: 0.92rem; vertical-align: top; }
        .ovn-table tr:last-child th, .ovn-table tr:last-child td { border-bottom: none; }
        .ovn-table th { color: var(--color-text-secondary); font-weight: 500; white-space: nowrap; width: 38%; }
        .ovn-table td { color: var(--color-text); }
        .ovn-table a { color: var(--color-accent); }
        .src-item { font-size: 0.88rem; margin-bottom: 10px; line-height: 1.6; }
        .src-tag { display: inline-block; background: var(--color-bg-secondary, #f4f4f2); border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; margin-right: 8px; color: var(--color-text-secondary); }
        .ovn-cta { background: linear-gradient(160deg, #2d5a3d, #3a7d54); color: #fff; border-radius: 20px; padding: 40px 32px; text-align: center; margin-bottom: 20px; }
        .ovn-cta h3 { font-family: var(--font-serif); font-size: 1.4rem; letter-spacing: -0.01em; margin-bottom: 12px; }
        .ovn-cta p { opacity: 0.92; margin: 0 auto 24px; max-width: 620px; font-size: 0.95rem; line-height: 1.7; }
        .ovn-btn { display: inline-block; background: #fff; color: #2d5a3d; padding: 13px 28px; border-radius: 100px; font-weight: 700; font-size: 0.92rem; text-decoration: none; margin: 4px; transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 150ms ease-out; }
        .ovn-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        .ovn-btn:active { transform: scale(0.97); transition-duration: 100ms; }
        .ovn-btn.ghost { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.55); }
        .ovn-note { font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.6; }
        .ovn-back { display: inline-block; margin-bottom: 12px; font-size: 0.9rem; color: var(--color-accent); text-decoration: none; }
        .ovn-back:hover { text-decoration: underline; }
        .faq-item-s { margin-bottom: 16px; }
        .faq-item-s .q { font-weight: 650; color: var(--color-text); margin-bottom: 6px; font-size: 0.97rem; line-height: 1.4; }
        .pref-block h2 { display: flex; align-items: baseline; gap: 10px; }
        .pref-block h2 a:hover { color: var(--color-accent); }
        .pref-block h2 .cnt { font-size: 0.85rem; color: var(--color-text-secondary); font-weight: 400; font-family: var(--font-sans, sans-serif); font-variant-numeric: tabular-nums; }
        .rf-form { margin-top: 16px; display: grid; gap: 10px; }
        .rf-label { font-size: 0.85rem; font-weight: 650; color: var(--color-text); }
        .rf-form select, .rf-form textarea, .rf-form input[type="email"] {
            width: 100%; font: inherit; font-size: 0.92rem; color: var(--color-text);
            background: #fff; border: 1px solid rgba(0,0,0,0.15); border-radius: 12px;
            padding: 11px 14px; transition: border-color 120ms ease-out, box-shadow 120ms ease-out;
        }
        .rf-form textarea { resize: vertical; min-height: 76px; line-height: 1.6; }
        .rf-form select:focus, .rf-form textarea:focus, .rf-form input:focus {
            outline: none; border-color: #2d5a3d; box-shadow: 0 0 0 3px rgba(45,90,61,0.15);
        }
        .rf-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .rf-submit { font: inherit; font-size: 0.92rem; font-weight: 700; color: #fff;
            background: #2d5a3d; border: none; border-radius: 100px; padding: 12px 26px; cursor: pointer;
            transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 150ms ease-out, opacity 150ms; }
        .rf-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(45,90,61,0.3); }
        .rf-submit:active { transform: scale(0.97); transition-duration: 100ms; }
        .rf-submit:disabled { opacity: 0.5; cursor: default; transform: none; box-shadow: none; }
        .rf-status { font-size: 0.88rem; }
        .rf-status.ok { color: var(--st-green-text); font-weight: 650; }
        .rf-status.err { color: var(--st-red-text); }
        a:focus-visible, button:focus-visible { outline: 2px solid #2d5a3d; outline-offset: 2px; border-radius: 4px; }
        .ovn-cta a:focus-visible, .ovn-hero a:focus-visible { outline-color: #fff; }
        /* WCAG AA: 白カード上の本文グレーを4.5:1以上に (#5f5f66 = 6.3:1) */
        .ovn-card p, .ovn-card li, .ovn-note, .src-item, a.station-row .st-city, .pref-chip .chip-n { color: #5f5f66; }
        .footer-bottom span { color: #767680; }
        @media (max-width: 600px) {
            .ovn-card { padding: 22px 20px; border-radius: 16px; }
            .status-banner { padding: 22px 20px; }
            .ovn-cta { padding: 32px 22px; }
        }
        @media (prefers-reduced-motion: reduce) {
            .status-banner { animation: none; }
            a.station-row, .ovn-btn, .rf-submit, .pref-chip, a.station-row .chev { transition: none; }
            .ovn-btn:hover, .ovn-btn:active, .rf-submit:hover, .rf-submit:active, .pref-chip:hover, .pref-chip:active, a.station-row:active { transform: none; }
        }
`;

function shell({ lang, sub, title, desc, h1, heroSub, crumbsHtml, jsonld, body, ogImage }) {
    const t = T[lang];
    const url = pageUrl(lang, sub);
    const dirAttr = ""; // all 4 langs are LTR
    return `<!DOCTYPE html>
<html lang="${LANG_ATTR[lang]}"${dirAttr}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${BASE}/images/${ogImage || "hero-vanlife.jpg"}">
    <meta property="og:locale" content="${OG_LOCALE[lang]}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="${url}">
    ${hreflangBlock(sub)}
    <link rel="icon" type="image/png" href="/images/favicon.png">
    <link rel="stylesheet" href="/css/style.css?v=${ASSET_V}">

    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-RC4937NTHC"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-RC4937NTHC');</script>

${jsonld.map((o) => `    <script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n    </script>`).join("\n")}

    <style>${SHARED_CSS}    </style>
</head>
<body>

    <nav class="nav" id="navbar">
        <div class="nav-inner">
            <a href="${LANG_DIR[lang] || "/"}" class="nav-logo">
                <div class="logo-icon">V</div>
                <div><span>VAN TRIP JAPAN</span><span class="magazine-tag">${esc(t.db_tag)}</span></div>
            </a>
            <div class="nav-links" id="navLinks">
                <a href="${LANG_DIR[lang] || "/"}">${esc(nav(lang, "nav.home"))}</a>
                <a href="/category/">${esc(nav(lang, "nav.guides"))}</a>
                <a href="${LANG_DIR[lang]}/rent/">${esc(nav(lang, "nav.rental"))}</a>
                <a href="${LANG_DIR[lang]}/contact/">${esc(nav(lang, "nav.contact"))}</a>
                <a href="${LANG_DIR[lang]}/rent/" class="nav-cta">${esc(nav(lang, "nav.rent_btn"))}</a>
            </div>
            <button class="nav-hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
        </div>
    </nav>

    ${langSwitcher(lang, sub)}

    <div class="ovn-hero">
        ${crumbsHtml ? `<div class="crumbs">${crumbsHtml}</div>` : ""}
        <h1>${esc(h1)}</h1>
        ${heroSub ? `<p>${heroSub}</p>` : ""}
    </div>

    <div class="ovn-wrap">
${body}
        <p class="ovn-note">${esc(t.disclaimer)}</p>
    </div>

    <!-- Footer -->
    <footer class="footer">
        <div class="footer-inner">
            <div class="footer-brand">
                <div class="footer-logo">VAN TRIP JAPAN</div>
                <p>${esc(nav(lang, "footer.desc"))}</p>
            </div>
            <div class="footer-col">
                <h4>${esc(nav(lang, "footer.explore"))}</h4>
                <a href="${LANG_DIR[lang] || "/"}">${esc(nav(lang, "nav.home"))}</a>
                <a href="/category/">${esc(nav(lang, "nav.guides"))}</a>
                <a href="${LANG_DIR[lang]}/faq/">${esc(nav(lang, "footer.faq"))}</a>
                <a href="${sectionPath(lang, "")}">${esc(t.db_name)}</a>
            </div>
            <div class="footer-col">
                <h4>${esc(nav(lang, "footer.rental"))}</h4>
                <a href="${LANG_DIR[lang]}/rent/">${esc(nav(lang, "footer.overview"))}</a>
                <a href="${LANG_DIR[lang]}/rent/#vehicles">${esc(nav(lang, "footer.vehicles"))}</a>
                <a href="${LANG_DIR[lang]}/rent/#pricing">${esc(nav(lang, "footer.pricing"))}</a>
            </div>
            <div class="footer-col">
                <h4>${esc(nav(lang, "footer.about"))}</h4>
                <a href="${LANG_DIR[lang]}/contact/">${esc(nav(lang, "nav.contact"))}</a>
                <a href="/privacy/">${esc(nav(lang, "footer.privacy"))}</a>
            </div>
        </div>
        <div class="footer-bottom">
            <span>${nav(lang, "footer.rights") || "© 2026 VAN TRIP JAPAN. Operated by Camp Jyoshi Inc.. All rights reserved."}</span>
        </div>
    </footer>

    <script src="/js/nav.js?v=${ASSET_V}"></script>

    <!-- Floating WhatsApp -->
    <a href="https://wa.me/817093757129?text=Hi!%20I%20have%20a%20question%20about%20campervan%20rental." class="floating-whatsapp" target="_blank" aria-label="Chat on WhatsApp">💬</a>

</body>
</html>
`;
}

/* ── JSON-LD builders ── */
function breadcrumbLd(items) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map(([name, url], i) => ({
            "@type": "ListItem",
            position: i + 1,
            name,
            item: url,
        })),
    };
}

function faqLd(pairs) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: pairs.map(([q, a]) => ({
            "@type": "Question",
            name: stripTags(q),
            acceptedAnswer: { "@type": "Answer", text: stripTags(a) },
        })),
    };
}

function placeLd(st, lang, sub) {
    const ld = {
        "@context": "https://schema.org",
        "@type": "Place",
        name: stationName(st, lang) === st.name.ja ? st.name.ja : `${stationName(st, lang)} (${st.name.ja})`,
        url: pageUrl(lang, sub),
        address: {
            "@type": "PostalAddress",
            addressRegion: prefName(st.prefecture, "en"),
            addressLocality: st.city.en,
            addressCountry: "JP",
        },
    };
    if (st.lat && st.lng) ld.geo = { "@type": "GeoCoordinates", latitude: st.lat, longitude: st.lng };
    if (st.official_url) ld.sameAs = st.official_url;
    return ld;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Renderers
 * ──────────────────────────────────────────────────────────────────────────── */
function writePage(lang, sub, html) {
    const dir = path.join(SITE, ...sectionPath(lang, sub).split("/").filter(Boolean));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
}

const byPref = {};
for (const st of DATA.stations) (byPref[st.prefecture] ||= []).push(st);
const PREF_ORDER = Object.keys(DATA.prefectures).filter((p) => byPref[p]);
const sortKey = (s) => (s.status === "prohibited" ? 0 : s.rv_park ? 1 : 2);
for (const p of PREF_ORDER) byPref[p].sort((a, b) => sortKey(a) - sortKey(b) || a.id.localeCompare(b.id));

const counts = {
    prohibited: DATA.stations.filter((s) => s.status === "prohibited").length,
    no_ban: DATA.stations.filter((s) => s.status === "no_explicit_ban").length,
    rv: DATA.stations.filter((s) => s.rv_park).length,
    total: DATA.stations.length,
};

function stationRow(st, lang) {
    const sub = `${st.prefecture}/${st.id}/`;
    const shownName = stationName(st, lang);
    const subtitle = shownName === st.name.ja
        ? esc(cityName(st, lang))
        : `${esc(st.name.ja)} · ${esc(cityName(st, lang))}`;
    return `<a class="station-row" href="${sectionPath(lang, sub)}">
                <span class="st-main"><span class="st-name">${esc(shownName)}</span>
                <span class="st-city">${subtitle}</span></span>
                <span class="st-side">${st.rv_park ? rvChip(lang) : ""}${badge(st, lang)}<span class="chev">›</span></span>
            </a>`;
}

function renderIndex(lang) {
    const t = T[lang];
    const sub = "";
    const legend = `
        <div class="ovn-card">
            <h2>${esc(t.legend_h)}</h2>
            <p style="margin-bottom:8px;">${t.stats_line(counts.prohibited, counts.no_ban, counts.rv, counts.total)}</p>
            <div class="legend-item"><span class="badge badge-prohibited"><span class="dot"></span>${esc(t.st_prohibited_short)}</span><p>${esc(t.legend_prohibited)}</p></div>
            <div class="legend-item"><span class="badge badge-noban"><span class="dot"></span>${esc(t.st_no_ban_short)}</span><p>${esc(t.legend_no_ban)}</p></div>
            <div class="legend-item"><span class="badge badge-rv"><span class="dot"></span>${esc(t.st_rv_short)}</span><p>${esc(t.legend_rv)}</p></div>
        </div>`;

    const prefChips = `<nav class="pref-chips" aria-label="Prefectures">
            ${PREF_ORDER.map((p) => `<a class="pref-chip" href="#${p}">${esc(prefName(p, lang))}<span class="chip-n">${byPref[p].length}</span></a>`).join("\n            ")}
        </nav>`;

    const prefBlocks = PREF_ORDER.map((p) => {
        const rows = byPref[p].map((st) => stationRow(st, lang)).join("\n");
        return `<div class="ovn-card pref-block" id="${p}">
            <h2><a href="${sectionPath(lang, p + "/")}" style="color:inherit;text-decoration:none;">${esc(prefName(p, lang))}</a> <span class="cnt">${esc(T[lang].stations_count(byPref[p].length))}</span></h2>
            <div class="station-list">
${rows}
            </div>
        </div>`;
    }).join("\n");

    const faqPairs = [
        [t.faq_q2, t.faq_a2],
        [t.faq_q3, t.faq_a3],
    ];

    const body = `
        ${prefChips}
        <div class="ovn-card">
            <h2>${esc(t.national_h)}</h2>
            <p>${t.national_p}</p>
        </div>
${legend}
        <div class="ovn-card">
            <h2>${esc(t.method_h)}</h2>
            <p>${esc(t.method_p)}</p>
            <p style="margin-top:10px;font-size:0.85rem;">${esc(t.updated_label)}${COLON[lang]}<strong>${DATA.meta.updated}</strong></p>
        </div>
${prefBlocks}
        <div class="ovn-card">
            <h2>${esc(t.faq_h)}</h2>
            ${faqPairs.map(([q, a]) => `<div class="faq-item-s"><div class="q">${esc(q)}</div><p>${esc(a)}</p></div>`).join("\n            ")}
        </div>
        <div class="ovn-card">
            <h2>${esc(t.related_h)}</h2>
            <div class="station-list">
                <a class="station-row" href="/posts/michi-no-eki-guide/"><span class="st-main"><span class="st-name">${esc(t.guide_michi)}</span></span><span class="st-side"><span class="chev">›</span></span></a>
                <a class="station-row" href="/posts/campervan-parking-japan-overnight/"><span class="st-main"><span class="st-name">${esc(t.guide_parking)}</span></span><span class="st-side"><span class="chev">›</span></span></a>
                <a class="station-row" href="/posts/kyushu-road-trip-7-days/"><span class="st-main"><span class="st-name">${esc(t.guide_7days)}</span></span><span class="st-side"><span class="chev">›</span></span></a>
            </div>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.opendata_h)}</h2>
            <p>${esc(t.opendata_p)}</p>
            <p style="margin-top:12px;"><a href="/${SECTION}/data.json" style="color:var(--color-accent);font-weight:700;">⬇ ${esc(t.opendata_btn)}</a></p>
        </div>
        <div class="ovn-cta">
            <h3>${esc(t.cta_h)}</h3>
            <p>${esc(t.cta_p)}</p>
            <a href="${LANG_DIR[lang]}/rent/" class="ovn-btn">${esc(t.cta_rent)}</a>
            <a href="https://drive-japan-license.com/" target="_blank" rel="noopener" class="ovn-btn ghost">${esc(t.cta_jdltc)}</a>
        </div>`;

    const jsonld = [
        breadcrumbLd([
            [T[lang].home, `${BASE}${LANG_DIR[lang] || "/"}`],
            [t.db_name, pageUrl(lang, "")],
        ]),
        faqLd(faqPairs),
        {
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `Michi-no-Eki Overnight Parking Rules Database — Kyushu, Japan (${YEAR})`,
            description: stripTags(t.index_desc),
            url: pageUrl(lang, ""),
            license: "https://creativecommons.org/licenses/by/4.0/",
            isAccessibleForFree: true,
            dateModified: DATA.meta.updated,
            inLanguage: ["en", "fr", "de", "zh-Hant"],
            keywords: ["michi no eki", "overnight parking", "campervan", "shachuhaku", "車中泊", "roadside station", "Kyushu", "Japan"],
            spatialCoverage: { "@type": "Place", name: "Kyushu, Japan" },
            creator: { "@id": `${BASE}/#organization` },
            distribution: {
                "@type": "DataDownload",
                encodingFormat: "application/json",
                contentUrl: `${BASE}/${SECTION}/data.json`,
            },
        },
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${BASE}/#organization`,
            name: "VAN TRIP JAPAN",
            url: `${BASE}/`,
            logo: `${BASE}/images/favicon.png`,
            description: "Family-run campervan rental in Fukuoka, Japan — operator of the Michi-no-Eki Overnight Database.",
        },
    ];

    writePage(lang, sub, shell({
        lang, sub,
        title: t.index_title,
        desc: t.index_desc,
        h1: t.index_h1,
        heroSub: esc(t.index_sub),
        crumbsHtml: null,
        jsonld,
        body,
        ogImage: "article-michinoeki.png",
    }));
}

function renderPref(lang, prefKey) {
    const t = T[lang];
    const pn = prefName(prefKey, lang);
    const sub = `${prefKey}/`;
    const rows = byPref[prefKey].map((st) => stationRow(st, lang)).join("\n");

    const body = `
        <a class="ovn-back" href="${sectionPath(lang, "")}">${esc(t.back_to_index)}</a>
        <div class="ovn-card">
            <div class="station-list">
${rows}
            </div>
        </div>
        <div class="ovn-cta">
            <h3>${esc(t.cta_h)}</h3>
            <p>${esc(t.cta_p)}</p>
            <a href="${LANG_DIR[lang]}/rent/" class="ovn-btn">${esc(t.cta_rent)}</a>
            <a href="https://drive-japan-license.com/" target="_blank" rel="noopener" class="ovn-btn ghost">${esc(t.cta_jdltc)}</a>
        </div>`;

    const jsonld = [
        breadcrumbLd([
            [T[lang].home, `${BASE}${LANG_DIR[lang] || "/"}`],
            [t.db_name, pageUrl(lang, "")],
            [pn, pageUrl(lang, sub)],
        ]),
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: stripTags(t.pref_h1(pn)),
            numberOfItems: byPref[prefKey].length,
            itemListElement: byPref[prefKey].map((st, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: stationName(st, lang),
                url: pageUrl(lang, `${prefKey}/${st.id}/`),
            })),
        },
    ];

    writePage(lang, sub, shell({
        lang, sub,
        title: t.pref_title(pn),
        desc: t.pref_desc(pn),
        h1: t.pref_h1(pn),
        heroSub: null,
        crumbsHtml: `<a href="${sectionPath(lang, "")}">${esc(t.db_name)}</a> › ${esc(pn)}`,
        jsonld,
        body,
    }));
}

function renderStation(lang, st) {
    const t = T[lang];
    const name = stationName(st, lang);
    const pn = prefName(st.prefecture, lang);
    const sub = `${st.prefecture}/${st.id}/`;
    const m = STATUS_META[st.status];
    const label = statusLabel(st, lang);

    // 4状態: (一般駐車場: 禁止/明示禁止なし) × (RVパーク: 有/無)
    const whatText = st.status === "prohibited"
        ? (st.rv_park ? t.what_prohibited_rv : t.what_prohibited)
        : (st.rv_park ? t.what_rv : t.what_no_ban);
    const faqA1 = st.status === "prohibited"
        ? (st.rv_park ? t.faq_a1_prohibited_rv(name) : t.faq_a1_prohibited(name))
        : (st.rv_park ? t.faq_a1_rv(name) : t.faq_a1_no_ban(name, st.verified));

    const mapsQuery = st.lat && st.lng
        ? `${st.lat},${st.lng}`
        : encodeURIComponent(st.name.ja);

    const detailRows = [
        [t.d_pref, esc(pn)],
        [t.d_city, cityName(st, lang) === st.city.ja ? esc(st.city.ja) : `${esc(cityName(st, lang))}（${esc(st.city.ja)}）`],
        st.official_url ? [t.d_official, `<a href="${esc(st.official_url)}" target="_blank" rel="noopener nofollow">${esc(new URL(st.official_url).hostname)}</a>`] : null,
        [t.d_map, `<a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">${esc(t.d_map_open)}</a>`],
        st.rv_park ? [t.d_rvpark, `<span lang="ja">${esc(st.rv_park.name)}</span>${st.rv_park.url ? ` — <a href="${esc(st.rv_park.url)}" target="_blank" rel="noopener nofollow">${esc(new URL(st.rv_park.url).hostname)}</a>` : ""}`] : null,
    ].filter(Boolean);

    const evidence = (st.evidence || []).map((ev) => {
        const tag = t.src_type[ev.type] || ev.type;
        let ref;
        if (ev.url) {
            let host = ev.url;
            try { host = new URL(ev.url).hostname; } catch { /* keep raw */ }
            ref = `<a href="${esc(ev.url)}" target="_blank" rel="noopener nofollow">${esc(host)}</a>`;
        } else {
            ref = esc(t.src_onsite); // urlなし = 現地確認（VTJチーム）
        }
        return `<div class="src-item"><span class="src-tag">${esc(tag)}</span>${ref}${ev.date ? ` <span style="color:#5f5f66;">(${esc(ev.date)})</span>` : ""}${ev.quote_ja ? `<div lang="ja" style="color:#5f5f66;margin-top:2px;font-size:0.82rem;">「${esc(ev.quote_ja)}」</div>` : ""}</div>`;
    }).join("\n            ");

    const faqPairs = [
        [t.faq_q1(name), faqA1],
        [t.faq_q2, t.faq_a2],
        [t.faq_q3, t.faq_a3],
    ];

    const body = `
        <a class="ovn-back" href="${sectionPath(lang, st.prefecture + "/")}">${esc(t.back_to_pref(pn))}</a>
        <div class="status-banner ${m.cls}">
            <div class="st-label"><span class="dot"></span>${esc(label)}</div>
            <div class="st-verified">${esc(t.verified_label)}${COLON[lang]}${esc(st.verified)}</div>
        </div>
        ${st.rv_park ? `<div class="status-banner rv">
            <div class="st-label"><span class="dot"></span>${esc(t.rv_banner)}</div>
        </div>` : ""}
        <div class="ovn-card">
            <h2>${esc(t.what_h)}</h2>
            <p>${esc(whatText)}</p>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.national_h)}</h2>
            <p>${t.national_p}</p>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.etiquette_h)}</h2>
            <ul>${t.etiquette.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.details_h)}</h2>
            <table class="ovn-table">${detailRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("\n            ")}</table>
        </div>
        ${evidence ? `<div class="ovn-card"><h2>${esc(t.sources_h)}</h2>
            ${evidence}
        </div>` : ""}
        <div class="ovn-card">
            <h2>${esc(t.faq_h)}</h2>
            ${faqPairs.map(([q, a]) => `<div class="faq-item-s"><div class="q">${esc(q)}</div><p>${esc(a)}</p></div>`).join("\n            ")}
        </div>
        <div class="ovn-card">
            <h2>${esc(t.report_h)}</h2>
            <p>${esc(t.report_p)}</p>
            <form class="rf-form" id="rfForm" novalidate>
                <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0;border:0;padding:0;">
                <label class="rf-label" for="rfType">${esc(t.rf_type)}</label>
                <select id="rfType" name="report_type">
                    <option value="ban_sign">${esc(t.rf_opt_ban)}</option>
                    <option value="rv_park">${esc(t.rf_opt_rv)}</option>
                    <option value="no_ban">${esc(t.rf_opt_noban)}</option>
                    <option value="other" selected>${esc(t.rf_opt_other)}</option>
                </select>
                <textarea id="rfMsg" name="message" rows="3" maxlength="1500" placeholder="${esc(t.rf_msg_ph)}" aria-label="${esc(t.rf_msg_ph)}" aria-describedby="rfStatus" required></textarea>
                <input type="email" id="rfContact" name="contact" maxlength="200" placeholder="${esc(t.rf_contact_ph)}" aria-label="${esc(t.rf_contact_ph)}" autocomplete="email">
                <div class="rf-actions">
                    <button type="submit" class="rf-submit">${esc(t.rf_send)}</button>
                    <span class="rf-status" id="rfStatus" role="status" aria-live="polite"></span>
                </div>
            </form>
            <p style="margin-top:14px;font-size:0.88rem;">${esc(t.rf_or_wa)} <a href="https://wa.me/817093757129?text=${encodeURIComponent(`Report for ${st.name.ja} (${st.id}): `)}" target="_blank" rel="noopener" style="color:var(--color-accent);font-weight:700;">${esc(t.report_btn)}</a></p>
        </div>
        <script>
        (function () {
            var form = document.getElementById('rfForm');
            if (!form) return;
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var msg = document.getElementById('rfMsg').value.trim();
                var status = document.getElementById('rfStatus');
                if (msg.length < 5) {
                    status.textContent = ${JSON.stringify(t.rf_min)};
                    status.className = 'rf-status err';
                    document.getElementById('rfMsg').focus();
                    return;
                }
                var btn = form.querySelector('.rf-submit');
                btn.disabled = true;
                fetch('/api/overnight-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        station_id: ${JSON.stringify(st.id)},
                        report_type: document.getElementById('rfType').value,
                        message: msg,
                        contact: document.getElementById('rfContact').value.trim(),
                        lang: ${JSON.stringify(lang)},
                        website: form.querySelector('[name=website]').value
                    })
                }).then(function (r) {
                    if (!r.ok) throw new Error('http ' + r.status);
                    return r.json();
                }).then(function () {
                    form.style.display = 'none';
                    status.textContent = ${JSON.stringify(t.rf_sent)};
                    status.className = 'rf-status ok';
                    form.parentElement.insertBefore(status, form.nextSibling);
                }).catch(function () {
                    btn.disabled = false;
                    status.textContent = ${JSON.stringify(t.rf_err)};
                    status.className = 'rf-status err';
                });
            });
        })();
        </script>
        <div class="ovn-cta">
            <h3>${esc(t.cta_h)}</h3>
            <p>${esc(t.cta_p)}</p>
            <a href="${LANG_DIR[lang]}/rent/" class="ovn-btn">${esc(t.cta_rent)}</a>
            <a href="https://drive-japan-license.com/" target="_blank" rel="noopener" class="ovn-btn ghost">${esc(t.cta_jdltc)}</a>
        </div>`;

    const jsonld = [
        breadcrumbLd([
            [T[lang].home, `${BASE}${LANG_DIR[lang] || "/"}`],
            [t.db_name, pageUrl(lang, "")],
            [pn, pageUrl(lang, st.prefecture + "/")],
            [name, pageUrl(lang, sub)],
        ]),
        placeLd(st, lang, sub),
        faqLd(faqPairs),
    ];

    writePage(lang, sub, shell({
        lang, sub,
        title: t.station_title(name),
        desc: t.station_desc(name, label),
        h1: t.station_h1(name),
        heroSub: `${esc(st.name.ja)} · ${esc(pn)}`,
        crumbsHtml: `<a href="${sectionPath(lang, "")}">${esc(t.db_name)}</a> › <a href="${sectionPath(lang, st.prefecture + "/")}">${esc(pn)}</a> › ${esc(name)}`,
        jsonld,
        body,
    }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Build
 * ──────────────────────────────────────────────────────────────────────────── */
console.log(`\n🏕️  Michi-no-Eki Overnight DB builder — ${counts.total} stations, ${LANGS.length} languages\n`);

let pages = 0;
for (const lang of LANGS) {
    renderIndex(lang); pages++;
    for (const p of PREF_ORDER) { renderPref(lang, p); pages++; }
    for (const st of DATA.stations) { renderStation(lang, st); pages++; }
    console.log(`  ✅ ${lang}: index + ${PREF_ORDER.length} prefectures + ${DATA.stations.length} stations`);
}

// Open data JSON (EN dir only — one canonical copy)
const openData = {
    meta: {
        ...DATA.meta,
        source: `${BASE}/${SECTION}/`,
        license: "CC BY 4.0 — attribution required: VAN TRIP JAPAN (vantripjapan.jp)",
    },
    prefectures: DATA.prefectures,
    stations: DATA.stations,
};
fs.writeFileSync(
    path.join(SITE, ...SECTION.split("/"), "data.json"),
    JSON.stringify(openData, null, 2)
);
console.log(`  ✅ open data → site/${SECTION}/data.json`);

// Sitemap URL list for functions/sitemap.xml.js
const urls = ["/" + SECTION + "/"];
for (const p of PREF_ORDER) urls.push(`/${SECTION}/${p}/`);
for (const st of DATA.stations) urls.push(`/${SECTION}/${st.prefecture}/${st.id}/`);
const libDir = path.join(ROOT, "functions", "lib");
fs.mkdirSync(libDir, { recursive: true });
fs.writeFileSync(
    path.join(libDir, "overnight-urls.js"),
    `// AUTO-GENERATED by scripts/build-overnight-pages.js — do not edit by hand.
// Overnight DB pages exist in en (no prefix) + fr/de/zh dirs. lastmod = database 'updated'.
export const OVERNIGHT_LASTMOD = ${JSON.stringify(DATA.meta.updated)};
export const OVERNIGHT_URLS = ${JSON.stringify(urls, null, 2)};
`
);
console.log(`  ✅ sitemap source → functions/lib/overnight-urls.js (${urls.length} base URLs × 4 langs)`);
console.log(`\n🎉 Done: ${pages} pages generated.\n`);
