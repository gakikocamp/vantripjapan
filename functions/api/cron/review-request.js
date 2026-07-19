/**
 * VanTripJapan — 返却翌日レビュー依頼 Cron Endpoint
 * GET /api/cron/review-request?secret=CRON_SECRET
 *
 * 昨日(JST)が返却日の confirmed/active/completed 予約に、お客様の言語で
 * 「カレンからのお礼＋Googleレビューのお願い」を送る。
 * - 対価の提示なし(Googleクチコミポリシー準拠)
 * - 不満だった場合の受け皿(返信/WhatsApp)を必ず併記 → 低評価の事前吸収
 * - 冪等性: notes.review_request_sent_at で二重送信を防ぐ
 * Karenにも送信一覧を通知(WhatsAppでの個別フォロー用)。
 *
 * レビューリンクは env.GBP_REVIEW_URL(GBP管理画面の「レビューをリクエスト」で
 * 取得する g.page/r/.../review 形式を推奨)。未設定時はマッププロフィールへ。
 */

import { decrypt } from '../_crypto.js';

const FALLBACK_REVIEW_URL = 'https://maps.app.goo.gl/3uuep4h3zypPY6UYA';
const WA = 'https://wa.me/817093757129';

const MAIL = {
  en: (first, vehicle, link) => ({
    subject: `Welcome home, ${first} — a small thank-you from Karen 🚐`,
    body: [
      `Hi ${first},`, ``,
      `It's Karen. I hope you made it home safe and sound!`, ``,
      `I keep wondering — how was Kyushu? Did ${vehicle} treat you well?`,
      `Every time one of our vans heads out, it feels a little like waving off family,`,
      `and I'm always happy when it comes home with new stories.`, ``,
      `May I ask you one small favor?`, ``,
      `VAN TRIP JAPAN is just the two of us — my husband and I — looking after a`,
      `handful of hand-built vans. We don't have a marketing department; new travelers`,
      `only find us when someone like you shares an honest word about their trip.`,
      `Every single review truly helps us keep doing this next year.`, ``,
      `If you have two minutes over a coffee, would you share one memory from your`,
      `trip on Google? Even a single line about your favorite view is more than enough:`, ``,
      `👉 ${link}`, ``,
      `And if anything was less than perfect, please just reply to this email or`,
      `message me on WhatsApp (${WA}) — I read everything, and it helps us improve.`, ``,
      `Thank you for trusting us with your Kyushu adventure.`,
      `The door in Fukuoka is always open for you.`, ``,
      `Warmest wishes,`,
      `Karen & the VanTripJapan family`,
    ],
  }),
  fr: (first, vehicle, link) => ({
    subject: `Bon retour, ${first} — un grand merci de Karen 🚐`,
    body: [
      `Bonjour ${first},`, ``,
      `C'est Karen. J'espère que vous êtes bien rentrés !`, ``,
      `Je me demandais — comment était Kyushu ? Est-ce que ${vehicle} a bien pris soin de vous ?`,
      `Chaque fois qu'un de nos vans part sur la route, c'est un peu comme voir partir`,
      `un membre de la famille, et je suis toujours heureuse quand il revient avec de nouvelles histoires.`, ``,
      `Puis-je vous demander un petit service ?`, ``,
      `VAN TRIP JAPAN, c'est seulement nous deux — mon mari et moi — et quelques vans`,
      `aménagés à la main. Nous n'avons pas de service marketing : les voyageurs ne nous`,
      `trouvent que grâce aux mots sincères de personnes comme vous. Chaque avis nous aide`,
      `réellement à continuer l'année prochaine.`, ``,
      `Si vous avez deux minutes autour d'un café, accepteriez-vous de partager un souvenir`,
      `de votre voyage sur Google ? Même une seule ligne sur votre plus beau paysage suffit :`, ``,
      `👉 ${link}`, ``,
      `Et si quelque chose n'était pas parfait, répondez simplement à cet e-mail ou`,
      `écrivez-moi sur WhatsApp (${WA}) — je lis tout, et cela nous aide à nous améliorer.`, ``,
      `Merci d'avoir confié votre aventure à Kyushu à notre petite entreprise.`,
      `La porte de Fukuoka vous est toujours ouverte.`, ``,
      `Chaleureusement,`,
      `Karen et la famille VanTripJapan`,
    ],
  }),
  de: (first, vehicle, link) => ({
    subject: `Willkommen zu Hause, ${first} — ein Dankeschön von Karen 🚐`,
    body: [
      `Hallo ${first},`, ``,
      `hier ist Karen. Ich hoffe, ihr seid gut nach Hause gekommen!`, ``,
      `Ich frage mich die ganze Zeit — wie war Kyushu? Hat ${vehicle} gut auf euch aufgepasst?`,
      `Jedes Mal, wenn einer unserer Vans losfährt, fühlt es sich an, als würde Familie`,
      `verreisen — und ich freue mich immer, wenn er mit neuen Geschichten zurückkommt.`, ``,
      `Darf ich euch um einen kleinen Gefallen bitten?`, ``,
      `VAN TRIP JAPAN — das sind nur wir zwei, mein Mann und ich, mit einer Handvoll`,
      `selbst ausgebauter Vans. Wir haben keine Marketingabteilung: Neue Reisende finden`,
      `uns nur durch ehrliche Worte von Menschen wie euch. Jede einzelne Bewertung hilft`,
      `uns wirklich, nächstes Jahr weiterzumachen.`, ``,
      `Wenn ihr zwei Minuten bei einem Kaffee habt — würdet ihr eine Erinnerung an eure`,
      `Reise auf Google teilen? Schon eine Zeile über euren schönsten Ausblick genügt:`, ``,
      `👉 ${link}`, ``,
      `Und falls etwas nicht perfekt war, antwortet einfach auf diese E-Mail oder schreibt`,
      `mir auf WhatsApp (${WA}) — ich lese alles, und es hilft uns, besser zu werden.`, ``,
      `Danke, dass ihr euer Kyushu-Abenteuer uns anvertraut habt.`,
      `In Fukuoka steht euch die Tür immer offen.`, ``,
      `Herzliche Grüße,`,
      `Karen & die VanTripJapan-Familie`,
    ],
  }),
  zh: (first, vehicle, link) => ({
    subject: `${first}，歡迎回家 — 來自Karen的小小感謝 🚐`,
    body: [
      `${first} 您好，`, ``,
      `我是Karen。希望您已平安到家！`, ``,
      `我一直很想知道——九州之旅還愉快嗎？${vehicle}有沒有好好照顧您？`,
      `每次目送我們的露營車出發，都像看著家人遠行；`,
      `當它帶著新的故事回來時,我總是特別開心。`, ``,
      `可以拜託您一件小事嗎？`, ``,
      `VAN TRIP JAPAN 只有我們夫妻兩個人，照顧著幾台親手改裝的露營車。`,
      `我們沒有行銷部門——新的旅人能找到我們，全靠像您這樣的旅客`,
      `留下真誠的一句話。每一則評論，都實實在在地幫助我們明年能繼續走下去。`, ``,
      `如果您有兩分鐘，願意在 Google 上分享一段旅途回憶嗎？`,
      `哪怕只寫一句您最喜歡的風景，都已足夠：`, ``,
      `👉 ${link}`, ``,
      `如果旅途中有任何不滿意的地方，請直接回覆這封信，`,
      `或透過 WhatsApp（${WA}）告訴我——我每一封都會讀，這能幫助我們做得更好。`, ``,
      `謝謝您把九州之旅託付給我們。福岡的大門永遠為您敞開。`, ``,
      `Karen 與 VanTripJapan 全家`,
    ],
  }),
  he: (first, vehicle, link) => ({
    subject: `ברוכים השבים, ${first} — תודה קטנה מקארן 🚐`,
    body: [
      `שלום ${first},`, ``,
      `זו קארן. אני מקווה שהגעתם הביתה בשלום!`, ``,
      `כל הזמן תהיתי — איך היה בקיושו? האם ${vehicle} טיפל בכם יפה?`,
      `בכל פעם שאחד הוואנים שלנו יוצא לדרך, זה מרגיש קצת כמו ללוות בן משפחה —`,
      `ואני תמיד שמחה כשהוא חוזר עם סיפורים חדשים.`, ``,
      `אפשר לבקש טובה קטנה?`, ``,
      `VAN TRIP JAPAN זה רק שנינו — בעלי ואני — עם כמה ואנים שבנינו במו ידינו.`,
      `אין לנו מחלקת שיווק: מטיילים חדשים מוצאים אותנו רק בזכות מילה כנה`,
      `של אנשים כמוכם. כל ביקורת באמת עוזרת לנו להמשיך גם בשנה הבאה.`, ``,
      `אם יש לכם שתי דקות עם קפה — תשמחו לשתף זיכרון מהטיול בגוגל?`,
      `אפילו שורה אחת על הנוף האהוב עליכם היא יותר ממספיק:`, ``,
      `👉 ${link}`, ``,
      `ואם משהו לא היה מושלם, פשוט השיבו למייל הזה או כתבו לי בוואטסאפ`,
      `(${WA}) — אני קוראת הכול, וזה עוזר לנו להשתפר.`, ``,
      `תודה שסמכתם עלינו בהרפתקת קיושו שלכם.`,
      `הדלת בפוקואוקה תמיד פתוחה בשבילכם.`, ``,
      `באהבה,`,
      `קארן ומשפחת VanTripJapan`,
    ],
  }),
};

// 言語別の車両フォールバック("the van"相当)
const VEHICLE_FALLBACK = {
  en: 'the van', fr: 'notre van', de: 'unser Van', zh: '我們的露營車', he: 'הוואן שלנו',
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Fail-closed認証(pickup-reminderと同方針)
  const secretParam = url.searchParams.get('secret');
  const authHeader = request.headers.get('Authorization');
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!isLocal) {
    if (!env.CRON_SECRET) {
      return Response.json({ error: 'Cron endpoint not configured (CRON_SECRET missing)' }, { status: 503 });
    }
    const ok = secretParam === env.CRON_SECRET || authHeader === `Bearer ${env.CRON_SECRET}`;
    if (!ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!env.CUSTOMERS_DB || !env.RESEND_API_KEY) {
    return Response.json({ error: 'Missing bindings' }, { status: 500 });
  }

  const reviewLink = env.GBP_REVIEW_URL || FALLBACK_REVIEW_URL;

  // 「昨日」をJSTで算出し、return_datetimeの日付部分と前方一致で比較
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const yesterday = new Date(jstNow.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  const rows = await env.CUSTOMERS_DB.prepare(
    "SELECT id, full_name, email_encrypted, vehicle_type, return_datetime, notes FROM bookings WHERE status IN ('confirmed','active','completed') AND return_datetime LIKE ?"
  ).bind(`${yesterday}%`).all();

  const sent = [];
  const skipped = [];
  for (const b of rows?.results || []) {
    let notes = {};
    try { notes = b.notes ? JSON.parse(b.notes) : {}; } catch { notes = { legacy: b.notes }; }
    if (notes.review_request_sent_at) { skipped.push(b.id); continue; }

    const email = await decrypt(b.email_encrypted, env);
    if (!email || !email.includes('@')) { skipped.push(b.id); continue; }

    const lang = MAIL[notes.lang] ? notes.lang : 'en';
    const first = (b.full_name || '').trim().split(/\s+/)[0] || 'there';
    const vehicle = (b.vehicle_type || '').trim() || VEHICLE_FALLBACK[lang];
    const m = MAIL[lang](first, vehicle, reviewLink);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Karen at VanTripJapan <booking@vantripjapan.jp>',
        reply_to: 'info@vantripjapan.jp',
        to: [email],
        subject: m.subject,
        text: m.body.join('\n'),
      }),
    });
    if (res.ok) {
      notes.review_request_sent_at = new Date().toISOString();
      await env.CUSTOMERS_DB.prepare('UPDATE bookings SET notes = ? WHERE id = ?')
        .bind(JSON.stringify(notes), b.id).run();
      sent.push(b.id);
    } else {
      console.error('[ReviewRequest] Resend failed for booking', b.id, await res.text());
      skipped.push(b.id);
    }
  }

  // Karenへ: レビュー依頼済み一覧(WhatsAppでの個別フォロー推奨)
  if (sent.length > 0) {
    const list = (rows?.results || [])
      .filter((b) => sent.includes(b.id))
      .map((b) => `  • #${b.id} ${b.full_name} — ${b.vehicle_type || ''} (返却: ${b.return_datetime})`)
      .join('\n');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VanTripJapan <booking@vantripjapan.jp>',
        to: ['info@vantripjapan.jp'],
        subject: `⭐ レビュー依頼メール送信 ${sent.length}件 — WhatsAppでひとことフォローすると回収率UP`,
        text: `昨日(${yesterday})返却のお客様にレビュー依頼メールを送信しました。\n\n${list}\n\nWhatsAppで「無事に帰れましたか?😊」と一言添えると、レビュー回収率が大きく上がります。\nレビューが入ったら必ず返信を(返信のあるプロフィール=信頼されます)。\n→ ${reviewLink}`,
      }),
    }).catch((e) => console.error('[ReviewRequest] admin mail', e?.message));
  }

  return Response.json({ status: 'ok', date: yesterday, sent, skipped });
}
