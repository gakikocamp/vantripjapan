/**
 * Overnight DB ○×投票 — /api/overnight-vote
 *   GET  ?station=<id>            集計を返す（静的ページから読み込む）
 *   POST {station_id, vote, lang} 1タップ投票を記録し、閾値超えでチームに通知
 *
 * 方針: 投票は「旅行者の声」であって検証ではない。表示は集計値の提示にとどめ、
 *       ステータス（泊まれる/泊まれない）の自動変更はしない。閾値を超えたら人間が
 *       一次情報で確認して content/overnight-stations.json を更新する。
 */

const ALERT_MILESTONES = [2, 5, 10, 25, 50];

async function ipHash(ip, salt) {
  const buf = new TextEncoder().encode(`${salt || "vtj"}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function tally(env, stationId) {
  const { results } = await env.CUSTOMERS_DB.prepare(
    `SELECT vote, COUNT(*) AS n FROM overnight_votes WHERE station_id = ? GROUP BY vote`
  ).bind(stationId).all();
  const out = { yes: 0, no: 0 };
  for (const r of results || []) if (r.vote === "yes" || r.vote === "no") out[r.vote] = r.n;
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env?.CUSTOMERS_DB) return Response.json({ yes: 0, no: 0 });

  if (request.method === "GET") {
    const stationId = (url.searchParams.get("station") || "").trim();
    if (!/^[a-z0-9-]{2,60}$/.test(stationId)) return Response.json({ error: "Invalid station" }, { status: 400 });
    try {
      return Response.json(await tally(env, stationId), {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    } catch (e) {
      console.error("[OvernightVote GET]", e.message);
      return Response.json({ yes: 0, no: 0 });
    }
  }

  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const data = await request.json();
    const stationId = (data.station_id || "").trim();
    const vote = data.vote === "yes" || data.vote === "no" ? data.vote : null;
    if (!/^[a-z0-9-]{2,60}$/.test(stationId) || !vote) {
      return Response.json({ error: "Invalid vote" }, { status: 400 });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const hash = await ipHash(ip, env.ENCRYPTION_KEY);

    // 同一IPは1駅につき30日で1票
    const dup = await env.CUSTOMERS_DB.prepare(
      `SELECT COUNT(*) AS n FROM overnight_votes
       WHERE station_id = ? AND ip_hash = ? AND created_at > datetime('now', '-30 day')`
    ).bind(stationId, hash).all();
    if (dup.results?.[0]?.n > 0) {
      return Response.json({ ...(await tally(env, stationId)), already: true });
    }

    await env.CUSTOMERS_DB.prepare(
      `INSERT INTO overnight_votes (station_id, vote, ip_hash, lang) VALUES (?, ?, ?, ?)`
    ).bind(stationId, vote, hash, (data.lang || "en").slice(0, 5)).run();

    const t = await tally(env, stationId);

    // 「泊まれなかった」が節目に達したらチームに確認を依頼（自動で表示は変えない）
    if (vote === "no" && ALERT_MILESTONES.includes(t.no) && env.RESEND_API_KEY) {
      const total = t.yes + t.no;
      const pct = total ? Math.round((t.no / total) * 100) : 0;
      const body = [
        `⚠️ 車中泊DB: 「泊まれなかった」報告が ${t.no} 件に達しました`,
        ``,
        `📍 駅ID: ${stationId}`,
        `📊 集計: ✕${t.no} / ○${t.yes}（✕比率 ${pct}%）`,
        ``,
        `→ 投票はあくまで旅行者の声です。表示を変える前に一次情報で確認してください:`,
        `   1. 駅の公式サイト・現地掲示を確認`,
        `   2. content/overnight-stations.json の status と evidence を更新`,
        `   3. node scripts/build-overnight-pages.js → scripts/safe-deploy.sh`,
        ``,
        `→ 該当ページ: https://vantripjapan.jp/overnight-parking/michi-no-eki/`,
      ].join("\n");
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "VanTripJapan Overnight DB <quote@vantripjapan.jp>",
            to: ["info@vantripjapan.jp"],
            subject: `⚠️ Overnight DB: ${stationId} に✕報告${t.no}件（✕${pct}%）— 要確認`,
            text: body,
          }),
        });
      } catch (e) {
        console.error("[OvernightVote alert]", e.message);
      }
    }

    return Response.json(t);
  } catch (err) {
    console.error("[OvernightVote]", err.message);
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
