/**
 * VanTripJapan — 前日リマインダー Cron Endpoint
 * GET /api/cron/pickup-reminder?secret=CRON_SECRET
 *
 * 翌日(JST)が取車日の confirmed 予約に、お客様の言語でリマインダーを送る:
 * 受取場所(Googleマップ/博多駅・空港から約10分)・持ち物・
 * 「鍵の開け方は本日中にKarenからWhatsAppで届く」旨。
 * Karenにも対象一覧を通知(鍵写真のWhatsApp送信忘れ防止)。
 * 冪等性: notes.reminder_sent_at を立て、二重送信を防ぐ。
 */

import { decrypt } from '../_crypto.js';

const MAP = 'https://maps.app.goo.gl/Dkb2bSSUM7dWJS7m7';
const WA = 'https://wa.me/817093757129';

const MAIL = {
  en: (first, vehicle, pickup) => ({
    subject: `🚐 Tomorrow's the day! Your VanTripJapan pick-up info`,
    body: [
      `Hi ${first},`, ``,
      `Your Kyushu adventure starts tomorrow! Here's everything for pick-up:`, ``,
      `  • Vehicle:  ${vehicle}`,
      `  • Pick-up:  ${pickup}`, ``,
      `📍 Location: VAN TRIP JAPAN, Hakozaki, Fukuoka`,
      `  ${MAP}`,
      `  About 10 minutes by bus or taxi from Hakata Station or Fukuoka Airport.`, ``,
      `🎒 Please bring: your driver's license, passport, and IDP or Japanese translation.`,
      `🔑 Karen will send you the key & self-check-in instructions (with photos) on WhatsApp today.`, ``,
      `Questions → WhatsApp: ${WA}`, ``,
      `See you tomorrow!`,
      `— Karen & the VanTripJapan family`,
    ],
  }),
  fr: (first, vehicle, pickup) => ({
    subject: `🚐 C'est demain ! Infos de prise en charge VanTripJapan`,
    body: [
      `Bonjour ${first},`, ``,
      `Votre aventure à Kyushu commence demain ! Voici tout pour la prise en charge :`, ``,
      `  • Véhicule : ${vehicle}`,
      `  • Prise en charge : ${pickup}`, ``,
      `📍 Lieu : VAN TRIP JAPAN, Hakozaki, Fukuoka`,
      `  ${MAP}`,
      `  À environ 10 minutes en bus ou taxi de la gare de Hakata ou de l'aéroport de Fukuoka.`, ``,
      `🎒 À apporter : permis de conduire, passeport, et permis international ou traduction japonaise.`,
      `🔑 Karen vous enverra aujourd'hui les instructions pour les clés (avec photos) sur WhatsApp.`, ``,
      `Questions → WhatsApp : ${WA}`, ``,
      `À demain !`,
      `— Karen et la famille VanTripJapan`,
    ],
  }),
  de: (first, vehicle, pickup) => ({
    subject: `🚐 Morgen geht's los! Ihre VanTripJapan-Abholinfos`,
    body: [
      `Hallo ${first},`, ``,
      `Ihr Kyushu-Abenteuer beginnt morgen! Hier alles zur Abholung:`, ``,
      `  • Fahrzeug:  ${vehicle}`,
      `  • Abholung:  ${pickup}`, ``,
      `📍 Ort: VAN TRIP JAPAN, Hakozaki, Fukuoka`,
      `  ${MAP}`,
      `  Ca. 10 Minuten mit Bus oder Taxi vom Bahnhof Hakata oder Flughafen Fukuoka.`, ``,
      `🎒 Bitte mitbringen: Führerschein, Reisepass und internationalen Führerschein oder japanische Übersetzung.`,
      `🔑 Karen sendet Ihnen heute die Schlüssel- & Self-Check-in-Anleitung (mit Fotos) per WhatsApp.`, ``,
      `Fragen → WhatsApp: ${WA}`, ``,
      `Bis morgen!`,
      `— Karen & die VanTripJapan-Familie`,
    ],
  }),
  zh: (first, vehicle, pickup) => ({
    subject: `🚐 明天出發！VanTripJapan取車資訊`,
    body: [
      `${first} 您好，`, ``,
      `您的九州之旅明天開始！取車資訊如下：`, ``,
      `  • 車輛：${vehicle}`,
      `  • 取車：${pickup}`, ``,
      `📍 地點：VAN TRIP JAPAN（福岡・箱崎）`,
      `  ${MAP}`,
      `  從博多站或福岡機場搭巴士／計程車約10分鐘。`, ``,
      `🎒 請攜帶：駕照、護照、日文譯本（或國際駕照）。`,
      `🔑 Karen今天會透過WhatsApp／LINE傳送鑰匙開啟方式（附照片）。`, ``,
      `有問題 → WhatsApp：${WA}`, ``,
      `明天見！`,
      `— Karen 與 VanTripJapan 全體`,
    ],
  }),
  he: (first, vehicle, pickup) => ({
    subject: `🚐 מחר יוצאים לדרך! פרטי האיסוף מ-VanTripJapan`,
    body: [
      `שלום ${first},`, ``,
      `הרפתקת קיושו שלכם מתחילה מחר! כל פרטי האיסוף:`, ``,
      `  • רכב: ${vehicle}`,
      `  • איסוף: ${pickup}`, ``,
      `📍 מיקום: VAN TRIP JAPAN, האקוזאקי, פוקואוקה`,
      `  ${MAP}`,
      `  כ-10 דקות באוטובוס או מונית מתחנת האקאטה או משדה התעופה פוקואוקה.`, ``,
      `🎒 נא להביא: רישיון נהיגה, דרכון, ורישיון בינלאומי או תרגום יפני.`,
      `🔑 קארן תשלח לכם היום את הוראות המפתח והצ'ק-אין העצמי (עם תמונות) בוואטסאפ.`, ``,
      `שאלות → וואטסאפ: ${WA}`, ``,
      `נתראה מחר!`,
      `— קארן ומשפחת VanTripJapan`,
    ],
  }),
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Fail-closed認証(send-dripと同方針)
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

  // 「明日」をJSTで算出し、pickup_datetimeの日付部分と前方一致で比較
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const tomorrow = new Date(jstNow.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  const rows = await env.CUSTOMERS_DB.prepare(
    "SELECT id, full_name, email_encrypted, vehicle_type, pickup_datetime, notes FROM bookings WHERE status IN ('confirmed','active') AND pickup_datetime LIKE ?"
  ).bind(`${tomorrow}%`).all();

  const sent = [];
  const skipped = [];
  for (const b of rows?.results || []) {
    let notes = {};
    try { notes = b.notes ? JSON.parse(b.notes) : {}; } catch { notes = { legacy: b.notes }; }
    if (notes.reminder_sent_at) { skipped.push(b.id); continue; }

    const email = await decrypt(b.email_encrypted, env);
    if (!email || !email.includes('@')) { skipped.push(b.id); continue; }

    const lang = MAIL[notes.lang] ? notes.lang : 'en';
    const first = (b.full_name || '').trim().split(/\s+/)[0] || 'there';
    const m = MAIL[lang](first, b.vehicle_type || 'Campervan', b.pickup_datetime);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VanTripJapan <booking@vantripjapan.jp>',
        reply_to: 'info@vantripjapan.jp',
        to: [email],
        subject: m.subject,
        text: m.body.join('\n'),
      }),
    });
    if (res.ok) {
      notes.reminder_sent_at = new Date().toISOString();
      await env.CUSTOMERS_DB.prepare('UPDATE bookings SET notes = ? WHERE id = ?')
        .bind(JSON.stringify(notes), b.id).run();
      sent.push(b.id);
    } else {
      console.error('[PickupReminder] Resend failed for booking', b.id, await res.text());
      skipped.push(b.id);
    }
  }

  // Karenへ: 明日の取車一覧(鍵のWhatsApp送信リマインド)
  if (sent.length > 0) {
    const list = (rows?.results || [])
      .filter((b) => sent.includes(b.id))
      .map((b) => `  • #${b.id} ${b.full_name} — ${b.vehicle_type} @ ${b.pickup_datetime}`)
      .join('\n');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VanTripJapan <booking@vantripjapan.jp>',
        to: ['info@vantripjapan.jp'],
        subject: `🔑 明日の取車 ${sent.length}件 — 鍵の開け方をWhatsAppで送ってください`,
        text: `明日(${tomorrow})取車のお客様に前日リマインダーを送信しました。\n\n${list}\n\n各お客様へ鍵の開け方(写真付き)をWhatsAppで送ってください。\n→ 管理画面: https://vantripjapan.jp/admin/`,
      }),
    }).catch((e) => console.error('[PickupReminder] admin mail', e?.message));
  }

  return Response.json({ status: 'ok', date: tomorrow, sent, skipped });
}
