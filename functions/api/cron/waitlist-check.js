/**
 * キャンセル待ちの空き確認 Cron — GET /api/cron/waitlist-check
 * (Authorization: Bearer CRON_SECRET または ?secret=) GitHub Actions から毎時。
 *
 * 待機中の登録それぞれについて、希望車種のどれかが希望日程で空いたらメールで知らせる。
 * 空き判定は /api/availability と同じ関数をそのまま呼ぶ（サイトの表示と必ず一致させる）。
 * カレンダーが一部読めないときは誤報を避けるため何も送らない。
 * 送信できた登録だけ status='notified' にする（失敗したら次の回に再送）。
 */
import { onRequestGet as availabilityGet } from '../availability.js';
import {
  WAITLIST_VEHICLES, WHATSAPP_URL, addDays, bookUrl, emailText, escapeHtml, formatRange,
  isInternalTest, leaveUrl, normalizeLang, renderEmail, sendEmail, todayJst
} from '../../_waitlist.js';

const MAX_EMAILS_PER_RUN = 40;

function overlaps(ranges, from, to) {
  return (ranges || []).some(r => from < r.to && to > r.from);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  // fail-closed: 本番はCRON_SECRET必須
  if (!isLocal) {
    if (!env.CRON_SECRET) {
      return Response.json({ error: 'Cron endpoint not configured (CRON_SECRET missing)' }, { status: 503 });
    }
    const auth = request.headers.get('Authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const secret = bearer || url.searchParams.get('secret') || '';
    if (secret !== env.CRON_SECRET) {
      return Response.json({ error: 'Authentication required' }, { status: 403 });
    }
  }
  if (!env.CUSTOMERS_DB) return Response.json({ error: 'Missing binding: CUSTOMERS_DB' }, { status: 500 });

  const db = env.CUSTOMERS_DB;
  const today = todayJst();

  // 出発日を過ぎた登録は締める
  const expired = await db.prepare(
    `UPDATE waitlist SET status = 'expired' WHERE status = 'waiting' AND pickup_date <= ?`
  ).bind(today).run();

  const { results: waiting = [] } = await db.prepare(
    `SELECT id, email, pickup_date, return_date, guests, vehicles, language
     FROM waitlist WHERE status = 'waiting' ORDER BY created_at LIMIT 300`
  ).all();

  const summary = { ok: true, waiting: waiting.length, expired: expired?.meta?.changes || 0, notified: 0 };
  if (!waiting.length) return Response.json(summary);

  const availabilityResponse = await availabilityGet({
    request: new Request('https://vantripjapan.jp/api/availability'),
    env
  });
  const availability = await availabilityResponse.json();
  if (!availabilityResponse.ok || availability?.availability?.complete !== true) {
    return Response.json({ ...summary, skipped: 'availability incomplete — no emails sent' });
  }

  // 一覧APIが見ている範囲（今日から約6ヶ月）を超える日程は判定しない
  const horizon = addDays(today, 180);
  const notified = [];

  for (const entry of waiting) {
    if (notified.length >= MAX_EMAILS_PER_RUN) break;
    if (entry.return_date > horizon) continue;

    const slugs = String(entry.vehicles || '').split(',').filter(slug => WAITLIST_VEHICLES[slug]);
    const openSlug = slugs.find(slug =>
      !overlaps(availability.vehicles?.[WAITLIST_VEHICLES[slug].api], entry.pickup_date, entry.return_date)
    );
    if (!openSlug) continue;

    const lang = normalizeLang(entry.language);
    const dates = formatRange(entry.pickup_date, entry.return_date, lang);
    const paragraphs = [
      emailText(lang, 'hello'),
      emailText(lang, 'opened', { van: WAITLIST_VEHICLES[openSlug].name, dates, guests: entry.guests }),
      emailText(lang, 'openedFair'),
      emailText(lang, 'openedCta', { url: bookUrl(openSlug, entry.pickup_date, entry.return_date, entry.guests, lang) }),
      emailText(lang, 'openedWa', { wa: WHATSAPP_URL }),
      emailText(lang, 'signoff'),
      emailText(lang, 'stop', { url: await leaveUrl(entry.id, env) })
    ];
    const mail = renderEmail(lang, paragraphs);
    const sent = await sendEmail(env, {
      to: entry.email,
      subject: emailText(lang, 'openedSubject', { dates }),
      text: mail.text,
      html: mail.html
    });
    if (!sent) continue;

    await db.prepare(
      `UPDATE waitlist SET status = 'notified', notified_at = datetime('now'), notified_vehicle = ? WHERE id = ?`
    ).bind(openSlug, entry.id).run();
    notified.push({ ...entry, openSlug });
  }

  summary.notified = notified.length;

  // カレンさんへ: 誰にお知らせしたか（問い合わせが来る前提で動けるように）
  if (notified.length) {
    const lines = [
      `キャンセル待ちの方 ${notified.length} 名に「空きが出ました」とメールしました（${today} JST）。`,
      `先着順とお伝えしています。リクエストやWhatsAppが届いたら、いつも通り確認をお願いします。`,
      ``
    ];
    for (const n of notified) {
      lines.push(`${isInternalTest(n.email) ? '[テスト] ' : ''}${n.pickup_date} → ${n.return_date}・${n.guests}名・${WAITLIST_VEHICLES[n.openSlug].name}・${n.language}・${n.email}`);
    }
    const text = lines.join('\n');
    await sendEmail(env, {
      to: 'info@vantripjapan.jp',
      subject: `🔔 キャンセル待ちへ空き通知 ${notified.length}件`,
      text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;">${escapeHtml(text)}</pre>`
    });
  }

  return Response.json(summary);
}
