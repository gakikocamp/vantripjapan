const fs = require('fs');
const file = 'site/rent/index.html';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
    // Nav
    ['<a href="/">Home</a>', '<a href="/" data-i18n="nav.home">Home</a>'],
    ['<a href="/category/">Guides</a>', '<a href="/category/" data-i18n="nav.guides">Guides</a>'],
    ['<a href="/rent/">Rental</a>', '<a href="/rent/" data-i18n="nav.rental">Rental</a>'],
    ['<a href="/contact/">Contact</a>', '<a href="/contact/" data-i18n="nav.contact">Contact</a>'],
    ['<a href="/rent/" class="nav-cta">Rent a Van →</a>', '<a href="/rent/" class="nav-cta" data-i18n="nav.rent_btn">Rent a Van →</a>'],

    // Destination
    ['<h2>Where Will You Go?</h2>', '<h2 data-i18n="dest.title">Where Will You Go?</h2>'],
    ['<p>All within a day’s drive from Fukuoka. Swipe to explore →</p>', '<p data-i18n="dest.subtitle">All within a day’s drive from Fukuoka. Swipe to explore →</p>'],
    ['<span class="dest-card-tag">🌋 Volcano</span>', '<span class="dest-card-tag">🌋 <span data-i18n="dest.volcano">Volcano</span></span>'],
    ['<div class="dest-card-name">Aso</div>', '<div class="dest-card-name" data-i18n="dest.aso">Aso</div>'],
    ['<div class="dest-card-drive">🚗 2h from Fukuoka</div>', '<div class="dest-card-drive">🚗 <span data-i18n="dest.drive.aso">2h from Fukuoka</span></div>'],
    ['<span class="dest-card-tag">♨️ Onsen</span>', '<span class="dest-card-tag">♨️ <span data-i18n="dest.onsen">Onsen</span></span>'],
    ['<div class="dest-card-name">Beppu</div>', '<div class="dest-card-name" data-i18n="dest.beppu">Beppu</div>'],
    ['<div class="dest-card-drive">🚗 2.5h from Fukuoka</div>', '<div class="dest-card-drive">🚗 <span data-i18n="dest.drive.beppu">2.5h from Fukuoka</span></div>'],
    ['<span class="dest-card-tag">🌊 Coast</span>', '<span class="dest-card-tag">🌊 <span data-i18n="dest.coast">Coast</span></span>'],
    ['<div class="dest-card-name">Itoshima</div>', '<div class="dest-card-name" data-i18n="dest.itoshima">Itoshima</div>'],
    ['<div class="dest-card-drive">🚗 40 min from Fukuoka</div>', '<div class="dest-card-drive">🚗 <span data-i18n="dest.drive.itoshima">40 min from Fukuoka</span></div>'],
    ['<span class="dest-card-tag">🌿 UNESCO</span>', '<span class="dest-card-tag">🌿 <span data-i18n="dest.unesco">UNESCO</span></span>'],
    ['<div class="dest-card-name">Yakushima</div>', '<div class="dest-card-name" data-i18n="dest.yakushima">Yakushima</div>'],
    ['<div class="dest-card-drive">⛴️ Ferry from Kagoshima</div>', '<div class="dest-card-drive">⛴️ <span data-i18n="dest.drive.yakushima">Ferry from Kagoshima</span></div>'],
    ['<span class="dest-card-tag">⛩️ Sacred</span>', '<span class="dest-card-tag">⛩️ <span data-i18n="dest.sacred">Sacred</span></span>'],
    ['<div class="dest-card-name">Takachiho</div>', '<div class="dest-card-name" data-i18n="dest.takachiho">Takachiho</div>'],
    ['<div class="dest-card-drive">🚗 3h from Fukuoka</div>', '<div class="dest-card-drive">🚗 <span data-i18n="dest.drive.takachiho">3h from Fukuoka</span></div>'],
    ['<span class="dest-card-tag">🏖️ Sand Bath</span>', '<span class="dest-card-tag">🏖️ <span data-i18n="dest.sandbath">Sand Bath</span></span>'],
    ['<div class="dest-card-name">Ibusuki</div>', '<div class="dest-card-name" data-i18n="dest.ibusuki">Ibusuki</div>'],
    ['<div class="dest-card-drive">🚗 4h from Fukuoka</div>', '<div class="dest-card-drive">🚗 <span data-i18n="dest.drive.ibusuki">4h from Fukuoka</span></div>'],

    // Vehicles
    ['<div class="spec-item">👥 2 guests</div>', '<div class="spec-item">👥 <span data-i18n="vehicles.spec_guest2">2 guests</span></div>'],
    ['<div class="spec-item">🛏️ Roof tent</div>', '<div class="spec-item">🛏️ <span data-i18n="vehicles.spec_rooftent">Roof tent</span></div>'],
    ['<div class="spec-item">⛽ Great fuel economy</div>', '<div class="spec-item">⛽ <span data-i18n="vehicles.spec_fuel">Great fuel economy</span></div>'],
    ['<div class="spec-item">🅿️ Easy to park</div>', '<div class="spec-item">🅿️ <span data-i18n="vehicles.spec_park">Easy to park</span></div>'],
    ['<div class="spec-item">📱 Portable power</div>', '<div class="spec-item">📱 <span data-i18n="vehicles.spec_power">Portable power</span></div>'],
    ['<div class="spec-item">🪑 Camping chairs</div>', '<div class="spec-item">🪑 <span data-i18n="vehicles.spec_chairs">Camping chairs</span></div>'],

    ['🔧 HAND-BUILT', '🔧 <span data-i18n="vehicles.handbuilt">HAND-BUILT</span>'],
    ['<div class="spec-item">👥 2-3 guests</div>', '<div class="spec-item">👥 <span data-i18n="vehicles.spec_guest23">2-3 guests</span></div>'],
    ['<div class="spec-item">🛏️ Built-in bed</div>', '<div class="spec-item">🛏️ <span data-i18n="vehicles.spec_bed">Built-in bed</span></div>'],
    ['<div class="spec-item">🏠 More interior space</div>', '<div class="spec-item">🏠 <span data-i18n="vehicles.spec_space">More interior space</span></div>'],
    ['<div class="spec-item">🔌 Power inverter</div>', '<div class="spec-item">🔌 <span data-i18n="vehicles.spec_inverter">Power inverter</span></div>'],
    ['<div class="spec-item">💡 LED lighting</div>', '<div class="spec-item">💡 <span data-i18n="vehicles.spec_led">LED lighting</span></div>'],

    // Micro Proofs
    ['<span>"The Bongo was spotless and perfectly equipped" — <span class="proof-name">James & Emily, UK</span></span>', '<span data-i18n="vehicles.proof1">"The Bongo was spotless and perfectly equipped" — <span class="proof-name">James & Emily, UK</span></span>'],
    ['<span>"The key box system was genius — we landed at 9 PM and were on the road by 9:30" — <span class="proof-name">Sarah M., Australia</span></span>', '<span data-i18n="vehicles.proof2">"The key box system was genius — we landed at 9 PM and were on the road by 9:30" — <span class="proof-name">Sarah M., Australia</span></span>'],
    ['<span>"Best value campervan rental in Kyushu — everything included, no surprises" — <span class="proof-name">Thomas K., Germany</span></span>', '<span data-i18n="vehicles.proof3">"Best value campervan rental in Kyushu — everything included, no surprises" — <span class="proof-name">Thomas K., Germany</span></span>'],

    // JAF Translation Link
    ['Apply for JAF Translation Online →', '<span data-i18n="license.apply_jaf">Apply for JAF Translation Online →</span>'],

    // Route
    ['<span class="rent-badge">🗺️ Suggested Route</span>', '<span class="rent-badge">🗺️ <span data-i18n="route.badge">Suggested Route</span></span>'],
    ['<h2>Your 7-Day Kyushu Road Trip</h2>', '<h2 data-i18n="route.title">Your 7-Day Kyushu Road Trip</h2>'],
    ['<p>A recommended route from Fukuoka — fully customizable to your interests</p>', '<p data-i18n="route.subtitle">A recommended route from Fukuoka — fully customizable to your interests</p>'],
    ['<div class="journey-day-title">Fukuoka → Aso</div>', '<div class="journey-day-title" data-i18n="route.d1.title">Fukuoka → Aso</div>'],
    ['<div class="journey-day-desc">Drive through the countryside to the world’s largest volcanic caldera. Wake up to misty grasslands and wild horses at Kusasenri.</div>', '<div class="journey-day-desc" data-i18n="route.d1.desc">Drive through the countryside to the world’s largest volcanic caldera. Wake up to misty grasslands and wild horses at Kusasenri.</div>'],
    ['<span class="journey-highlight">🌋 Daikanbo Viewpoint</span>', '<span class="journey-highlight">🌋 <span data-i18n="route.d1.h1">Daikanbo Viewpoint</span></span>'],
    ['<span class="journey-highlight">🌿 Kusasenri Grassland</span>', '<span class="journey-highlight">🌿 <span data-i18n="route.d1.h2">Kusasenri Grassland</span></span>'],
    ['<span class="journey-highlight">♨️ Kurokawa Onsen</span>', '<span class="journey-highlight">♨️ <span data-i18n="route.d1.h3">Kurokawa Onsen</span></span>'],

    ['<div class="journey-day-title">Aso → Beppu</div>', '<div class="journey-day-title" data-i18n="route.d3.title">Aso → Beppu</div>'],
    ['<div class="journey-day-desc">Head to Japan’s onsen capital. Soak in steaming hot springs, explore the “Hells of Beppu,” and eat local jigoku-mushi (steam-cooked) cuisine.</div>', '<div class="journey-day-desc" data-i18n="route.d3.desc">Head to Japan’s onsen capital. Soak in steaming hot springs, explore the “Hells of Beppu,” and eat local jigoku-mushi (steam-cooked) cuisine.</div>'],
    ['<span class="journey-highlight">♨️ Hyotan Onsen</span>', '<span class="journey-highlight">♨️ <span data-i18n="route.d3.h1">Hyotan Onsen</span></span>'],
    ['<span class="journey-highlight">🔥 Jigoku Meguri</span>', '<span class="journey-highlight">🔥 <span data-i18n="route.d3.h2">Jigoku Meguri</span></span>'],
    ['<span class="journey-highlight">🍜 Jigoku-mushi</span>', '<span class="journey-highlight">🍜 <span data-i18n="route.d3.h3">Jigoku-mushi</span></span>'],

    ['<div class="journey-day-title">Beppu → Takachiho</div>', '<div class="journey-day-title" data-i18n="route.d5.title">Beppu → Takachiho</div>'],
    ['<div class="journey-day-desc">Discover the mythical gorge where Japanese gods are said to have descended. Rent a boat and drift beneath the 17m Manai Falls.</div>', '<div class="journey-day-desc" data-i18n="route.d5.desc">Discover the mythical gorge where Japanese gods are said to have descended. Rent a boat and drift beneath the 17m Manai Falls.</div>'],
    ['<span class="journey-highlight">⛩️ Takachiho Gorge</span>', '<span class="journey-highlight">⛩️ <span data-i18n="route.d5.h1">Takachiho Gorge</span></span>'],
    ['<span class="journey-highlight">⚩️ Amano Iwato Shrine</span>', '<span class="journey-highlight">⚩️ <span data-i18n="route.d5.h2">Amano Iwato Shrine</span></span>'],
    ['<span class="journey-highlight">🎭 Yokagura Dance</span>', '<span class="journey-highlight">🎭 <span data-i18n="route.d5.h3">Yokagura Dance</span></span>'],

    ['<div class="journey-day-title">Takachiho → Itoshima</div>', '<div class="journey-day-title" data-i18n="route.d6.title">Takachiho → Itoshima</div>'],
    ['<div class="journey-day-desc">Wind through mountain roads back to the coast. End the day watching the sunset at Sakurai Futamigaura with its iconic torii gate and sea rocks.</div>', '<div class="journey-day-desc" data-i18n="route.d6.desc">Wind through mountain roads back to the coast. End the day watching the sunset at Sakurai Futamigaura with its iconic torii gate and sea rocks.</div>'],
    ['<span class="journey-highlight">🌅 Futamigaura Sunset</span>', '<span class="journey-highlight">🌅 <span data-i18n="route.d6.h1">Futamigaura Sunset</span></span>'],
    ['<span class="journey-highlight">🌴 Beach Cafes</span>', '<span class="journey-highlight">🌴 <span data-i18n="route.d6.h2">Beach Cafes</span></span>'],
    ['<span class="journey-highlight">🍵 Local Crafts</span>', '<span class="journey-highlight">🍵 <span data-i18n="route.d6.h3">Local Crafts</span></span>'],

    ['<div class="journey-day-title">Itoshima → Fukuoka</div>', '<div class="journey-day-title" data-i18n="route.d7.title">Itoshima → Fukuoka</div>'],
    ['<div class="journey-day-desc">A short 40-minute drive back to base. Drop off the van, grab a bowl of Hakata tonkotsu ramen, and catch your flight home.</div>', '<div class="journey-day-desc" data-i18n="route.d7.desc">A short 40-minute drive back to base. Drop off the van, grab a bowl of Hakata tonkotsu ramen, and catch your flight home.</div>'],
    ['<span class="journey-highlight">🍜 Hakata Ramen</span>', '<span class="journey-highlight">🍜 <span data-i18n="route.d7.h1">Hakata Ramen</span></span>'],
    ['<span class="journey-highlight">✈️ 10 min to Airport</span>', '<span class="journey-highlight">✈️ <span data-i18n="route.d7.h2">10 min to Airport</span></span>'],
    ['💬 Plan Your Custom Route', '💬 <span data-i18n="route.cta">Plan Your Custom Route</span>'],

    // Footer
    ['<p>A travel blog featuring road trips & van life in Japan. Real stories, practical tips, and campervan\n                    rental in Fukuoka.</p>', '<p data-i18n="footer.desc">A travel blog featuring road trips & van life in Japan. Real stories, practical tips, and campervan rental in Fukuoka.</p>'],
    ['<h4>Explore</h4>', '<h4 data-i18n="footer.explore">Explore</h4>'],
    ['<a href="/posts/best-scenic-drives-kyushu/">Scenic Drives</a>', '<a href="/posts/best-scenic-drives-kyushu/" data-i18n="footer.scenic">Scenic Drives</a>'],
    ['<a href="/posts/kyushu-road-trip-7-days/">7-Day Itinerary</a>', '<a href="/posts/kyushu-road-trip-7-days/" data-i18n="footer.itinerary">7-Day Itinerary</a>'],
    ['<h4>Rental</h4>', '<h4 data-i18n="footer.rental">Rental</h4>'],
    ['<a href="/rent/">Overview</a>', '<a href="/rent/" data-i18n="footer.overview">Overview</a>'],
    ['<a href="/rent/#vehicles">Vehicles</a>', '<a href="/rent/#vehicles" data-i18n="footer.vehicles">Vehicles</a>'],
    ['<a href="/rent/#pricing">Pricing</a>', '<a href="/rent/#pricing" data-i18n="footer.pricing">Pricing</a>'],
    ['<a href="/rent/#faq">FAQ</a>', '<a href="/rent/#faq" data-i18n="footer.faq">FAQ</a>'],
    ['<h4>About</h4>', '<h4 data-i18n="footer.about">About</h4>'],
    ['<a href="/privacy/">Privacy Policy</a>', '<a href="/privacy/" data-i18n="footer.privacy">Privacy Policy</a>'],
    ['<h4>Related Services</h4>', '<h4 data-i18n="footer.related">Related Services</h4>'],
    ['<span>© 2026 VanTripJapan. Operated by <a href="https://www.camjyo.com/" target="_blank" style="color:inherit;text-decoration:underline;">キャンプ女子株式会社</a>. All rights reserved.</span>', '<span data-i18n="footer.rights">© 2026 VanTripJapan. Operated by <a href="https://www.camjyo.com/" target="_blank" style="color:inherit;text-decoration:underline;">キャンプ女子株式会社</a>. All rights reserved.</span>']
];

let changedCount = 0;
for (const [search, replace] of replacements) {
    if (content.includes(search)) {
        content = content.replace(search, replace);
        changedCount++;
    } else {
        console.log("Could not find:", search);
    }
}

fs.writeFileSync(file, content, 'utf8');
console.log(`Updated ${changedCount} out of ${replacements.length} items in ${file}`);
