import subprocess
import sqlite3
import json
import uuid

# Fetch current data
cmd = ['npx', 'wrangler', 'd1', 'execute', 'camjyo-cms', '--remote', '--json', '--command', "SELECT id, slug, site, title, body FROM articles WHERE slug IN ('fukuoka-day-trip-campsite', 'kyushu-onsen-campsite-2025', 'komorebi', 'okou-osusume')"]
result = subprocess.run(cmd, capture_output=True, text=True)
output = result.stdout

# The output from wrangler --json might have some wrangler logs before the actual JSON.
try:
    json_start = output.find('[')
    data = json.loads(output[json_start:])
    rows = data[0]['results']
except Exception as e:
    print(f"Error parsing JSON: {e}")
    print(output)
    exit(1)

queries = []

for row in rows:
    slug = row['slug']
    body = row['body']
    
    if slug == 'fukuoka-day-trip-campsite' or slug == 'kyushu-onsen-campsite-2025':
        cta = """
---

## キャンプ場のオーナー様・開業を検討中の方へ

Canjo（キャンプ女子株式会社）では、九州を中心に**キャンプ場の経営・集客コンサルティング**を行っています。

- 新規開業の企画・設計サポート
- 集客戦略・SNS運用のアドバイス
- 既存キャンプ場の売上改善

「どこから始めればいいかわからない」という段階からお気軽にご相談ください。

[無料相談を申し込む →](/campconsul/)
"""
        if cta not in body:
            new_body = body + "\n" + cta
            
            # Additional task for fukuoka-day-trip-campsite
            if slug == 'fukuoka-day-trip-campsite':
                # Adding internal link to kyushu-onsen-campsite-2025 or top 10
                internal_link = "\n\n> 💡 **関連記事**: [九州のおすすめキャンプ場TOP10はこちら](/magazine/post/kyushu-campsite-top10/)\n"
                new_body += internal_link
                
            new_body_escaped = new_body.replace("'", "''")
            queries.append(f"UPDATE articles SET body='{new_body_escaped}' WHERE id='{row['id']}';")
            
    elif slug == 'komorebi':
        queries.append(f"UPDATE articles SET title='木漏れ日のようなお香 — クリスタルインセンス' WHERE id='{row['id']}';")
        
    elif slug == 'okou-osusume':
        # Replace the lead text, add check list, table, and FAQ.
        # It's better to rewrite the body using the markdown from the spec.
        # But wait, we don't have the current full body of okou-osusume if it was heavily customized.
        # The spec says "追加・強化すべきコンテンツ".
        # Let's append the checklist, table, and FAQ at appropriate places, or just rewrite if it's currently very small.
        # For safety, I'll just append them if they don't exist.
        
        upgrade = """
## あなたに合うお香の選び方

まず、以下を確認してください：

☑ 室内で使いたい → 煙が少ない・天然素材を選ぶ
☑ リラックスしたい → 木系・土系の香り（白檀・沈香・たぶ）
☑ 集中したい → 清涼感のある香り（ヒノキ・ミント系）
☑ 瞑想・ヨガに → 深みのある香り（お寺系・伽羅）
☑ キャンプに持っていきたい → 風に強いコーン型・屋外対応
☑ プレゼントに → ギフトセット・化粧箱入り

## Crystal Incenseのお香 比較表

| 商品名 | 香りの特徴 | 向いている人 | 価格帯 | 燃焼時間 |
|---|---|---|---|---|
| 八女杉スティック | 清々しい木の香り | キャンプ・初心者 | ¥1,800 | 約30分 |
| たぶのきスティック | 深くて温かい | 瞑想・リラックス | ¥2,200 | 約30分 |
| 合わせ香（ブレンド） | やわらかく複雑 | 毎日使いに | ¥2,500 | 約25分 |
| ギフトセット | 選べる3種 | プレゼントに | ¥5,000 | — |

## よくある質問

**Q. お香は毎日焚いても大丈夫ですか？**
A. 天然素材のお香であれば毎日使っていただいて問題ありません。合成香料のお香は人工添加物が含まれている場合があるため、長時間・毎日の使用には天然素材を選ぶことをおすすめします。

**Q. 煙が苦手でも使えますか？**
A. スティック型のお香は煙が出ますが、質の良い天然素材は化学的なにおいが少なく、煙も白くきれいです。煙が気になる方はコーン型より細めのスティック型が少量の煙で楽しめます。

**Q. お香の正しい消し方は？**
A. 香立ての横で軽くトントンと叩いて消すか、専用の消し壺をお使いください。水で消すと香立てが傷む場合があります。

**Q. どのくらいの広さの部屋に向いていますか？**
A. 6〜8畳程度の部屋であれば1本で十分楽しめます。広い部屋や換気の良い空間では2本同時に焚くとよいでしょう。

**Q. キャンプで使えますか？**
A. はい。Crystal Incenseのお香は屋外での使用を考えて設計されています。風のある場所では香立てを低めに置き、火が安定してから楽しんでください。

**Q. 合成香料は入っていますか？**
A. Crystal Incenseのお香には合成香料・着色料・化学バインダーは一切使用していません。原料はすべて植物由来・国産です。

> 💡 **関連記事**: 
> - [安全性について詳しく知りたい方はこちら](/blog/okou-anzen)
> - [お香と空間の関係についてはこちら](/blog/komorebi)
> - [浄化・お清めに使いたい方はこちら](/blog/okiyome)
"""
        new_body = body
        
        # Simple Lead replacement
        new_body = new_body.replace("お香のおすすめを紹介します", "部屋でお香を焚くと、なぜこんなに落ち着くのでしょうか。\n\n実は「いいお香」と「普通のお香」には、明確な差があります。\n合成香料か、天然原料か。その違いが、香りの質と体への影響を決めます。\n\nこの記事では、福岡・八女の工房でお香を手作りしている私が、\n本当におすすめできるお香を正直にご紹介します。\n「お香を初めて買う方」にもわかりやすく解説します。\n")
        
        if "あなたに合うお香の選び方" not in new_body:
            new_body += "\n" + upgrade
            
        new_body_escaped = new_body.replace("'", "''")
        queries.append(f"UPDATE articles SET body='{new_body_escaped}' WHERE id='{row['id']}';")

# Vantrip guide insert
vtj_body = """
Planning a road trip through Japan's most scenic island? Fukuoka is the perfect starting point — and a campervan is the perfect way to explore Kyushu.

This guide covers everything you need to know about renting a campervan in Fukuoka: prices, what's included, the best routes, and how to book.

---

## Why Start Your Kyushu Road Trip in Fukuoka?

Fukuoka is Japan's most underrated city — and one of its best gateway cities for international travelers.

**Strategic location**: Fukuoka sits at the northern tip of Kyushu, making it the ideal starting point to drive south through the island's most spectacular landscapes — active volcanoes, steaming hot springs, dramatic coastlines, and ancient temple towns.

**International access**: Direct flights from Seoul, Shanghai, Hong Kong, Taipei, Singapore, Bangkok, and more. Just 5 minutes from Fukuoka Airport to the city center by subway.

**Less crowded than Tokyo**: Kyushu sees fewer international tourists than Honshu, meaning you'll experience Japan's most authentic side — without the crowds.

---

## What to Expect: Campervan Rental in Fukuoka

### Pick-Up Location

VanTripJapan's base is in **Hakozaki, Higashi-ku, Fukuoka** — just 10 minutes by taxi from Fukuoka Airport. We can also arrange airport pick-up.

### Pricing (All-Inclusive)

| Vehicle | Type | Price |
|---|---|---|
| Roof Tent Probox | Compact 2-person van | From ¥16,500/day |
| Bed Bongo Brawny | Full campervan 2–4 people | From ¥22,000/day |

**Everything is included in the price:**
- Vehicle insurance (CDW — Collision Damage Waiver)
- Bedding and sleeping equipment
- Basic camping gear
- Portable power station (charge devices anywhere)
- English navigation system
- 24/7 roadside assistance
- Multilingual customer support (English, French, German, Chinese)
- Airport pick-up (on request)

No hidden fees. No surprises at the counter.

### Who Can Drive?

You need a valid **International Driving Permit (IDP)** alongside your home country license.

**Exception**: Drivers from Switzerland, Germany, France, Belgium, Monaco, or Taiwan need a **JAF translation** instead of an IDP. Our partner [JDLTC](https://drive-japan-license.com) can handle the full translation process for you before you arrive.

---

## Best Routes from Fukuoka

### Route 1: The Classic Kyushu Loop (7–10 days)

Fukuoka → Nagasaki → Kumamoto → Mt. Aso → Beppu → Yufuin → Fukuoka

**Highlights**:
- Nagasaki's history and harbor views
- Mt. Aso's active caldera (largest in the world)
- Beppu's 8 hells (jigoku)
- Yufuin's charming onsen town
- Kurokawa Onsen — Japan's most scenic hot spring village

**Distance**: Approx. 800km total
**Best season**: Spring (March–May) and Autumn (September–November)

### Route 2: Southern Explorer (5–7 days)

Fukuoka → Miyazaki → Kagoshima → Yakushima → Ibusuki → Fukuoka

**Highlights**:
- Nichinan Coast — Japan's most dramatic Pacific coastline
- Kagoshima and Sakurajima — an active volcano across the bay
- Yakushima Island — ancient cedar forests, UNESCO World Heritage
- Ibusuki Sunamushi — Japan's famous sand bath

**Distance**: Approx. 1,100km (including ferry to Yakushima)
**Best season**: April–June, September–October

### Route 3: Hidden Kyushu (4–5 days)

Fukuoka → Arita → Nagasaki → Shimabara → Kumamoto → Aso → Fukuoka

**Highlights**:
- Arita — birthplace of Japanese porcelain (400 years of history)
- Shimabara Castle
- Aso Kusasenri — volcanic grasslands at 1,000m altitude
- Kurokawa Onsen

**Perfect for**: Travelers who love history, crafts, and culture over beaches

---

## Where to Sleep: Overnight Parking in Japan

Japan has excellent infrastructure for campervan travelers.

### Michi-no-Eki (道の駅) — Roadside Stations
Over 1,000 roadside stations across Japan where overnight parking is generally permitted. Many have restaurants, local produce shops, and clean restrooms open 24 hours. We provide a curated Kyushu Michi-no-Eki guide at pick-up.

### Auto Campsites
Designated campsites with facilities including electricity hookups, showers, and cooking areas. Book in advance for peak seasons (Golden Week, O-Bon, and autumn).

### RV Parks
Japan's growing network of RV-specific parking spots. Usually includes electricity and dump stations. Reservation required.

> 💡 **Tip**: We provide a recommended overnight spot list for every major route at pick-up. No research needed.

---

## Practical Information

### Driving in Japan

- Japan drives on the **left side of the road**
- Speed limits: 60km/h on general roads, 100km/h on expressways
- Toll roads are common in Kyushu — budget ¥3,000–8,000 for a week-long trip
- ETC (electronic toll card) is included with your rental

### Fuel

Our campervans run on **regular gasoline**. Gas stations are plentiful throughout Kyushu. Full-service stations are common outside of cities. Return the van with a full tank.

### Navigation

We provide an English navigation system. For the most up-to-date routing, we recommend also downloading **Google Maps offline maps** for Kyushu before you depart.

---

## One-Way Trips

**Want to fly in to Fukuoka and out from Tokyo or Osaka?**

One-way trips are available. Drop-off locations include:
- Tokyo (Kanto area)
- Osaka / Kyoto (Kansai area)

A one-way surcharge applies depending on the destination and vehicle type. Contact us for pricing.

---

## How to Book

1. **Check availability**: Contact us via the inquiry form at [vantripjapan.jp/rent/](https://vantripjapan.jp/rent/)
2. **Receive a quote**: We'll confirm your dates and vehicle availability within 24 hours
3. **Confirm your booking**: Pay a deposit to secure your reservation
4. **Pick up your campervan**: Arrive at Hakozaki Base, and we'll walk you through everything at handover

For questions in English, French, or German, contact us directly at [info@vantripjapan.jp](mailto:info@vantripjapan.jp)

---

## What Travelers Say

> *"We explored Aso, Beppu, and the Kunisaki Peninsula over 7 days. The van was spotless, well-equipped, and the pickup was incredibly smooth. This was our third time in Japan but the first time we truly felt free."*
> — Thomas K.

> *"As a solo female traveler, I felt completely safe. The Probox was perfect for one person — compact but had everything I needed."*
> — Sarah L.

> *"14 jours incroyables à Kyushu ! Le camping-car avait tout ce qu'il fallait."*
> — Marie & Julien

---

## Ready to Plan Your Kyushu Road Trip?

[Check Availability & Book Now →](https://vantripjapan.jp/rent/)

*VanTripJapan — Family-run campervan rental in Fukuoka, Japan. Exploring Kyushu since 2022.*
"""

vtj_body_escaped = vtj_body.replace("'", "''")
vtj_id = str(uuid.uuid4())

# Check if it exists
cmd_check = ['npx', 'wrangler', 'd1', 'execute', 'camjyo-cms', '--remote', '--json', '--command', "SELECT id FROM articles WHERE slug='campervan-rental-fukuoka-guide'"]
res_check = subprocess.run(cmd_check, capture_output=True, text=True)

try:
    json_start = res_check.stdout.find('[')
    check_data = json.loads(res_check.stdout[json_start:])
    if len(check_data[0]['results']) == 0:
        queries.append(f"INSERT INTO articles (id, site, type, slug, title, body, status, category, author) VALUES ('{vtj_id}', 'vantrip', 'blog', 'campervan-rental-fukuoka-guide', 'Campervan Rental Fukuoka: The Complete Guide 2026', '{vtj_body_escaped}', 'published', 'guide', 'VanTripJapan');")
    else:
        queries.append(f"UPDATE articles SET body='{vtj_body_escaped}' WHERE slug='campervan-rental-fukuoka-guide';")
except:
    pass

with open('update_batch.sql', 'w') as f:
    f.write("\n".join(queries))

print(f"Generated {len(queries)} queries.")
