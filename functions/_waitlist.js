/**
 * キャンセル待ち（waitlist）の共通部品
 *
 * 満車でお断りしたお客様を取りこぼさないための仕組み。
 *   /api/waitlist              … 登録（公開・POST）
 *   /api/waitlist/leave        … 配信停止（公開・GET・HMACトークン）
 *   /api/cron/waitlist-check   … 空きが出たら通知（CRON_SECRET）
 *
 * お客様向けの文面は5言語（en/fr/de/zh/he）。/js/waitlist.js と言語をそろえる。
 */

export const SITE = 'https://vantripjapan.jp';
export const WHATSAPP_URL = 'https://wa.me/817093757129';
export const LANGS = ['en', 'fr', 'de', 'zh', 'he'];

// サイトの車種キー（slug）と、空き状況APIの車名・定員
export const WAITLIST_VEHICLES = {
  probox: { api: 'TOYOTA PROBOX', name: 'Toyota Probox', cap: 5 },
  bongo: { api: 'MAZDA BONGO', name: 'Mazda Bongo', cap: 3 },
  loft: { api: 'DAIHATSU POCKET LOFT', name: 'Daihatsu Pocket Loft', cap: 2 }
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', zh: 'zh-TW', he: 'he-IL' };

export function normalizeLang(lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(code) ? code : 'en';
}

export function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(iso, amount) {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso, lang) {
  try {
    return new Intl.DateTimeFormat(LOCALES[normalizeLang(lang)], {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

export function formatRange(from, to, lang) {
  return `${formatDate(from, lang)} – ${formatDate(to, lang)}`;
}

export function vehicleNames(slugs) {
  return slugs.map(slug => WAITLIST_VEHICLES[slug]?.name).filter(Boolean).join(' / ');
}

/** 配信停止リンク用トークン — 予約手続きページと同じ HMAC-SHA256(ENCRYPTION_KEY) 方式 */
export async function buildWaitlistToken(id, env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(String(env.ENCRYPTION_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`vtj-waitlist:${id}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function verifyWaitlistToken(id, token, env) {
  if (!id || !token || !env.ENCRYPTION_KEY) return false;
  const expected = await buildWaitlistToken(id, env);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function leaveUrl(id, env) {
  return `${SITE}/api/waitlist/leave?id=${id}&t=${await buildWaitlistToken(id, env)}`;
}

export function bookUrl(slug, from, to, guests, lang) {
  const params = new URLSearchParams({ vehicle: slug, from, to, guests: String(guests) });
  if (normalizeLang(lang) !== 'en') params.set('lang', normalizeLang(lang));
  return `${SITE}/book/?${params}`;
}

/* ── お客様向けメール文面（5言語） ─────────────────────────────── */

const EMAIL = {
  en: {
    joinedSubject: "You're on the waitlist: {dates}",
    hello: 'Hi,',
    joined: 'Thanks for joining the waitlist for {dates} ({guests} guests).',
    joinedHow: "Cancellations do happen. If a van that fits your group ({vans}) opens up for these dates, we'll email you right away.",
    nothingNow: 'Nothing to pay and nothing to confirm now.',
    sakura: "We'll also send you the cherry-blossom early-bird rate before it ends on {date}.",
    autumn: "We'll let you know first when autumn {year} dates open.",
    talk: 'Want to talk now? Message Karen on WhatsApp: {wa}',
    openedSubject: 'Good news: a van is free for {dates}',
    opened: 'The {van} now shows as available for your dates: {dates} ({guests} guests).',
    openedFair: 'Everyone on the waitlist for these dates gets this email at the same time, so the first request gets the van.',
    openedCta: 'Request it here (no payment until Karen confirms): {url}',
    openedWa: 'Or message Karen on WhatsApp: {wa}',
    signoff: 'Karen, Van Trip Japan',
    stop: 'Stop these emails: {url}'
  },
  fr: {
    joinedSubject: "Vous êtes sur la liste d'attente : {dates}",
    hello: 'Bonjour,',
    joined: "Merci de vous être inscrit(e) sur la liste d'attente pour vos dates : {dates} ({guests} pers.).",
    joinedHow: "Des annulations arrivent. Si l'un des vans adaptés à votre groupe ({vans}) se libère à ces dates, nous vous écrivons tout de suite.",
    nothingNow: "Rien à payer, rien à confirmer pour l'instant.",
    sakura: "Nous vous enverrons aussi le tarif early-bird de la saison des cerisiers avant sa fin, le {date}.",
    autumn: "Nous vous préviendrons en premier à l'ouverture des dates d'automne {year}.",
    talk: "Envie d'en parler maintenant ? Écrivez à Karen sur WhatsApp : {wa}",
    openedSubject: 'Bonne nouvelle : un van est disponible ({dates})',
    opened: 'Le {van} apparaît maintenant disponible pour vos dates : {dates} ({guests} pers.).',
    openedFair: "Toutes les personnes inscrites pour ces dates reçoivent ce message en même temps : la première demande obtient le van.",
    openedCta: 'Faites votre demande ici (aucun paiement avant la confirmation de Karen) : {url}',
    openedWa: 'Ou écrivez à Karen sur WhatsApp : {wa}',
    signoff: 'Karen, Van Trip Japan',
    stop: 'Ne plus recevoir ces e-mails : {url}'
  },
  de: {
    joinedSubject: 'Sie stehen auf der Warteliste: {dates}',
    hello: 'Hallo,',
    joined: 'danke, dass Sie sich für {dates} ({guests} Pers.) auf die Warteliste gesetzt haben.',
    joinedHow: 'Stornierungen kommen vor. Wird ein passender Van ({vans}) für diese Daten frei, schreiben wir Ihnen sofort.',
    nothingNow: 'Sie müssen jetzt nichts bezahlen und nichts bestätigen.',
    sakura: 'Außerdem schicken wir Ihnen den Frühbucher-Tarif für die Kirschblütenzeit, bevor er am {date} endet.',
    autumn: 'Sobald die Herbsttermine {year} buchbar sind, erfahren Sie es zuerst.',
    talk: 'Lieber direkt sprechen? Schreiben Sie Karen auf WhatsApp: {wa}',
    openedSubject: 'Gute Nachricht: Ein Van ist frei ({dates})',
    opened: 'Der {van} wird für Ihre Daten jetzt als verfügbar angezeigt: {dates} ({guests} Pers.).',
    openedFair: 'Alle auf der Warteliste für diese Daten erhalten diese Nachricht gleichzeitig. Die erste Anfrage erhält den Van.',
    openedCta: 'Hier anfragen (Zahlung erst nach Karens Bestätigung): {url}',
    openedWa: 'Oder schreiben Sie Karen auf WhatsApp: {wa}',
    signoff: 'Karen, Van Trip Japan',
    stop: 'Keine weiteren E-Mails: {url}'
  },
  zh: {
    joinedSubject: '您已加入候補名單：{dates}',
    hello: '您好，',
    joined: '感謝您登記 {dates}（{guests} 人）的候補名單。',
    joinedHow: '訂單偶爾會取消。只要適合您人數的車（{vans}）在這段日期空出來，我們會立刻寄信通知您。',
    nothingNow: '現在不需要付款，也不需要確認任何事。',
    sakura: '我們也會在櫻花季早鳥價於 {date} 截止前通知您。',
    autumn: '{year} 年秋季的日期開放時，我們會第一時間通知您。',
    talk: '想直接聊聊嗎？歡迎用 WhatsApp 聯絡 Karen：{wa}',
    openedSubject: '好消息：您的日期有車了（{dates}）',
    opened: '{van} 現在顯示在您的日期可以預約：{dates}（{guests} 人）。',
    openedFair: '候補同一日期的每一位都會同時收到這封信，最先送出申請的人優先。',
    openedCta: '請在這裡送出申請（Karen 確認前不需付款）：{url}',
    openedWa: '或用 WhatsApp 聯絡 Karen：{wa}',
    signoff: 'Karen｜Van Trip Japan',
    stop: '不想再收到這些信件：{url}'
  },
  he: {
    joinedSubject: 'נרשמתם לרשימת ההמתנה: {dates}',
    hello: 'שלום,',
    joined: 'תודה שנרשמתם לרשימת ההמתנה לתאריכים {dates} ({guests} נוסעים).',
    joinedHow: 'ביטולים קורים. אם ואן שמתאים לקבוצה שלכם ({vans}) יתפנה בתאריכים האלה, נשלח לכם מייל מיד.',
    nothingNow: 'אין צורך לשלם או לאשר שום דבר עכשיו.',
    sakura: 'נשלח לכם גם את מחיר ההזמנה המוקדמת לעונת פריחת הדובדבן, לפני שהוא מסתיים ב-{date}.',
    autumn: 'נעדכן אתכם ראשונים כשייפתחו התאריכים לסתיו {year}.',
    talk: 'רוצים לדבר עכשיו? כתבו לקארן בוואטסאפ: {wa}',
    openedSubject: 'חדשות טובות: התפנה ואן לתאריכים שלכם ({dates})',
    opened: 'ה-{van} מופיע עכשיו כפנוי בתאריכים שלכם: {dates} ({guests} נוסעים).',
    openedFair: 'כל מי שברשימת ההמתנה לתאריכים האלה מקבל את המייל הזה באותו הזמן, והבקשה הראשונה מקבלת את הוואן.',
    openedCta: 'שלחו בקשה כאן (אין תשלום לפני שקארן מאשרת): {url}',
    openedWa: 'או כתבו לקארן בוואטסאפ: {wa}',
    signoff: 'קארן, Van Trip Japan',
    stop: 'להפסקת המיילים: {url}'
  }
};

export const EMAIL_KEYS = Object.keys(EMAIL.en);

export function emailText(lang, key, vars = {}) {
  const dict = EMAIL[normalizeLang(lang)] || EMAIL.en;
  const template = dict[key] ?? EMAIL.en[key] ?? '';
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}

export function emailDictionaries() {
  return EMAIL;
}

/** 段落の配列から text / html を作る。URLはリンクにする。ヘブライ語は右から左 */
export function renderEmail(lang, paragraphs) {
  const text = paragraphs.join('\n\n');
  const dir = normalizeLang(lang) === 'he' ? 'rtl' : 'ltr';
  const linkify = s => escapeHtml(s).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#C4704B;">$1</a>');
  const html = `<div dir="${dir}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D2A26;font-size:15px;line-height:1.65;">`
    + paragraphs.map(p => `<p style="margin:0 0 14px;">${linkify(p)}</p>`).join('')
    + '</div>';
  return { text, html };
}

export async function sendEmail(env, { to, subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.error('[Waitlist] RESEND_API_KEY missing — email skipped');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Karen | Van Trip Japan <waitlist@vantripjapan.jp>',
      reply_to: replyTo || 'info@vantripjapan.jp',
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    })
  });
  if (!res.ok) {
    console.error('[Waitlist Resend]', res.status, await res.text());
    return false;
  }
  return true;
}

/** 社内確認用のテスト登録（info@ 宛て）を見分ける */
export function isInternalTest(email) {
  return String(email || '').toLowerCase().endsWith('@vantripjapan.jp');
}
