/**
 * キャンセル待ちの配信停止 — GET /api/waitlist/leave?id=&t=（公開・HMACトークン）
 * 空き通知も、桜・秋の案内もまとめて止める。
 */
import { SITE, escapeHtml, normalizeLang, verifyWaitlistToken } from '../../_waitlist.js';

const PAGE = {
  en: ["You're off the waitlist", "You won't receive any more waitlist emails from us. Thanks for your interest in Van Trip Japan.", 'Back to Van Trip Japan'],
  fr: ["Vous êtes retiré(e) de la liste d'attente", "Vous ne recevrez plus d'e-mails de liste d'attente de notre part. Merci de l'intérêt que vous portez à Van Trip Japan.", 'Retour à Van Trip Japan'],
  de: ['Sie stehen nicht mehr auf der Warteliste', 'Sie erhalten keine Wartelisten-E-Mails mehr von uns. Danke für Ihr Interesse an Van Trip Japan.', 'Zurück zu Van Trip Japan'],
  zh: ['已將您從候補名單移除', '您不會再收到我們的候補通知信。感謝您對 Van Trip Japan 的關注。', '回到 Van Trip Japan'],
  he: ['הוסרתם מרשימת ההמתנה', 'לא תקבלו מאיתנו עוד מיילים על רשימת ההמתנה. תודה על ההתעניינות ב-Van Trip Japan.', 'חזרה ל-Van Trip Japan']
};
const INVALID = ['This link is invalid', 'Please use the link in your most recent email, or message us on WhatsApp.', 'Back to Van Trip Japan'];

function page(lang, [title, body, back], status = 200) {
  const code = normalizeLang(lang);
  const home = code === 'en' ? `${SITE}/rent/` : `${SITE}/${code}/rent/`;
  const html = `<!doctype html><html lang="${code}" dir="${code === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)} | Van Trip Japan</title></head>
<body style="margin:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2D2A26;">
<main style="max-width:520px;margin:12vh auto;padding:32px 24px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.06);">
<h1 style="font-size:22px;margin:0 0 12px;">${escapeHtml(title)}</h1>
<p style="font-size:15px;line-height:1.7;margin:0 0 20px;">${escapeHtml(body)}</p>
<a href="${home}" style="color:#C4704B;font-weight:700;">${escapeHtml(back)}</a>
</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  const token = url.searchParams.get('t') || '';
  if (!id || !env?.CUSTOMERS_DB || !(await verifyWaitlistToken(id, token, env))) {
    return page('en', INVALID, 400);
  }

  const row = await env.CUSTOMERS_DB.prepare('SELECT language FROM waitlist WHERE id = ?').bind(id).first();
  if (!row) return page('en', INVALID, 404);

  await env.CUSTOMERS_DB.prepare(
    `UPDATE waitlist SET status = 'left', sakura_year = NULL, autumn_year = NULL WHERE id = ?`
  ).bind(id).run();

  const lang = normalizeLang(row.language);
  return page(lang, PAGE[lang]);
}
