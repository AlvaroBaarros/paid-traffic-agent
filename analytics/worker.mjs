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
      return new Response("OK");
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

// [id, nome, onde cadastrar, região]. Regiões: br (Brasil), us (EUA), eu (Europa), global.
export const PLATAFORMAS_CHECKOUT = [
  ["hotmart", "Hotmart", "Ferramentas → Webhook (API e notificações) → Cadastrar webhook. Versão 2.0.0, marque todos os eventos de compra.", "br"],
  ["kiwify", "Kiwify", "Apps → Webhooks → Criar webhook. Marque compra aprovada, recusada, reembolso, chargeback, boleto/pix gerado.", "br"],
  ["cakto", "Cakto", "Integrações → Webhooks → Novo webhook: cole a URL e marque compra aprovada, recusada, reembolso, chargeback, pix/boleto gerado e pix expirado. Copie o “secret” e cole em Custos e segurança.", "br"],
  ["eduzz", "Eduzz", "Configurações → Webhook/Notificações de venda: cole a URL e marque todos os status.", "br"],
  ["monetizze", "Monetizze", "Ferramentas → Postback: cole a URL e marque todos os status de venda.", "br"],
  ["braip", "Braip", "Ferramentas → Postback: cadastre a URL para todos os eventos.", "br"],
  ["perfectpay", "PerfectPay", "Ferramentas → Webhook: cadastre a URL para todos os produtos e status.", "br"],
  ["ticto", "Ticto", "Integrações → Webhook: cole a URL e selecione todos os eventos de venda.", "br"],
  ["guru", "Digital Manager Guru", "Configurações → Webhooks → Novo: cole a URL e marque transações (aprovada, reembolsada, chargeback).", "br"],
  ["greenn", "Greenn", "Integrações → Webhook: cole a URL e marque todos os status.", "br"],
  ["kirvano", "Kirvano", "Integrações → Webhooks: cole a URL e marque os eventos de venda.", "br"],
  ["lastlink", "Lastlink", "Integrações → Webhooks: cole a URL e marque compras, reembolsos e chargebacks.", "br"],
  ["hubla", "Hubla", "Integrações → Webhooks: cole a URL e marque os eventos de venda.", "br"],
  ["mercadopago", "Mercado Pago", "Suas integrações → sua aplicação → Webhooks: cole a URL e marque “Pagamentos”. Cole também o Access Token de produção em Custos e segurança (o aviso do Mercado Pago só traz o ID do pagamento).", "br"],
  ["pagarme", "Pagar.me", "Configurações → Webhooks: cole a URL e marque order.paid, charge.refunded e charge.chargedback.", "br"],
  ["asaas", "Asaas", "Integrações → Webhooks: cole a URL e marque os eventos de cobrança (recebida, estornada, chargeback).", "br"],
  ["pagseguro", "PagBank (PagSeguro)", "Integrações → Notificações/Webhooks: cole a URL para pedidos e cobranças.", "br"],
  ["appmax", "Appmax", "Configurações → Webhooks: cole a URL e marque pedidos pagos, reembolsados e chargebacks.", "br"],
  ["yampi", "Yampi", "Configurações → Webhooks: eventos order.paid e order.status.updated.", "br"],
  ["cartpanda", "Cartpanda", "Configurações → Webhooks: cole a URL para pedidos pagos e reembolsados.", "br"],
  ["nuvemshop", "Nuvemshop", "Use um app de webhook da loja: eventos order/paid e order/cancelled.", "br"],
  ["stripe", "Stripe", "Developers → Webhooks → Add endpoint: cole a URL e marque checkout.session.completed, payment_intent.succeeded, charge.refunded e charge.dispute.created. Passe as UTMs em “metadata” ou o sck em client_reference_id.", "global"],
  ["paypal", "PayPal", "developer.paypal.com → seu app → Webhooks: cole a URL e marque PAYMENT.CAPTURE.COMPLETED, REFUNDED e REVERSED. Mande as UTMs no custom_id.", "global"],
  ["shopify", "Shopify", "Configurações → Notificações → Webhooks: “Pagamento do pedido” e “Reembolso”, formato JSON. As UTMs vêm do link de chegada da loja.", "global"],
  ["woocommerce", "WooCommerce", "WooCommerce → Configurações → Avançado → Webhooks: “Pedido atualizado”, versão mais nova da API. As UTMs vêm da atribuição de pedidos do WooCommerce.", "global"],
  ["clickbank", "ClickBank", "Vendor Settings → My Site → Advanced Tools → Instant Notification URL (versão 8.0). Cole a Secret Key em Custos e segurança para descriptografar os avisos.", "us"],
  ["buygoods", "BuyGoods", "Settings → IPN/Postback: cole a URL para vendas, reembolsos e chargebacks.", "us"],
  ["thrivecart", "ThriveCart", "Settings → API & Webhooks → Webhooks & notifications: cole a URL.", "us"],
  ["samcart", "SamCart", "Settings → Integrations → Webhooks/Notifications: cole a URL para Order e Refund.", "us"],
  ["gumroad", "Gumroad", "Settings → Advanced → Ping: cole a URL.", "us"],
  ["lemonsqueezy", "Lemon Squeezy", "Settings → Webhooks: cole a URL e marque order_created e order_refunded. Passe as UTMs em checkout[custom].", "us"],
  ["digistore24", "Digistore24", "Settings → Integrations (IPN) → Generic: cole a URL e marque todos os eventos. As UTMs vão em “custom” ou nos parâmetros utm_.", "eu"],
  ["paddle", "Paddle", "Developer Tools → Notifications → New destination: cole a URL e marque transaction.completed e adjustment.created. Passe as UTMs em custom_data.", "eu"],
  ["mollie", "Mollie", "Use a URL como webhookUrl dos pagamentos (o Mollie avisa só o ID; funciona melhor com Stripe ou Paddle).", "eu"],
  ["generico", "Outra plataforma", "Use esta URL em qualquer checkout que envie webhook/postback de vendas.", "global"],
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
  var s=String(u.utm_source||"").toLowerCase(),pre=/google|gads|youtube/.test(s)?"G":/tiktok/.test(s)?"TT":/kwai/.test(s)?"KW":"FB";
  var idG=/google|gads|youtube|kwai/.test(s);
  if(idG)id=function(v){var m=String(v||"").match(/(\\d+)\\s*$/);return m?m[1]:""};
  var sck=id(u.utm_campaign)&&id(u.utm_content)?pre+"_"+id(u.utm_campaign)+"_"+(id(u.utm_medium)||"0")+"_"+id(u.utm_content):"";
  function marcar(a){try{var l=new URL(a.href);if(!/pay\\.|checkout|hotmart|kiwify|eduzz|monetizze|braip|perfectpay|ticto|cakto|greenn|kirvano|yampi|cartpanda|myshopify|guru|lastlink|hubla|appmax|mercadopago|pagar\\.me|stripe|paypal|clickbank|digistore24|paddle|thrivecart|samcart|gumroad|lemonsqueezy|buygoods/i.test(l.hostname+l.pathname))return;
    K.forEach(function(k){if(u[k]&&!l.searchParams.get(k))l.searchParams.set(k,u[k])});
    if(sck){if(!l.searchParams.get("sck"))l.searchParams.set("sck",sck);if(!l.searchParams.get("src"))l.searchParams.set("src",sck)}
    a.href=l.toString()}catch(e){}}
  function tudo(){document.querySelectorAll("a[href]").forEach(marcar)}
  tudo();document.addEventListener("DOMContentLoaded",tudo);document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a)marcar(a)},true);
})();
</script>`;
}

export const UTM_GOOGLE = "utm_source=google&utm_campaign={campaignid}&utm_medium={adgroupid}&utm_content={creative}&utm_term={keyword}";
