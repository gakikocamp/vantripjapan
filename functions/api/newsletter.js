/**
 * VanTripJapan — Newsletter Subscription API
 * POST /api/newsletter — stores email in D1, sends welcome email via Resend
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'VanTripJapan <newsletter@vantripjapan.jp>';
const REPLY_TO = 'info@vantripjapan.jp';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const WELCOME_HTML = (name) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1A1A2E;">
  <p style="font-size: 13px; letter-spacing: 2px; color: #BF4E30; text-transform: uppercase;">VAN TRIP JAPAN</p>
  <h1 style="font-size: 24px; font-weight: 600; margin: 16px 0;">Welcome${name ? ', ' + name : ''}!</h1>
  <p style="font-size: 16px; line-height: 1.8; color: #444;">
    You're now part of the VanTripJapan community. We'll send you road trip guides, hidden spots across Kyushu, and occasional updates about our campervan rental service in Fukuoka.
  </p>
  <p style="font-size: 16px; line-height: 1.8; color: #444;">
    Our vans are available from ¥16,500/day — all-inclusive, 10 minutes from Fukuoka Airport.
  </p>
  <a href="https://vantripjapan.jp/rent/" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #BF4E30; color: #fff; text-decoration: none; font-size: 14px; letter-spacing: 1px;">
    View Rental Options →
  </a>
  <p style="font-size: 14px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
    VanTripJapan · Fukuoka, Japan<br>
    <a href="https://vantripjapan.jp" style="color: #888;">vantripjapan.jp</a>
  </p>
</body>
</html>`;

const WELCOME_TEXT = (name) =>
  `Welcome${name ? ', ' + name : ''}!\n\nYou're now subscribed to VanTripJapan.\n\nWe'll send you road trip guides, hidden spots across Kyushu, and updates about our campervan rental in Fukuoka.\n\nOur vans start from ¥16,500/day — all-inclusive, 10 min from Fukuoka Airport.\nhttps://vantripjapan.jp/rent/\n\n— VanTripJapan Team`;

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://vantripjapan.jp',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const email = (body.email || '').trim().toLowerCase();
  const name  = (body.name  || '').trim().slice(0, 100);

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Store in D1
  try {
    await env.DB.prepare(
      `INSERT INTO newsletter_subscribers (site, email, name, subscribed_at)
       VALUES ('vantrip', ?, ?, datetime('now'))
       ON CONFLICT(site, email) DO NOTHING`
    ).bind(email, name || null).run();
  } catch (err) {
    // Table may not exist yet — still send welcome email
  }

  // Send welcome email via Resend
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [email],
        subject: 'Welcome to VanTripJapan 🚐',
        html: WELCOME_HTML(name),
        text: WELCOME_TEXT(name),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
    }
  } catch (err) {
    console.error('Resend fetch error:', err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
