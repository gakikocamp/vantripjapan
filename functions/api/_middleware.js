/**
 * API Middleware — Security layer for all /api/* requests.
 * - CORS control (vantripjapan.jp only)
 * - CSP headers
 * - Admin route protection via Cloudflare Access
 * - Rate limiting (simple IP-based)
 * - Access logging
 */

// In-memory rate limit store (per isolate, resets on cold start — acceptable for edge)
const rateLimitMap = new Map();
const RATE_LIMIT = 30; // requests per minute for public endpoints
const RATE_WINDOW = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW;
  }

  entry.count++;
  rateLimitMap.set(ip, entry);

  return entry.count <= RATE_LIMIT;
}

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         'unknown';
}

function getCFAccessEmail(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') || null;
}

function isAdminRoute(url) {
  const path = new URL(url).pathname;
  // Public endpoints: POST /api/booking, POST /api/documents
  if (path === '/api/booking' && true) return false; // checked by method below
  if (path === '/api/documents' && true) return false;
  // Everything under /api/admin-* or GET/PUT on /api/booking, /api/documents requires auth
  return true;
}

function isPublicRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Public: GET articles listing (homepage, category page)
  if (path === '/api/articles' && method === 'GET') return true;
  // Public: POST new booking
  if (path === '/api/booking' && method === 'POST') return true;
  // Public: POST document upload
  if (path === '/api/documents' && method === 'POST') return true;
  // Public: POST newsletter signup
  if (path === '/api/newsletter' && method === 'POST') return true;
  // Public: POST quote request
  if (path === '/api/quote' && method === 'POST') return true;
  // Public: OPTIONS (CORS preflight)
  if (method === 'OPTIONS') return true;

  return false;
}

const ALLOWED_ORIGINS = [
  'https://vantripjapan.jp',
  'https://www.vantripjapan.jp',
  'https://admin.vantripjapan.jp',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob:; connect-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=()',
  };
}

async function logAccess(db, email, action, resource, ip, detail) {
  try {
    await db.prepare(
      'INSERT INTO access_logs (user_email, action, resource, ip_address, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, action, resource, ip, detail).run();
  } catch (e) {
    console.error('Log error:', e);
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const ip = getClientIP(request);

  // Rate limit public endpoints
  if (isPublicRequest(request)) {
    if (!checkRateLimit(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }
  }

  // Admin authentication check
  if (!isPublicRequest(request)) {
    const email = getCFAccessEmail(request);
    const isLocalDev = ['localhost', '127.0.0.1'].includes(url.hostname);

    // Never trust Referer for auth. Only CF Access (or explicit local dev) is accepted.
    if (!email && !isLocalDev) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }
    // Attach email to context for downstream use
    context.data = context.data || {};
    context.data.userEmail = email || 'admin-page';
  }

  // Pass through to route handler
  const response = await next();

  // Add security headers
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
  for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
