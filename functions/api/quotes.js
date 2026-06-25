// functions/api/quotes.js
import { requireAuth } from './_auth.js';
import { sniffImageType, extForImage } from './_validate.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM quotes ORDER BY created_at DESC"
    ).all();

    return new Response(JSON.stringify({ quotes: results }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error al obtener aforismos" }), { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  const denied = await requireAuth(request, env);
  if (denied) return denied;
  try {
    const formData = await request.formData();
    const text = formData.get("text");
    const author = formData.get("author");
    const imageFile = formData.get("image"); // Puede ser null si no suben foto

    if (!text || !author) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios" }), { status: 400 });
    }

    const id = crypto.randomUUID();
    let imageUrl = null;

    // Si el usuario subió una imagen, la guardamos en R2 de forma segura
    if (imageFile && imageFile.size > 0) {
      if (imageFile.size > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "Imagen muy grande (máx 5MB)" }), { status: 400 });
      }

      const fileData = await imageFile.arrayBuffer();
      const imgType  = sniffImageType(fileData); // trust bytes, not client type
      if (!imgType) {
        return new Response(JSON.stringify({ error: "Formato de imagen no soportado" }), { status: 400 });
      }

      // Server-generated name; never trust the client filename.
      const safeName = `${id}.${extForImage(imgType)}`;
      const fileName = `quotes/${safeName}`;

      await env.FILOS_BUCKET.put(fileName, fileData, {
        httpMetadata: { contentType: imgType }
      });

      imageUrl = `/api/media?file=${safeName}`;
    }

    await env.DB.prepare(
      "INSERT INTO quotes (id, text, author, image_url) VALUES (?, ?, ?, ?)"
    ).bind(id, text, author, imageUrl).run();

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error interno: " + error.message }), { status: 500 });
  }
}
