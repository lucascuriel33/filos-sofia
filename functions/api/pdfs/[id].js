// functions/api/pdfs/[id].js
// PDFs are indexed in FILOS_KV ('pdfs:index') and stored as files in FILOS_BUCKET (R2).
// This file was previously querying a D1 database that has no pdfs table — fixed.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet({ params, env }) {
  try {
    const raw  = await env.FILOS_KV.get('pdfs:index');
    const pdfs = raw ? JSON.parse(raw) : [];
    const meta = pdfs.find(p => p.id === params.id);

    if (!meta) {
      return new Response(JSON.stringify({ error: 'PDF no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const obj = await env.FILOS_BUCKET.get(meta.r2Key);
    if (!obj) {
      return new Response(JSON.stringify({ error: 'Archivo no encontrado en almacenamiento' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const cleanTitle = meta.title.replace(/[^a-zA-Z0-9áéíóúüñ ]/gi, '_');
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${cleanTitle}.pdf"`,
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno al descargar: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const raw  = await env.FILOS_KV.get('pdfs:index');
    const pdfs = raw ? JSON.parse(raw) : [];
    const idx  = pdfs.findIndex(p => p.id === params.id);

    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'PDF no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Delete file from R2 first, then remove from KV index
    await env.FILOS_BUCKET.delete(pdfs[idx].r2Key);
    pdfs.splice(idx, 1);
    await env.FILOS_KV.put('pdfs:index', JSON.stringify(pdfs));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno al borrar: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}