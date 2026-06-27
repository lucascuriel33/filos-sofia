// functions/api/media.js

export async function onRequestGet({ request, env }) {
  try {
    // Leemos la URL y extraemos el nombre del archivo
    const url = new URL(request.url);
    const fileNameParam = url.searchParams.get('file');

    if (!fileNameParam) {
      return new Response('Falta el nombre del archivo', { status: 400 });
    }

    // Only serve files matching our server-generated naming scheme.
    if (!/^[a-f0-9-]+\.(jpg|png|gif|webp)$/i.test(fileNameParam)) {
      return new Response('No encontrado', { status: 404 });
    }

    const fileName = `quotes/${fileNameParam}`;
    const object = await env.FILOS_BUCKET.get(fileName);

    if (!object) {
      return new Response('No encontrado', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    // Forzamos el formato de imagen
    if (!headers.has('content-type') || headers.get('content-type') === 'application/octet-stream') {
      const ext = fileName.split('.').pop().toLowerCase();
      if (ext === 'png') headers.set('content-type', 'image/png');
      else if (ext === 'gif') headers.set('content-type', 'image/gif');
      else if (ext === 'webp') headers.set('content-type', 'image/webp');
      else headers.set('content-type', 'image/jpeg');
    }

    return new Response(object.body, { headers });
    
  } catch (error) {
    console.error('media GET error:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
}