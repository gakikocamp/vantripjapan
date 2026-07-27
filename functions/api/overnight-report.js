/**
 * Overnight DB Field Reports — /api/overnight-report
 * POST (public): 駅の車中泊ルール変更報告（禁止看板を見た等）を受け付ける
 * Stores in CUSTOMERS_DB (overnight_reports) + notifies team via Resend
 * 検証フロー: 報告 → info@ へ通知 → 一次情報で裏取り → content/overnight-stations.json 更新 → 再ビルド
 */

const REPORT_TYPES = ['ban_sign', 'rv_park', 'no_ban', 'other'];
const TYPE_LABEL = {
  ban_sign: '🔴 禁止看板・禁止告知を見た',
  rv_park: '🟢 RVパーク情報',
  no_ban: '🟡 禁止表示なしの報告',
  other: 'その他の変更',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const data = await request.json();

    // Honeypot — botはこのフィールドを埋める
    if ((data.website || '').trim() !== '') {
      return Response.json({ ok: true }); // 静かに捨てる
    }

    const stationId = (data.station_id || '').trim();
    if (!/^[a-z0-9-]{2,60}$/.test(stationId)) {
      return Response.json({ error: 'Invalid station' }, { status: 400 });
    }
    const message = (data.message || '').trim();
    if (message.length < 5 || message.length > 1500) {
      return Response.json({ error: 'Message must be 5-1500 characters' }, { status: 400 });
    }

    const report = {
      station_id: stationId,
      report_type: REPORT_TYPES.includes(data.report_type) ? data.report_type : 'other',
      message,
      contact: (data.contact || '').trim().slice(0, 200),
      lang: (data.lang || 'en').slice(0, 5),
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      user_agent: (request.headers.get('User-Agent') || '').slice(0, 200),
    };

    if (env?.CUSTOMERS_DB) {
      // 簡易レート制限: 同一IPから1時間に5件まで
      try {
        const { results } = await env.CUSTOMERS_DB.prepare(
          `SELECT COUNT(*) AS n FROM overnight_reports
           WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`
        ).bind(report.ip).all();
        if (results?.[0]?.n >= 5) {
          return Response.json({ error: 'Too many reports — please try later' }, { status: 429 });
        }
      } catch (e) {
        console.error('[OvernightReport rate]', e.message);
      }

      try {
        await env.CUSTOMERS_DB.prepare(
          `INSERT INTO overnight_reports (station_id, report_type, message, contact, lang, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          report.station_id, report.report_type, report.message,
          report.contact, report.lang, report.ip, report.user_agent
        ).run();
      } catch (dbErr) {
        console.error('[OvernightReport DB]', dbErr.message);
        // DB失敗でも通知は送る
      }
    }

    // チーム通知（quote.jsと同じResendパターン）
    try {
      if (env.RESEND_API_KEY) {
        const pageUrl = `https://vantripjapan.jp/overnight-parking/michi-no-eki/`;
        const body = [
          `🏕️ 車中泊DBに現地報告が届きました`,
          ``,
          `📍 駅ID: ${report.station_id}`,
          `🏷️ 種別: ${TYPE_LABEL[report.report_type]}`,
          `💬 内容: ${report.message}`,
          `📧 連絡先: ${report.contact || '（なし）'}`,
          `🌐 言語: ${report.lang} / IP: ${report.ip}`,
          ``,
          `→ 検証フロー: 一次情報（公式サイト・現地・電話）で裏取り →`,
          `  content/overnight-stations.json を更新 → node scripts/build-overnight-pages.js → safe-deploy`,
          `→ DBページ: ${pageUrl}`,
        ].join('\n');

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VanTripJapan Overnight DB <quote@vantripjapan.jp>',
            to: ['info@vantripjapan.jp'],
            subject: `🏕️ Overnight DB報告: ${report.station_id} (${TYPE_LABEL[report.report_type]})`,
            text: body,
          }),
        });
        if (!res.ok) console.error('[OvernightReport Resend]', await res.text());
      } else {
        console.error('Missing env.RESEND_API_KEY. Overnight report notification skipped.');
      }
    } catch (mailErr) {
      console.error('[OvernightReport Mail]', mailErr.message);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[OvernightReport]', err.message);
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
