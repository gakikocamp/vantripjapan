/**
 * キャンセル待ち登録 — POST /api/waitlist（公開）
 *
 * /rent/ の検索結果や /book/ で満車と表示されたお客様が登録する。
 * 空きが出たら /api/cron/waitlist-check がメールで知らせる。
 * 桜の早割・来年秋の先行案内は、本人がチェックした場合だけ記録する（既定はオフ）。
 */
import {
  WAITLIST_VEHICLES, addDays, emailText, escapeHtml, formatDate, formatRange,
  isInternalTest, leaveUrl, normalizeLang, renderEmail, sendEmail, todayJst,
  vehicleNames, WHATSAPP_URL
} from '../_waitlist.js';
import { upcomingSakuraEarlyBird } from '../_rate-calendar.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

// 秋（10〜11月）の案内対象年: 7月以降の登録なら翌年の秋
function upcomingAutumnYear(today) {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 7 ? year + 1 : year;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return bad('Method not allowed', 405);
  if (!env?.CUSTOMERS_DB) return bad('Waitlist service misconfigured', 500);

  let data;
  try {
    data = await request.json();
  } catch {
    return bad('Invalid JSON');
  }

  // Honeypot — botだけが埋める欄
  if (String(data.website || '').trim() !== '') return Response.json({ ok: true });

  const email = String(data.email || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return bad('Valid email required');

  const whatsapp = String(data.whatsapp || '').replace(/[^\d+\s()-]/g, '').trim().slice(0, 30) || null;
  const from = String(data.from || '');
  const to = String(data.to || '');
  const today = todayJst();
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return bad('Invalid dates');
  }
  if (from <= today || to <= from || to > addDays(from, 60) || from > addDays(today, 550)) {
    return bad('Dates out of range');
  }

  const guests = Math.min(8, Math.max(1, parseInt(data.guests, 10) || 2));
  const requested = Array.isArray(data.vehicles) ? data.vehicles.map(String) : [];
  const fits = Object.keys(WAITLIST_VEHICLES).filter(slug => WAITLIST_VEHICLES[slug].cap >= guests);
  let vehicles = requested.filter(slug => fits.includes(slug));
  if (!vehicles.length) vehicles = fits;
  if (!vehicles.length) return bad('No van fits this group size');

  const lang = normalizeLang(data.lang);
  const sakura = data.sakura ? upcomingSakuraEarlyBird(today) : null;
  const autumnYear = data.autumn ? upcomingAutumnYear(today) : null;
  const landingPath = String(data.path || '').slice(0, 200);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  const db = env.CUSTOMERS_DB;

  // 簡易レート制限: 同一IPから1時間に6件まで
  const recent = await db.prepare(
    `SELECT COUNT(*) AS n FROM waitlist WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`
  ).bind(ip).first();
  if ((recent?.n || 0) >= 6) return bad('Too many requests — please try later', 429);

  const existing = await db.prepare(
    `SELECT id, status FROM waitlist WHERE email = ? AND pickup_date = ? AND return_date = ?`
  ).bind(email, from, to).first();

  await db.prepare(`
    INSERT INTO waitlist (email, whatsapp, pickup_date, return_date, guests, vehicles, language,
                          sakura_year, autumn_year, landing_path, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email, pickup_date, return_date) DO UPDATE SET
      whatsapp = COALESCE(excluded.whatsapp, waitlist.whatsapp),
      guests = excluded.guests,
      vehicles = excluded.vehicles,
      language = excluded.language,
      sakura_year = COALESCE(excluded.sakura_year, waitlist.sakura_year),
      autumn_year = COALESCE(excluded.autumn_year, waitlist.autumn_year),
      status = 'waiting',
      notified_at = NULL,
      notified_vehicle = NULL
  `).bind(
    email, whatsapp, from, to, guests, vehicles.join(','), lang,
    sakura ? sakura.year : null, autumnYear, landingPath, ip
  ).run();

  // 同じ日程で登録済み（待機中）なら、確認メールを重ねて送らない
  if (existing && existing.status === 'waiting') {
    return Response.json({ ok: true, already: true });
  }

  const row = await db.prepare(
    `SELECT id FROM waitlist WHERE email = ? AND pickup_date = ? AND return_date = ?`
  ).bind(email, from, to).first();
  const id = row?.id;

  try {
    const dates = formatRange(from, to, lang);
    const paragraphs = [
      emailText(lang, 'hello'),
      emailText(lang, 'joined', { dates, guests }),
      emailText(lang, 'joinedHow', { vans: vehicleNames(vehicles) }),
      emailText(lang, 'nothingNow')
    ];
    if (sakura) paragraphs.push(emailText(lang, 'sakura', { date: formatDate(sakura.until, lang) }));
    if (autumnYear) paragraphs.push(emailText(lang, 'autumn', { year: autumnYear }));
    paragraphs.push(emailText(lang, 'talk', { wa: WHATSAPP_URL }), emailText(lang, 'signoff'));
    if (id) paragraphs.push(emailText(lang, 'stop', { url: await leaveUrl(id, env) }));
    const customer = renderEmail(lang, paragraphs);
    await sendEmail(env, {
      to: email,
      subject: emailText(lang, 'joinedSubject', { dates }),
      text: customer.text,
      html: customer.html
    });

    // カレンさんへの通知（社内）
    const test = isInternalTest(email);
    const internal = [
      `${test ? '⚠️ [テスト登録] ' : ''}キャンセル待ちの登録がありました。`,
      ``,
      `日程: ${from} → ${to}（${Math.round((Date.parse(to) - Date.parse(from)) / 86400000)}日）`,
      `人数: ${guests}名`,
      `希望車種: ${vehicleNames(vehicles)}`,
      `言語: ${lang}`,
      `メール: ${email}`,
      `WhatsApp: ${whatsapp || '（未記入）'}`,
      `桜の早割の案内: ${sakura ? `希望（${sakura.year}年）` : '希望なし'}`,
      `来年秋の先行案内: ${autumnYear ? `希望（${autumnYear}年）` : '希望なし'}`,
      `登録ページ: ${landingPath || '不明'}`,
      ``,
      `空きが出たら自動でお客様にメールが届きます（毎時チェック）。`,
      `別の車や近い日程を提案できそうなら、こちらから連絡しても大丈夫です。`
    ].join('\n');
    await sendEmail(env, {
      to: 'info@vantripjapan.jp',
      replyTo: email,
      subject: `${test ? '⚠️ [TEST] ' : ''}🔔 キャンセル待ち: ${from} → ${to}・${guests}名・${vehicleNames(vehicles)}`,
      text: internal,
      html: `<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;">${escapeHtml(internal)}</pre>`
    });
  } catch (err) {
    // 登録は保存済み。メール失敗で登録を失敗扱いにはしない
    console.error('[Waitlist mail]', err?.message || err);
  }

  return Response.json({ ok: true });
}
