// functions/api/quotes.js

export async function onRequestGet({ env }) {
  try {
    // Obtener los aforismos de la base de datos D1, ordenados por el más reciente
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
      // Limpiamos el nombre del archivo de caracteres extraños
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const fileName = `quotes/${id}-${safeName}`;
      
      // Convertimos a ArrayBuffer para evitar que el archivo se corrompa al guardarse
      const fileData = await imageFile.arrayBuffer();

      // Guardamos en tu R2 (usando el nombre exacto de tu wrangler.toml: FILOS_BUCKET)
      await env.FILOS_BUCKET.put(fileName, fileData, {
        httpMetadata: { contentType: imageFile.type }
      });
      
      // Guardamos la URL usando el parámetro de búsqueda seguro
      imageUrl = `/api/media?file=${id}-${safeName}`; 
    }

    // Guardamos todos los datos (incluyendo la URL de la imagen) en la base de datos D1
    await env.DB.prepare(
      "INSERT INTO quotes (id, text, author, image_url) VALUES (?, ?, ?, ?)"
    ).bind(id, text, author, imageUrl).run();

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    // Añadimos error.message para saber exactamente por qué falló si ocurre un error 500
    return new Response(JSON.stringify({ error: "Error interno: " + error.message }), { status: 500 });
  }
}