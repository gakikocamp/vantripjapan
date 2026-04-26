import json
import urllib.request
import urllib.error

url = "https://www.camjyo.com/api/articles"
api_key = "77ed1a5cd427c9091da77bc73fbfaef6a07db97f4328019067f9fade72ae0155"

body = """<p>福岡から九州の大自然へ！VanTripJapanのレンタカーでは、お客様の旅のスタイルに合わせて2つの車両をご用意しています。今回はそれぞれの車両の特徴、メリット・デメリット、そして「こんな方におすすめ！」をご紹介します。</p>

<h2>1. トヨタ・プロボックス（ルーフテント仕様）</h2>
<img src="/images/rent/vehicles/probox.png" alt="Toyota Probox Campervan" style="width:100%; border-radius:12px; margin:20px 0;">
<p>日本で最も有名で信頼される商用バン「トヨタ・プロボックス」をベースにした、アウトドア仕様の車両です。ルーフ（屋根）の上にテントが展開でき、秘密基地のようなワクワク感を味わえます。</p>

<h3>メリット</h3>
<ul>
    <li><strong>燃費が抜群に良い：</strong> 長距離ドライブが多い九州旅行でもガソリン代を安く抑えられます。</li>
    <li><strong>コマ割りがきく：</strong> 普通乗用車と同じ感覚で運転できるため、細い山道や初めての左側通行でも安心です。</li>
    <li><strong>ルーフテントの解放感：</strong> 高い位置からの景色を楽しめ、風通しも抜群です。</li>
</ul>

<h3>デメリット</h3>
<ul>
    <li>車内空間はコンパクトなので、大きなスーツケースを複数積むと少し手狭になります。</li>
    <li>テントの展開・収納に少し手間（数分程度）が必要です。</li>
</ul>

<h3>こんな方におすすめ！</h3>
<ul>
    <li>運転にあまり自信がない方や、日本での運転が初めての方</li>
    <li>ガソリン代など、旅のコストを抑えたい方</li>
    <li>キャンプらしいワクワク感を楽しみたいカップルや友人同士</li>
</ul>

<h2>2. マツダ・ボンゴブローニイ（車中泊特化・ロングタイプ）</h2>
<img src="/images/rent/vehicles/bongo.png" alt="Mazda Bongo Brawny" style="width:100%; border-radius:12px; margin:20px 0;">
<p>広々とした車内空間が魅力の「ボンゴブローニイ」。珍しいロングタイプのボディを採用しており、後部座席がそのまま広大なベッドルームになります。</p>

<h3>メリット</h3>
<ul>
    <li><strong>とにかく広々！車中泊が快適：</strong> 大人2名が足を伸ばしてゆったり眠れるベッドを完備。</li>
    <li><strong>荷物の心配ゼロ：</strong> ロングタイプなので、ベッドを展開したままでもベッド下に巨大な収納スペースがあります。お土産をたくさん買っても全く問題ありません！</li>
    <li><strong>天候に左右されない：</strong> 車内で完結するため、雨の日や風の強い日でも快適に過ごせます。</li>
</ul>

<h3>デメリット</h3>
<ul>
    <li>車体が長く大きいため、狭い駐車場や細い道での運転には少し注意が必要です。</li>
    <li>プロボックスと比較すると燃費は少し劣ります。</li>
</ul>

<h3>こんな方におすすめ！</h3>
<ul>
    <li>長期間の旅行で、荷物やお土産が多い方</li>
    <li>テントの設営なしで、疲れたらすぐにベッドで眠りたい方</li>
    <li>車内でゆっくり食事もしたい方</li>
</ul>

<p>あなたの旅のスタイルに合わせて、最高の1台をお選びください！</p>"""

data = {
  "site": "camjyo",
  "type": "magazine",
  "slug": "vantrip-vehicles-guide",
  "title": "【車両ガイド】プロボックスとボンゴ、あなたに合うキャンピングカーはどっち？",
  "excerpt": "VanTripJapanが提供する2種類の車両「トヨタ・プロボックス（ルーフテント）」と「マツダ・ボンゴブローニイ（ロングタイプ）」の特徴やメリット・デメリットを徹底解説！",
  "body": body,
  "cover_image": "https://vantripjapan.jp/images/rent/hero/bongo_edit1.png",
  "category": "マガジン",
  "author": "キャンプ女子株式会社",
  "published_at": "2026-04-23",
  "status": "published"
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={
    'X-CMS-API-Key': api_key,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

try:
    with urllib.request.urlopen(req) as response:
        print("Success:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode())
except Exception as e:
    print("Error:", e)
