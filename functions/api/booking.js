/**
 * Booking API — /api/booking
 * POST (public): Create new booking
 * GET (admin): List bookings (optional ?status= filter)
 * GET /api/booking?id=N (admin): Get single booking with documents
 * PUT (admin): Update booking status
 */

import { encrypt, decrypt } from './_crypto.js';

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
  const baseTotal = (Math.floor(days / 7) * weeklyTotal) + ((days % 7) * base);
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
  const price = estimateBookingTotal(data.vehicle_type, pickup, returns);

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
  await sendBookingEmails(data, bookingId, env, mailLang).catch((e) => console.error('[Booking Mail]', e?.message));

  return Response.json({ status: 'ok', booking_id: bookingId });
}

// Send confirmation to the customer + alert to the VanTripJapan inbox (Resend API)
async function sendBookingEmails(data, bookingId, env, lang = 'en') {
  const name = (data.full_name || '').trim() || 'there';
  const email = (data.email || '').trim();
  const vehicle = data.vehicle_type || 'Campervan';
  const pickup = data.pickup_datetime || '—';
  const ret = data.return_datetime || '—';
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
      body: (ins, wa) => [
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
      body: (ins, wa) => [
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
      body: (ins, wa) => [
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
      body: (ins, wa) => [
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
      body: (ins, wa) => [
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
  const customerBody = CT.body(insLabel, customerWaLink).join('\n');

  const customerMail = email && email.includes('@') ? sendResend({
    from: 'VanTripJapan <booking@vantripjapan.jp>',
    reply_to: 'info@vantripjapan.jp',
    to: [email],
    subject: CT.subject,
    text: customerBody,
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

    return Response.json({ status: 'ok' });
  }

  return Response.json({ error: 'No valid update fields' }, { status: 400 });
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
