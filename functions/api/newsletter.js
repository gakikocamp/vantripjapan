/**
 * VanTripJapan — Newsletter Subscription API (Custom CRM & Drip Campaign Integrated)
 * POST /api/newsletter — stores email in drip_subscribers (CUSTOMERS_DB), sends step 1 email via Resend
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'Karen | VanTripJapan <newsletter@vantripjapan.jp>';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
  const survey = (body.survey || 'kyushu').trim().slice(0, 50);
  const language = (body.language || 'en').trim().slice(0, 10);

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1. Backwards Compatibility: Store in main DB
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO newsletter_subscribers (site, email, name, subscribed_at)
         VALUES ('vantrip', ?, ?, datetime('now'))
         ON CONFLICT(site, email) DO NOTHING`
      ).bind(email, name || null).run();
    } catch (err) {
      console.error('Legacy Newsletter DB error:', err.message, { email });
    }
  }

  let shouldSendDrip1 = false;

  // 2. Custom CRM: Store in CUSTOMERS_DB (drip_subscribers)
  if (env.CUSTOMERS_DB) {
    try {
      // Check if subscriber already exists
      const existing = await env.CUSTOMERS_DB.prepare(
        'SELECT current_step FROM drip_subscribers WHERE email = ?'
      ).bind(email).first();

      if (!existing) {
        // New subscriber
        await env.CUSTOMERS_DB.prepare(
          `INSERT INTO drip_subscribers (email, name, survey, language, current_step, next_send_date, last_sent_at)
           VALUES (?, ?, ?, ?, 1, date('now', '+2 days'), datetime('now', 'localtime'))`
        ).bind(email, name || null, survey, language).run();
        shouldSendDrip1 = true;
      } else if (existing.current_step === -1) {
        // Resubscribing from unsubscribe state
        await env.CUSTOMERS_DB.prepare(
          `UPDATE drip_subscribers 
           SET name = ?, survey = ?, language = ?, current_step = 1, next_send_date = date('now', '+2 days'), last_sent_at = datetime('now', 'localtime')
           WHERE email = ?`
        ).bind(name || null, survey, language, email).run();
        shouldSendDrip1 = true;
      } else {
        // Already active or finished, do not restart
        console.log(`Subscriber ${email} already at step ${existing.current_step}. Skipping restart.`);
      }
    } catch (err) {
      console.error('Custom CRM DB error:', err.message, { email });
    }
  }

  // 2.5. Sync to Resend Audience
  if (env.RESEND_API_KEY) {
    try {
      const audienceRes = await fetch('https://api.resend.com/audiences/de618a55-3736-4982-a19d-2996b31ef834/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          first_name: name.split(' ')[0] || '',
          last_name: name.split(' ').slice(1).join(' ') || '',
          unsubscribed: false,
          metadata: {
            lang: language,
            source: 'newsletter_form',
            survey: survey
          }
        }),
      });
      if (!audienceRes.ok) {
        const errText = await audienceRes.text();
        console.error('Failed to sync newsletter subscriber to Resend Audience:', errText);
      }
    } catch (e) {
      console.error('Error syncing newsletter subscriber to Resend Audience:', e.message);
    }
  }

  // 3. Send step 1 welcome drip email if needed
  if (shouldSendDrip1 && env.RESEND_API_KEY) {
    try {
      // Fetch Step 1 template
      let template = await env.CUSTOMERS_DB.prepare(
        'SELECT subject, body_html FROM email_templates WHERE step = 1 AND language = ?'
      ).bind(language).first();

      // Fallback to English if language template is missing
      if (!template && language !== 'en') {
        template = await env.CUSTOMERS_DB.prepare(
          'SELECT subject, body_html FROM email_templates WHERE step = 1 AND language = \'en\''
        ).first();
      }

      if (template) {
        // Render content
        const renderedSubject = template.subject.replace(/{Name}/gi, name || 'there');
        const unsubUrl = `https://vantripjapan.jp/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&lang=${language}`;
        const renderedHtml = template.body_html
          .replace(/{Name}/gi, name || 'there')
          .replace(/{{UnsubscribeURL}}/g, unsubUrl);

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
          console.error('Resend Step 1 delivery error:', errText);
        }
      } else {
        console.error('Step 1 template not found in DB.');
      }
    } catch (err) {
      console.error('Resend Step 1 send error:', err);
    }
  }

  // 3.5. Send email notification to Karen (owner) on new lead capture
  if (shouldSendDrip1 && env.RESEND_API_KEY) {
    try {
      const ownerSubject = `[Lead Alert] New Kyushu Guide Download - ${name || 'New Lead'}`;
      const ownerHtml = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #2d3748; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background-color: #f7fafc;">
          <h2 style="color: #2c5282; margin-top: 0; display: flex; align-items: center; gap: 8px;">🗺️ New Guide Download</h2>
          <p>Hi Karen,</p>
          <p>A new traveler has just requested the free <strong>Kyushu Road Trip Guide</strong>!</p>
          <div style="background-color: #ffffff; border: 1px solid #edf2f7; border-radius: 6px; padding: 16px; margin: 18px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; width: 120px; color: #4a5568;">Name:</td>
                <td style="padding: 6px 0; color: #2d3748;">${name || '—'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">Email:</td>
                <td style="padding: 6px 0;"><a href="mailto:${email}" style="color: #3182ce; text-decoration: underline;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">Planned Area:</td>
                <td style="padding: 6px 0; color: #2d3748; text-transform: capitalize;">${survey}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">Language:</td>
                <td style="padding: 6px 0; color: #2d3748; text-transform: uppercase;">${language}</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 13px; color: #718096; margin-bottom: 0;">They have been subscribed to the 5-step nurturing drip email campaign (Step 1 sent in ${language}).</p>
        </div>
      `;

      await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: ['info@vantripjapan.jp'],
          subject: ownerSubject,
          html: ownerHtml,
        }),
      });
    } catch (err) {
      console.error('Owner lead notification delivery error:', err);
    }
  }

  // 4. Backwards Compatibility: Sync to MailerLite if configured
  if (env.MAILERLITE_API_KEY) {
    try {
      const mlData = {
        email: email,
        fields: {
          name: name || '',
          language: language,
          survey: survey
        }
      };
      
      if (env.MAILERLITE_GROUP_ID) {
        mlData.groups = [env.MAILERLITE_GROUP_ID];
      }

      await fetch('https://connect.mailerlite.com/api/subscribers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(mlData)
      });
    } catch (err) {
      console.error('MailerLite sync error:', err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
