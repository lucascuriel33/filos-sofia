import { requireAuth } from '../_auth.js';

export async function onRequestDelete({ request, params, env }) {
  const denied = await requireAuth(request, env);
  if (denied) return denied;
  try {
    const info = await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(params.id).run();
    if (info.success) {
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "No se pudo eliminar" }), { status: 400 });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
  }
}
