// functions/api/quotes/[id].js

export async function onRequestDelete({ params, env }) {
  try {
    const quoteId = params.id;

    // Opcional: Podrías buscar primero el aforismo para borrar su imagen de R2
    // const { results } = await env.DB.prepare("SELECT image_url FROM quotes WHERE id = ?").bind(quoteId).all();
    // if (results[0]?.image_url) { /* Lógica para borrar de env.BUCKET */ }

    // Borrar de la base de datos D1
    const info = await env.DB.prepare(
      "DELETE FROM quotes WHERE id = ?"
    ).bind(quoteId).run();

    if (info.success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({ error: "No se pudo eliminar" }), { status: 400 });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 });
  }
}