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
        st_prohibited: "Overnight stay not allowed here",
        st_prohibited_rv: "Free parking: no overnight — book the RV park instead",
        st_no_ban: "A quiet overnight rest is usually OK here",
        st_rv: "Official RV park on site",
        rv_banner: "Official RV park on site — overnight welcome (paid, book ahead)",
        st_prohibited_short: "Not allowed",
        st_paidonly_short: "Paid only",
        st_no_ban_short: "Usually OK",
        st_rv_short: "RV park",
        legend_paidonly: "The free parking lot explicitly bans overnight stays — but the station has an official paid RV park where staying is welcome. Book a spot and sleep legally.",
        src_onsite: "Confirmed on site by the VAN TRIP JAPAN team",
        legend_prohibited: "The station has posted or published an explicit no-overnight rule. Please respect it — use a nearby campground or RV park instead.",
        legend_no_ban: "No explicit prohibition found as of the verification date — under Japan's national rule, a quiet one-night rest in your vehicle is generally tolerated here. Not a guarantee: no camping behavior, and always check signs on site.",
        legend_rv: "The station has an official paid RV park (Japan RV Association or equivalent) — the one case where overnight stay is explicitly welcome.",
        stats_line: (p, n, r, total) =>
            `Currently tracking <strong>${total} stations</strong> in Kyushu: <span class="c-red">${p === 1 ? "1 free lot with an explicit overnight ban" : `${p} free lots with explicit overnight bans`}</span> and ${n} where a quiet rest is tolerated (no explicit ban found) — plus <span class="c-green">${r === 1 ? "1 official RV park" : `${r} official RV parks`}</span> where paid overnight stay is always welcome.`,
        method_h: "How we verify",
        method_p: "Verified entries link their sources — official station websites, the Japan RV Association register, and reports from the Japanese vanlife community — and carry the date we last checked them. Our rental fleet drives these routes weekly, and guest reports flow back into the database. Rules change; when we learn of a change, the entry and its date are updated.",
        method_split: (c, l) => `Right now <strong>${c} stations are individually verified</strong>. The other <strong>${l}</strong> are listed from the official registry with their location and the national rule, but we have not checked their own signage yet — those entries say so plainly. We verify more every week.`,
        pref_h_prefix: "Stations by prefecture",
        pref_title: (pref) => `Michi-no-Eki Overnight Rules in ${pref} ${YEAR} — Station List | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Overnight campervan parking rules for every tracked Michi-no-Eki in ${pref}, Japan — explicit bans, RV parks and verified dates.`,
        pref_h1: (pref) => `Michi-no-Eki Overnight Rules — ${pref}`,
        station_title: (name) => `${name} — Overnight Parking Rules ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Can you sleep overnight at ${name}? Current status: ${statusLabel}. Rules, sources, verification date and nearby legal alternatives for campervan travelers.`,
        station_h1: (name) => `Can you sleep overnight at ${name}?`,
        verified_label: "Last verified",
        st_listed: "We haven't checked this station's own rules yet — help us verify it",
        listed_note: "This station is in the official Michi-no-Eki registry, but we have not yet checked its own signage or website. Japan's national rule applies by default: a quiet rest in your vehicle is usually tolerated, camping behaviour is not. Signs on site always win — so please read them when you arrive.",
        listed_short: "Info wanted",
        help_h: "Been here? Help other travellers",
        help_p: "We know where this station is — but not what its signs say. If you've stayed here or just driven past, tell us in 30 seconds. We verify every report against the station's own sources, then update this page and credit you.",
        help_btn: "Report what you saw ↓",
        vote_q: "Were you able to stay overnight here?",
        vote_yes: "○ Yes, I stayed",
        vote_no: "✕ No, I couldn't",
        vote_thanks: "Thanks! Your report helps the next traveller.",
        vote_tally: (y, n) => `${y} said yes · ${n} said no`,
        vote_disclaimer: "Traveller reports — not our own verification. We check every report against the station's sources before changing this page.",
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
        map_h: "Map view",
        map_hint: "Tap a pin for rules, station details and Google Maps navigation. Pin numbers match the station list below.",
        map_details: "Station details →",
        nearby_h: "Nearby stations",
        chip_all: "All",
        rv_spaces: (n) => `${n} space${n === 1 ? "" : "s"}`,
        rv_power: "power hookup",
        rv_price: (p) => `¥${p}/night`,
        rv_booking: "online booking required",
        near_me: "📍 Nearest to me",
        near_me_wait: "Finding your location…",
        near_me_fail: "Could not get your location. Please pick a prefecture instead.",
        near_me_done: "Sorted by distance from you.",
        map_legend_h: "Pin colours",
        filter_ph: "Filter stations… (name or city)",
        filter_label: "Filter the station list",
        filter_none: "No stations match your filter.",
        filter_count: (n) => `${n} ${n === 1 ? "station" : "stations"} shown`,
        aria_menu: "Menu",
        aria_whatsapp: "Chat on WhatsApp",
        map_gesture_touch: "Use two fingers to move the map",
        map_gesture_scroll: "Use Ctrl + scroll to zoom the map",
        map_gesture_scroll_mac: "Use ⌘ + scroll to zoom the map",
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
        st_prohibited: "Dormir ici n'est pas autorisé",
        st_prohibited_rv: "Parking gratuit : pas de nuitée — réservez le RV park",
        st_no_ban: "Une nuit de repos discrète est généralement OK ici",
        st_rv: "RV park officiel sur place",
        rv_banner: "RV park officiel sur place — nuitée bienvenue (payant, réservez à l'avance)",
        st_prohibited_short: "Interdit",
        st_paidonly_short: "Payant uniquement",
        st_no_ban_short: "Généralement OK",
        st_rv_short: "RV park",
        legend_paidonly: "Le parking gratuit interdit explicitement la nuitée — mais la station dispose d'un RV park officiel payant où vous êtes le bienvenu. Réservez un emplacement et dormez en toute légalité.",
        src_onsite: "Constaté sur place par l'équipe VAN TRIP JAPAN",
        legend_prohibited: "La station affiche ou publie une interdiction explicite de nuitée. Respectez-la — préférez un camping ou un RV park à proximité.",
        legend_no_ban: "Aucune interdiction explicite trouvée à la date de vérification — selon la règle nationale, une nuit de repos discrète dans le véhicule y est généralement tolérée. Ce n'est pas une garantie : aucun comportement de camping, et vérifiez toujours les panneaux sur place.",
        legend_rv: "La station dispose d'un RV park officiel payant (Japan RV Association ou équivalent) — le seul cas où la nuitée est explicitement bienvenue.",
        stats_line: (p, n, r, total) =>
            `<strong>${total} stations</strong> suivies à Kyushu : <span class="c-red">${p === 1 ? "1 parking gratuit avec interdiction explicite de nuitée" : `${p} parkings gratuits avec interdiction explicite de nuitée`}</span> et ${n} où le repos discret est toléré (aucune interdiction explicite trouvée) — plus <span class="c-green">${r === 1 ? "1 RV park officiel" : `${r} RV parks officiels`}</span> où la nuitée payante est toujours bienvenue.`,
        method_h: "Notre méthode de vérification",
        method_split: (c, l) => `Actuellement, <strong>${c} stations sont vérifiées individuellement</strong>. Les <strong>${l}</strong> autres sont répertoriées d'après le registre officiel, avec leur localisation et la règle nationale, mais leur signalétique propre n'a pas encore été vérifiée — ces fiches le disent clairement. Nous en vérifions davantage chaque semaine.`,
        method_p: "Chaque fiche cite ses sources — sites officiels des stations, registre de la Japan RV Association, remontées de la communauté vanlife japonaise — et porte la date de notre dernière vérification. Notre flotte de location parcourt ces routes chaque semaine et les retours de nos clients alimentent la base. Les règles changent ; dès qu'un changement est connu, la fiche et sa date sont mises à jour.",
        pref_h_prefix: "Stations par préfecture",
        pref_title: (pref) => `Michi-no-Eki : règles de nuit — ${pref} ${YEAR} | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Règles de stationnement de nuit en van pour chaque Michi-no-Eki suivie de la préfecture de ${pref} (Japon) — interdictions explicites, RV parks, dates vérifiées.`,
        pref_h1: (pref) => `Michi-no-Eki : règles de nuit — ${pref}`,
        station_title: (name) => `${name} — peut-on y passer la nuit ? Règles ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Peut-on dormir en van à ${name} ? Statut actuel : ${statusLabel}. Règles, sources, date de vérification et alternatives légales à proximité.`,
        station_h1: (name) => `Peut-on passer la nuit à ${name} ?`,
        verified_label: "Dernière vérification",
        st_listed: "Nous n'avons pas encore vérifié les règles de cette station — aidez-nous",
        listed_note: "Cette station figure au registre officiel des Michi-no-Eki, mais nous n'avons pas encore vérifié sa signalétique ni son site. La règle nationale s'applique par défaut : un repos discret dans le véhicule est généralement toléré, le comportement de camping non. Les panneaux sur place priment toujours — lisez-les en arrivant.",
        listed_short: "Infos recherchées",
        help_h: "Vous y êtes allé ? Aidez les autres voyageurs",
        help_p: "Nous savons où se trouve cette station — mais pas ce que disent ses panneaux. Si vous y avez dormi ou êtes simplement passé, dites-le-nous en 30 secondes. Nous vérifions chaque signalement auprès des sources de la station, puis nous mettons la fiche à jour en vous créditant.",
        help_btn: "Signaler ce que vous avez vu ↓",
        vote_q: "Avez-vous pu passer la nuit ici ?",
        vote_yes: "○ Oui, j'ai dormi",
        vote_no: "✕ Non, impossible",
        vote_thanks: "Merci ! Votre retour aide le prochain voyageur.",
        vote_tally: (y, n) => `${y} oui · ${n} non`,
        vote_disclaimer: "Retours de voyageurs — pas notre propre vérification. Nous confrontons chaque signalement aux sources de la station avant de modifier cette fiche.",
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
        map_h: "Vue carte",
        map_hint: "Touchez une épingle : règles, fiche station et navigation Google Maps. Les numéros des épingles correspondent à la liste ci-dessous.",
        map_details: "Fiche station →",
        nearby_h: "Stations à proximité",
        chip_all: "Toutes",
        rv_spaces: (n) => `${n} emplacement${n === 1 ? "" : "s"}`,
        rv_power: "électricité",
        rv_price: (p) => `${p} ¥/nuit`,
        rv_booking: "réservation en ligne obligatoire",
        near_me: "📍 Les plus proches",
        near_me_wait: "Localisation en cours…",
        near_me_fail: "Localisation impossible. Choisissez une préfecture.",
        near_me_done: "Trié par distance depuis votre position.",
        map_legend_h: "Couleurs des épingles",
        filter_ph: "Filtrer les stations… (nom ou ville)",
        filter_label: "Filtrer la liste des stations",
        filter_none: "Aucune station ne correspond au filtre.",
        filter_count: (n) => `${n} station${n === 1 ? "" : "s"} affichée${n === 1 ? "" : "s"}`,
        aria_menu: "Menu",
        aria_whatsapp: "Discuter sur WhatsApp",
        map_gesture_touch: "Déplacez la carte avec deux doigts",
        map_gesture_scroll: "Ctrl + molette pour zoomer la carte",
        map_gesture_scroll_mac: "⌘ + molette pour zoomer la carte",
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
        st_prohibited: "Übernachten ist hier nicht erlaubt",
        st_prohibited_rv: "Kostenloser Parkplatz: kein Übernachten — buchen Sie den RV-Park",
        st_no_ban: "Eine ruhige Nacht im Fahrzeug ist hier meist OK",
        st_rv: "Offizieller RV-Park vor Ort",
        rv_banner: "Offizieller RV-Park vor Ort — Übernachten willkommen (kostenpflichtig, vorab buchen)",
        st_prohibited_short: "Nicht erlaubt",
        st_paidonly_short: "Nur bezahlt",
        st_no_ban_short: "Meist OK",
        st_rv_short: "RV-Park",
        legend_paidonly: "Der kostenlose Parkplatz verbietet Übernachtungen ausdrücklich — die Station hat aber einen offiziellen, kostenpflichtigen RV-Park, in dem Sie willkommen sind. Stellplatz buchen und legal übernachten.",
        src_onsite: "Vor Ort bestätigt durch das VAN-TRIP-JAPAN-Team",
        legend_prohibited: "Die Station hat ein ausdrückliches Übernachtungsverbot ausgehängt oder veröffentlicht. Bitte respektieren Sie es — nutzen Sie stattdessen einen Campingplatz oder RV-Park in der Nähe.",
        legend_no_ban: "Zum Prüfdatum kein ausdrückliches Verbot gefunden — nach der nationalen Regel wird eine ruhige Nacht im Fahrzeug hier in der Regel toleriert. Keine Garantie: kein Camping-Verhalten, und beachten Sie immer die Schilder vor Ort.",
        legend_rv: "Die Station hat einen offiziellen, kostenpflichtigen RV-Park (Japan RV Association o. ä.) — der eine Fall, in dem Übernachten ausdrücklich willkommen ist.",
        stats_line: (p, n, r, total) =>
            `Aktuell erfasst: <strong>${total} Stationen</strong> in Kyushu — <span class="c-red">${p === 1 ? "1 kostenloser Parkplatz mit ausdrücklichem Übernachtungsverbot" : `${p} kostenlose Parkplätze mit ausdrücklichem Übernachtungsverbot`}</span>; bei ${n} wird ruhiges Übernachten toleriert (kein ausdrückliches Verbot gefunden) — dazu <span class="c-green">${r === 1 ? "1 offizieller RV-Park" : `${r} offizielle RV-Parks`}</span>, wo bezahltes Übernachten immer willkommen ist.`,
        method_h: "So verifizieren wir",
        method_split: (c, l) => `Derzeit sind <strong>${c} Stationen einzeln geprüft</strong>. Die übrigen <strong>${l}</strong> stammen aus dem offiziellen Register — mit Lage und nationaler Regel, aber ohne Prüfung der eigenen Beschilderung; diese Einträge sagen das ausdrücklich. Wir prüfen wöchentlich weitere.`,
        method_p: "Jeder Eintrag verlinkt seine Quellen — offizielle Stations-Websites, das Register der Japan RV Association und Meldungen aus der japanischen Vanlife-Community — und trägt das Datum unserer letzten Prüfung. Unsere Mietflotte fährt diese Routen wöchentlich, und Rückmeldungen unserer Gäste fließen in die Datenbank ein. Regeln ändern sich; sobald wir von einer Änderung erfahren, werden Eintrag und Datum aktualisiert.",
        pref_h_prefix: "Stationen nach Präfektur",
        pref_title: (pref) => `Michi-no-Eki-Übernachtungsregeln in ${pref} ${YEAR} — Stationsliste | VAN TRIP JAPAN`,
        pref_desc: (pref) => `Übernachtungsregeln für jede erfasste Michi-no-Eki in der Präfektur ${pref}, Japan — ausdrückliche Verbote, RV-Parks und Prüfdaten.`,
        pref_h1: (pref) => `Michi-no-Eki-Übernachtungsregeln — ${pref}`,
        station_title: (name) => `${name} — Übernachtungsregeln ${YEAR} | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `Darf man am ${name} im Campervan übernachten? Aktueller Status: ${statusLabel}. Regeln, Quellen, Prüfdatum und legale Alternativen in der Nähe.`,
        station_h1: (name) => `Darf man am ${name} übernachten?`,
        verified_label: "Zuletzt geprüft",
        st_listed: "Wir haben die Regeln dieser Station noch nicht geprüft — helfen Sie uns",
        listed_note: "Diese Station steht im offiziellen Michi-no-Eki-Register, aber wir haben ihre Beschilderung und Website noch nicht geprüft. Es gilt zunächst Japans nationale Regel: ruhiges Ausruhen im Fahrzeug wird meist toleriert, Camping-Verhalten nicht. Schilder vor Ort haben immer Vorrang — lesen Sie sie bitte bei der Ankunft.",
        listed_short: "Infos gesucht",
        help_h: "Schon dort gewesen? Helfen Sie anderen Reisenden",
        help_p: "Wir wissen, wo diese Station liegt — aber nicht, was auf ihren Schildern steht. Wenn Sie dort übernachtet haben oder vorbeigefahren sind, sagen Sie es uns in 30 Sekunden. Wir prüfen jede Meldung anhand der Quellen der Station, aktualisieren dann diese Seite und nennen Sie als Quelle.",
        help_btn: "Melden, was Sie gesehen haben ↓",
        vote_q: "Konnten Sie hier übernachten?",
        vote_yes: "○ Ja, ich habe übernachtet",
        vote_no: "✕ Nein, ging nicht",
        vote_thanks: "Danke! Ihre Meldung hilft dem nächsten Reisenden.",
        vote_tally: (y, n) => `${y} × ja · ${n} × nein`,
        vote_disclaimer: "Reisendenmeldungen — keine eigene Prüfung. Wir gleichen jede Meldung mit den Quellen der Station ab, bevor wir diese Seite ändern.",
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
        map_h: "Kartenansicht",
        map_hint: "Tippen Sie auf einen Pin: Regeln, Stationsdetails und Google-Maps-Navigation. Die Pin-Nummern entsprechen der Stationsliste unten.",
        map_details: "Stationsdetails →",
        nearby_h: "Stationen in der Nähe",
        chip_all: "Alle",
        rv_spaces: (n) => `${n} Stellplätze`,
        rv_power: "Stromanschluss",
        rv_price: (p) => `${p} ¥/Nacht`,
        rv_booking: "Online-Buchung erforderlich",
        near_me: "📍 In meiner Nähe",
        near_me_wait: "Standort wird ermittelt…",
        near_me_fail: "Standort nicht verfügbar. Bitte wählen Sie eine Präfektur.",
        near_me_done: "Nach Entfernung von Ihnen sortiert.",
        map_legend_h: "Pin-Farben",
        filter_ph: "Stationen filtern … (Name oder Ort)",
        filter_label: "Stationsliste filtern",
        filter_none: "Keine Station passt zum Filter.",
        filter_count: (n) => `${n} Station${n === 1 ? "" : "en"} angezeigt`,
        aria_menu: "Menü",
        aria_whatsapp: "Auf WhatsApp chatten",
        map_gesture_touch: "Karte mit zwei Fingern verschieben",
        map_gesture_scroll: "Strg + Scrollen zum Zoomen der Karte",
        map_gesture_scroll_mac: "⌘ + Scrollen zum Zoomen der Karte",
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
        st_prohibited: "這裡不可過夜",
        st_prohibited_rv: "免費停車場不可過夜 — 請預訂RV Park",
        st_no_ban: "在車內安靜過一夜，這裡通常OK",
        st_rv: "設有官方RV Park",
        rv_banner: "設有官方RV Park — 歡迎過夜（付費・建議預約）",
        st_prohibited_short: "不可過夜",
        st_paidonly_short: "僅限付費",
        st_no_ban_short: "通常OK",
        st_rv_short: "RV Park",
        legend_paidonly: "免費停車場明文禁止過夜 — 但站內設有官方付費RV Park，歡迎入住。預訂車位即可合法過夜。",
        src_onsite: "由VAN TRIP JAPAN團隊現地確認",
        legend_prohibited: "該站已公告或發布明文禁止過夜。請務必遵守 — 改用附近的露營場或RV Park。",
        legend_no_ban: "截至查證日期未發現明文禁止 — 依全國規則，在車內安靜休息一晚在此通常被容許。但這不是保證：不做露營行為，並一律以現場告示為準。",
        legend_rv: "該站設有官方付費RV Park（日本RV協會等認證）— 這是唯一明確歡迎過夜的情況。",
        stats_line: (p, n, r, total) =>
            `目前追蹤九州 <strong>${total} 座道之驛</strong>：<span class="c-red">${p} 座的免費停車場明文禁止過夜</span>、${n} 座容許安靜休息（未發現明文禁止）— 另有 <span class="c-green">${r} 座設有官方RV Park</span>，付費過夜隨時歡迎。`,
        method_h: "我們如何查證",
        method_split: (c, l) => `目前 <strong>${c} 座站點已逐一查證</strong>，其餘 <strong>${l}</strong> 座則是依官方名冊收錄（含位置與全國規則），但尚未查證各站自訂告示 — 這些頁面會明確標示。我們每週持續增加查證數量。`,
        method_p: "每筆資料都附上來源 — 各站官方網站、日本RV協會登錄名單、日本車中泊社群的回報 — 並標註最後查證日期。我們的租賃車隊每週行駛這些路線，客人的回報也會回饋到資料庫。規則會變；一旦得知變動，就會更新該筆資料與日期。",
        pref_h_prefix: "依縣份瀏覽",
        pref_title: (pref) => `${pref}道之驛過夜規則 ${YEAR} — 站點清單 | VAN TRIP JAPAN`,
        pref_desc: (pref) => `${pref}每座已收錄道之驛的露營車過夜規則 — 明文禁止、RV Park與查證日期。`,
        pref_h1: (pref) => `道之驛過夜規則 — ${pref}`,
        station_title: (name) => `${name} — 可以過夜嗎？${YEAR}年規則 | VAN TRIP JAPAN`,
        station_desc: (name, statusLabel) => `${name}可以車中泊過夜嗎？目前狀態：${statusLabel}。規則、來源、查證日期與附近合法替代地點。`,
        station_h1: (name) => `${name} 可以過夜嗎？`,
        verified_label: "最後查證",
        st_listed: "本站的規則我們尚未查證 — 歡迎協助",
        listed_note: "本站已收錄於官方道之驛名冊，但我們尚未查證其現場告示或官網。預設適用日本全國規則：在車內安靜休息通常被容許，露營行為則否。現場告示永遠優先 — 抵達時請先確認。",
        listed_short: "徵求資訊",
        help_h: "去過這裡嗎？幫助其他旅行者",
        help_p: "我們知道這座站點的位置 — 但不知道現場告示寫了什麼。如果你曾在此過夜或只是路過，只要30秒告訴我們。每則回報我們都會對照官方來源查證，然後更新本頁並註明你的貢獻。",
        help_btn: "回報你看到的情況 ↓",
        vote_q: "你在這裡順利過夜了嗎？",
        vote_yes: "○ 有，順利過夜",
        vote_no: "✕ 沒有，不行",
        vote_thanks: "謝謝！你的回報會幫助下一位旅行者。",
        vote_tally: (y, n) => `${y} 人可以 · ${n} 人不行`,
        vote_disclaimer: "旅行者回報 — 非我們的查證結果。變更本頁前，我們會逐一對照官方來源查證。",
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
        map_h: "地圖總覽",
        map_hint: "點選圖釘查看規則、站點資訊與Google地圖導航。圖釘上的號碼對應下方的站點清單。",
        map_details: "站點詳情 →",
        nearby_h: "附近的道之驛",
        chip_all: "全部",
        rv_spaces: (n) => `${n} 個車位`,
        rv_power: "附電源",
        rv_price: (p) => `每晚 ¥${p}`,
        rv_booking: "需線上預約",
        near_me: "📍 離我最近",
        near_me_wait: "定位中…",
        near_me_fail: "無法取得位置，請改用縣份選擇。",
        near_me_done: "已依距離排序。",
        map_legend_h: "圖釘顏色說明",
        filter_ph: "篩選站點…（站名或市町村）",
        filter_label: "篩選站點清單",
        filter_none: "沒有符合條件的站點。",
        filter_count: (n) => `顯示 ${n} 座站點`,
        aria_menu: "選單",
        aria_whatsapp: "透過WhatsApp聯絡",
        map_gesture_touch: "請用兩指移動地圖",
        map_gesture_scroll: "按住 Ctrl 並滾動以縮放地圖",
        map_gesture_scroll_mac: "按住 ⌘ 並滾動以縮放地圖",
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
                `<a href="${sectionPath(l, sub)}" class="lang-btn${l === lang ? " active" : ""}"${l === lang ? ' aria-current="true"' : ""}>${labels[l]}</a>`
        ).join("\n        ")}
    </div>`;
}

// 言語別コロン（fr=直前にnbsp、zh=全角）
const COLON = { en: ": ", fr: "&nbsp;: ", de: ": ", zh: "：" };

// status は無料の一般駐車場のポリシー。rv_park は直交（併設の有無）。
// 表示クラスは4値: prohibited(赤=泊まれない) / paidonly(黄=無料禁止だがRVパークで有料OK) / noban(ティール=容認)
function stCls(st) {
    if (st.status === "prohibited") return st.rv_park ? "paidonly" : "prohibited";
    return "noban";
}

/** 公式名簿から収録しただけで、その駅固有のルールは未確認 → 検証済みと偽らない */
const isListed = (st) => st.verification === "listed";

function statusLabel(st, lang, short = false) {
    const t = T[lang];
    if (st.status === "prohibited") {
        if (short) return st.rv_park ? t.st_paidonly_short : t.st_prohibited_short;
        return st.rv_park ? t.st_prohibited_rv : t.st_prohibited;
    }
    return short ? t.st_no_ban_short : t.st_no_ban;
}

function badge(st, lang) {
    return `<span class="badge badge-${stCls(st)}"><span class="dot"></span>${esc(statusLabel(st, lang, true))}</span>`;
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
            --st-amber: #d9a400; --st-amber-text: #6b5400; --st-amber-tint: #fdf6e2;
            --st-green: #2c9a44; --st-green-text: #1e5c28; --st-green-tint: #eaf6ec;
        }
        /* padding-top は言語スイッチャー(絶対配置 top:96px・高さ約40px)の下端を必ず超えること */
        .ovn-hero { background: linear-gradient(160deg, #1a3a2a, #2d5a3d); color: #fff; padding: 156px 20px 72px; text-align: center; }
        .ovn-hero h1 { font-family: var(--font-serif); font-size: clamp(1.75rem, 4.5vw, 2.75rem); margin-bottom: 16px; letter-spacing: -0.02em; line-height: 1.08; }
        .ovn-hero p { color: rgba(255,255,255,0.82); font-size: 1.02rem; max-width: 680px; margin: 0 auto; line-height: 1.65; }
        .ovn-hero .crumbs { font-size: 0.85rem; letter-spacing: 0.02em; margin-bottom: 20px; color: rgba(255,255,255,0.82); }
        .ovn-hero .crumbs a { color: rgba(255,255,255,0.85); text-decoration: none; }
        .ovn-hero .crumbs a:hover { text-decoration: underline; }
        /* 駅ページ: 質問(h1)は控えめに、判定文が最大の活字になる */
        .ovn-hero.compact { padding: 148px 20px 56px; }
        .ovn-hero.compact h1 { font-size: clamp(1.35rem, 2.6vw, 1.85rem); letter-spacing: -0.015em; margin-bottom: 10px; }
        .ovn-wrap { max-width: 860px; margin: -30px auto 96px; padding: 0 20px; }
        /* Apple-2026調: コンテンツは箱なし+活字階層+余白、箱はリスト/フォーム等の操作モジュール(.boxed)のみ */
        .ovn-card { padding: 12px 0 44px; }
        .ovn-card h2 { font-family: var(--font-serif); font-size: 1.55rem; letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 18px; color: var(--color-text); }
        .ovn-card p, .ovn-card li { font-size: 0.98rem; color: var(--color-text-secondary); line-height: 1.75; }
        .ovn-card p { max-width: 70ch; }
        .ovn-card ul, .ovn-card ol { padding-left: 1.3em; margin-top: 8px; max-width: 70ch; }
        .etiquette-list li { padding-left: 4px; }
        .etiquette-list li::marker { font-weight: 700; color: #2d5a3d; }
        .ovn-card li { margin-bottom: 9px; }
        .ovn-card.boxed { background: #fff; border-radius: 20px; padding: 24px 28px 28px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.05); margin-bottom: 36px; }
        .ovn-card.boxed h2 { font-size: 1.3rem; }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 100px; font-size: 0.88rem; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; }
        .badge-prohibited { background: var(--st-red-tint); color: var(--st-red-text); } .badge-prohibited .dot { background: var(--st-red); }
        .badge-noban { background: var(--st-teal-tint); color: var(--st-teal-text); } .badge-noban .dot { background: var(--st-teal); }
        .badge-paidonly { background: var(--st-amber-tint); color: var(--st-amber-text); } .badge-paidonly .dot { background: var(--st-amber); }
        .badge-rv { background: var(--st-green-tint); color: var(--st-green-text); } .badge-rv .dot { background: var(--st-green); }
        .c-red { color: var(--st-red-text); font-weight: 700; } .c-green { color: var(--st-green-text); font-weight: 700; }
        .status-banner { border-radius: 24px; padding: 34px 36px; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05); animation: ovn-rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .status-banner.prohibited { background: var(--st-red-tint); color: var(--st-red-text); }
        .status-banner.noban { background: var(--st-teal-tint); color: var(--st-teal-text); }
        .status-banner.paidonly { background: var(--st-amber-tint); color: var(--st-amber-text); }
        .status-banner.rv { background: var(--st-green-tint); color: var(--st-green-text); }
        /* 答えがヒーロー: 判定文をページ最大の活字にする */
        .status-banner .st-label { display: flex; align-items: center; gap: 14px; font-size: clamp(1.5rem, 3.2vw, 2.1rem); font-weight: 800; font-family: var(--font-serif); letter-spacing: -0.02em; line-height: 1.15; }
        .status-banner .st-label .dot { width: 14px; height: 14px; flex-shrink: 0; }
        .status-banner .st-verified { font-size: 0.9rem; }
        .status-banner.prohibited .dot { background: var(--st-red); } .status-banner.noban .dot { background: var(--st-teal); } .status-banner.rv .dot { background: var(--st-green); } .status-banner.paidonly .dot { background: var(--st-amber); }
        .status-banner .st-verified { margin-top: 8px; font-size: 0.85rem; opacity: 0.88; font-variant-numeric: tabular-nums; }
        @keyframes ovn-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .station-list { display: block; }
        .station-list .station-row + .station-row { border-top: 1px solid var(--color-border-light); }
        a.station-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 12px; margin: 0 -12px; border-radius: 12px; text-decoration: none; transition: background-color 120ms ease-out, transform 100ms ease-out; }
        a.station-row:hover { background: rgba(0,0,0,0.035); }
        a.station-row:active { transform: scale(0.99); }
        a.station-row .st-main { min-width: 0; }
        a.station-row .st-name { display: block; font-weight: 650; color: var(--color-text); font-size: 0.97rem; line-height: 1.35; }
        a.station-row .st-city { display: block; font-size: 0.9rem; color: var(--color-text-secondary); margin-top: 3px; }
        a.station-row .st-side { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
        a.station-row .chev { color: rgba(0,0,0,0.25); font-size: 1.05rem; transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1); }
        a.station-row:hover .chev { transform: translateX(2px); color: rgba(0,0,0,0.4); }
        /* ガラス質スティッキーチップ: コンテンツがチップの下に潜る */
        .pref-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;
            position: sticky; top: 72px; z-index: 20; padding: 10px 12px; margin-left: -12px; margin-right: -12px;
            background: rgba(249,249,247,0.72); backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
            border-radius: 18px; }
        @media (prefers-reduced-transparency: reduce) { .pref-chips { background: #f9f9f7; backdrop-filter: none; -webkit-backdrop-filter: none; } }
        .pref-chip { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid rgba(0,0,0,0.08);
            border-radius: 100px; padding: 8px 16px; font-size: 0.85rem; font-weight: 650; color: var(--color-text);
            text-decoration: none; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 150ms ease-out, border-color 150ms; }
        .pref-chip:hover { transform: translateY(-1px); border-color: rgba(45,90,61,0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .pref-chip:active { transform: scale(0.97); transition-duration: 100ms; }
        .pref-chip .chip-n { font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); font-variant-numeric: tabular-nums;
            background: var(--color-bg-secondary, #f4f4f2); border-radius: 100px; padding: 1px 8px; }
        /* 言語スイッチャーは固定だと粘着チップ帯に重なりクリックを奪う → ページと一緒にスクロールさせる */
        .lang-switcher { position: absolute; top: 96px; }
        .pref-block { scroll-margin-top: 170px; }
        /* 番号ピン: 地図とリストを結ぶID（順位ではない） */
        .ovn-pin span { display: flex; align-items: center; justify-content: center;
            width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: 0.8rem; font-weight: 700;
            border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); font-variant-numeric: tabular-nums; }
        .st-num { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: 28px; height: 28px; border-radius: 50%; margin-right: 14px;
            font-size: 0.8rem; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
        .st-num-prohibited { background: var(--st-red); } .st-num-paidonly { background: var(--st-amber); }
        .st-num-noban { background: var(--st-teal); }
        .st-unverified { color: #7a6a3d; background: #fbf7ea; border-radius: 5px; padding: 1px 7px; font-size: 0.82rem; }
        .map-legend { display: flex; flex-wrap: wrap; gap: 10px 20px; list-style: none; padding: 14px 4px 0; margin: 0; }
        .map-legend li { display: inline-flex; align-items: center; gap: 7px; font-size: 0.86rem; font-weight: 600; color: #5f5f66; }
        .map-legend .dot { width: 10px; height: 10px; }
        .st-chip.near-me { background: #fff; border-style: dashed; border-color: rgba(45,90,61,0.45); color: #2d5a3d; }
        .st-chip.near-me:hover { background: #f2f7f3; }
        .filter-bar { margin: 4px 0 16px; }
        .status-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .st-chip { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 0.88rem; font-weight: 650;
            color: var(--color-text); background: #fff; border: 1px solid rgba(0,0,0,0.1); border-radius: 100px;
            padding: 9px 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 150ms, background-color 150ms, box-shadow 150ms; }
        .st-chip .dot { width: 9px; height: 9px; }
        .st-chip:hover { transform: translateY(-1px); border-color: rgba(45,90,61,0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .st-chip:active { transform: scale(0.97); transition-duration: 100ms; }
        .st-chip.active { background: #2d5a3d; color: #fff; border-color: #2d5a3d; }
        .st-chip.active .chip-n { background: rgba(255,255,255,0.2); color: #fff; }
        .filter-bar input[type="search"] {
            width: 100%; font: inherit; font-size: 0.95rem; color: var(--color-text);
            background: #fff; border: 1px solid rgba(0,0,0,0.12); border-radius: 100px;
            padding: 13px 22px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            transition: border-color 120ms ease-out, box-shadow 120ms ease-out;
        }
        .filter-bar input[type="search"]:focus {
            outline: none; border-color: #2d5a3d; box-shadow: 0 0 0 3px rgba(45,90,61,0.15);
        }
        .filter-none { margin-top: 12px; font-size: 0.9rem; color: #5f5f66; }
        #ovnMap { height: 520px; border-radius: 24px; z-index: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.08); }
        #ovnMap .leaflet-popup-content { font-family: inherit; font-size: 0.9rem; line-height: 1.6; }
        #ovnMap .leaflet-popup-content a { color: var(--color-accent); font-weight: 650; text-decoration: none; }
        #ovnMap .leaflet-popup-content a:hover { text-decoration: underline; }
        @media (max-width: 600px) { #ovnMap { height: 360px; } }
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
        .action-row { margin: 4px 0 28px; }
        /* ○×投票: 1タップで現地の実態を集める。表示は集計の提示にとどめ、判定は人が行う */
        .vote-card .vote-q { font-size: 1.15rem; margin-bottom: 16px; }
        .vote-btns { display: flex; flex-wrap: wrap; gap: 10px; }
        .vote-btn { flex: 1 1 180px; font: inherit; font-size: 1rem; font-weight: 700; cursor: pointer;
            border-radius: 14px; padding: 16px 20px; border: 2px solid rgba(0,0,0,0.1); background: #fff; color: var(--color-text);
            transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 150ms, background-color 150ms; }
        .vote-btn.yes:hover { border-color: var(--st-green); background: var(--st-green-tint); color: var(--st-green-text); }
        .vote-btn.no:hover { border-color: var(--st-red); background: var(--st-red-tint); color: var(--st-red-text); }
        .vote-btn:active { transform: scale(0.97); transition-duration: 100ms; }
        .vote-btn.picked.yes { border-color: var(--st-green); background: var(--st-green-tint); color: var(--st-green-text); }
        .vote-btn.picked.no { border-color: var(--st-red); background: var(--st-red-tint); color: var(--st-red-text); }
        .vote-btn:disabled { cursor: default; opacity: 0.75; }
        .vote-btn:disabled.picked { opacity: 1; }
        .vote-tally { margin-top: 14px; font-weight: 650; color: var(--color-text); font-variant-numeric: tabular-nums; }
        .vote-note { margin-top: 8px; font-size: 0.85rem; color: #5f5f66; }
        .help-card { background: var(--st-teal-tint); border-color: rgba(18,128,138,0.18); }
        @media (prefers-reduced-motion: reduce) { .vote-btn { transition: none; } .vote-btn:active { transform: none; } }
        .ovn-btn.primary { background: #2d5a3d; color: #fff; font-size: 1rem; padding: 15px 32px; margin: 0; }
        .ovn-btn.primary:hover { box-shadow: 0 8px 24px rgba(45,90,61,0.35); }
        .ovn-note { font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.6; }
        /* 上位階層への移動はヒーローのパンくず1本に集約（浮いた戻るボタンは廃止）。
           パンくずは十分な文字サイズとタップ余白を持たせ、これ自体をナビゲーションとして機能させる */
        .ovn-hero .crumbs { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px 4px; }
        .ovn-hero .crumbs a { display: inline-block; padding: 6px 10px; margin: -2px 0; border-radius: 8px;
            font-weight: 600; text-decoration: none; transition: background-color 120ms ease-out; }
        .ovn-hero .crumbs a:hover { background: rgba(255,255,255,0.14); text-decoration: none; }
        .ovn-hero .crumbs .sep { opacity: 0.5; }
        .ovn-hero .crumbs .here { padding: 6px 2px; opacity: 0.85; }
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
        .ovn-card p, .ovn-card li, .ovn-note, .src-item, a.station-row .st-city, .pref-chip .chip-n,
        .pref-block h2 .cnt, .ovn-table th, .src-tag { color: #5f5f66; }
        /* 共有部品の低コントラストをDBページ内で是正（#F5F5F7背景でも4.5:1超） */
        .footer-bottom span, .footer-col a, .footer-brand p { color: #5f5f66; }
        .lang-switcher .lang-btn:not(.active) { color: #6e6e73; }
        @media (max-width: 640px) {
            .ovn-card { padding: 8px 0 36px; }
            .ovn-card.boxed { padding: 20px 18px 24px; border-radius: 16px; }
            .status-banner { padding: 24px 22px; }
            .ovn-cta { padding: 32px 22px; }
            /* 粘着帯が画面の1/3を占拠しスクロールがカクつく問題 → 1行横スクロール・すりガラス解除 */
            .pref-chips { top: 58px; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;
                scrollbar-width: none; padding: 8px 12px; border-radius: 0;
                background: #f9f9f7; backdrop-filter: none; -webkit-backdrop-filter: none;
                box-shadow: 0 1px 0 rgba(0,0,0,0.06); }
            .pref-chips::-webkit-scrollbar { display: none; }
            .pref-chip { flex: 0 0 auto; }
            .pref-block { scroll-margin-top: 118px; }
            .status-chips { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; scrollbar-width: none; }
            .status-chips::-webkit-scrollbar { display: none; }
            .st-chip { flex: 0 0 auto; }
            /* 駅名の折り返しでカードが伸びるのを防ぐ（バッジを下段へ） */
            a.station-row { flex-wrap: wrap; row-gap: 8px; }
            a.station-row .st-main { flex: 1 1 100%; }
            a.station-row .st-side { margin-left: 0; }
            #ovnMap { height: 380px; }
        }
        @media (prefers-reduced-motion: reduce) {
            .status-banner { animation: none; }
            a.station-row, .ovn-btn, .rf-submit, .pref-chip, a.station-row .chev { transition: none; }
            .ovn-btn:hover, .ovn-btn:active, .rf-submit:hover, .rf-submit:active, .pref-chip:hover, .pref-chip:active, a.station-row:active { transform: none; }
        }
`;

function shell({ lang, sub, title, desc, h1, heroSub, crumbsHtml, jsonld, body, ogImage, extraHead = "", heroCompact = false, noindex = false }) {
    const t = T[lang];
    const url = pageUrl(lang, sub);
    const dirAttr = ""; // all 4 langs are LTR
    return `<!DOCTYPE html>
<html lang="${LANG_ATTR[lang]}"${dirAttr}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"}">
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
    ${extraHead}

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
            <button class="nav-hamburger" id="hamburger" aria-label="${esc(t.aria_menu)}"><span></span><span></span><span></span></button>
        </div>
    </nav>

    ${langSwitcher(lang, sub)}

    <div class="ovn-hero${heroCompact ? " compact" : ""}">
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
    <a href="https://wa.me/817093757129?text=Hi!%20I%20have%20a%20question%20about%20campervan%20rental." class="floating-whatsapp" target="_blank" rel="noopener" aria-label="${esc(t.aria_whatsapp)}">💬</a>

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
const sortKey = (s) => (s.status === "prohibited" ? (s.rv_park ? 1 : 0) : s.rv_park ? 2 : 3);
for (const p of PREF_ORDER) byPref[p].sort((a, b) => sortKey(a) - sortKey(b) || a.id.localeCompare(b.id));

// 地図ピンとリスト行を結ぶ通し番号（順位ではなくID。県順→表示順で固定）
const STATION_NUM = {};
let _n = 0;
for (const p of PREF_ORDER) for (const s of byPref[p]) STATION_NUM[s.id] = ++_n;

const counts = {
    prohibited: DATA.stations.filter((s) => s.status === "prohibited").length,
    no_ban: DATA.stations.filter((s) => s.status === "no_explicit_ban").length,
    rv: DATA.stations.filter((s) => s.rv_park).length,
    total: DATA.stations.length,
    checked: DATA.stations.filter((s) => !isListed(s)).length,
    listed: DATA.stations.filter((s) => isListed(s)).length,
};

function stationRow(st, lang, distanceKm) {
    const sub = `${st.prefecture}/${st.id}/`;
    const shownName = stationName(st, lang);
    let subtitle = shownName === st.name.ja
        ? esc(cityName(st, lang))
        : `${esc(st.name.ja)} · ${esc(cityName(st, lang))}`;
    if (distanceKm != null) subtitle += ` · ${distanceKm}&nbsp;km`;
    if (isListed(st)) subtitle += ` · <span class="st-unverified">${esc(T[lang].listed_short)}</span>`;
    return `<a class="station-row" data-st="${stCls(st)}" data-rv="${st.rv_park ? 1 : 0}"${st.lat ? ` data-lat="${st.lat}" data-lng="${st.lng}"` : ""} href="${sectionPath(lang, sub)}">
                <span class="st-num st-num-${stCls(st)}" aria-hidden="true">${STATION_NUM[st.id] || ""}</span>
                <span class="st-main"><span class="st-name">${esc(shownName)}</span>
                <span class="st-city">${subtitle}</span></span>
                <span class="st-side">${st.rv_park ? rvChip(lang) : ""}${badge(st, lang)}<span class="chev" aria-hidden="true">›</span></span>
            </a>`;
}

/** 大円距離(km) — 近隣駅の算出に使用 */
function haversineKm(a, b) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** RVパーク情報を構造化フィールドから各言語で組み立てる（日本語生データを出さない） */
function rvParkText(rv, lang) {
    const t = T[lang];
    const bits = [];
    if (rv.spaces) bits.push(t.rv_spaces(rv.spaces));
    if (rv.power) bits.push(t.rv_power);
    if (rv.price_jpy) bits.push(t.rv_price(rv.price_jpy.toLocaleString("en-US")));
    if (rv.booking === "online") bits.push(t.rv_booking);
    const host = rv.url ? (() => { try { return new URL(rv.url).hostname; } catch { return rv.url; } })() : "";
    return `<span lang="ja">${esc(rv.name_ja || rv.name || "")}</span>`
        + (bits.length ? ` · ${esc(bits.join(" · "))}` : "")
        + (rv.url ? ` — <a href="${esc(rv.url)}" target="_blank" rel="noopener nofollow">${esc(host)}</a>` : "");
}

function nearbyStations(st, count = 3) {
    if (!st.lat || !st.lng) return [];
    return DATA.stations
        .filter((o) => o.id !== st.id && o.lat && o.lng)
        .map((o) => ({ st: o, km: Math.round(haversineKm(st, o)) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, count);
}

function renderIndex(lang) {
    const t = T[lang];
    const sub = "";
    const legend = `
        <div class="ovn-card">
            <h2>${esc(t.legend_h)}</h2>
            <p style="margin-bottom:8px;">${t.stats_line(counts.prohibited, counts.no_ban, counts.rv, counts.total)}</p>
            <div class="legend-item"><span class="badge badge-prohibited"><span class="dot"></span>${esc(t.st_prohibited_short)}</span><p>${esc(t.legend_prohibited)}</p></div>
            <div class="legend-item"><span class="badge badge-paidonly"><span class="dot"></span>${esc(t.st_paidonly_short)}</span><p>${esc(t.legend_paidonly)}</p></div>
            <div class="legend-item"><span class="badge badge-noban"><span class="dot"></span>${esc(t.st_no_ban_short)}</span><p>${esc(t.legend_no_ban)}</p></div>
            <div class="legend-item"><span class="badge badge-rv"><span class="dot"></span>${esc(t.st_rv_short)}</span><p>${esc(t.legend_rv)}</p></div>
        </div>`;

    const prefChips = `<nav class="pref-chips" aria-label="Prefectures">
            ${PREF_ORDER.map((p) => `<a class="pref-chip" href="#${p}">${esc(prefName(p, lang))}<span class="chip-n">${byPref[p].length}</span></a>`).join("\n            ")}
        </nav>`;

    const nOk = DATA.stations.filter((s) => s.status !== "prohibited").length;
    const nRv = DATA.stations.filter((s) => s.rv_park).length;
    const nPaid = DATA.stations.filter((s) => s.status === "prohibited" && s.rv_park).length;
    const nNo = DATA.stations.filter((s) => s.status === "prohibited" && !s.rv_park).length;

    const filterBar = `
        <div class="filter-bar">
            <div class="status-chips" role="group" aria-label="${esc(t.filter_label)}">
                <button type="button" class="st-chip active" data-f="all" aria-pressed="true">${esc(t.chip_all)}<span class="chip-n">${counts.total}</span></button>
                <button type="button" class="st-chip" data-f="ok" aria-pressed="false"><span class="dot" style="background:var(--st-teal)"></span>${esc(t.st_no_ban_short)}<span class="chip-n">${nOk}</span></button>
                <button type="button" class="st-chip" data-f="rv" aria-pressed="false"><span class="dot" style="background:var(--st-green)"></span>${esc(t.st_rv_short)}<span class="chip-n">${nRv}</span></button>
                ${nPaid ? `<button type="button" class="st-chip" data-f="paid" aria-pressed="false"><span class="dot" style="background:var(--st-amber)"></span>${esc(t.st_paidonly_short)}<span class="chip-n">${nPaid}</span></button>` : ""}
                <button type="button" class="st-chip" data-f="no" aria-pressed="false"><span class="dot" style="background:var(--st-red)"></span>${esc(t.st_prohibited_short)}<span class="chip-n">${nNo}</span></button>
                <button type="button" class="st-chip near-me" id="ovnNearMe">${esc(t.near_me)}</button>
            </div>
            <input type="search" id="ovnFilter" placeholder="${esc(t.filter_ph)}" aria-label="${esc(t.filter_label)}" autocomplete="off">
            <p class="filter-none" id="ovnFilterNone" role="status" hidden></p>
        </div>
        <div class="ovn-card boxed" id="ovnNearWrap" hidden>
            <h2>${esc(t.near_me)}</h2>
            <div class="station-list" id="ovnNearList"></div>
        </div>
        <script>
        (function () {
            var input = document.getElementById('ovnFilter');
            var status = document.getElementById('ovnFilterNone');
            if (!input || !status) return;
            var noneText = ${JSON.stringify(t.filter_none)};
            var oneText = ${JSON.stringify(t.filter_count(1))};
            var manyTemplate = ${JSON.stringify(t.filter_count("__N__"))};
            var activeF = 'all';
            // fキー: all / ok=通常OK / rv=RVパークあり / paid=無料不可だが有料OK / no=泊まれない
            function matchStatus(st, rv) {
                if (activeF === 'all') return true;
                if (activeF === 'ok') return st === 'noban';
                if (activeF === 'rv') return rv === 1 || rv === '1';
                if (activeF === 'paid') return st === 'paidonly';
                return st === 'prohibited';
            }
            function apply() {
                var q = input.value.trim().toLowerCase();
                var total = 0;
                document.querySelectorAll('.pref-block').forEach(function (block) {
                    var visible = 0;
                    block.querySelectorAll('a.station-row').forEach(function (row) {
                        var hit = (!q || row.textContent.toLowerCase().indexOf(q) !== -1) &&
                            matchStatus(row.getAttribute('data-st'), row.getAttribute('data-rv'));
                        row.style.display = hit ? '' : 'none';
                        if (hit) visible++;
                    });
                    block.style.display = visible ? '' : 'none';
                    total += visible;
                });
                if (window.__ovnMapFilter) window.__ovnMapFilter(function (st, rv) {
                    return matchStatus(st, rv);
                });
                if (!q && activeF === 'all') { status.hidden = true; return; }
                status.hidden = false;
                status.textContent = total === 0 ? noneText : (total === 1 ? oneText : manyTemplate.replace('__N__', total));
            }
            input.addEventListener('input', apply);
            document.querySelectorAll('.st-chip[data-f]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    activeF = btn.getAttribute('data-f');
                    document.querySelectorAll('.st-chip[data-f]').forEach(function (b) {
                        var on = b === btn;
                        b.classList.toggle('active', on);
                        b.setAttribute('aria-pressed', on ? 'true' : 'false');
                    });
                    apply();
                });
            });

            // 現在地から近い順に並べ替え（夜間・急いでいる利用者の主動線）
            var nearBtn = document.getElementById('ovnNearMe');
            if (nearBtn && navigator.geolocation) {
                nearBtn.addEventListener('click', function () {
                    status.hidden = false;
                    status.className = 'filter-none';
                    status.textContent = ${JSON.stringify(t.near_me_wait)};
                    navigator.geolocation.getCurrentPosition(function (pos) {
                        var la = pos.coords.latitude, ln = pos.coords.longitude;
                        var R = 6371, rad = function (d) { return d * Math.PI / 180; };
                        var rows = [].slice.call(document.querySelectorAll('a.station-row[data-lat]'));
                        rows.forEach(function (row) {
                            var dLat = rad(parseFloat(row.getAttribute('data-lat')) - la);
                            var dLng = rad(parseFloat(row.getAttribute('data-lng')) - ln);
                            var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(rad(la)) *
                                Math.cos(rad(parseFloat(row.getAttribute('data-lat')))) * Math.pow(Math.sin(dLng / 2), 2);
                            var km = Math.round(2 * R * Math.asin(Math.sqrt(h)));
                            row.__km = km;
                            var city = row.querySelector('.st-city');
                            if (city && city.getAttribute('data-base') === null) city.setAttribute('data-base', city.textContent);
                            if (city) city.textContent = (city.getAttribute('data-base') || city.textContent).split(' · ').slice(0, 2).join(' · ') + ' · ' + km + ' km';
                        });
                        rows.sort(function (a, b) { return a.__km - b.__km; });
                        var host = document.getElementById('ovnNearList');
                        host.innerHTML = '';
                        rows.slice(0, 10).forEach(function (r) { host.appendChild(r.cloneNode(true)); });
                        document.getElementById('ovnNearWrap').hidden = false;
                        status.textContent = ${JSON.stringify(t.near_me_done)};
                        document.getElementById('ovnNearWrap').scrollIntoView({ block: 'start' });
                    }, function () {
                        status.className = 'filter-none err';
                        status.textContent = ${JSON.stringify(t.near_me_fail)};
                    }, { timeout: 8000, maximumAge: 300000 });
                });
            } else if (nearBtn) {
                nearBtn.hidden = true;
            }
        })();
        </script>`;

    const prefBlocks = PREF_ORDER.map((p) => {
        const rows = byPref[p].map((st) => stationRow(st, lang)).join("\n");
        return `<div class="ovn-card boxed pref-block" id="${p}">
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

    // 地図マーカー: 色 = 禁止:赤 / RVパーク併設:緑 / 休憩容認:ティール
    const markers = DATA.stations.filter((s) => s.lat && s.lng).map((s) => ({
        i: STATION_NUM[s.id],
        n: stationName(s, lang),
        la: s.lat, ln: s.lng,
        st: stCls(s), rv: s.rv_park ? 1 : 0,
        c: s.status === "prohibited" ? (s.rv_park ? "#d9a400" : "#c93028") : s.rv_park ? "#2c9a44" : "#12808a",
        b: esc(statusLabel(s, lang, true)) + (s.rv_park ? " · " + esc(t.st_rv_short) : ""),
        u: sectionPath(lang, `${s.prefecture}/${s.id}/`),
        g: `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`,
    }));

    const mapCard = `
        <div class="ovn-card">
            <h2>${esc(t.map_h)}</h2>
            <p style="margin-bottom:14px;">${esc(t.map_hint)}</p>
            <div id="ovnMap" role="application" aria-label="${esc(t.map_h)}"></div>
            <ul class="map-legend" aria-label="${esc(t.map_legend_h)}">
                <li><span class="dot" style="background:var(--st-teal)"></span>${esc(t.st_no_ban_short)}</li>
                <li><span class="dot" style="background:var(--st-green)"></span>${esc(t.st_rv_short)}</li>
                <li><span class="dot" style="background:var(--st-amber)"></span>${esc(t.st_paidonly_short)}</li>
                <li><span class="dot" style="background:var(--st-red)"></span>${esc(t.st_prohibited_short)}</li>
            </ul>
        </div>
        <script src="/js/vendor/leaflet.js"></script>
        <script src="/js/vendor/leaflet-gesture-handling.min.js"></script>
        <script>
        (function () {
            var el = document.getElementById('ovnMap');
            if (!el || !window.L) return;
            // gestureHandling: モバイルは2本指パン(1本指はページスクロール)、PCはCtrl+ホイールでズーム
            var map = L.map(el, {
                scrollWheelZoom: false, tap: true,
                gestureHandling: true,
                gestureHandlingOptions: { text: ${JSON.stringify({
                    touch: t.map_gesture_touch,
                    scroll: t.map_gesture_scroll,
                    scrollMac: t.map_gesture_scroll_mac,
                }) } }
            }).setView([32.75, 130.95], 7);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            var sts = ${JSON.stringify(markers)};
            // 番号入りピン: 下のリストの同じ番号と対応する。色に依存しない手がかりにもなる
            var mapMarkers = sts.map(function (s) {
                var m = L.marker([s.la, s.ln], {
                    icon: L.divIcon({
                        className: 'ovn-pin',
                        html: '<span style="background:' + s.c + '">' + s.i + '</span>',
                        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14]
                    }),
                    title: s.i + '. ' + s.n
                }).addTo(map).bindPopup(
                    '<strong>' + s.i + '. ' + s.n + '</strong><br><span style="color:' + s.c + ';font-weight:600;">' + s.b + '</span><br>' +
                    '<a href="' + s.u + '">${esc(t.map_details)}</a> · <a href="' + s.g + '" target="_blank" rel="noopener">Google Maps ↗</a>'
                );
                return { m: m, st: s.st, rv: s.rv };
            });
            // ステータス絞り込みチップから呼ばれる（リストと地図を同時に絞る）
            window.__ovnMapFilter = function (pred) {
                mapMarkers.forEach(function (x) {
                    if (pred(x.st, x.rv)) { if (!map.hasLayer(x.m)) x.m.addTo(map); }
                    else if (map.hasLayer(x.m)) map.removeLayer(x.m);
                });
            };
        })();
        </script>`;

    const body = `
        ${prefChips}
${mapCard}
${filterBar}
${prefBlocks}
        <div class="ovn-card">
            <h2>${esc(t.national_h)}</h2>
            <p>${t.national_p}</p>
        </div>
${legend}
        <div class="ovn-card">
            <h2>${esc(t.method_h)}</h2>
            <p>${esc(t.method_p)}</p>
            <p style="margin-top:10px;">${t.method_split(counts.checked, counts.listed)}</p>
            <p style="margin-top:10px;font-size:0.85rem;">${esc(t.updated_label)}${COLON[lang]}<strong>${DATA.meta.updated}</strong></p>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.faq_h)}</h2>
            ${faqPairs.map(([q, a]) => `<div class="faq-item-s"><div class="q">${esc(q)}</div><p>${esc(a)}</p></div>`).join("\n            ")}
        </div>
        <div class="ovn-card">
            <h2>${esc(t.related_h)}</h2>
            <div class="station-list">
                <a class="station-row" href="/posts/michi-no-eki-guide/"><span class="st-main"><span class="st-name">${esc(t.guide_michi)}</span></span><span class="st-side"><span class="chev" aria-hidden="true">›</span></span></a>
                <a class="station-row" href="/posts/campervan-parking-japan-overnight/"><span class="st-main"><span class="st-name">${esc(t.guide_parking)}</span></span><span class="st-side"><span class="chev" aria-hidden="true">›</span></span></a>
                <a class="station-row" href="/posts/kyushu-road-trip-7-days/"><span class="st-main"><span class="st-name">${esc(t.guide_7days)}</span></span><span class="st-side"><span class="chev" aria-hidden="true">›</span></span></a>
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
        extraHead: '<link rel="stylesheet" href="/css/vendor/leaflet.css"><link rel="stylesheet" href="/css/vendor/leaflet-gesture-handling.min.css">',
    }));
}

function renderPref(lang, prefKey) {
    const t = T[lang];
    const pn = prefName(prefKey, lang);
    const sub = `${prefKey}/`;
    const rows = byPref[prefKey].map((st) => stationRow(st, lang)).join("\n");

    const body = `
        <div class="ovn-card boxed">
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
        crumbsHtml: `<a href="${sectionPath(lang, "")}">${esc(t.db_name)}</a><span class="sep">›</span><span class="here">${esc(pn)}</span>`,
        jsonld,
        body,
    }));
}

function renderStation(lang, st) {
    const t = T[lang];
    const name = stationName(st, lang);
    const pn = prefName(st.prefecture, lang);
    const sub = `${st.prefecture}/${st.id}/`;
    const cls = stCls(st);
    const label = statusLabel(st, lang);

    // 4状態: (一般駐車場: 禁止/明示禁止なし) × (RVパーク: 有/無)
    const whatText = st.status === "prohibited"
        ? (st.rv_park ? t.what_prohibited_rv : t.what_prohibited)
        : (st.rv_park ? t.what_rv : t.what_no_ban);
    const faqA1 = isListed(st)
        ? t.listed_note
        : st.status === "prohibited"
            ? (st.rv_park ? t.faq_a1_prohibited_rv(name) : t.faq_a1_prohibited(name))
            : (st.rv_park ? t.faq_a1_rv(name) : t.faq_a1_no_ban(name, st.verified));

    const mapsQuery = st.lat && st.lng
        ? `${st.lat},${st.lng}`
        : encodeURIComponent(st.name.ja);
    // ワンタップでナビ開始（検索ピンではなく経路画面へ）。目的地名も渡して行き先を確認できるようにする
    const mapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}&travelmode=driving`;

    const detailRows = [
        [t.d_pref, esc(pn)],
        [t.d_city, cityName(st, lang) === st.city.ja ? esc(st.city.ja) : `${esc(cityName(st, lang))}（${esc(st.city.ja)}）`],
        st.official_url ? [t.d_official, `<a href="${esc(st.official_url)}" target="_blank" rel="noopener nofollow">${esc(new URL(st.official_url).hostname)}</a>`] : null,
        [t.d_map, `<a href="${mapsNavUrl}" target="_blank" rel="noopener">${esc(t.d_map_open)}</a>`],
        st.rv_park ? [t.d_rvpark, rvParkText(st.rv_park, lang)] : null,
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
        <div class="status-banner ${cls}">
            <div class="st-label"><span class="dot"></span>${esc(label)}</div>
            <div class="st-verified">${isListed(st)
                ? esc(t.st_listed)
                : `${esc(t.verified_label)}${COLON[lang]}${esc(st.verified)}`}</div>
        </div>
        ${st.rv_park ? `<div class="status-banner rv">
            <div class="st-label"><span class="dot"></span>${esc(t.rv_banner)}</div>
        </div>` : ""}
        <div class="action-row">
            <a class="ovn-btn primary" href="${mapsNavUrl}" target="_blank" rel="noopener">🧭 ${esc(t.d_map_open)}</a>
        </div>
        ${isListed(st) ? `<div class="ovn-card boxed help-card">
            <h2>${esc(t.help_h)}</h2>
            <p>${esc(t.help_p)}</p>
            <p style="margin-top:14px;"><a href="#rfForm" class="ovn-btn primary" style="font-size:0.92rem;padding:12px 26px;">${esc(t.help_btn)}</a></p>
        </div>` : ""}
        <div class="ovn-card boxed vote-card">
            <h2 class="vote-q">${esc(t.vote_q)}</h2>
            <div class="vote-btns" id="ovnVote">
                <button type="button" class="vote-btn yes" data-v="yes">${esc(t.vote_yes)}</button>
                <button type="button" class="vote-btn no" data-v="no">${esc(t.vote_no)}</button>
            </div>
            <p class="vote-tally" id="ovnTally" role="status" hidden></p>
            <p class="vote-note">${esc(t.vote_disclaimer)}</p>
        </div>
        <script>
        (function () {
            var box = document.getElementById('ovnVote'), out = document.getElementById('ovnTally');
            if (!box || !out) return;
            var sid = ${JSON.stringify(st.id)}, lang = ${JSON.stringify(lang)};
            var THANKS = ${JSON.stringify(t.vote_thanks)};
            var TALLY = ${JSON.stringify(t.vote_tally("__Y__", "__N__"))};
            function show(d, thanks) {
                var total = (d.yes || 0) + (d.no || 0);
                if (!total) { out.hidden = true; return; }
                out.hidden = false;
                out.textContent = (thanks ? THANKS + ' ' : '') +
                    TALLY.replace('__Y__', d.yes || 0).replace('__N__', d.no || 0);
            }
            fetch('/api/overnight-vote?station=' + encodeURIComponent(sid))
                .then(function (r) { return r.json(); }).then(function (d) { show(d, false); })
                .catch(function () {});
            box.addEventListener('click', function (e) {
                var b = e.target.closest('.vote-btn');
                if (!b) return;
                [].forEach.call(box.querySelectorAll('.vote-btn'), function (x) { x.disabled = true; });
                b.classList.add('picked');
                fetch('/api/overnight-vote', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ station_id: sid, vote: b.getAttribute('data-v'), lang: lang })
                }).then(function (r) { return r.json(); })
                  .then(function (d) { show(d, true); })
                  .catch(function () { out.hidden = false; out.textContent = THANKS; });
            });
        })();
        </script>
        <div class="ovn-card">
            <h2>${esc(t.what_h)}</h2>
            <p>${esc(isListed(st) ? t.listed_note : whatText)}</p>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.national_h)}</h2>
            <p>${t.national_p}</p>
        </div>
        <div class="ovn-card">
            <h2>${esc(t.etiquette_h)}</h2>
            <ol class="etiquette-list">${t.etiquette.map((e) => `<li>${esc(e)}</li>`).join("")}</ol>
        </div>
        <div class="ovn-card boxed">
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
        ${(() => {
            const near = nearbyStations(st);
            if (!near.length) return "";
            return `<div class="ovn-card boxed">
            <h2>${esc(t.nearby_h)}</h2>
            <div class="station-list">
                ${near.map((n) => stationRow(n.st, lang, n.km)).join("\n                ")}
            </div>
        </div>`;
        })()}
        <div class="ovn-card boxed">
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
        crumbsHtml: `<a href="${sectionPath(lang, "")}">${esc(t.db_name)}</a><span class="sep">›</span><a href="${sectionPath(lang, st.prefecture + "/")}">${esc(pn)}</a><span class="sep">›</span><span class="here">${esc(name)}</span>`,
        jsonld,
        body,
        heroCompact: true,
        noindex: isListed(st),
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

// Sitemap URL list for functions/sitemap.xml.js（未検証=noindexの駅は載せない）
const urls = ["/" + SECTION + "/"];
for (const p of PREF_ORDER) urls.push(`/${SECTION}/${p}/`);
for (const st of DATA.stations) if (!isListed(st)) urls.push(`/${SECTION}/${st.prefecture}/${st.id}/`);
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
