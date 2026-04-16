/**
 * Quote API — /api/quote
 * POST (public): Receive quote request from rent page calculator
 * Stores in D1 + sends notification email via MailChannels
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const data = await request.json();

    // Validate email
    if (!data.email || !data.email.includes('@')) {
      return Response.json({ error: 'Valid email required' }, { status: 400 });
    }

    // Sanitize input
    const quote = {
      email: data.email.trim().toLowerCase(),
      name: (data.name || '').trim().slice(0, 100) || 'Not provided',
      dates: (data.dates || '').trim().slice(0, 200) || 'Flexible',
      days: parseInt(data.days) || 7,
      vehicle: ['Probox', 'Bongo'].includes(data.vehicle) ? data.vehicle : 'Probox',
      daily_rate: parseInt(data.dailyRate) || 16500,
      people: parseInt(data.people) || 2,
      total: parseInt(data.total) || 0,
      discount: (data.discount || 'None').slice(0, 50),
      lang: (data.lang || 'en').slice(0, 5),
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      user_agent: (request.headers.get('User-Agent') || '').slice(0, 200),
      created_at: new Date().toISOString(),
    };

    // Store in D1 if binding exists
    if (env?.CUSTOMERS_DB) {
      try {
        await env.CUSTOMERS_DB.prepare(`
          INSERT INTO quote_requests (email, name, preferred_dates, days, vehicle, daily_rate, people, total_estimate, discount, lang, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          quote.email, quote.name, quote.dates, quote.days,
          quote.vehicle, quote.daily_rate, quote.people, quote.total,
          quote.discount, quote.lang, quote.ip, quote.user_agent
        ).run();
      } catch (dbErr) {
        console.error('[Quote DB]', dbErr.message);
        // Continue even if DB insert fails — still send notification
      }
    }

    // Send notification email via MailChannels (Cloudflare Workers integration)
    try {
      const emailBody = [
        `📧 New Quote Request from VanTripJapan`,
        ``,
        `👤 Name: ${quote.name}`,
        `📧 Email: ${quote.email}`,
        `📅 Dates: ${quote.dates}`,
        `🚐 Vehicle: ${quote.vehicle}`,
        `📆 Days: ${quote.days}`,
        `👥 People: ${quote.people}`,
        `💰 Daily Rate: ¥${quote.daily_rate.toLocaleString()}`,
        `💰 Total: ¥${quote.total.toLocaleString()}`,
        `🎉 Discount: ${quote.discount}`,
        `🌐 Language: ${quote.lang}`,
        `🕐 Time: ${quote.created_at}`,
        `🌍 IP: ${quote.ip}`,
      ].join('\n');

      await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: 'info@vantripjapan.jp', name: 'VanTripJapan' }],
          }],
          from: { email: 'noreply@vantripjapan.jp', name: 'VanTripJapan Quote Bot' },
          subject: `🚐 Quote: ${quote.vehicle} ${quote.days}d — ${quote.name} (${quote.email})`,
          content: [{
            type: 'text/plain',
            value: emailBody,
          }],
        }),
      });
    } catch (mailErr) {
      console.error('[Quote Mail]', mailErr.message);
      // Non-critical — quote is still saved in DB
    }

    return Response.json({ status: 'ok', message: 'Quote request received' });

  } catch (err) {
    console.error('[Quote API]', err.message);
    return Response.json({ error: 'Failed to process quote request' }, { status: 500 });
  }
}
