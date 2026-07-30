/**
 * Booking API — /api/booking
 * POST (public): Create new booking
 * GET (admin): List bookings (optional ?status= filter)
 * GET /api/booking?id=N (admin): Get single booking with documents
 * PUT (admin): Update booking status
 */

import { encrypt, decrypt } from './_crypto.js';
import { buildCompleteToken } from './_complete-token.js';

function ensureBookingBindings(env) {
  if (!env?.CUSTOMERS_DB) return 'Missing binding: CUSTOMERS_DB';
  if (!env?.ENCRYPTION_KEY) return 'Missing secret: ENCRYPTION_KEY';
  return null;
}

// 予約フォーム(/book/)と同じ料金ロジック。見積総額と割引ラベルを返す。
const VEHICLE_BASE = { 'MAZDA BONGO': 22000, 'TOYOTA PROBOX': 22000, 'DAIHATSU POCKET LOFT': 25000 };
const DISCOUNT_TIERS = [
  { minDays: 21, rate: 0.20, label: '20% OFF' },
  { minDays: 14, rate: 0.15, label: '15% OFF' },
  { minDays: 7, rate: 0.10, label: '10% OFF' },
];
function estimateBookingTotal(vehicleType, pickup, returns) {
  const base = VEHICLE_BASE[vehicleType];
  if (!base || !(pickup instanceof Date) || !(returns instanceof Date)) return { total: null, label: null };
  const days = Math.ceil((returns - pickup) / (1000 * 60 * 60 * 24));
  if (!(days > 0)) return { total: null, label: null };
  const weekendRate = Math.round(base * 1.5);
  const weeklyTotal = (5 * base) + (2 * weekendRate);
  // VTJ公式ルール: 各週の1-5日目=平日料金、6日目=週末料金（6日=5平日+1週末）
  const rem = days % 7;
  const baseTotal = (Math.floor(days / 7) * weeklyTotal) + (Math.min(rem, 5) * base) + (Math.max(0, rem - 5) * weekendRate);
  const tier = DISCOUNT_TIERS.find((t) => days >= t.minDays);
  const total = Math.round(baseTotal * (1 - (tier ? tier.rate : 0)));
  return { total, label: tier ? tier.label : null, days };
}

// POST: Public — create a new booking
async function handlePost(request, env) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const data = await request.json();

  // Validate required fields
  const required = ['email', 'full_name', 'pickup_datetime', 'return_datetime'];
  for (const field of required) {
    if (!data[field]?.trim()) {
      return Response.json({ error: `Missing: ${field}` }, { status: 400 });
    }
  }

  // Validate rental period consistency
  const pickup = new Date(data.pickup_datetime);
  const returns = new Date(data.return_datetime);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(returns.getTime())) {
    return Response.json({ error: 'Invalid pickup/return datetime' }, { status: 400 });
  }
  if (returns <= pickup) {
    return Response.json({ error: 'return_datetime must be after pickup_datetime' }, { status: 400 });
  }

  // Encrypt PII fields
  const emailEnc = await encrypt(data.email.trim(), env);
  const phoneEnc = await encrypt(data.phone || null, env);
  const addressEnc = await encrypt(data.address || null, env);

  const status = data.status || 'form_submitted';
  let gearNotes = data.num_guests
    ? `[Guests: ${data.num_guests}] ${data.camping_gear_notes || ''}`
    : data.camping_gear_notes || null;

  if (data.full_cover_option) {
    gearNotes = `[Insurance: Zero-Risk Full Cover] ${gearNotes || ''}`;
  }

  // 見積金額をサーバ側でも算出して保存（予約フォームと同じ計算式）
  // 管理画面からの手動登録ではWhatsAppで合意した金額を優先(agreed_total)
  let price = estimateBookingTotal(data.vehicle_type, pickup, returns);
  const agreed = Number(data.agreed_total);
  if (agreed > 0 && agreed < 10_000_000) {
    price = { total: Math.round(agreed), label: '合意額' };
  }

  // お客様のメタ情報を notes 列にJSONで保存: 申込言語 + 申込国（Cloudflareの地理情報ヘッダ）
  const meta = {
    lang: ['en', 'fr', 'de', 'zh', 'he'].includes(data.lang) ? data.lang : null,
    country: request.headers.get('CF-IPCountry') || null,
  };
  const notesJson = (meta.lang || meta.country) ? JSON.stringify(meta) : null;

  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT INTO bookings (email_encrypted, full_name, phone_encrypted, address_encrypted,
      vehicle_type, pickup_datetime, return_datetime, num_drivers,
      referral_source, camping_gear_notes, translation_needed, status,
      notes, estimated_total, discount_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    emailEnc,
    data.full_name.trim(),
    phoneEnc,
    addressEnc,
    data.vehicle_type || null,
    data.pickup_datetime,
    data.return_datetime,
    data.num_drivers || 1,
    data.referral_source || null,
    gearNotes,
    data.translation_needed ? 1 : 0,
    status,
    notesJson,
    price.total,
    price.label || null
  ).run();

  const bookingId = result.meta.last_row_id;

  // Fire-and-forget notifications (never block or fail the booking on email errors)
  const mailLang = ['en', 'fr', 'de', 'zh', 'he'].includes(data.lang) ? data.lang : 'en';
  // 手動登録(WhatsApp成約)は、お客様控えメールに手続きページのリンクを直接同封する
  let completeUrl = null;
  if (data.referral_source === 'WhatsApp/Manual') {
    const tok = await buildCompleteToken(bookingId, env);
    completeUrl = `https://vantripjapan.jp/booking/complete/?id=${bookingId}&token=${tok}&lang=${mailLang}`;
  }
  await sendBookingEmails(data, bookingId, env, mailLang, completeUrl).catch((e) => console.error('[Booking Mail]', e?.message));

  return Response.json({ status: 'ok', booking_id: bookingId });
}

// Googleカレンダー用リンク + 全メールソフト共通の.icsファイルを生成（Gmailの「自動追加」は
// Google審査済みの大手送信元に限定されており小規模事業者には効かないため、リンク/添付で代替）
function buildCalendarLinks(vehicle, pickupStr, retStr, bookingId) {
  const pickup = new Date(pickupStr);
  const ret = new Date(retStr);
  if (isNaN(pickup) || isNaN(ret)) return null;
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = `VanTripJapan — ${vehicle} pickup (request #${bookingId})`;
  const desc = `Booking request #${bookingId} with VanTripJapan. Pending Karen's confirmation — no payment needed yet. https://vantripjapan.jp`;
  const location = 'VAN TRIP JAPAN, Hakozaki, Fukuoka, Japan';

  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${fmt(pickup)}/${fmt(ret)}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;

  const esc = (s) => String(s).replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VanTripJapan//Booking//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:vtj-booking-${bookingId}@vantripjapan.jp`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(pickup)}`,
    `DTEND:${fmt(ret)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    `LOCATION:${esc(location)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const icsBase64 = btoa(unescape(encodeURIComponent(ics)));

  return { gcalUrl, icsBase64 };
}

// Send confirmation to the customer + alert to the VanTripJapan inbox (Resend API)
async function sendBookingEmails(data, bookingId, env, lang = 'en', completeUrl = null) {
  const name = (data.full_name || '').trim() || 'there';
  const email = (data.email || '').trim();
  const vehicle = data.vehicle_type || 'Campervan';
  const pickup = data.pickup_datetime || '—';
  const ret = data.return_datetime || '—';
  const cal = buildCalendarLinks(vehicle, data.pickup_datetime, data.return_datetime, bookingId);
  const waLink = "https://wa.me/817093757129?text=" +
    encodeURIComponent(`Hi Karen! I just submitted booking request #${bookingId}.`);

  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('Missing env.RESEND_API_KEY. Booking email notifications skipped.');
    return;
  }

  const sendResend = async (payload) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API failed: ${errText}`);
    }
    return res.json();
  };

  // 1) Customer confirmation — フォームの言語で送信（支払い/書類はまだ不要という安心感 + WhatsApp導線）
  const CUSTOMER_MAIL_I18N = {
    en: {
      subject: `✅ We received your VanTripJapan booking request (#${bookingId})`,
      wa: `Hi Karen! I just submitted booking request #${bookingId}.`,
      insFull: 'Zero-Risk Full Cover (+¥5,000/day)', insBasic: 'Basic Cover (Excess applies)',
      body: (ins, wa, cal) => [
        `Hi ${name},`, ``,
        `Thank you for your booking request with VanTripJapan! 🚐`, ``,
        `We've received your request (ref #${bookingId}) and Karen will personally`,
        `check availability and reply within 24 hours — usually much faster.`, ``,
        `IMPORTANT: No payment and no documents are needed yet. We only ask for`,
        `those after we've confirmed your dates are free.`, ``,
        `Your request:`,
        `  • Vehicle:   ${vehicle}`,
        `  • Pick-up:   ${pickup}`,
        `  • Return:    ${ret}`,
        `  • Insurance: ${ins}`, ``,
        ...(cal ? [
          `📅 Add these dates to your calendar (tentative, pending confirmation):`,
          `  ${cal.gcalUrl}`,
          `  A calendar file (.ics) is also attached — works with Apple Calendar, Outlook, etc.`, ``,
        ] : []),
        `Want a faster reply? Message Karen directly on WhatsApp:`,
        `  ${wa}`, ``,
        `— Karen & the VanTripJapan family`,
        `Licensed rent-a-car operator (Permit No. 愛運輸第290号)`,
        `Operated by キャンプ女子株式会社 · Hakozaki, Fukuoka, Japan`,
        `https://vantripjapan.jp`,
      ],
    },
    fr: {
      subject: `✅ Votre demande de réservation VanTripJapan est bien reçue (#${bookingId})`,
      wa: `Bonjour Karen ! Je viens d'envoyer la demande de réservation #${bookingId}.`,
      insFull: 'Couverture complète sans risque (+5 000 ¥/jour)', insBasic: 'Couverture de base (franchise applicable)',
      body: (ins, wa, cal) => [
        `Bonjour ${name},`, ``,
        `Merci pour votre demande de réservation chez VanTripJapan ! 🚐`, ``,
        `Nous avons bien reçu votre demande (réf. #${bookingId}). Karen vérifiera`,
        `personnellement la disponibilité et vous répondra sous 24 h — souvent bien plus vite.`, ``,
        `IMPORTANT : aucun paiement ni document n'est requis pour le moment.`,
        `Nous ne les demanderons qu'une fois vos dates confirmées.`, ``,
        `Votre demande :`,
        `  • Véhicule : ${vehicle}`,
        `  • Prise en charge : ${pickup}`,
        `  • Retour : ${ret}`,
        `  • Assurance : ${ins}`, ``,
        ...(cal ? [
          `📅 Ajouter ces dates à votre calendrier (provisoire, en attente de confirmation) :`,
          `  ${cal.gcalUrl}`,
          `  Un fichier calendrier (.ics) est aussi joint — compatible Apple Calendar, Outlook, etc.`, ``,
        ] : []),
        `Pour une réponse plus rapide, écrivez directement à Karen sur WhatsApp :`,
        `  ${wa}`, ``,
        `— Karen et la famille VanTripJapan`,
        `Loueur de véhicules agréé (permis n° 愛運輸第290号)`,
        `Exploité par キャンプ女子株式会社 · Hakozaki, Fukuoka, Japon`,
        `https://vantripjapan.jp`,
      ],
    },
    de: {
      subject: `✅ Ihre VanTripJapan-Buchungsanfrage ist eingegangen (#${bookingId})`,
      wa: `Hallo Karen! Ich habe gerade die Buchungsanfrage #${bookingId} gesendet.`,
      insFull: 'Null-Risiko-Vollkasko (+5.000 ¥/Tag)', insBasic: 'Basisschutz (Selbstbeteiligung möglich)',
      body: (ins, wa, cal) => [
        `Hallo ${name},`, ``,
        `vielen Dank für Ihre Buchungsanfrage bei VanTripJapan! 🚐`, ``,
        `Wir haben Ihre Anfrage erhalten (Ref. #${bookingId}). Karen prüft persönlich`,
        `die Verfügbarkeit und antwortet innerhalb von 24 Stunden — meist deutlich schneller.`, ``,
        `WICHTIG: Es sind noch keine Zahlung und keine Dokumente nötig.`,
        `Wir fragen erst danach, wenn Ihre Termine bestätigt sind.`, ``,
        `Ihre Anfrage:`,
        `  • Fahrzeug: ${vehicle}`,
        `  • Abholung: ${pickup}`,
        `  • Rückgabe: ${ret}`,
        `  • Versicherung: ${ins}`, ``,
        ...(cal ? [
          `📅 Termin (vorläufig, bis zur Bestätigung) zum Kalender hinzufügen:`,
          `  ${cal.gcalUrl}`,
          `  Eine Kalenderdatei (.ics) ist ebenfalls angehängt — kompatibel mit Apple Kalender, Outlook usw.`, ``,
        ] : []),
        `Für eine schnellere Antwort schreiben Sie Karen direkt auf WhatsApp:`,
        `  ${wa}`, ``,
        `— Karen & die VanTripJapan-Familie`,
        `Lizenzierter Autovermieter (Genehmigung Nr. 愛運輸第290号)`,
        `Betrieben von キャンプ女子株式会社 · Hakozaki, Fukuoka, Japan`,
        `https://vantripjapan.jp`,
      ],
    },
    zh: {
      subject: `✅ VanTripJapan已收到您的預約申請（#${bookingId}）`,
      wa: `Karen您好！我剛送出了預約申請 #${bookingId}。`,
      insFull: '零風險全險（+5,000日圓/天）', insBasic: '基本保險（含自負額）',
      body: (ins, wa, cal) => [
        `${name} 您好，`, ``,
        `感謝您向VanTripJapan送出預約申請！🚐`, ``,
        `我們已收到您的申請（編號 #${bookingId}），Karen將親自確認檔期，`,
        `並於24小時內回覆 — 通常會更快。`, ``,
        `重要：目前無需付款、也無需提供任何文件。`,
        `我們會在確認日期有空檔後才向您索取。`, ``,
        `您的申請內容：`,
        `  • 車輛：${vehicle}`,
        `  • 取車：${pickup}`,
        `  • 還車：${ret}`,
        `  • 保險：${ins}`, ``,
        ...(cal ? [
          `📅 加入日曆（暫定日期，待確認後為準）：`,
          `  ${cal.gcalUrl}`,
          `  郵件也附上日曆檔案（.ics），適用於Apple日曆、Outlook等。`, ``,
        ] : []),
        `想更快得到回覆？直接在WhatsApp聯繫Karen：`,
        `  ${wa}`, ``,
        `— Karen與VanTripJapan全體`,
        `合法登記租車業者（許可編號 愛運輸第290号）`,
        `由キャンプ女子株式会社營運 · 日本福岡市箱崎`,
        `https://vantripjapan.jp`,
      ],
    },
    he: {
      subject: `✅ קיבלנו את בקשת ההזמנה שלך ב-VanTripJapan (#${bookingId})`,
      wa: `היי קארן! הרגע שלחתי את בקשת ההזמנה #${bookingId}.`,
      insFull: 'כיסוי מלא ללא סיכון (+5,000 ין ליום)', insBasic: 'כיסוי בסיסי (השתתפות עצמית)',
      body: (ins, wa, cal) => [
        `שלום ${name},`, ``,
        `תודה על בקשת ההזמנה ב-VanTripJapan! 🚐`, ``,
        `קיבלנו את הבקשה (מס' #${bookingId}). קארן תבדוק אישית את הזמינות`,
        `ותחזור אליך תוך 24 שעות — בדרך כלל הרבה יותר מהר.`, ``,
        `חשוב: בשלב זה אין צורך בתשלום או במסמכים.`,
        `נבקש אותם רק אחרי שנאשר שהתאריכים פנויים.`, ``,
        `הבקשה שלך:`,
        `  • רכב: ${vehicle}`,
        `  • איסוף: ${pickup}`,
        `  • החזרה: ${ret}`,
        `  • ביטוח: ${ins}`, ``,
        ...(cal ? [
          `📅 הוספת התאריכים ליומן (זמני, בהמתנה לאישור):`,
          `  ${cal.gcalUrl}`,
          `  קובץ יומן (.ics) מצורף גם הוא — תואם ל-Apple Calendar, Outlook ועוד.`, ``,
        ] : []),
        `רוצה תשובה מהירה יותר? כתבו לקארן ישירות בוואטסאפ:`,
        `  ${wa}`, ``,
        `— קארן ומשפחת VanTripJapan`,
        `משכיר רכב מורשה (רישיון מס' 愛運輸第290号)`,
        `מופעל ע"י キャンプ女子株式会社 · האקוזאקי, פוקואוקה, יפן`,
        `https://vantripjapan.jp`,
      ],
    },
  };
  const CT = CUSTOMER_MAIL_I18N[lang] || CUSTOMER_MAIL_I18N.en;
  const insLabel = data.full_cover_option ? CT.insFull : CT.insBasic;
  const customerWaLink = "https://wa.me/817093757129?text=" + encodeURIComponent(CT.wa);
  let customerBody = CT.body(insLabel, customerWaLink, cal).join('\n');
  // WhatsApp成約(手動登録)の控えメール: 手続きページへの導線を先頭に追加
  if (completeUrl) {
    const NEXT_STEP = {
      en: `▶ NEXT STEP — please complete your booking here (license & passport upload, details):\n${completeUrl}\n`,
      fr: `▶ PROCHAINE ÉTAPE — finalisez votre réservation ici (permis, passeport et informations) :\n${completeUrl}\n`,
      de: `▶ NÄCHSTER SCHRITT — vervollständigen Sie Ihre Buchung hier (Führerschein, Reisepass & Angaben):\n${completeUrl}\n`,
      zh: `▶ 下一步 — 請在此完成預約手續（上傳駕照、護照與填寫資料）：\n${completeUrl}\n`,
      he: `▶ השלב הבא — השלימו את ההזמנה כאן (העלאת רישיון, דרכון ופרטים):\n${completeUrl}\n`,
    };
    customerBody = (NEXT_STEP[lang] || NEXT_STEP.en) + '\n' + customerBody;
  }

  const customerMail = email && email.includes('@') ? sendResend({
    from: 'VanTripJapan <booking@vantripjapan.jp>',
    reply_to: 'info@vantripjapan.jp',
    to: [email],
    subject: CT.subject,
    text: customerBody,
    ...(cal ? { attachments: [{ filename: `vantripjapan-booking-${bookingId}.ics`, content: cal.icsBase64 }] } : {}),
  }) : Promise.resolve();

  // Clean phone and build WhatsApp link
  let waAdminLink = '';
  if (data.phone) {
    let cleanPhone = data.phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '81' + cleanPhone.slice(1);
    }
    waAdminLink = `https://wa.me/${cleanPhone}`;
  }

  // お客様が申込フォームで使っていた言語（Karenが同じ言語で返信できるように内部通知へ表示）
  const LANG_LABELS = { en: 'English', fr: 'Français (French)', de: 'Deutsch (German)', zh: '繁體中文 (Chinese)', he: 'עברית (Hebrew)' };
  const langLabel = LANG_LABELS[lang] || `English (default${data.lang ? ` — unknown "${data.lang}"` : ', lang not sent'})`;

  // Detect test requests
  const nameLower = name.toLowerCase();
  const emailLower = email.toLowerCase();
  const isTest = nameLower.includes('test') || nameLower.includes('テスト') || nameLower.includes('dummy') ||
                 emailLower.includes('test') || emailLower.includes('dummy') ||
                 (data.camping_gear_notes || '').toLowerCase().includes('test') ||
                 (data.camping_gear_notes || '').includes('テスト');

  // 2) Internal alert so Karen can reply fast
  const adminBody = [
    `🚐 NEW BOOKING REQUEST #${bookingId}`,
    isTest ? `⚠️ [TEST SUBMISSION / テスト送信]` : ``,
    ``,
    `Name:     ${data.full_name || '—'}`,
    `Email:    ${email || '—'}`,
    `Phone:    ${data.phone || '—'}`,
    `Language: ${langLabel}  ← お客様が申込時に使っていた言語。この言語で返信してください`,
    `Vehicle:  ${vehicle}`,
    `Pick-up:  ${pickup}`,
    `Return:   ${ret}`,
    `Guests:   ${data.num_guests || 1}`,
    `Drivers:  ${data.num_drivers || 1}`,
    `Found us: ${data.referral_source || '—'}`,
    `Gear:     ${data.camping_gear_notes || '—'}`,
    `Insurance: ${data.full_cover_option ? 'Zero-Risk Full Cover (+¥5,000/day)' : 'Basic Cover'}`,
    `JP license translation needed: ${data.translation_needed ? 'YES' : 'no'}`,
    ``,
    `→ Reply via Email: mailto:${email}`,
    waAdminLink ? `→ Reply via WhatsApp: ${waAdminLink}` : ``,
    `→ Manage: https://vantripjapan.jp/admin/`,
  ].join('\n');

  const adminHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #2d3748;">
  <!-- Title/Header Banner -->
  <div style="background-color: ${isTest ? '#d69e2e' : '#1a365d'}; padding: 20px; color: #ffffff; text-align: center;">
    <h2 style="margin: 0; font-size: 20px;">🚐 新規予約リクエスト #${bookingId}</h2>
    ${isTest ? '<div style="margin-top: 5px; font-weight: bold; background-color: rgba(255,255,255,0.2); display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px;">⚠️ テスト送信の可能性があります (Test Submission)</div>' : ''}
  </div>

  <div style="padding: 24px;">
    <!-- Customer Quick Action / Contact Info -->
    <h3 style="margin-top: 0; color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">👤 お客様情報 (Customer Info)</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; font-weight: bold; width: 150px; color: #4a5568;">お名前 (Name):</td>
        <td style="padding: 6px 0; font-weight: bold;">${data.full_name || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">メール (Email):</td>
        <td style="padding: 6px 0;"><a href="mailto:${email}" style="color: #3182ce; text-decoration: underline;">${email || '—'}</a></td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">電話番号 (Phone):</td>
        <td style="padding: 6px 0;">${data.phone || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">言語 (Language):</td>
        <td style="padding: 6px 0; font-weight: bold; color: #c05621;">${langLabel} <span style="font-weight:400; color:#718096;">← この言語で返信</span></td>
      </tr>
    </table>

    <!-- Admin Actions -->
    <h3 style="color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">🚀 次のアクション (Next Steps)</h3>
    <div style="margin-bottom: 25px;">
      <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #4a5568;">
        お客様へ直接連絡、または予約処理を行うには以下のボタンを押してください：
      </p>
      
      <!-- Action 1: Reply via Email -->
      <a href="mailto:${email}?subject=Re: VanTripJapan Booking Request %23${bookingId}" style="display: block; background-color: #3182ce; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 4px; font-size: 14px;">
        ✉️ お客様にメールで返信する (Direct Email)
      </a>
      <div style="font-size: 11px; color: #718096; margin-bottom: 12px; text-align: center;">
        （※この通知メールにそのまま「返信」をしても、お客様宛に届きます）
      </div>

      <!-- Action 2: WhatsApp if phone is present -->
      ${waAdminLink ? `
      <a href="${waAdminLink}" target="_blank" style="display: block; background-color: #38a169; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 12px; font-size: 14px;">
        💬 WhatsAppでチャットを開始する
      </a>
      ` : ''}

      <!-- Action 3: Go to Admin Dashboard -->
      <a href="https://vantripjapan.jp/admin/" target="_blank" style="display: block; background-color: #4a5568; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; font-size: 14px;">
        ⚙️ 管理画面で予約を処理する (Admin Dashboard)
      </a>
    </div>

    <!-- Details Table -->
    <h3 style="color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">📋 予約リクエスト詳細 (Request Details)</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.5;">
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; width: 180px; color: #4a5568;">車両タイプ (Vehicle)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${vehicle}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">出発日時 (Pick-up)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${pickup}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">返却日時 (Return)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${ret}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">乗車人数 (Guests)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.num_guests || 1} 名</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">運転者数 (Drivers)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.num_drivers || 1} 名</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">加入保険 (Insurance)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">${data.full_cover_option ? 'Zero-Risk フルカバー (+¥5,000/日)' : '標準カバー'}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">免許翻訳 (JAF Translation)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: ${data.translation_needed ? '#e53e3e' : '#2d3748'};">${data.translation_needed ? '✅ 必要 (YES)' : '不要 (NO)'}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">アンケート (Referral)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.referral_source || '—'}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">要望・備品備考 (Notes)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.camping_gear_notes || '—'}</td>
      </tr>
    </table>
  </div>
</div>
  `;

  const adminMail = sendResend({
    from: 'VanTripJapan Booking Bot <booking@vantripjapan.jp>',
    reply_to: email && email.includes('@') ? email : 'info@vantripjapan.jp',
    to: ['info@vantripjapan.jp'],
    subject: `${isTest ? '⚠️ [TEST] ' : ''}🚐 New booking: ${vehicle} — ${data.full_name || ''} (#${bookingId})`,
    text: adminBody,
    html: adminHtml,
  });

  // 3) Sync customer to Resend Audience
  const syncAudience = async () => {
    if (!email || !email.includes('@')) return;
    try {
      const res = await fetch('https://api.resend.com/audiences/de618a55-3736-4982-a19d-2996b31ef834/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          first_name: name.split(' ')[0],
          last_name: name.split(' ').slice(1).join(' ') || '',
          unsubscribed: false,
          metadata: {
            lang: data.translation_needed ? 'ja' : 'en',
            source: 'booking_form',
            vehicle: vehicle
          }
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[Booking Mail] Resend Audience Sync Failed:', errText);
      }
    } catch (e) {
      console.error('[Booking Mail] Resend Audience Sync Error:', e?.message);
    }
  };

  await Promise.allSettled([customerMail, adminMail, syncAudience()]);
}

// GET: Admin — list bookings or get single booking
async function handleGet(request, env) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    // Single booking with documents
    const booking = await env.CUSTOMERS_DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
    if (!booking) return Response.json({ error: 'Not found' }, { status: 404 });

    // Decrypt PII
    booking.email = await decrypt(booking.email_encrypted, env);
    booking.phone = await decrypt(booking.phone_encrypted, env);
    booking.address = await decrypt(booking.address_encrypted, env);
    delete booking.email_encrypted;
    delete booking.phone_encrypted;
    delete booking.address_encrypted;

    // Get documents
    const docs = await env.CUSTOMERS_DB.prepare(
      'SELECT * FROM customer_documents WHERE booking_id = ? ORDER BY uploaded_at'
    ).bind(id).all();
    booking.documents = docs.results;

    // 顧客手続きページのリンク（KarenがWhatsAppに貼る用。言語はnotesの申込言語を引き継ぐ）
    let bookingLang = 'en';
    try { bookingLang = JSON.parse(booking.notes || '{}').lang || 'en'; } catch { /* legacy notes */ }
    const token = await buildCompleteToken(id, env);
    booking.complete_url = `https://vantripjapan.jp/booking/complete/?id=${id}&token=${token}&lang=${bookingLang}`;

    return Response.json(booking);
  }

  // List bookings
  const status = url.searchParams.get('status');
  let query, params;

  if (status) {
    query = 'SELECT id, full_name, email_encrypted, vehicle_type, pickup_datetime, return_datetime, status, translation_needed, created_at, notes, estimated_total FROM bookings WHERE status = ? ORDER BY created_at DESC';
    params = [status];
  } else {
    query = 'SELECT id, full_name, email_encrypted, vehicle_type, pickup_datetime, return_datetime, status, translation_needed, created_at, notes, estimated_total FROM bookings ORDER BY created_at DESC';
    params = [];
  }

  const stmt = params.length > 0
    ? env.CUSTOMERS_DB.prepare(query).bind(...params)
    : env.CUSTOMERS_DB.prepare(query);

  const results = await stmt.all();

  // Decrypt emails for list view
  const bookings = await Promise.all(results.results.map(async (b) => {
    b.email = await decrypt(b.email_encrypted, env);
    delete b.email_encrypted;
    return b;
  }));

  return Response.json(bookings);
}

// PUT: Admin — update booking
async function handlePut(request, env, data) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const body = await request.json();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  if (body.status) {
    const validStatuses = ['form_submitted', 'docs_requested', 'docs_received', 'payment_sent', 'confirmed', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    await env.CUSTOMERS_DB.prepare(
      "UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(body.status, id).run();

    // Log the status change
    const email = data?.userEmail || 'unknown';
    await env.CUSTOMERS_DB.prepare(
      'INSERT INTO access_logs (user_email, action, resource, detail) VALUES (?, ?, ?, ?)'
    ).bind(email, 'status_change', `booking/${id}`, `Status → ${body.status}`).run();

    // 「確定」に進めたら、お客様へ予約確定メール(ics+受取場所つき・5言語)を自動送信
    if (body.status === 'confirmed') {
      await sendConfirmedEmail(env, id).catch((e) => console.error('[Confirm Mail]', e?.message));
    }

    return Response.json({ status: 'ok' });
  }

  return Response.json({ error: 'No valid update fields' }, { status: 400 });
}

// 予約確定メール — Karenが管理画面で「確定」に進めた瞬間に自動送信。
// 確定版ics添付 + 受取場所(Googleマップ/博多駅・空港から約10分) + WhatsApp導線。
async function sendConfirmedEmail(env, id) {
  if (!env.RESEND_API_KEY) return;
  const b = await env.CUSTOMERS_DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!b) return;
  const email = await decrypt(b.email_encrypted, env);
  if (!email || !email.includes('@')) return;

  let lang = 'en';
  try { lang = JSON.parse(b.notes || '{}').lang || 'en'; } catch { /* legacy notes */ }
  const first = (b.full_name || '').trim().split(/\s+/)[0] || 'there';
  const vehicle = b.vehicle_type || 'Campervan';
  const pickup = b.pickup_datetime || '—';
  const ret = b.return_datetime || '—';
  const cal = buildCalendarLinks(vehicle, b.pickup_datetime, b.return_datetime, id);
  const MAP = 'https://maps.app.goo.gl/Dkb2bSSUM7dWJS7m7';
  const WA = 'https://wa.me/817093757129';

  const M = {
    en: {
      subject: `🎉 Your VanTripJapan booking is confirmed! (#${id})`,
      body: [
        `Hi ${first},`, ``,
        `Great news — your booking is confirmed! 🚐`, ``,
        `  • Vehicle:  ${vehicle}`,
        `  • Pick-up:  ${pickup}`,
        `  • Return:   ${ret}`, ``,
        `📍 Pick-up location: VAN TRIP JAPAN, Hakozaki, Fukuoka`,
        `  ${MAP}`,
        `  About 10 minutes by bus or taxi from Hakata Station or Fukuoka Airport.`, ``,
        cal ? `📅 Add it to your calendar: ${cal.gcalUrl}` : ``,
        cal ? `  (A calendar file (.ics) is also attached.)` : ``, ``,
        `On pick-up day, please bring your driver's license and your IDP or Japanese translation.`,
        `Questions anytime → WhatsApp Karen: ${WA}`, ``,
        `We can't wait to welcome you to Kyushu!`,
        `— Karen & the VanTripJapan family`,
        `https://vantripjapan.jp`,
      ],
    },
    fr: {
      subject: `🎉 Votre réservation VanTripJapan est confirmée ! (#${id})`,
      body: [
        `Bonjour ${first},`, ``,
        `Bonne nouvelle — votre réservation est confirmée ! 🚐`, ``,
        `  • Véhicule : ${vehicle}`,
        `  • Prise en charge : ${pickup}`,
        `  • Retour : ${ret}`, ``,
        `📍 Lieu de prise en charge : VAN TRIP JAPAN, Hakozaki, Fukuoka`,
        `  ${MAP}`,
        `  À environ 10 minutes en bus ou taxi de la gare de Hakata ou de l'aéroport de Fukuoka.`, ``,
        cal ? `📅 Ajoutez-la à votre calendrier : ${cal.gcalUrl}` : ``,
        cal ? `  (Un fichier calendrier (.ics) est également joint.)` : ``, ``,
        `Le jour J, merci d'apporter votre permis de conduire et votre permis international ou traduction japonaise.`,
        `Des questions ? → WhatsApp Karen : ${WA}`, ``,
        `Nous avons hâte de vous accueillir à Kyushu !`,
        `— Karen et la famille VanTripJapan`,
        `https://vantripjapan.jp`,
      ],
    },
    de: {
      subject: `🎉 Ihre VanTripJapan-Buchung ist bestätigt! (#${id})`,
      body: [
        `Hallo ${first},`, ``,
        `Gute Nachrichten — Ihre Buchung ist bestätigt! 🚐`, ``,
        `  • Fahrzeug:  ${vehicle}`,
        `  • Abholung:  ${pickup}`,
        `  • Rückgabe:  ${ret}`, ``,
        `📍 Abholort: VAN TRIP JAPAN, Hakozaki, Fukuoka`,
        `  ${MAP}`,
        `  Ca. 10 Minuten mit Bus oder Taxi vom Bahnhof Hakata oder Flughafen Fukuoka.`, ``,
        cal ? `📅 Zum Kalender hinzufügen: ${cal.gcalUrl}` : ``,
        cal ? `  (Eine Kalenderdatei (.ics) ist ebenfalls angehängt.)` : ``, ``,
        `Bringen Sie am Abholtag bitte Ihren Führerschein und Ihren internationalen Führerschein oder die japanische Übersetzung mit.`,
        `Fragen jederzeit → WhatsApp Karen: ${WA}`, ``,
        `Wir freuen uns auf Sie in Kyushu!`,
        `— Karen & die VanTripJapan-Familie`,
        `https://vantripjapan.jp`,
      ],
    },
    zh: {
      subject: `🎉 您的VanTripJapan預約已確認！（#${id}）`,
      body: [
        `${first} 您好，`, ``,
        `好消息 — 您的預約已確認！🚐`, ``,
        `  • 車輛：${vehicle}`,
        `  • 取車：${pickup}`,
        `  • 還車：${ret}`, ``,
        `📍 取車地點：VAN TRIP JAPAN（福岡・箱崎）`,
        `  ${MAP}`,
        `  從博多站或福岡機場搭巴士／計程車約10分鐘。`, ``,
        cal ? `📅 加入行事曆：${cal.gcalUrl}` : ``,
        cal ? `  （郵件亦附上 .ics 行事曆檔案。）` : ``, ``,
        `取車當天請攜帶駕照與日文譯本（或國際駕照）。`,
        `有任何問題 → WhatsApp／LINE 聯絡 Karen：${WA}`, ``,
        `期待在九州與您相見！`,
        `— Karen 與 VanTripJapan 全體`,
        `https://vantripjapan.jp`,
      ],
    },
    he: {
      subject: `🎉 ההזמנה שלך ב-VanTripJapan אושרה! (#${id})`,
      body: [
        `שלום ${first},`, ``,
        `חדשות טובות — ההזמנה שלך אושרה! 🚐`, ``,
        `  • רכב: ${vehicle}`,
        `  • איסוף: ${pickup}`,
        `  • החזרה: ${ret}`, ``,
        `📍 מיקום האיסוף: VAN TRIP JAPAN, האקוזאקי, פוקואוקה`,
        `  ${MAP}`,
        `  כ-10 דקות באוטובוס או מונית מתחנת האקאטה או משדה התעופה פוקואוקה.`, ``,
        cal ? `📅 הוספה ליומן: ${cal.gcalUrl}` : ``,
        cal ? `  (קובץ יומן (.ics) מצורף גם הוא.)` : ``, ``,
        `ביום האיסוף נא להביא את רישיון הנהיגה ואת הרישיון הבינלאומי או התרגום היפני.`,
        `שאלות בכל שעה → וואטסאפ קארן: ${WA}`, ``,
        `מחכים לכם בקיושו!`,
        `— קארן ומשפחת VanTripJapan`,
        `https://vantripjapan.jp`,
      ],
    },
  };
  const m = M[lang] || M.en;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'VanTripJapan <booking@vantripjapan.jp>',
      reply_to: 'info@vantripjapan.jp',
      to: [email],
      subject: m.subject,
      text: m.body.join('\n'),
      ...(cal ? { attachments: [{ filename: `vantripjapan-booking-${id}.ics`, content: cal.icsBase64 }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
}

async function handleDelete(request, env, data) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  // 関連書類を先に削除（R2の暗号化ファイル + customer_documents の行）
  try {
    const docs = await env.CUSTOMERS_DB.prepare(
      'SELECT r2_key FROM customer_documents WHERE booking_id = ?'
    ).bind(id).all();
    if (env.DOCUMENTS && docs?.results?.length) {
      for (const d of docs.results) {
        if (d.r2_key) await env.DOCUMENTS.delete(d.r2_key).catch(() => {});
      }
    }
    await env.CUSTOMERS_DB.prepare('DELETE FROM customer_documents WHERE booking_id = ?').bind(id).run();
  } catch (e) {
    // customer_documents が無い/空でも予約本体の削除は続行
  }

  const res = await env.CUSTOMERS_DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id).run();
  if (!res?.meta?.changes) return Response.json({ error: 'Not found' }, { status: 404 });

  // 監査ログ（誰が何を消したか）
  try {
    const email = data?.userEmail || 'unknown';
    await env.CUSTOMERS_DB.prepare(
      'INSERT INTO access_logs (user_email, action, resource, detail) VALUES (?, ?, ?, ?)'
    ).bind(email, 'delete', `booking/${id}`, 'Booking deleted').run();
  } catch (e) { /* ログ失敗は無視 */ }

  return Response.json({ status: 'ok' });
}

export async function onRequest(context) {
  const { request, env, data } = context;

  switch (request.method) {
    case 'POST': return handlePost(request, env);
    case 'GET': return handleGet(request, env);
    case 'PUT': return handlePut(request, env, data);
    case 'DELETE': return handleDelete(request, env, data);
    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
}
