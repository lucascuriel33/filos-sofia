/**
 * Shared server-side auth for φίλος σοφία.
 *
 * Login (POST /api/auth) verifies ADMIN_PASSWORD and sets a signed,
 * HttpOnly session cookie. Every mutating endpoint calls requireAuth()
 * before acting. The cookie is an HMAC-SHA256 signature over an expiry
 * timestamp, keyed by ADMIN_PASSWORD — so no extra secret or storage is
 * needed, and rotating the password invalidates all existing sessions.
 */

const COOKIE_NAME = 'filos_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Constant-time comparison of two byte arrays.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Constant-time comparison of two strings (for the password check).
export function safeEqualStr(a, b) {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Always hash to a fixed length so length isn't leaked via timing.
  return timingSafeEqual(ab, bb) && a.length === b.length;
}

/** Create a signed session token: "<expiry>.<sig>" */
export async function createSessionToken(env) {
  if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not configured');
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(exp);
  const key = await hmacKey(env.ADMIN_PASSWORD);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Verify a session token. Returns true only if signature valid & not expired. */
export async function verifySessionToken(token, env) {
  if (!token || !env.ADMIN_PASSWORD) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);

  const exp = parseInt(payload, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  let providedSig;
  try { providedSig = b64urlToBytes(sigStr); }
  catch { return false; }

  const key = await hmacKey(env.ADMIN_PASSWORD);
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  );
  return timingSafeEqual(providedSig, expected);
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** True if the request carries a valid session cookie. */
export async function isAuthed(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  return verifySessionToken(token, env);
}

/**
 * Guard for protected handlers. Returns a 401 Response if unauthenticated,
 * or null if the caller may proceed.
 *
 *   const denied = await requireAuth(request, env);
 *   if (denied) return denied;
 */
export async function requireAuth(request, env, corsHeaders = {}) {
  if (await isAuthed(request, env)) return null;
  return new Response(JSON.stringify({ error: 'No autorizado' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export function sessionCookieHeader(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
