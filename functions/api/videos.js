export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare("SELECT * FROM videos ORDER BY created_at DESC").all();
    return new Response(JSON.stringify({ videos: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error al obtener videos" }), { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { title, description, youtube_id } = await request.json();
    if (!title || !youtube_id) return new Response(JSON.stringify({ error: "Faltan datos" }), { status: 400 });

    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO videos (id, title, description, youtube_id) VALUES (?, ?, ?, ?)"
    ).bind(id, title, description, youtube_id).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
  }
}