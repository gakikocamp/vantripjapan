/**
 * VanTripJapan — Admin Drip Campaign & CRM API
 * GET: Retrieves templates and subscribers list
 * POST: Handles CRM actions (saving templates, sending test emails, managing subscribers)
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'Karen | VanTripJapan <newsletter@vantripjapan.jp>';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Missing CUSTOMERS_DB binding' }, { status: 500 });
  }

  try {
    // 1. Fetch all subscribers
    const subscribers = await env.CUSTOMERS_DB.prepare(
      'SELECT * FROM drip_subscribers ORDER BY subscribed_at DESC'
    ).all();

    // 2. Fetch all templates
    const templates = await env.CUSTOMERS_DB.prepare(
      'SELECT * FROM email_templates ORDER BY step ASC, language ASC'
    ).all();

    return Response.json({
      subscribers: subscribers.results || [],
      templates: templates.results || []
    });
  } catch (err) {
    console.error('Admin CRM GET error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Missing CUSTOMERS_DB binding' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;

  try {
    // Action 1: Save Template
    if (action === 'save_template') {
      const { step, language, subject, body_html, delay_days } = body;
      
      if (!step || !language || !subject || !body_html) {
        return Response.json({ error: 'Missing template fields' }, { status: 400 });
      }

      await env.CUSTOMERS_DB.prepare(
        `INSERT OR REPLACE INTO email_templates (step, language, subject, body_html, delay_days)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(step, language, subject, body_html, delay_days || 3).run();

      return Response.json({ ok: true, message: 'Template saved successfully' });
    }

    // Action 2: Send Test Email
    if (action === 'send_test') {
      const { step, language, test_email } = body;

      if (!step || !language || !test_email) {
        return Response.json({ error: 'Missing test parameters' }, { status: 400 });
      }

      if (!env.RESEND_API_KEY) {
        return Response.json({ error: 'Resend API key not configured' }, { status: 500 });
      }

      const template = await env.CUSTOMERS_DB.prepare(
        'SELECT subject, body_html FROM email_templates WHERE step = ? AND language = ?'
      ).bind(step, language).first();

      if (!template) {
        return Response.json({ error: 'Template not found' }, { status: 404 });
      }

      const unsubUrl = `https://vantripjapan.jp/api/newsletter/unsubscribe?email=${encodeURIComponent(test_email)}&lang=${language}`;
      const renderedSubject = `[TEST] ${template.subject.replace(/{Name}/gi, 'Test User')}`;
      const renderedHtml = template.body_html
        .replace(/{Name}/gi, 'Test User')
        .replace(/{{UnsubscribeURL}}/g, unsubUrl);

      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [test_email],
          subject: renderedSubject,
          html: renderedHtml,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return Response.json({ error: `Resend error: ${errText}` }, { status: 502 });
      }

      return Response.json({ ok: true, message: 'Test email sent successfully' });
    }

    // Action 3: Unsubscribe Subscriber manually
    if (action === 'unsubscribe') {
      const { id } = body;
      if (!id) return Response.json({ error: 'Missing subscriber ID' }, { status: 400 });

      await env.CUSTOMERS_DB.prepare(
        'UPDATE drip_subscribers SET current_step = -1, next_send_date = NULL WHERE id = ?'
      ).bind(id).run();

      return Response.json({ ok: true, message: 'Subscriber unsubscribed' });
    }

    // Action 4: Resubscribe / Reset Subscriber
    if (action === 'resubscribe') {
      const { id } = body;
      if (!id) return Response.json({ error: 'Missing subscriber ID' }, { status: 400 });

      await env.CUSTOMERS_DB.prepare(
        `UPDATE drip_subscribers 
         SET current_step = 1, 
             next_send_date = date('now', 'localtime', '+2 days'),
             last_sent_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).bind(id).run();

      // Note: This resets them to step 1 (which means they'll start getting step 2 after 2 days).
      // We don't trigger the step 1 welcome email again here to avoid duplicate spamming unless they submit the signup form.
      return Response.json({ ok: true, message: 'Subscriber reset to Step 1 active' });
    }

    // Action 5: Delete Subscriber
    if (action === 'delete_subscriber') {
      const { id } = body;
      if (!id) return Response.json({ error: 'Missing subscriber ID' }, { status: 400 });

      await env.CUSTOMERS_DB.prepare(
        'DELETE FROM drip_subscribers WHERE id = ?'
      ).bind(id).run();

      return Response.json({ ok: true, message: 'Subscriber deleted successfully' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Admin CRM POST error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
