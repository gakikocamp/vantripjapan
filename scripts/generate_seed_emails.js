const fs = require('fs');
const path = require('path');

const emails = [
  // Email 1
  {
    step: 1,
    delay_days: 2,
    en: {
      subject: "📥 Your Kyushu Road Trip Guide is inside! + A quick hello from Karen",
      body: `Hi {Name},

I'm so glad you decided to download our Kyushu guide! You can save and read the PDF directly from the link below:

👉 [Download the Kyushu Guide (PDF)](https://vantripjapan.jp/downloads/kyushu-road-trip-guide.pdf)

I hope it helps you plan an amazing adventure. Before you dive into the maps and hidden hot springs, let me quickly introduce myself.

I'm Karen, and along with my husband, we run VanTripJapan here in Fukuoka. We aren't a massive car rental corporation with scripts and call centers. We are just a couple who loves vanlife and built these campervans by hand so you can experience the real, rural Japan that trains can't reach.

In the next few days, I’ll share some of our favorite local secrets with you—like how to find free overnight parking, tattoo-friendly onsens, and the best places to buy A5 Wagyu to cook in your van.

If you have any questions about driving in Japan, just reply to this email or send me a message on WhatsApp. I reply personally!

Speak soon,

Karen
VanTripJapan Team`
    },
    ja: {
      subject: "📥 九州ロードトリップガイドをお届けします！＋Karenからのご挨拶",
      body: `{Name} 様

こんにちは、VanTripJapanのKarenです。
九州のガイドブックをダウンロードいただき、本当にありがとうございます！

こちらのリンクからPDFを保存してご覧いただけます：

👉 [九州ガイドをダウンロード (PDF)](https://vantripjapan.jp/downloads/kyushu-road-trip-guide.pdf)

少しでも旅の計画の参考になれば嬉しいです。さて、地図や隠れた温泉情報を見る前に、少しだけ自己紹介をさせてください。

私はKarenです。夫と一緒に、ここ福岡でVanTripJapanを運営しています。私たちは、マニュアルやコールセンターがあるような大企業ではありません。バンライフを愛し、電車では行けない「本物の田舎の日本」を体験してほしくて、キャンピングカーを手作りした夫婦です。

これから数日間にわたって、無料の車中泊スポットの探し方、タトゥーOKな温泉、車内で調理する A5 和牛の美味しい買い方など、地元の秘密を少しずつシェアしていきますね。

日本での運転について気になることがあれば、このメールに返信するか、WhatsAppで気軽に話しかけてください。私が直接お返事します！

それでは、また。

Karen
VanTripJapan チーム`
    }
  },
  // Email 2
  {
    step: 2,
    delay_days: 3,
    en: {
      subject: "Campervan vs. Trains: The reality of traveling Japan",
      body: `Hi {Name},

Most people who visit Japan follow the exact same route: Tokyo to Kyoto on a crowded Shinkansen (bullet train), carrying heavy luggage, and staying in tiny, expensive hotel rooms.

It’s a beautiful trip, but it can feel like a rush from one crowded tourist spot to another.

Now, imagine this instead:
Waking up to the cool mountain air overlooking **Mount Aso** (the world's largest active volcanic caldera). There are no train timetables to check, no hotels to check out of by 10 AM, and no luggage to drag.

You drive down a quiet coastal road, pull over at a local farmer's market to buy fresh strawberries and local pork, and park at a *Michi-no-Eki* (roadside station) with a natural hot spring next to it.

That is the magic of traveling Kyushu by campervan. It’s slow, it’s authentic, and it's 100% on your own schedule.

Here are 3 routes our guests love:
👉 [Kyushu 7-Day Scenic Itinerary](https://vantripjapan.jp/posts/kyushu-road-trip-7-days/)

Have you started planning your travel dates yet?

Karen
VanTripJapan`
    },
    ja: {
      subject: "キャンピングカー vs 電車：日本旅行のリアル",
      body: `{Name} 様

日本を訪れる多くの旅行者が、全く同じルートをたどります。東京から京都へ、混雑した新幹線に乗り、重い荷物を引きずり、狭くて高いホテルに泊まるルートです。

それも素晴らしい旅ですが、混雑した観光地から観光地へと急がされているように感じることもあります。

では、代わりにこんな旅を想像してみてください。
世界最大級の活火山カルデラである**阿蘇山**を見下ろす涼しい山の中、鳥の声で目覚める朝。調べるべき電車の時刻表はなく、朝10時までのチェックアウトも不要で、引きずる荷物もありません。

静かな海岸沿いの道路を走り、地元の直売所に立ち寄って新鮮なイチゴや地元の豚肉を買い、隣に天然温泉がある「道の駅」で車中泊をする。

これこそが、キャンピングカーで巡る九州の魅力です。ゆっくりと、本物で、100%あなただけのスケジュールで進みます。

私たちのゲストに人気の3ルートを紹介します：
👉 [九州7日間絶景ルート](https://vantripjapan.jp/posts/kyushu-road-trip-7-days/)

旅行の日程はもう決まりつつありますか？

Karen
VanTripJapan`
    }
  },
  // Email 3
  {
    step: 3,
    delay_days: 3,
    en: {
      subject: "Is it hard to drive in Japan? (Plus a €100 gift for you)",
      body: `Hi {Name},

One of the most common questions I get is: *"Is it safe and easy to drive in Japan as a foreigner?"*

The honest answer is **yes, highly safe**. Japanese drivers are incredibly polite, roads are in perfect condition, and signs are in English. Also, our vans are specifically chosen to be narrow and compact—so you can easily navigate winding roads and narrow mountain passes without stress.

The only real "hassle" is the paperwork.
Depending on your country, you need either an International Driving Permit (IDP) or an official JAF Japanese Translation (required for France, Germany, Switzerland, Belgium, and Taiwan).

To make your trip completely stress-free, **we will help you get your translation done through our official service, JDLTC.**

Even better: **If you book a campervan with us, we will deduct €100 (approx. ¥16,000) from your rental fee.** Since a translation costs about €100, this makes your translation **completely free**!

Check your license requirement here:
👉 [Can You Drive in Japan? License Guide](https://vantripjapan.jp/posts/can-foreigners-drive-in-japan/)

If you need JAF translation assistance, just let me know. We handle the paperwork so you can focus on the adventure.

Warmly,

Karen
VanTripJapan`
    },
    ja: {
      subject: "日本での運転は難しい？（＋100ユーロ還元のプレゼント）",
      body: `{Name} 様

よくこんな質問をいただきます。「外国人にとって、日本での運転は安全で簡単ですか？」

正直にお答えすると、**「はい、非常に安全です」**。日本のドライバーは非常に礼儀正しく、道路は整備されており、標識には英語が併記されています。さらに、私たちの車は「車幅が狭くてコンパクトなモデル」を選んでいるため、山道や細い道でもストレスなく運転できます。

唯一の面倒な点は「書類の手続き」です。
国によって、国際免許証（IDP）が必要な場合と、公式の日文翻訳（JAF翻訳。フランス、ドイツ、スイス、ベルギー、台湾で必須）が必要な場合があります。

あなたの旅行を完全にストレスフリーにするため、**私たちの公式サービス「JDLTC」を通して、翻訳の取得をお手伝いします。**

さらに嬉しい特典として、**キャンピングカーをご予約いただいた場合、レンタル料金から100ユーロ（約16,000円）を値引きします。** 翻訳費用は約100ユーロですので、実質的に翻訳代が**完全無料**になる非常にお得なキャンペーンです！

免許の要件はこちらからご確認いただけます：
👉 [日本で運転できる？免許ガイド](https://vantripjapan.jp/posts/can-foreigners-drive-in-japan/)

翻訳の手配が必要でしたら、いつでも声をかけてくださいね。私たちが面倒な書類処理を引き受けます。

Karen
VanTripJapan`
    }
  },
  // Email 4
  {
    step: 4,
    delay_days: 3,
    en: {
      subject: "3 things tourists miss out on in Kyushu (Lonely Planet won't tell you)",
      body: `Hi {Name},

Since you are planning a trip to Kyushu, I want to share 3 local secrets that will make your road trip unforgettable:

**1. The "Michi-no-Eki" Secret**
Japan has over 1,200 "Roadside Stations" (Michi-no-Eki). They aren't just rest stops; they are local hubs selling fresh local beef, seafood, and vegetables. Most importantly, it is socially accepted and safe to park and sleep overnight in them for free. Many even have hot spring baths (onsens) next to them!

**2. The Tattoo-Friendly Hot Spring Map**
Getting into an onsen with tattoos can be stressful in Japan. Kyushu is the onsen capital of Japan, and we have curated a private list of beautiful, traditional hot springs that are 100% tattoo-friendly (including private family baths).

**3. Camping in the Wild Caldera**
Camping inside the caldera of Mount Aso is a mystical experience. Waking up surrounded by ancient volcanic crater walls is something you will never experience from a hotel window.

We include our **complete local spot map** (Google Maps format) with every rental, so you have these secrets saved on your phone during your drive.

If you want to check if a specific spot is on your route, just send me your draft itinerary. I'd love to take a look and give you feedback!

Karen
VanTripJapan`
    },
    ja: {
      subject: "観光客が知らない九州の3つの秘密（ガイドブックには載っていません）",
      body: `{Name} 様

九州旅行を計画されているあなたに、ロードトリップを一生の思い出にするための3つの地元の秘密をシェアします。

**1. 「道の駅」のヒミツ**
日本には1,200以上の「道の駅」があります。単なる休憩所ではなく、地元の牛肉や魚、野菜が手に入る直売所です。そして何より、ここで安全に無料で車中泊をすることが可能です（マナーを守れば、一部の道の駅以外では容認されています）。温泉が隣接している道の駅もたくさんあります！

**2. タトゥーOKの温泉マップ**
日本ではタトゥーがあると温泉に入るのが難しいことがあります。しかし、温泉天国である九州には、タトゥーが入っていても100%問題なく入れる伝統的な美しい温泉（家族風呂・貸切風呂含む）がいくつもあります。私たちはそのプライベートリストを用意しています。

**3. 巨大カルデラでのキャンプ**
阿蘇山のカルデラ内でキャンプをするのは神秘的な体験です。太古の火口壁に囲まれて目覚める朝は、ホテルの窓からは絶対に味わえません。

私たちのキャンピングカーをご利用いただく方には、これらの秘密スポットがすべて入った**「ローカルマップ（Googleマップ版）」**を差し上げています。

もし「このルートに行きたいんだけど大丈夫？」というのがあれば、予定しているルートを送ってください。アドバイスさせていただきます！

Karen
VanTripJapan`
    }
  },
  // Email 5
  {
    step: 5,
    delay_days: 0,
    en: {
      subject: "Our fleet is small. Let’s lock in your Kyushu dates!",
      body: `Hi {Name},

If you are thinking about renting a van for your Japan trip, I wanted to give you a quick, friendly heads-up.

Because we handbuild and personally maintain our campervans (to ensure the highest safety and cleanliness), **our fleet is very small—we only have a few select vehicles.**

During the peak travel seasons (Spring Cherry Blossoms, Autumn Foliage, and Summer holidays), our vans get booked out months in advance.

I would hate for you to miss out on the freedom of exploring Kyushu.

**Here is how to secure your trip:**
1. You don't need to pay anything yet.
2. Just send me your preferred dates on WhatsApp.
3. We will check availability and hold the vehicle for you.

Plus, don't forget you get the **€100 JDLTC discount** if you need a license translation!

Let's make this trip happen. Tap below to chat with me on WhatsApp:

👉 [Chat with Karen on WhatsApp](https://wa.me/817093757129?text=Hi%20Karen!%20I'm%20planning%20a%20Kyushu%20trip%20and%20want%20to%20check%20availability.)

(Prefer email? You can also request via our [Simple Form](https://vantripjapan.jp/book/)).

I look forward to hosting you in Japan!

Karen
VanTripJapan`
    },
    ja: {
      subject: "車両数には限りがあります。九州旅行の日程を確保しましょう！",
      body: `{Name} 様

日本旅行でのキャンピングカーレンタルをご検討中のあなたに、少しだけ大切なご案内です。

私たちは最高水準 of 安全と清潔さを保つため、自分たちの手で車両を作り、メンテナンスしています。そのため、**私たちのフリートは非常に小さく、数台の特別な車両しかありません。**

特に旅行のピークシーズン（春の桜、秋の紅葉、夏のバカンス期）は、何ヶ月も前から予約で埋まってしまいます。

ぜひ、九州を自由に旅するチャンスを逃さないでいただきたいです。

**旅を確定させるためのステップ：**
1. 現時点でお支払いは一切不要です。
2. 希望する日程をWhatsAppで送ってください。
3. 空き状況を確認し、車両をお取り置きします。

運転免許の翻訳が必要な方は、**100ユーロのJDLTC割引**も適用されますのでお忘れなく！

あなたの素晴らしい旅を実現させましょう。以下のリンクからWhatsAppでチャットを始められます：

👉 [WhatsAppでKarenにチャットを送る](https://wa.me/817093757129?text=Hi%20Karen!%20I'm%20planning%20a%20Kyushu%20trip%20and%20want%20to%20check%20availability.)

（メールフォームがご希望ですか？こちらの[簡易フォーム](https://vantripjapan.jp/book/)からもリクエストできます）。

日本であなたをお迎えできるのを楽しみにしています！

Karen
VanTripJapan`
    }
  }
];

function wrapEmail(bodyText, lang) {
  // Convert text markdown links [Text](URL) into html links
  let html = bodyText
    .trim()
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #4b6b94; text-decoration: underline; font-weight: bold;">$1</a>');

  // Convert paragraphs
  html = html
    .split('\n\n')
    .map(para => {
      // If it starts with 👉, style it a bit differently or indent it
      if (para.startsWith('👉')) {
        return `<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; padding-left: 8px; border-left: 3px solid #4b6b94;">${para.replace(/\n/g, '<br>')}</p>`;
      }
      return `<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #333333;">${para.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  // Add the footer
  let footer = '';
  if (lang === 'ja') {
    footer = `
<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 30px 0;">
<p style="margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #666666; font-weight: bold;">
  VanTripJapan （株式会社キャンジョ）
</p>
<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #666666;">
  福岡ベース：福岡市東区箱崎（福岡空港から10分）<br>
  公式サイト： <a href="https://vantripjapan.jp" style="color: #4b6b94; text-decoration: underline;">vantripjapan.jp</a> | 
  WhatsApp： <a href="https://wa.me/817093757129" style="color: #4b6b94; text-decoration: underline;">+81 70-9375-7129</a>
</p>
<p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #999999;">
  メール配信の停止を希望される場合は、<a href="{{UnsubscribeURL}}" style="color: #999999; text-decoration: underline;">こちらから配信解除</a>してください。
</p>`;
  } else {
    footer = `
<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 30px 0;">
<p style="margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #666666; font-weight: bold;">
  VanTripJapan
</p>
<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #666666;">
  Hakozaki Base: Fukuoka City, Japan (10 mins from Airport)<br>
  Website: <a href="https://vantripjapan.jp" style="color: #4b6b94; text-decoration: underline;">vantripjapan.jp</a> | 
  WhatsApp: <a href="https://wa.me/817093757129" style="color: #4b6b94; text-decoration: underline;">+81 70-9375-7129</a>
</p>
<p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #999999;">
  If you no longer wish to receive these emails, you can <a href="{{UnsubscribeURL}}" style="color: #999999; text-decoration: underline;">unsubscribe here</a>.
</p>`;
  }

  return `${html}${footer}`;
}

// Generate SQL
let sql = `-- Seed email templates for drip campaign\n`;
sql += `DELETE FROM email_templates;\n\n`;

const languages = ['en', 'ja', 'fr', 'de', 'zh', 'he'];

for (const email of emails) {
  for (const lang of languages) {
    let subject, body;
    // Fallback to 'en' if language copy doesn't exist
    if (lang === 'ja' && email.ja) {
      subject = email.ja.subject;
      body = wrapEmail(email.ja.body, 'ja');
    } else {
      subject = email.en.subject;
      body = wrapEmail(email.en.body, 'en');
    }

    // Escape SQL single quotes
    const escapedSubject = subject.replace(/'/g, "''");
    const escapedBody = body.replace(/'/g, "''");

    sql += `INSERT OR REPLACE INTO email_templates (step, language, subject, body_html, delay_days) VALUES (${email.step}, '${lang}', '${escapedSubject}', '${escapedBody}', ${email.delay_days});\n`;
  }
}

fs.writeFileSync(path.join(__dirname, '../migrations/seed_email_templates.sql'), sql);
console.log('✅ SQL seed file generated successfully!');
