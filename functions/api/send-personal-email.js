/**
 * send-personal-email.js
 * 
 * 柴垣さん個人名義のシンプルメール送信 Cloudflare Function
 * shibagaki@crystalinsence.com から送信
 * CTRトラッキングなし・装飾なし・人間の温かみを感じるメール
 */

// 許可するオリジン（自社ドメインのみ）
const ALLOWED_ORIGINS = [
    'https://crystalinsence.com',
    'https://www.crystalinsence.com',
    'https://www.camjyo.com',
    'http://localhost:3001',  // ローカル開発用
];

function getCorsOrigin(request) {
    const origin = request.headers.get('Origin') || '';
    return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export async function onRequestPost(context) {
    const corsOrigin = getCorsOrigin(context.request);
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
        // --- 認証チェック ---
        const authHeader = context.request.headers.get('Authorization') || '';
        const SEND_SECRET = context.env.MAIL_SEND_SECRET;

        if (!SEND_SECRET || authHeader !== `Bearer ${SEND_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers
            });
        }

        const body = await context.request.json();
        const { to, recipientName, subject, bodyText, fromAddress } = body;

        // Validate
        if (!to || !subject || !bodyText) {
            return new Response(JSON.stringify({ error: 'to, subject, bodyText は必須です' }), {
                status: 400, headers
            });
        }

        // --- 送信先数の制限（悪用防止） ---
        const recipients = Array.isArray(to) ? to : [to];
        if (recipients.length > 50) {
            return new Response(JSON.stringify({ error: '一度に送信できるのは50件までです' }), {
                status: 400, headers
            });
        }

        const RESEND_KEY = context.env.RESEND_API_KEY;
        if (!RESEND_KEY) {
            return new Response(JSON.stringify({ error: 'Email service not configured' }), {
                status: 500, headers
            });
        }

        // --- 送信元の選択 ---
        const senderMap = {
            'shibagaki': {
                from: '柴垣 道弘 <shibagaki@crystalinsence.com>',
                replyTo: 'shibagaki@crystalinsence.com',
            },
            'info': {
                from: 'Crystal Insence <info@crystalinsence.com>',
                replyTo: 'info@crystalinsence.com',
            },
        };

        const sender = senderMap[fromAddress] || senderMap['shibagaki'];

        // --- 挨拶文を組み立て ---
        const greeting = recipientName
            ? `${recipientName}さん、こんにちは。`
            : 'こんにちは。';

        // --- 超シンプルなHTML（プレーンテキスト風） ---
        // 装飾なし、トラッキングなし、友人からの手紙のように
        const html = `<div style="font-family: 'Hiragino Kaku Gothic Pro', 'Noto Sans JP', 'メイリオ', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #333; font-size: 15px; line-height: 1.9;">
<p style="margin: 0 0 24px;">${greeting}<br>
Crystal Insence の柴垣です。</p>

${bodyText.split('\n\n').map(p => `<p style="margin: 0 0 20px;">${p.replace(/\n/g, '<br>')}</p>`).join('\n')}

<p style="margin: 32px 0 0; color: #333;">ではまた。<br>
お体に気をつけて。</p>

<p style="margin: 24px 0 0; color: #555; font-size: 14px;">
柴垣 道弘<br>
<span style="font-size: 12px; color: #888;">Crystal Insence / 香司<br>
Handcrafted in Fukuoka, Japan</span>
</p>

<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;">

<p style="font-size: 11px; color: #aaa; line-height: 1.6; margin: 0;">
このメールは Crystal Insence にご登録いただいた方にお届けしています。<br>
配信停止をご希望の場合は、このメールに「配信停止」とご返信ください。
</p>
</div>`;

        // --- プレーンテキスト版も生成 ---
        const text = `${greeting}
Crystal Insence の柴垣です。

${bodyText}

ではまた。
お体に気をつけて。

柴垣 道弘
Crystal Insence / 香司
Handcrafted in Fukuoka, Japan

---
このメールは Crystal Insence にご登録いただいた方にお届けしています。
配信停止をご希望の場合は、このメールに「配信停止」とご返信ください。`;

        // --- Resend API で送信 ---
        const emailPayload = {
            from: sender.from,
            reply_to: sender.replyTo,
            to: Array.isArray(to) ? to : [to],
            subject: subject,
            html: html,
            text: text,
        };

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayload),
        });

        const resendData = await resendResponse.json();

        if (!resendResponse.ok) {
            return new Response(JSON.stringify({
                error: resendData.message || 'Email send failed',
            }), { status: 500, headers });
        }

        return new Response(JSON.stringify({
            success: true,
            id: resendData.id,
            from: sender.from,
        }), { status: 200, headers });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers
        });
    }
}

export async function onRequestOptions(context) {
    const corsOrigin = getCorsOrigin(context.request);
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}
