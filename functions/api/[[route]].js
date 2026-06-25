/**
 * φίλος σοφία — Cloudflare Pages Functions API
 * Route: /api/[[route]]
 *
 * Bindings required (set in wrangler.toml or Cloudflare Dashboard):
 *   - R2 bucket:    FILOS_BUCKET
 *   - KV namespace: FILOS_KV
 *   - Secret:       ADMIN_PASSWORD
 */

import {
  requireAuth,
  createSessionToken,
  sessionCookieHeader,
  clearCookieHeader,
  isAuthed,
  safeEqualStr,
} from './_auth.js';
import { sniffImageType, extForImage } from './_validate.js';

// Same-origin only. Pages Functions and the static site share an origin,
// so we simply reflect the request's own origin and allow credentials.
function corsFor(request) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  // Allow credentialed same-origin requests only.
  if (origin && new URL(origin).host === url.host) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

// CORS headers for the current request, set at the top of onRequest.
let CORS_HEADERS = {};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ─── ROUTER ─────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env, params } = context;
  CORS_HEADERS = corsFor(request);

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const route  = (params.route || []).join('/');
  const method = request.method;

  // Guard: every state-changing request must carry a valid session,
  // except `auth` itself (login). This is a blanket backstop so no
  // mutating route can ever be reached unauthenticated.
  const isWrite = method === 'POST' || method === 'PUT' || method === 'DELETE';
  const isLogin = route === 'auth';
  // Public POST exception: anyone may submit an ágora comment.
  const isPublicComment = route === 'comments' && method === 'POST';
  if (isWrite && !isLogin && !isPublicComment) {
    const denied = await requireAuth(request, env, CORS_HEADERS);
    if (denied) return denied;
  }

  // ── Auth ──────────────────────────────────────────────────
  if (route === 'auth' && method === 'POST') return checkAuth(request, env);
  if (route === 'auth/check' && method === 'GET') {
    return json({ ok: await isAuthed(request, env) });
  }
  if (route === 'auth/logout' && method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader(),
        ...CORS_HEADERS,
      },
    });
  }

  // ── PDFs ─────────────────────────────────────────────────
  if (route === 'pdfs' && method === 'GET')  return listPdfs(env);
  if (route === 'pdfs' && method === 'POST') return uploadPdf(request, env);

  const pdfMatch = route.match(/^pdfs\/([a-z0-9_-]+)$/i);
  if (pdfMatch) {
    if (method === 'GET')    return downloadPdf(pdfMatch[1], env);
    if (method === 'DELETE') return deletePdf(pdfMatch[1], env);
  }

  // ── Posts ─────────────────────────────────────────────────
  if (route === 'posts' && method === 'GET')  return listPosts(env);
  if (route === 'posts' && method === 'POST') return createPost(request, env);

  const postMatch = route.match(/^posts\/([a-z0-9_-]+)$/i);
  if (postMatch) {
    if (method === 'GET')    return getPost(postMatch[1], env);
    if (method === 'PUT')    return updatePost(postMatch[1], request, env);
    if (method === 'DELETE') return deletePost(postMatch[1], env);
  }

  // ── News ───────────────────────────────────────────────────
  if (route === 'news' && method === 'GET')  return listNews(env);
  if (route === 'news' && method === 'POST') return createNews(request, env);

  const newsMatch = route.match(/^news\/([a-z0-9_-]+)$/i);
  if (newsMatch) {
    if (method === 'GET')    return getNews(newsMatch[1], env);
    if (method === 'DELETE') return deleteNews(newsMatch[1], env);
  }

  // ── Comments ──────────────────────────────────────────────
  if (route === 'comments' && method === 'GET')  return listComments(env);
  if (route === 'comments' && method === 'POST') return addComment(request, env);

  // ── Avatars ───────────────────────────────────────────────
  const avMatch = route.match(/^avatars\/(.+)$/);
  if (avMatch && method === 'GET') return serveAvatar(avMatch[1], env);

  return err('Not found', 404);
}

// ─── AUTH HANDLER ────────────────────────────────────────────

async function checkAuth(request, env) {
  let data;
  try { data = await request.json(); }
  catch { return err('JSON inválido'); }

  if (!env.ADMIN_PASSWORD) return err('Servidor mal configurado', 500);

  const password = (data.password || '').trim();
  if (!password || !safeEqualStr(password, env.ADMIN_PASSWORD)) {
    return json({ ok: false }, 401);
  }

  const token = await createSessionToken(env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
      ...CORS_HEADERS,
    },
  });
}

// ─── PDF HANDLERS ────────────────────────────────────────────

async function listPdfs(env) {
  const raw  = await env.FILOS_KV.get('pdfs:index');
  const pdfs = raw ? JSON.parse(raw) : [];
  return json({ pdfs });
}

async function uploadPdf(request, env) {
  let form;
  try { form = await request.formData(); }
  catch { return err('Error al leer el formulario'); }

  const title       = (form.get('title') || '').trim();
  const description = (form.get('description') || '').trim();
  const file        = form.get('file');

  if (!title)  return err('El título es requerido');
  if (!file)   return err('Archivo PDF requerido');

  const fileType = file.type || '';
  const fileName = file.name || '';
  if (!fileType.includes('pdf') && !fileName.toLowerCase().endsWith('.pdf')) {
    return err('Solo se aceptan PDFs');
  }
  if (file.size > 20 * 1024 * 1024) return err('Archivo demasiado grande (máx 20MB)');

  const id     = 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const r2Key  = `pdfs/${id}.pdf`;
  const buffer = await file.arrayBuffer();

  await env.FILOS_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { title, description },
  });

  const raw  = await env.FILOS_KV.get('pdfs:index');
  const pdfs = raw ? JSON.parse(raw) : [];
  pdfs.unshift({ id, title, description, r2Key, created_at: new Date().toISOString() });
  await env.FILOS_KV.put('pdfs:index', JSON.stringify(pdfs));

  return json({ ok: true, id }, 201);
}

async function downloadPdf(id, env) {
  const raw  = await env.FILOS_KV.get('pdfs:index');
  const pdfs = raw ? JSON.parse(raw) : [];
  const meta = pdfs.find(p => p.id === id);
  if (!meta) return err('PDF no encontrado', 404);

  const obj = await env.FILOS_BUCKET.get(meta.r2Key);
  if (!obj)  return err('Archivo no encontrado en almacenamiento', 404);

  const blob = await obj.arrayBuffer();
  return new Response(blob, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.pdf"`,
      ...CORS_HEADERS,
    },
  });
}

async function deletePdf(id, env) {
  const raw  = await env.FILOS_KV.get('pdfs:index');
  const pdfs = raw ? JSON.parse(raw) : [];
  const idx  = pdfs.findIndex(p => p.id === id);
  if (idx === -1) return err('PDF no encontrado', 404);

  await env.FILOS_BUCKET.delete(pdfs[idx].r2Key);
  pdfs.splice(idx, 1);
  await env.FILOS_KV.put('pdfs:index', JSON.stringify(pdfs));

  return json({ ok: true });
}

// ─── POST HANDLERS ───────────────────────────────────────────

async function listPosts(env) {
  const raw   = await env.FILOS_KV.get('posts:index');
  const posts = raw ? JSON.parse(raw) : [];
  return json({
    posts: posts.map(({ body, ...p }) => ({
      ...p,
      excerpt: body ? body.slice(0, 280) : '',
    })),
  });
}

async function getPost(id, env) {
  const raw   = await env.FILOS_KV.get('posts:index');
  const posts = raw ? JSON.parse(raw) : [];
  const post  = posts.find(p => p.id === id);
  if (!post) return err('Entrada no encontrada', 404);
  return json({ post });
}

async function createPost(request, env) {
  let data;
  try { data = await request.json(); }
  catch { return err('JSON inválido'); }

  const title = (data.title || '').trim().slice(0, 200);
  const body  = (data.body  || '').trim().slice(0, 50000);
  const tags  = Array.isArray(data.tags)
    ? data.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 8)
    : [];

  if (!title) return err('El título es requerido');
  if (!body)  return err('El contenido es requerido');

  const id   = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const post = {
    id, title, body, tags,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const raw   = await env.FILOS_KV.get('posts:index');
  const posts = raw ? JSON.parse(raw) : [];
  posts.unshift(post);
  await env.FILOS_KV.put('posts:index', JSON.stringify(posts));

  return json({ ok: true, id }, 201);
}

async function updatePost(id, request, env) {
  let data;
  try { data = await request.json(); }
  catch { return err('JSON inválido'); }

  const raw   = await env.FILOS_KV.get('posts:index');
  const posts = raw ? JSON.parse(raw) : [];
  const idx   = posts.findIndex(p => p.id === id);
  if (idx === -1) return err('Entrada no encontrada', 404);

  const title = (data.title || '').trim().slice(0, 200)  || posts[idx].title;
  const body  = (data.body  || '').trim().slice(0, 50000) || posts[idx].body;
  const tags  = Array.isArray(data.tags)
    ? data.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 8)
    : posts[idx].tags;

  posts[idx] = { ...posts[idx], title, body, tags, updated_at: new Date().toISOString() };
  await env.FILOS_KV.put('posts:index', JSON.stringify(posts));

  return json({ ok: true });
}

async function deletePost(id, env) {
  const raw   = await env.FILOS_KV.get('posts:index');
  const posts = raw ? JSON.parse(raw) : [];
  const idx   = posts.findIndex(p => p.id === id);
  if (idx === -1) return err('Entrada no encontrada', 404);

  posts.splice(idx, 1);
  await env.FILOS_KV.put('posts:index', JSON.stringify(posts));

  return json({ ok: true });
}

// ─── COMMENT HANDLERS ────────────────────────────────────────

async function listComments(env) {
  const raw      = await env.FILOS_KV.get('comments:list');
  const comments = raw ? JSON.parse(raw) : [];
  return json({ comments: comments.map(({ email, ...c }) => c) });
}

async function addComment(request, env) {
  // ── Rate limiting: max 5 comments per IP per 10 minutes ──
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:comment:${ip}`;
  const rlWindow = 600; // seconds
  const rlMax = 5;
  try {
    const current = parseInt(await env.FILOS_KV.get(rlKey), 10) || 0;
    if (current >= rlMax) {
      return err('Demasiados comentarios. Intenta de nuevo en unos minutos.', 429);
    }
    await env.FILOS_KV.put(rlKey, String(current + 1), { expirationTtl: rlWindow });
  } catch { /* if KV read fails, fail open rather than block legitimate users */ }

  let form;
  try { form = await request.formData(); }
  catch { return err('Error al leer el formulario'); }

  // Honeypot: bots fill hidden fields; humans never see this one.
  if ((form.get('website') || '').trim() !== '') {
    return json({ ok: true }); // silently drop, pretend success
  }

  const name   = (form.get('name')  || '').trim().slice(0, 80);
  const text   = (form.get('text')  || '').trim().slice(0, 1200);
  const email  = (form.get('email') || '').trim().slice(0, 200);
  const avatar = form.get('avatar');

  if (!name)             return err('El nombre es requerido');
  if (!text || text.length < 5) return err('El comentario es demasiado corto');

  let avatar_url = null;

  if (avatar && avatar.size > 0) {
    if (avatar.size > 2 * 1024 * 1024) return err('Avatar muy grande (máx 2MB)');
    const buf    = await avatar.arrayBuffer();
    const avType = sniffImageType(buf); // trust bytes, not client-sent type
    if (!avType) return err('Formato de imagen no soportado');

    const ext   = extForImage(avType);
    const avKey = `avatars/av_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

    await env.FILOS_BUCKET.put(avKey, buf, {
      httpMetadata: { contentType: avType },
    });

    avatar_url = `/api/avatars/${avKey.replace('avatars/', '')}`;
  }

  const id      = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const comment = {
    id, name, text,
    email: email || null,
    avatar_url,
    created_at: new Date().toISOString(),
  };

  const raw      = await env.FILOS_KV.get('comments:list');
  const comments = raw ? JSON.parse(raw) : [];
  comments.unshift(comment);
  if (comments.length > 500) comments.pop();
  await env.FILOS_KV.put('comments:list', JSON.stringify(comments));

  return json({ ok: true, id });
}

// ─── NEWS HANDLERS ───────────────────────────────────────────

async function listNews(env) {
  const raw  = await env.FILOS_KV.get('news:index');
  const news = raw ? JSON.parse(raw) : [];
  return json({ news });
}

async function getNews(id, env) {
  const raw  = await env.FILOS_KV.get('news:index');
  const news = raw ? JSON.parse(raw) : [];
  const item = news.find(n => n.id === id);
  if (!item) return err('Noticia no encontrada', 404);
  return json({ item });
}

async function createNews(request, env) {
  let data;
  try { data = await request.json(); }
  catch { return err('JSON inválido'); }

  const title   = (data.title || '').trim().slice(0, 200);
  const summary = (data.summary || '').trim().slice(0, 500);
  const url     = (data.url || '').trim().slice(0, 500);

  if (!title)   return err('El título es requerido');
  if (!summary) return err('El resumen es requerido');

  const id   = 'news_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const item = {
    id, title, summary, url: url || null,
    created_at: new Date().toISOString(),
  };

  const raw  = await env.FILOS_KV.get('news:index');
  const news = raw ? JSON.parse(raw) : [];
  news.unshift(item);
  if (news.length > 100) news.pop();
  await env.FILOS_KV.put('news:index', JSON.stringify(news));

  return json({ ok: true, id }, 201);
}

async function deleteNews(id, env) {
  const raw  = await env.FILOS_KV.get('news:index');
  const news = raw ? JSON.parse(raw) : [];
  const idx  = news.findIndex(n => n.id === id);
  if (idx === -1) return err('Noticia no encontrada', 404);

  news.splice(idx, 1);
  await env.FILOS_KV.put('news:index', JSON.stringify(news));

  return json({ ok: true });
}

// ─── AVATAR HANDLER ──────────────────────────────────────────

async function serveAvatar(filename, env) {
  // Only serve avatars matching our server-generated naming pattern.
  // Blocks path traversal / arbitrary key access via crafted filenames.
  if (!/^av_[0-9]+_[a-z0-9]+\.(jpg|png|gif|webp)$/.test(filename)) {
    return new Response('Not found', { status: 404 });
  }
  const key = `avatars/${filename}`;
  const obj = await env.FILOS_BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const blob = await obj.arrayBuffer();
  return new Response(blob, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
      ...CORS_HEADERS,
    },
  });
}
