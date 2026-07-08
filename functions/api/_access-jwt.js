/**
 * Cloudflare Access JWT 検証
 *
 * admin.vantripjapan.jp は Cloudflare Access で保護されており、認証済みリクエストには
 * `Cf-Access-Jwt-Assertion` ヘッダ（RS256署名付きJWT）が注入される。この関数はその署名を
 * チームの公開鍵(JWKS)で検証し、exp/iss を確認して本人のメールを返す。
 *
 * - クライアントが cf-access-* ヘッダを偽装しても Cloudflare が剥がすため注入不可
 * - 署名検証まで行うので、別チーム/別アプリのトークンや期限切れも弾ける（fail-closed）
 *
 * 環境変数（任意）:
 *   ACCESS_TEAM_DOMAIN … 例 "flat-thunder-9ad3.cloudflareaccess.com"（未設定時は下記の既定値）
 *   ACCESS_AUD         … Application Audience タグ。設定時のみ aud も検証する。
 */

const DEFAULT_TEAM_DOMAIN = 'flat-thunder-9ad3.cloudflareaccess.com';

// モジュールスコープの JWKS キャッシュ（Worker isolate 内で使い回す）
let _jwksCache = { keys: null, fetchedAt: 0, domain: null };
const JWKS_TTL_MS = 3600_000; // 1時間

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getJwks(teamDomain, now) {
  if (_jwksCache.keys && _jwksCache.domain === teamDomain && now - _jwksCache.fetchedAt < JWKS_TTL_MS) {
    return _jwksCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  _jwksCache = { keys, fetchedAt: now, domain: teamDomain };
  return keys;
}

/**
 * @returns {Promise<string|null>} 検証OKなら email、失敗なら null
 */
export async function verifyAccessJwt(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const teamDomain = env?.ACCESS_TEAM_DOMAIN || DEFAULT_TEAM_DOMAIN;
  const now = Date.now();

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return null;
  }

  // 期限・発行者チェック
  if (!payload.exp || payload.exp * 1000 < now) return null;
  const expectedIss = `https://${teamDomain}`;
  if (payload.iss && payload.iss !== expectedIss) return null;
  if (env?.ACCESS_AUD) {
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return null;
  }

  // 署名検証
  let keys;
  try {
    keys = await getJwks(teamDomain, now);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64urlToBytes(parts[2]), data);
  } catch {
    return null;
  }
  if (!ok) return null;

  return payload.email || payload.identity || 'access-user';
}
