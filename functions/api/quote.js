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
      vehicle: ['Probox', 'Bongo', 'Pocket Loft'].includes(data.vehicle) ? data.vehicle : 'Probox',
      daily_rate: parseInt(data.dailyRate) || 22000,
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

    // Send notification email via Resend API
    try {
      const resendApiKey = env.RESEND_API_KEY;
      if (!resendApiKey) {
        console.error('Missing env.RESEND_API_KEY. Quote email notification skipped.');
      } else {
        const nameLower = quote.name.toLowerCase();
        const emailLower = quote.email.toLowerCase();
        const isTest = nameLower.includes('test') || nameLower.includes('テスト') || nameLower.includes('dummy') ||
                       emailLower.includes('test') || emailLower.includes('dummy') ||
                       quote.dates.toLowerCase().includes('test') || quote.dates.includes('テスト');

        const emailBody = [
          `📧 New Quote Request from VanTripJapan`,
          isTest ? `⚠️ [TEST SUBMISSION / テスト送信]` : ``,
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
          ``,
          `→ Reply via Email: mailto:${quote.email}`,
        ].join('\n');

        const emailHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #2d3748;">
  <!-- Title/Header Banner -->
  <div style="background-color: ${isTest ? '#d69e2e' : '#2b6cb0'}; padding: 20px; color: #ffffff; text-align: center;">
    <h2 style="margin: 0; font-size: 20px;">📧 新規見積もりリクエスト (Quote Request)</h2>
    ${isTest ? '<div style="margin-top: 5px; font-weight: bold; background-color: rgba(255,255,255,0.2); display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px;">⚠️ テスト送信の可能性があります (Test Submission)</div>' : ''}
  </div>

  <div style="padding: 24px;">
    <!-- Customer Quick Action / Contact Info -->
    <h3 style="margin-top: 0; color: #2b6cb0; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">👤 お客様情報 (Customer Info)</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; font-weight: bold; width: 150px; color: #4a5568;">お名前 (Name):</td>
        <td style="padding: 6px 0; font-weight: bold;">${quote.name}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">メール (Email):</td>
        <td style="padding: 6px 0;"><a href="mailto:${quote.email}" style="color: #3182ce; text-decoration: underline;">${quote.email}</a></td>
      </tr>
    </table>

    <!-- Admin Actions -->
    <h3 style="color: #2b6cb0; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">🚀 次のアクション (Next Steps)</h3>
    <div style="margin-bottom: 25px;">
      <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #4a5568;">
        お見積もりへの返信・料金の提示を行うには、以下のボタンを押してください：
      </p>
      
      <!-- Action 1: Reply via Email -->
      <a href="mailto:${quote.email}?subject=Re: VanTripJapan Quote Estimate" style="display: block; background-color: #3182ce; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 4px; font-size: 14px;">
        ✉️ お客様にメールで返信する (料金見積を提示)
      </a>
      <div style="font-size: 11px; color: #718096; text-align: center;">
        （※この通知メールにそのまま「返信」をしても、お客様宛に届きます）
      </div>
    </div>

    <!-- Details Table -->
    <h3 style="color: #2b6cb0; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">📋 見積もり依頼詳細 (Details)</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.5;">
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; width: 180px; color: #4a5568;">希望車両 (Vehicle)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.vehicle}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">希望日程 (Dates)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.dates}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">レンタル日数 (Days)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.days} 日間</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">人数 (People)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.people} 名</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">概算総額 (Total)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #b7791f; font-size: 14px;">¥${quote.total.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">適用割引 (Discount)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.discount}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">使用言語 (Language)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.lang}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">日時 (Created)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${quote.created_at}</td>
      </tr>
    </table>
  </div>
</div>
        `;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VanTripJapan Quote Bot <quote@vantripjapan.jp>',
            reply_to: quote.email,
            to: ['info@vantripjapan.jp'],
            subject: `${isTest ? '⚠️ [TEST] ' : ''}🚐 Quote: ${quote.vehicle} ${quote.days}d — ${quote.name} (${quote.email})`,
            text: emailBody,
            html: emailHtml,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('[Quote Resend API Error]', errText);
        }
      }
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
