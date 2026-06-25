/**
 * VanTripJapan — Newsletter Unsubscribe API
 * GET /api/newsletter/unsubscribe — unsubscribes user by setting current_step = -1
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  const lang = url.searchParams.get('lang') || 'en';

  if (!email) {
    return new Response('Email parameter required', { status: 400 });
  }

  // 1. Unsubscribe from Custom CRM (drip_subscribers)
  if (env.CUSTOMERS_DB) {
    try {
      await env.CUSTOMERS_DB.prepare(
        `UPDATE drip_subscribers 
         SET current_step = -1, next_send_date = NULL, last_sent_at = datetime('now', 'localtime') 
         WHERE email = ?`
      ).bind(email).run();
    } catch (err) {
      console.error('CRM Unsubscribe D1 error:', err.message);
    }
  }

  // 2. Unsubscribe from Legacy Newsletter Subscribers if exists
  if (env.DB) {
    try {
      // Delete or set unsubscribed if legacy schema has unsubscribe flags (we just delete or ignore)
      // Since it's legacy, we'll keep the record but delete it or keep it as is.
      // Usually, just setting CRM to unsubscribed is sufficient.
    } catch (err) {
      console.error('Legacy Unsubscribe error:', err.message);
    }
  }

  const title = lang === 'ja' ? '配信解除完了' : 'Unsubscribed Successfully';
  const message = lang === 'ja' 
    ? 'メルマガの配信解除が完了しました。いつでもまたご登録いただけます！'
    : 'You have been successfully unsubscribed from our newsletter. You can subscribe again anytime!';
  const homeBtn = lang === 'ja' ? 'ホームに戻る' : 'Go back to Home';

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — VanTripJapan</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f7f9fa;
      color: #333333;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 {
      font-size: 24px;
      color: #1a1a2e;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #666666;
      margin-bottom: 24px;
    }
    a {
      display: inline-block;
      padding: 12px 24px;
      background-color: #4b6b94;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      transition: background-color 0.2s;
    }
    a:hover {
      background-color: #3b5374;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://vantripjapan.jp">${homeBtn}</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
