export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const syncKey = request.headers.get("X-Sync-Key") || url.searchParams.get("key");

  if (!syncKey || syncKey.length < 4) {
    return new Response("Chave Inválida", { status: 401, headers: corsHeaders });
  }

  const KV = env.CONTAS_DATA;
  if (!KV) {
    return new Response("Erro: Banco KV não conectado nas configurações da Cloudflare", { status: 500, headers: corsHeaders });
  }

  if (request.method === "POST") {
    try {
      const data = await request.text();
      await KV.put(syncKey, data);
      return new Response("Salvo", { headers: corsHeaders });
    } catch (e) {
      return new Response("Erro ao salvar: " + e.message, { status: 500, headers: corsHeaders });
    }
  }

  if (request.method === "GET") {
    try {
      const data = await KV.get(syncKey);
      return new Response(data || '{"notes":[]}', { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response("Erro ao buscar: " + e.message, { status: 500, headers: corsHeaders });
    }
  }

  return new Response("Método não permitido", { status: 405, headers: corsHeaders });
}
