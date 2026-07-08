/**
 * 管理画面ホスト強制ミドルウェア（/admin/* に適用）
 *
 * 管理ダッシュボードは Cloudflare Access で保護された admin.vantripjapan.jp からのみ
 * 使う。主ドメイン（vantripjapan.jp）の /admin/* はAccess保護外なので、ログイン情報が
 * 付かず API が「Authentication required」を返してしまう。
 * ここで主ドメインの /admin/* を保護サブドメインへ 301 転送し、古いURL/ブックマークでも
 * 必ず認証を通るようにする。admin.vantripjapan.jp 自身はそのまま静的資産を配信（ループ防止）。
 */
export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const host = url.hostname;

  if (host === 'vantripjapan.jp' || host === 'www.vantripjapan.jp') {
    return Response.redirect(`https://admin.vantripjapan.jp${url.pathname}${url.search}`, 301);
  }

  // admin.vantripjapan.jp（Access保護下）ではそのまま配信
  return next();
}
