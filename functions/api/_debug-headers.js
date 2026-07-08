/**
 * 一時診断エンドポイント — Cloudflare Access がどのヘッダを注入しているか確認する。
 * 原因特定後に必ず削除すること（PIIは返さない：自分のメールと存在有無のみ）。
 */
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const h = request.headers;

  const cfAccessHeaders = {};
  for (const [k, v] of h.entries()) {
    if (k.toLowerCase().startsWith('cf-access')) {
      // JWTなどの長い値は先頭だけ・メールはそのまま（本人のもの）
      cfAccessHeaders[k] = k.toLowerCase().includes('email') ? v : `present(len=${v.length})`;
    }
  }

  return Response.json({
    hostname: url.hostname,
    path: url.pathname,
    accessEmailHeader: h.get('Cf-Access-Authenticated-User-Email') || null,
    hasJwtAssertion: !!h.get('Cf-Access-Jwt-Assertion'),
    cfAccessHeaders,
    note: 'diagnostic only — will be removed',
  });
}
