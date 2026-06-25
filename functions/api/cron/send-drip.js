/**
 * VanTripJapan — Daily Drip Email Campaign Cron Endpoint
 * GET /api/cron/send-drip — processes daily candidates and sends step 2-5 emails via Resend
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'Karen | VanTripJapan <newsletter@vantripjapan.jp>';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Security Check: CRON_SECRET authorization
  const authHeader = request.headers.get('Authorization');
  const secretParam = url.searchParams.get('secret');
  const cronSecret = env.CRON_SECRET;

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (cronSecret && !isLocal) {
    const isAuthorized = 
      (authHeader === `Bearer ${cronSecret}`) || 
      (secretParam === cronSecret);
      
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (!env.CUSTOMERS_DB) {
    return new Response(JSON.stringify({ error: 'Missing CUSTOMERS_DB binding' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY environment variable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results = [];
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  try {
    // 1. Fetch all active subscribers who are scheduled to receive the next email today or earlier
    const subscribers = await env.CUSTOMERS_DB.prepare(
      `SELECT * FROM drip_subscribers 
       WHERE current_step >= 1 
         AND current_step < 5 
         AND next_send_date <= date('now', 'localtime')`
    ).all();

    if (!subscribers.results || subscribers.results.length === 0) {
      return new Response(JSON.stringify({ message: 'No candidates for drip campaign today.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Loop and process each candidate
    for (const sub of subscribers.results) {
      processedCount++;
      const nextStep = sub.current_step + 1;
      const email = sub.email;
      const name = sub.name || '';
      const lang = sub.language || 'en';

      try {
        // Fetch next step template in candidate's language
        let template = await env.CUSTOMERS_DB.prepare(
          'SELECT subject, body_html, delay_days FROM email_templates WHERE step = ? AND language = ?'
        ).bind(nextStep, lang).first();

        // Fallback to English template if not found
        if (!template && lang !== 'en') {
          template = await env.CUSTOMERS_DB.prepare(
            'SELECT subject, body_html, delay_days FROM email_templates WHERE step = ? AND language = \'en\''
          ).bind(nextStep).first();
        }

        if (!template) {
          throw new Error(`Template for step ${nextStep} (${lang}) not found`);
        }

        // Render template variables
        const renderedSubject = template.subject.replace(/{Name}/gi, name || 'there');
        const unsubUrl = `https://vantripjapan.jp/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&lang=${lang}`;
        const renderedHtml = template.body_html
          .replace(/{Name}/gi, name || 'there')
          .replace(/{{UnsubscribeURL}}/g, unsubUrl);

        // Send email via Resend
        const res = await fetch(RESEND_API, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM,
            to: [email],
            subject: renderedSubject,
            html: renderedHtml,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Resend API Error: ${errText}`);
        }

        // Calculate next date or finish
        let nextSendDate = null;
        if (nextStep < 5) {
          const delay = template.delay_days || 3;
          // Calculate delay using SQL date arithmetic
          const nextDateRow = await env.CUSTOMERS_DB.prepare(
            `SELECT date('now', 'localtime', '+' || ? || ' days') as d`
          ).bind(delay).first();
          if (nextDateRow) {
            nextSendDate = nextDateRow.d;
          }
        }

        // Update subscriber status in D1
        await env.CUSTOMERS_DB.prepare(
          `UPDATE drip_subscribers 
           SET current_step = ?, 
               next_send_date = ?, 
               last_sent_at = datetime('now', 'localtime') 
           WHERE id = ?`
        ).bind(nextStep, nextSendDate, sub.id).run();

        successCount++;
        results.push({ email, step: nextStep, status: 'success' });
      } catch (err) {
        errorCount++;
        console.error(`Error processing drip for ${email}:`, err.message);
        results.push({ email, step: nextStep, status: 'error', error: err.message });
      }
    }
  } catch (err) {
    console.error('Drip cron general error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: processedCount,
    success: successCount,
    errors: errorCount,
    results
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
