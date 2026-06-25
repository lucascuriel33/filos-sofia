// functions/api/quotes/[id].js
import { requireAuth } from '../_auth.js';

export async function onRequestDelete({ request, params, env }) {
  const denied = await requireAuth(request, env);
  if (denied) return denied;
  try {
    const quoteId = params.id;

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
