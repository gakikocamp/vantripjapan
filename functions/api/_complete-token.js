/**
 * 予約手続きページ用トークン — HMAC-SHA256(booking_id, ENCRYPTION_KEY)の先頭32hex。
 * URLを知っている本人だけが自分の予約手続きページを開ける（PIIは最小限しか返さない）。
 */
export async function buildCompleteToken(bookingId, env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(String(env.ENCRYPTION_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`vtj-complete:${bookingId}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function verifyCompleteToken(bookingId, token, env) {
  if (!bookingId || !token) return false;
  const expected = await buildCompleteToken(bookingId, env);
  if (token.length !== expected.length) return false;
  // 定数時間比較
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
