/**
 * φίλος σοφία — Cloudflare Pages Functions API
 * Route: /api/[[route]]
 *
 * Bindings required (set in wrangler.toml or Cloudflare Dashboard):
 *   - R2 bucket:    FILOS_BUCKET
 *   - KV namespace: FILOS_KV
 *   - Secret:       ADMIN_PASSWORD
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const route  = (params.route || []).join('/');
  const method = request.method;

  // ── Auth ──────────────────────────────────────────────────
  if (route === 'auth' && method === 'POST') return checkAuth(request, env);

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

  const password = (data.password || '').trim();
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ ok: false }, 401);
  }
  return json({ ok: true });
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
  let form;
  try { form = await request.formData(); }
  catch { return err('Error al leer el formulario'); }

  const name   = (form.get('name')  || '').trim().slice(0, 80);
  const text   = (form.get('text')  || '').trim().slice(0, 1200);
  const email  = (form.get('email') || '').trim().slice(0, 200);
  const avatar = form.get('avatar');

  if (!name)             return err('El nombre es requerido');
  if (!text || text.length < 5) return err('El comentario es demasiado corto');

  let avatar_url = null;

  if (avatar && avatar.size > 0) {
    if (avatar.size > 2 * 1024 * 1024) return err('Avatar muy grande (máx 2MB)');
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const avType  = avatar.type || '';
    if (!allowed.includes(avType)) return err('Formato de imagen no soportado');

    const ext   = avType.split('/')[1].replace('jpeg', 'jpg');
    const avKey = `avatars/av_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const buf   = await avatar.arrayBuffer();

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
