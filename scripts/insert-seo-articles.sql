-- VanTripJapan SEO Articles — 2026-04-13
-- Run with: npx wrangler d1 execute camjyo-cms --file=scripts/insert-seo-articles.sql --remote

-- ═══════════════════════════════════════════════════════════
-- Article 1: Best Scenic Drives in Kyushu
-- ═══════════════════════════════════════════════════════════

INSERT INTO articles (id, slug, title, excerpt, body, cover_image, category, published_at, created_at, updated_at, site, status, author, type, tags)
VALUES (
  lower(hex(randomblob(16))),
  'best-scenic-drives-kyushu',
  'Best Scenic Drives in Kyushu for Foreign Visitors',
  'From volcanic highland roads to dramatic coastal cliffs, Kyushu offers some of Japan''s most spectacular driving routes — and most of them are tourist-free. Here are 8 drives you won''t forget.',
  '<p>Kyushu is a driver''s paradise. Unlike the congested highways of Honshu, this southern island offers wide, well-maintained roads that wind through volcanic calderas, along rugged coastlines, and past ancient shrines — often with barely another car in sight.</p>

<p>Whether you''re behind the wheel of a campervan or a compact rental, these 8 scenic drives will make your Kyushu road trip unforgettable.</p>

<h2>1. Yamanami Highway (やまなみハイウェイ) — The Crown Jewel</h2>
<p><strong>Route:</strong> Beppu → Aso (50 km, ~1.5 hours)<br>
<strong>Best season:</strong> April–November</p>
<p>Often called Japan''s most beautiful mountain road, Yamanami Highway cuts through the heart of Kyushu''s volcanic highlands. You''ll drive past the Kuju Mountain Range, rolling grasslands dotted with grazing cattle, and steaming hot spring villages. The road rises to over 1,300 meters, offering panoramic views that rival the Swiss Alps — but with onsen at every turn.</p>
<p><strong>Campervan tip:</strong> Stop at Chojabaru Visitor Center for a short hike through the Tadewara Marshlands. Free parking, beautiful boardwalk trail.</p>

<h2>2. Aso Milk Road (ミルクロード) — Above the Clouds</h2>
<p><strong>Route:</strong> Daikanbo Lookout → Uchimaki (25 km, ~40 min)<br>
<strong>Best season:</strong> Year-round (early morning for sea of clouds)</p>
<p>This ridge-top road runs along the outer rim of the Aso caldera — one of the largest volcanic calderas on Earth. On clear mornings, the entire caldera fills with cloud, and you''re driving above it. The Daikanbo lookout offers a 360-degree view of the five peaks of Mount Aso.</p>
<p><strong>Campervan tip:</strong> Arrive before 7 AM for the best chance of seeing the ''unkai'' (sea of clouds). There''s ample parking at Daikanbo.</p>

<h2>3. Itoshima Coastal Drive (糸島ドライブ) — Fukuoka''s Backyard Beach</h2>
<p><strong>Route:</strong> Fukuoka → Itoshima Peninsula loop (40 km, ~1.5 hours)<br>
<strong>Best season:</strong> Year-round</p>
<p>Just one hour from Fukuoka city, Itoshima feels like a different world. This coastal loop takes you past pristine beaches, photogenic ''Husband and Wife Rocks'' (Meoto Iwa), stylish seaside cafés, and oyster huts in winter. It''s the perfect warm-up drive on your first day.</p>
<p><strong>Campervan tip:</strong> Perfect for Day 1 of your trip — easy roads, beautiful scenery, and plenty of places to stop for fresh seafood. Park at Sakurai Futamigaura for the iconic torii-gate-in-the-sea photo.</p>

<h2>4. Sasebo–Kujukushima Scenic Road (九十九島) — 99 Islands</h2>
<p><strong>Route:</strong> Sasebo → Kujukushima Pearl Sea Resort (15 km, ~30 min)<br>
<strong>Best season:</strong> Year-round</p>
<p>The Kujukushima (literally "99 Islands") archipelago is a cluster of 208 islands scattered across Sasebo Bay. The scenic road and multiple observation decks along the coast offer breathtaking views — especially at sunset, when the islands turn into silhouettes against a golden sky.</p>
<p><strong>Campervan tip:</strong> Tenkaiho Observatory has free parking and the best sunset viewpoint. Combine with Sasebo Burger — the city''s famous American-influenced hamburger.</p>

<h2>5. Takachiho–Hyuga Coastal Route (高千穂〜日向) — Gorge to Ocean</h2>
<p><strong>Route:</strong> Takachiho Gorge → Hyuga Coast (80 km, ~2 hours)<br>
<strong>Best season:</strong> March–November</p>
<p>Start at the mythological Takachiho Gorge — where legend says the gods descended to Earth — then wind your way east through mountain villages to the dramatic Hyuga coastline. The road descends from sacred forests to crashing Pacific waves, passing through some of the most rural and untouched landscapes in Japan.</p>
<p><strong>Campervan tip:</strong> Visit Takachiho Gorge early (before 9 AM) to avoid crowds and secure a parking spot. The gorge boat ride (¥4,100 per boat) is worth it.</p>

<h2>6. Ibusuki Skyline (指宿スカイライン) — Volcano Views</h2>
<p><strong>Route:</strong> Kagoshima → Ibusuki (35 km, ~50 min)<br>
<strong>Best season:</strong> Year-round</p>
<p>This toll-free mountain road offers sweeping views of Kagoshima Bay, Sakurajima volcano, and on clear days, the distant Yakushima island. The road is well-maintained and lightly trafficked — a refreshing alternative to the highway. At the end, Ibusuki''s famous sand baths await.</p>
<p><strong>Campervan tip:</strong> Continue to Ibusuki for the ''sunamushi'' sand bath experience (¥1,100). The Michi-no-Eki Ibusuki is a good overnight spot.</p>

<h2>7. Sakurajima Circumnavigation (桜島一周) — Drive Around a Volcano</h2>
<p><strong>Route:</strong> Sakurajima Port → Full circle (35 km, ~1 hour)<br>
<strong>Best season:</strong> Year-round (check eruption status)</p>
<p>How many places let you drive around an active volcano? Sakurajima is one of Japan''s most active volcanoes, and the ring road circling it offers views of lava fields, buried torii gates, hot foot baths, and — if you''re lucky — small eruptions sending ash plumes into the sky.</p>
<p><strong>Campervan tip:</strong> Take the 15-minute ferry from Kagoshima (¥200, vehicles welcome). The Arimura Lava Observatory has free parking and dramatic views.</p>

<h2>8. Hirado–Ikitsuki Island (平戸・生月島) — Edge of Japan</h2>
<p><strong>Route:</strong> Hirado → Ikitsuki Island (30 km, ~1 hour)<br>
<strong>Best season:</strong> April–October</p>
<p>Hirado is a former Dutch and Portuguese trading post with a fascinating blend of European and Japanese architecture. Cross the bridge to Ikitsuki Island for raw, windswept coastal scenery that feels like the edge of the world. The lighthouse at Oshima is a photographer''s dream.</p>
<p><strong>Campervan tip:</strong> Visit Hirado Castle for views, then cross to Ikitsuki for the sunset. The island has several free parking areas near the coast.</p>

<h2>Driving Tips for Foreign Visitors</h2>
<ul>
<li><strong>Stay left:</strong> Japan drives on the left side of the road. It feels natural after about 30 minutes.</li>
<li><strong>ETC Card:</strong> Get an Electronic Toll Collection card for highway tolls. VanTripJapan rentals include one for free.</li>
<li><strong>Speed limits:</strong> Generally 40–60 km/h on regular roads, 80–100 km/h on highways. Speed cameras are common.</li>
<li><strong>Mountain roads:</strong> Many scenic routes have narrow sections. Pull into passing places when you meet oncoming traffic.</li>
<li><strong>Refueling:</strong> Gas stations are in every town. Many close by 7 PM in rural areas — plan ahead.</li>
<li><strong>Winter driving:</strong> Snow tires may be required December–March on mountain roads (Aso, Kirishima areas).</li>
</ul>

<h2>Ready to Drive Kyushu?</h2>
<p>All of these drives are easily accessible from our Hakozaki base in Fukuoka — just 10 minutes from the airport. Our campervans come with English navigation, an ETC card, and 24/7 support, so you can focus on the scenery.</p>',
  '/images/article-kyushu-roadtrip.png',
  'Guide',
  '2026-04-13',
  datetime('now'),
  datetime('now'),
  'vantrip',
  'published',
  'VanTripJapan',
  'article',
  'scenic drives, kyushu, road trip, driving, campervan'
);


-- ═══════════════════════════════════════════════════════════
-- Article 2: 7-Day Kyushu Road Trip Itinerary
-- ═══════════════════════════════════════════════════════════

INSERT INTO articles (id, slug, title, excerpt, body, cover_image, category, published_at, created_at, updated_at, site, status, author, type, tags)
VALUES (
  lower(hex(randomblob(16))),
  'kyushu-road-trip-7-days',
  'Kyushu Road Trip Itinerary: 7 Days from Fukuoka',
  'The ultimate week-long campervan route around Kyushu — from Fukuoka to volcanic highlands, hidden gorges, coastal roads, and world-class hot springs. Day-by-day breakdown with costs.',
  '<p>Seven days is the sweet spot for a Kyushu road trip. It''s enough time to circle the island, soak in world-class onsen, eat your weight in ramen, and still have time for detours. This itinerary is designed for campervan travelers starting from Fukuoka — but works for any vehicle.</p>

<p><strong>Total distance:</strong> ~850 km<br>
<strong>Estimated fuel cost:</strong> ¥12,000–15,000<br>
<strong>Best seasons:</strong> Spring (March–May) and Autumn (September–November)</p>

<h2>Day 1: Fukuoka → Itoshima (40 km)</h2>
<p><strong>Highlights:</strong> Seaside cafés, Sakurai Futamigaura shrine, sunset beach</p>
<p>Pick up your campervan at our Hakozaki base and head west to Itoshima — Fukuoka''s coastal playground. The drive takes about an hour along the coast, passing through charming fishing villages and past some of the best beaches in northern Kyushu.</p>
<ul>
<li>🏖️ <strong>Morning:</strong> Pick up campervan at Hakozaki (10 min from airport)</li>
<li>📸 <strong>Afternoon:</strong> Drive the Itoshima coastline — stop at Sakurai Futamigaura for the famous torii gate in the sea</li>
<li>🍽️ <strong>Evening:</strong> Fresh seafood at one of Itoshima''s oyster huts (winter) or beach cafés (summer)</li>
<li>🏕️ <strong>Stay:</strong> Beach parking area or campground near Keya-no-Oto (sea cave)</li>
</ul>

<h2>Day 2: Itoshima → Karatsu → Hirado (120 km)</h2>
<p><strong>Highlights:</strong> Karatsu Castle, Yobuko morning squid market, Hirado Dutch heritage</p>
<p>Head northwest along the coast to Karatsu, famous for its pottery and castle with ocean views. Continue to the fishing village of Yobuko (amazing squid!), then cross to Hirado — a former Portuguese and Dutch trading port with a fascinating multicultural history.</p>
<ul>
<li>🏯 <strong>Morning:</strong> Karatsu Castle and Niji-no-Matsubara pine forest</li>
<li>🦑 <strong>Lunch:</strong> Fresh squid at Yobuko Morning Market</li>
<li>⛪ <strong>Afternoon:</strong> Hirado — explore the castle and hidden Christian churches</li>
<li>🏕️ <strong>Stay:</strong> Hirado area parking or drive to Ikitsuki Island for sunset</li>
</ul>

<h2>Day 3: Hirado → Nagasaki → Shimabara (130 km)</h2>
<p><strong>Highlights:</strong> Nagasaki Peace Park, Glover Garden, Shimabara Castle</p>
<p>Drive south to Nagasaki — one of Japan''s most historically significant cities. Spend the afternoon exploring the Peace Park, Glover Garden, and the atmospheric Chinatown. Then continue to Shimabara at the base of Mount Unzen.</p>
<ul>
<li>🕊️ <strong>Morning:</strong> Nagasaki Peace Park and Atomic Bomb Museum</li>
<li>🏘️ <strong>Afternoon:</strong> Glover Garden, Dutch Slope, Chinatown champon noodles</li>
<li>🌋 <strong>Evening:</strong> Drive to Shimabara — stop at Unzen Jigoku (Hell Valley) hot springs</li>
<li>🏕️ <strong>Stay:</strong> Shimabara waterfront parking or campground</li>
</ul>

<h2>Day 4: Shimabara → Kumamoto → Aso (120 km)</h2>
<p><strong>Highlights:</strong> Ferry crossing, Kumamoto Castle, Aso caldera</p>
<p>Take the morning ferry from Shimabara to Kumamoto (30 min, ~¥1,500 with vehicle). Visit the reconstructed Kumamoto Castle, then head into the Aso highlands — one of the most dramatic volcanic landscapes on Earth.</p>
<ul>
<li>⛴️ <strong>Morning:</strong> Ferry Shimabara → Kumamoto (30 min)</li>
<li>🏯 <strong>Midday:</strong> Kumamoto Castle + basashi (horse sashimi) lunch</li>
<li>🌋 <strong>Afternoon:</strong> Drive up to Mount Aso crater (when open) via Aso Panorama Line</li>
<li>🏕️ <strong>Stay:</strong> Camp near Aso — several campgrounds with onsen facilities (¥500–1,500)</li>
</ul>

<h2>Day 5: Aso → Takachiho → Hyuga Coast (130 km)</h2>
<p><strong>Highlights:</strong> Milk Road, Takachiho Gorge, Hyuga coastal scenery</p>
<p>Start with an early morning drive on the Milk Road (see our <a href="/posts/best-scenic-drives-kyushu/">Best Scenic Drives</a> article) for the chance to see the sea of clouds. Then descend to the mythological Takachiho Gorge, and continue east to the Pacific coast.</p>
<ul>
<li>🌅 <strong>Early morning:</strong> Milk Road sunrise / sea of clouds at Daikanbo</li>
<li>⛩️ <strong>Morning:</strong> Takachiho Gorge — boat ride + Amano Iwato Shrine</li>
<li>🛣️ <strong>Afternoon:</strong> Scenic drive through mountain villages to Hyuga coast</li>
<li>🏕️ <strong>Stay:</strong> Hyuga coastal parking or Michi-no-Eki Hyuga</li>
</ul>

<h2>Day 6: Hyuga → Beppu → Yufuin (150 km)</h2>
<p><strong>Highlights:</strong> Beppu hot springs, Yufuin lake village</p>
<p>Drive north along the coast to Beppu — Japan''s hot spring capital. Soak in a sand bath, visit the famous ''hells'' (jigoku), and then head to the elegant mountain village of Yufuin for the night.</p>
<ul>
<li>♨️ <strong>Morning:</strong> Beppu — sand bath at Takegawara (¥1,100), or try a mud bath at Myoban</li>
<li>🔥 <strong>Midday:</strong> Tour the Beppu Hells (¥2,200 combined ticket)</li>
<li>🌿 <strong>Afternoon:</strong> Drive to Yufuin — stroll around Kinrin-ko lake, browse boutiques</li>
<li>🏕️ <strong>Stay:</strong> Yufuin area campground or Michi-no-Eki Yufuin</li>
</ul>

<h2>Day 7: Yufuin → Dazaifu → Fukuoka (120 km)</h2>
<p><strong>Highlights:</strong> Morning onsen, Dazaifu Tenmangu shrine, Hakata ramen</p>
<p>Your final day. Take a morning onsen dip in Yufuin, then drive back toward Fukuoka via Dazaifu — home to one of Japan''s most beautiful Shinto shrines. Return your campervan and celebrate with a bowl of Hakata ramen.</p>
<ul>
<li>♨️ <strong>Morning:</strong> Last onsen soak in Yufuin</li>
<li>⛩️ <strong>Midday:</strong> Dazaifu Tenmangu shrine + umegae mochi (plum rice cake)</li>
<li>🍜 <strong>Afternoon:</strong> Return campervan at Hakozaki, then Hakata ramen farewell dinner</li>
</ul>

<h2>Cost Breakdown (2 People, 7 Days)</h2>
<table>
<thead><tr><th>Item</th><th>Cost</th></tr></thead>
<tbody>
<tr><td>Campervan rental (Probox, 7 days)</td><td>¥115,500</td></tr>
<tr><td>Fuel (~850 km)</td><td>~¥13,000</td></tr>
<tr><td>Highway tolls (ETC)</td><td>~¥8,000</td></tr>
<tr><td>Campgrounds (4 nights × ¥1,000)</td><td>~¥4,000</td></tr>
<tr><td>Food (¥3,000/person/day)</td><td>~¥42,000</td></tr>
<tr><td>Activities (onsen, gorge boat, etc.)</td><td>~¥8,000</td></tr>
<tr><td><strong>Total for 2 people</strong></td><td><strong>~¥190,500</strong></td></tr>
<tr><td><strong>Per person per day</strong></td><td><strong>~¥13,600</strong></td></tr>
</tbody>
</table>
<p><em>Compare: A hotel-based trip covering the same route would cost ¥300,000+ for two, with far less flexibility.</em></p>

<h2>Seasonal Notes</h2>
<ul>
<li><strong>🌸 Spring (Mar–May):</strong> Cherry blossoms + comfortable temperatures. Peak season — book your van early!</li>
<li><strong>☀️ Summer (Jun–Aug):</strong> Hot and humid. Rainy season in June. Great for coastal drives and beach camping.</li>
<li><strong>🍁 Autumn (Sep–Nov):</strong> Our favorite season. Fall foliage transforms Aso and Takachiho into a masterpiece. Mild weather, fewer tourists.</li>
<li><strong>❄️ Winter (Dec–Feb):</strong> Cold but crowd-free. Onsen season! Some mountain roads may require snow tires.</li>
</ul>

<h2>Ready to Go?</h2>
<p>This itinerary works perfectly with our all-inclusive campervan rental from Fukuoka. Pick up at Hakozaki base (10 min from the airport), skip the city traffic, and head straight into Kyushu''s nature.</p>',
  '/images/article-kyushu-5day-itinerary.png',
  'Itinerary',
  '2026-04-13',
  datetime('now'),
  datetime('now'),
  'vantrip',
  'published',
  'VanTripJapan',
  'article',
  '7 days, itinerary, kyushu, road trip, fukuoka, campervan'
);
