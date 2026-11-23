// Gera o código do receptor de vendas (Cloudflare Worker + banco D1, plano grátis).
export function codigoWorker({ segredo, token }) {
  return `// 🐉 Receptor de vendas do Paid Traffic Agent
// Recebe os webhooks dos checkouts 24h por dia e guarda até o Minerador buscar.
// Precisa de um banco D1 ligado a este Worker com o nome de variável: DB
const SEGREDO = ${JSON.stringify(segredo)};
const TOKEN = ${JSON.stringify(token)};

async function preparar(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, plataforma TEXT, recebido TEXT, tipo TEXT, cabecalhos TEXT, query TEXT, corpo TEXT)").run();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.split("/").filter(Boolean);
    if (!env.DB) return new Response("Falta ligar o banco D1 com o nome DB (Settings > Bindings).", { status: 500 });

    // Webhook dos checkouts: /w/SEGREDO/plataforma
    if (p[0] === "w" && p[1] === SEGREDO) {
      if (req.method === "GET") return new Response("Webhook do Paid Traffic Agent ativo ✓");
      const corpo = await req.text();
      if (corpo.length > 300000) return new Response("grande demais", { status: 413 });
      await preparar(env);
      const cab = {};
      for (const k of ["content-type", "x-hotmart-hottok", "x-kiwify-digital-signature", "x-cakto-signature", "x-cakto-timestamp", "user-agent"]) { const v = req.headers.get(k); if (v) cab[k] = v; }
      await env.DB.prepare("INSERT INTO eventos (plataforma, recebido, tipo, cabecalhos, query, corpo) VALUES (?, ?, ?, ?, ?, ?)")
        .bind((p[2] || "generico").slice(0, 30), new Date().toISOString(), req.headers.get("content-type") || "", JSON.stringify(cab), url.search, corpo).run();
      return new Response("ok");
    }

    // Minerador busca os eventos: /sync?desde=ID
    if (p[0] === "sync") {
      if (req.headers.get("authorization") !== "Bearer " + TOKEN) return new Response("não autorizado", { status: 401 });
      await preparar(env);
      if (req.method === "GET") {
        const desde = Number(url.searchParams.get("desde") || 0);
        const r = await env.DB.prepare("SELECT * FROM eventos WHERE id > ? ORDER BY id LIMIT 500").bind(desde).all();
        return Response.json({ ok: true, eventos: r.results || [] });
      }
      if (req.method === "POST" && p[1] === "limpar") {
        const ate = Number(url.searchParams.get("ate") || 0);
        const limite = new Date(Date.now() - 7 * 864e5).toISOString();
        await env.DB.prepare("DELETE FROM eventos WHERE id <= ? AND recebido < ?").bind(ate, limite).run();
        return Response.json({ ok: true });
      }
    }
    return new Response("Paid Traffic Agent 🐉", { status: 404 });
  },
};
`;
}

export const PLATAFORMAS_CHECKOUT = [
  ["hotmart", "Hotmart", "Ferramentas → Webhook (API e notificações) → Cadastrar webhook. Versão 2.0.0, marque todos os eventos de compra."],
  ["kiwify", "Kiwify", "Apps → Webhooks → Criar webhook. Marque compra aprovada, recusada, reembolso, chargeback, boleto/pix gerado."],
  ["eduzz", "Eduzz", "Configurações → Webhook/Notificações de venda: cole a URL e marque todos os status."],
  ["monetizze", "Monetizze", "Ferramentas → Postback: cole a URL e marque todos os status de venda."],
  ["braip", "Braip", "Ferramentas → Postback: cadastre a URL para todos os eventos."],
  ["perfectpay", "PerfectPay", "Ferramentas → Webhook: cadastre a URL para todos os produtos e status."],
  ["ticto", "Ticto", "Integrações → Webhook: cole a URL e selecione todos os eventos de venda."],
  ["cakto", "Cakto", "Integrações → Webhooks → Novo webhook: cole a URL e marque compra aprovada, recusada, reembolso, chargeback, pix/boleto gerado e pix expirado. Copie o “secret” e cole em Custos e segurança."],
  ["greenn", "Greenn", "Integrações → Webhook: cole a URL e marque todos os status."],
  ["kirvano", "Kirvano", "Integrações → Webhooks: cole a URL e marque os eventos de venda."],
  ["yampi", "Yampi", "Configurações → Webhooks: eventos order.paid e order.status.updated."],
  ["shopify", "Shopify", "Configurações → Notificações → Webhooks: “Criação de pedido” e “Pagamento do pedido”, formato JSON."],
  ["generico", "Outra plataforma", "Use esta URL em qualquer checkout que envie webhook/postback de vendas."],
];

// Script para a página de vendas: guarda as UTMs e repassa para os links de checkout.
export function scriptPagina() {
  return `<!-- 🐉 Paid Traffic Agent: repassa as UTMs para o checkout -->
<script>
(function(){
  var K=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"],q=new URLSearchParams(location.search),u={};
  try{u=JSON.parse(localStorage.getItem("debian_utm")||"{}")}catch(e){}
  if(K.some(function(k){return q.get(k)})){u={};K.forEach(function(k){if(q.get(k))u[k]=q.get(k)});try{localStorage.setItem("debian_utm",JSON.stringify(u))}catch(e){}}
  if(!Object.keys(u).length)return;
  var id=function(v){var m=String(v||"").match(/(\\d{5,})\\s*$/);return m?m[1]:""};
  var s=String(u.utm_source||"").toLowerCase(),pre=/google|gads|youtube/.test(s)?"G":"FB";
  var sck=id(u.utm_campaign)&&id(u.utm_content)?pre+"_"+id(u.utm_campaign)+"_"+(id(u.utm_medium)||"0")+"_"+id(u.utm_content):"";
  function marcar(a){try{var l=new URL(a.href);if(!/pay\\.|checkout|hotmart|kiwify|eduzz|monetizze|braip|perfectpay|ticto|cakto|greenn|kirvano|yampi|cartpanda|myshopify/i.test(l.hostname+l.pathname))return;
    K.forEach(function(k){if(u[k]&&!l.searchParams.get(k))l.searchParams.set(k,u[k])});
    if(sck){if(!l.searchParams.get("sck"))l.searchParams.set("sck",sck);if(!l.searchParams.get("src"))l.searchParams.set("src",sck)}
    a.href=l.toString()}catch(e){}}
  function tudo(){document.querySelectorAll("a[href]").forEach(marcar)}
  tudo();document.addEventListener("DOMContentLoaded",tudo);document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a)marcar(a)},true);
})();
</script>`;
}

export const UTM_GOOGLE = "utm_source=google&utm_campaign={campaignid}&utm_medium={adgroupid}&utm_content={creative}&utm_term={keyword}";
