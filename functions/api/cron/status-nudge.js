/**
 * VanTripJapan — ステータス進行の見守り Cron Endpoint
 * GET /api/cron/status-nudge  (Authorization: Bearer CRON_SECRET または ?secret=)
 *
 * 目的: レビュー依頼メール(review-request)は status が
 * confirmed / active / completed の予約にしか送られない。
 * 返却日を過ぎているのに form_submitted 等のままだと、自動化が永久に止まる。
 * → 毎朝Karenへ「進めるべき予約」の一覧を通知して詰まりを解消する。
 *
 * 通知するのはVTJ社内のみ（お客様には送らない）。冪等性は不要（毎朝の要約）。
 */

const PRE_TRIP = ['form_submitted', 'docs_requested', 'docs_received', 'payment_sent'];

export async function onRequest(context) {
  const { request, env } = context;
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

  const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // ① 返却日を過ぎたのに旅前ステータスのまま（＝レビュー依頼が飛ばない予約）
  const stale = await env.CUSTOMERS_DB.prepare(
    `SELECT id, full_name, vehicle_type, substr(pickup_datetime,1,10) AS pu, substr(return_datetime,1,10) AS ret, status
     FROM bookings
     WHERE substr(return_datetime,1,10) < ?
       AND status IN (${PRE_TRIP.map(() => '?').join(',')})
     ORDER BY return_datetime DESC LIMIT 30`
  ).bind(todayJst, ...PRE_TRIP).all();

  // ② 取車日が過ぎたのに confirmed のまま（active/completedへ進め忘れ）
  const running = await env.CUSTOMERS_DB.prepare(
    `SELECT id, full_name, vehicle_type, substr(return_datetime,1,10) AS ret, status
     FROM bookings
     WHERE substr(pickup_datetime,1,10) <= ? AND substr(return_datetime,1,10) >= ? AND status = 'confirmed'
     ORDER BY return_datetime LIMIT 30`
  ).bind(todayJst, todayJst).all();

  const staleRows = stale?.results || [];
  const runningRows = running?.results || [];

  if (!staleRows.length && !runningRows.length) {
    return Response.json({ ok: true, stale: 0, running: 0, note: '進め忘れなし' });
  }

  if (env.RESEND_API_KEY) {
    const lines = [
      `おはようございます。予約ステータスの確認をお願いします（${todayJst} JST）。`, ``,
    ];
    if (staleRows.length) {
      lines.push(
        `⚠️ 返却日を過ぎたのに、ステータスが旅前のままの予約が ${staleRows.length} 件あります。`,
        `　 このままだとお客様に「お礼＋レビュー依頼メール」が届きません（レビューが増えない原因になります）。`,
        `　 管理画面で「✨ 完了にする」を押してください:`, ``,
      );
      for (const b of staleRows) {
        lines.push(`　 #${b.id}  ${b.ret} 返却  ${b.vehicle_type || ''}  ${b.full_name || ''}  [現在: ${b.status}]`);
      }
      lines.push(``);
    }
    if (runningRows.length) {
      lines.push(`🚐 現在レンタル中（confirmed のまま）の予約 ${runningRows.length} 件 — 返却後に「完了にする」をお願いします:`, ``);
      for (const b of runningRows) {
        lines.push(`　 #${b.id}  ${b.ret} 返却予定  ${b.vehicle_type || ''}  ${b.full_name || ''}`);
      }
      lines.push(``);
    }
    lines.push(`→ 管理画面: https://admin.vantripjapan.jp/admin/`);

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VanTripJapan <booking@vantripjapan.jp>',
        to: ['info@vantripjapan.jp'],
        subject: `📋 ステータス確認のお願い — 進め忘れ ${staleRows.length} 件 / レンタル中 ${runningRows.length} 件`,
        text: lines.join('\n'),
      }),
    }).catch((e) => console.error('[StatusNudge Mail]', e?.message));
  }

  return Response.json({ ok: true, stale: staleRows.length, running: runningRows.length });
}
