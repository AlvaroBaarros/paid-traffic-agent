// Imitação das APIs da Meta, do Google Ads e do Claude, para testar o agente sem mexer em contas reais.
export const registro = [];

const meta = {
  campanhas: [
    { id: "C1", name: "[AG] Protocolo Seca · teste", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "10000" },
    { id: "C2", name: "Inglês 90D · frio", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_SALES" },
  ],
  conjuntos: [
    { id: "S1", name: "Advantage+ BR", status: "ACTIVE", effective_status: "ACTIVE", campaign_id: "C1" },
    { id: "S2", name: "Interesses idiomas", status: "ACTIVE", effective_status: "ACTIVE", campaign_id: "C2", daily_budget: "8000" },
  ],
  anuncios: [
    { id: "A1", name: "AD01 · gancho dor", status: "ACTIVE", effective_status: "ACTIVE", adset_id: "S1", campaign_id: "C1" },
    { id: "A2", name: "AD02 · depoimento", status: "ACTIVE", effective_status: "ACTIVE", adset_id: "S1", campaign_id: "C1" },
    { id: "A3", name: "AD03 · demonstração", status: "ACTIVE", effective_status: "ACTIVE", adset_id: "S1", campaign_id: "C1" },
    { id: "B1", name: "AD01 · aula grátis", status: "ACTIVE", effective_status: "ACTIVE", adset_id: "S2", campaign_id: "C2" },
  ],
};
const compra = (n, valor) => ({ actions: n ? [{ action_type: "omni_purchase", value: String(n) }, { action_type: "offsite_conversion.fb_pixel_purchase", value: String(n) }] : [], action_values: n ? [{ action_type: "omni_purchase", value: String(valor) }] : [] });
const ins = {
  today: { A1: [20, 4000, 80, 1, 97], A2: [30, 3000, 40, 0, 0], A3: [10, 5000, 10, 0, 0], B1: [40, 3000, 60, 1, 97] },
  last_3d: { A1: [130, 20000, 400, 5, 485], A2: [60, 8000, 90, 0, 0], A3: [20, 9000, 30, 0, 0], B1: [160, 12000, 200, 1, 97] },
  last_7d: { A1: [300, 45000, 900, 10, 970], A2: [120, 16000, 170, 0, 0], A3: [40, 15000, 50, 0, 0], B1: [320, 24000, 380, 3, 291] },
};
let seq = 100;

function respMeta(url, init) {
  const u = new URL(url);
  const partes = u.pathname.split("/").filter(Boolean).slice(1); // tira a versão
  const metodo = (init && init.method) || "GET";
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
  if (u.searchParams.get("access_token") === "ruim" || (init?.body instanceof URLSearchParams && init.body.get("access_token") === "ruim")) return new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 400 });
  const caminho = partes.join("/");
  if (metodo === "GET") {
    if (caminho === "me") return ok({ id: "1", name: "Debian Teste" });
    if (caminho === "me/adaccounts") return ok({ data: [{ id: "act_999", name: "Conta Debian", account_status: 1, currency: "BRL" }, { id: "act_888", name: "Conta antiga", account_status: 2, currency: "BRL" }] });
    if (caminho === "act_999/promote_pages") return ok({ data: [{ id: "P1", name: "Página do Debian" }] });
    if (caminho === "act_999/adspixels") return ok({ data: [{ id: "PX1", name: "Pixel principal" }] });
    if (caminho === "act_999/campaigns") return ok({ data: meta.campanhas, paging: {} });
    if (caminho === "act_999/adsets") return ok({ data: meta.conjuntos });
    if (caminho === "act_999/ads") return ok({ data: meta.anuncios });
    if (caminho === "act_999/insights" && u.searchParams.get("time_range")) {
      const tr = JSON.parse(u.searchParams.get("time_range"));
      const out = [];
      const nomeAd = Object.fromEntries(meta.anuncios.map((a) => [a.id, a]));
      for (let d = tr.since; d <= tr.until; d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) {
        for (const [id, [g, imp, cl]] of Object.entries(ins.last_7d)) {
          const a = nomeAd[id]; const s = meta.conjuntos.find((x) => x.id === a.adset_id); const c = meta.campanhas.find((x) => x.id === a.campaign_id);
          out.push({ date_start: d, ad_id: id, ad_name: a.name, adset_id: s.id, adset_name: s.name, campaign_id: c.id, campaign_name: c.name, spend: (g / 7).toFixed(2), impressions: String(Math.round(imp / 7)), inline_link_clicks: String(Math.round(cl / 7)) });
        }
      }
      return ok({ data: out });
    }
    if (caminho === "act_999/insights") {
      const t = ins[u.searchParams.get("date_preset")] || {};
      return ok({ data: Object.entries(t).map(([id, [g, imp, cl, n, v]]) => ({ ad_id: id, spend: String(g), impressions: String(imp), inline_link_clicks: String(cl), frequency: id === "A3" && u.searchParams.get("date_preset") === "last_7d" ? "3.6" : "1.4", ...compra(n, v) })) });
    }
    if (/^V\d+$/.test(caminho)) return ok({ status: { video_status: "ready" }, thumbnails: { data: [{ uri: "https://img.example/thumb.jpg", is_preferred: true }] } });
    if (/^C\d+\/adsets$/.test(caminho)) return ok({ data: meta.conjuntos.filter((s) => s.campaign_id === partes[0]).map((s) => ({ id: s.id })) });
    if (/^C\d+\/ads$/.test(caminho)) return ok({ data: meta.anuncios.filter((a) => a.campaign_id === partes[0]).map((a) => ({ id: a.id })) });
    return new Response(JSON.stringify({ error: { message: "GET não simulado: " + caminho, code: 100 } }), { status: 400 });
  }
  // POST
  const corpo = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "[arquivo]"])) : {};
  delete corpo.access_token;
  registro.push({ plataforma: "meta", caminho, corpo });
  if (caminho === "act_999/campaigns") { const id = "C" + seq++; meta.campanhas.push({ id, name: corpo.name, status: "PAUSED", effective_status: "PAUSED", daily_budget: corpo.daily_budget }); return ok({ id }); }
  if (caminho === "act_999/adsets") { const t = JSON.parse(corpo.targeting); if (!t.targeting_automation) return new Response(JSON.stringify({ error: { message: "advantage_audience obrigatório", code: 100 } }), { status: 400 }); const id = "S" + seq++; meta.conjuntos.push({ id, name: corpo.name, status: "PAUSED", effective_status: "PAUSED", campaign_id: corpo.campaign_id }); return ok({ id }); }
  if (caminho === "act_999/adimages") return ok({ images: { "img.png": { hash: "HASH" + seq++ } } });
  if (caminho === "act_999/advideos") return ok({ id: "V" + seq++ });
  if (caminho === "act_999/adcreatives") return ok({ id: "CR" + seq++ });
  if (caminho === "act_999/ads") { const id = "A" + seq++; const cr = JSON.parse(corpo.creative); const s = meta.conjuntos.find((x) => x.id === corpo.adset_id); meta.anuncios.push({ id, name: corpo.name, status: "PAUSED", effective_status: "PAUSED", adset_id: corpo.adset_id, campaign_id: s.campaign_id, _cr: cr }); return ok({ id }); }
  const alvo = [...meta.campanhas, ...meta.conjuntos, ...meta.anuncios].find((x) => x.id === caminho);
  if (alvo) {
    if (corpo.status) { alvo.status = corpo.status; alvo.effective_status = corpo.status; }
    if (corpo.daily_budget) alvo.daily_budget = corpo.daily_budget;
    return ok({ success: true });
  }
  return new Response(JSON.stringify({ error: { message: "POST não simulado: " + caminho, code: 100 } }), { status: 400 });
}

const google = { orcamento: 60000000, ads: { "11~111": "ENABLED", "11~112": "ENABLED" } };
function respGoogle(url, init) {
  const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
  if (url.includes("oauth2.googleapis.com")) return ok({ access_token: "ya29.teste", expires_in: 3600 });
  const corpo = JSON.parse(init.body || "{}");
  if (url.endsWith("googleAds:searchStream")) {
    const q = corpo.query;
    if (/^SELECT segments\.date/.test(q)) {
      const [, a, b] = q.match(/BETWEEN '([\d-]+)' AND '([\d-]+)'/);
      const rows = [];
      for (let d = a; d <= b; d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) {
        rows.push({ segments: { date: d }, campaign: { id: "77", name: "Pesquisa · marca" }, adGroup: { id: "11", name: "Grupo marca" }, adGroupAd: { ad: { id: "111", name: "" } }, metrics: { costMicros: String(28e6), impressions: "700", clicks: "55" } });
        rows.push({ segments: { date: d }, campaign: { id: "77", name: "Pesquisa · marca" }, adGroup: { id: "11", name: "Grupo marca" }, adGroupAd: { ad: { id: "112", name: "" } }, metrics: { costMicros: String(21e6), impressions: "560", clicks: "14" } });
      }
      return ok([{ results: rows }]);
    }
    if (/FROM customer/.test(q)) return ok([{ results: [{ customer: { id: "1234567890", descriptiveName: "Google do Debian", currencyCode: "BRL" } }] }]);
    if (/FROM campaign/.test(q)) return ok([{ results: [{ campaign: { id: "77", name: "Pesquisa · marca", status: "ENABLED", advertisingChannelType: "SEARCH" }, campaignBudget: { resourceName: "customers/1234567890/campaignBudgets/5", amountMicros: String(google.orcamento), explicitlyShared: false } }] }]);
    if (/FROM ad_group_ad/.test(q) && !/metrics\./.test(q)) return ok([{ results: [
      { adGroupAd: { ad: { id: "111", name: "" }, status: google.ads["11~111"] }, adGroup: { id: "11", name: "Grupo marca", status: "ENABLED" }, campaign: { id: "77" } },
      { adGroupAd: { ad: { id: "112", name: "" }, status: google.ads["11~112"] }, adGroup: { id: "11", name: "Grupo marca", status: "ENABLED" }, campaign: { id: "77" } },
    ] }]);
    const mult = /TODAY/.test(q) ? 0.2 : /BETWEEN/.test(q) ? 0.6 : 1;
    return ok([{ results: [
      { adGroup: { id: "11" }, adGroupAd: { ad: { id: "111" } }, metrics: { costMicros: String(200e6 * mult), impressions: String(Math.round(5000 * mult)), clicks: String(Math.round(400 * mult)), conversions: 8 * mult, conversionsValue: 800 * mult } },
      { adGroup: { id: "11" }, adGroupAd: { ad: { id: "112" } }, metrics: { costMicros: String(150e6 * mult), impressions: String(Math.round(4000 * mult)), clicks: String(Math.round(100 * mult)), conversions: 0, conversionsValue: 0 } },
    ] }]);
  }
  registro.push({ plataforma: "google", caminho: url.split("/customers/1234567890/")[1], corpo });
  if (url.endsWith("adGroupAds:mutate")) { const op = corpo.operations[0].update; google.ads[op.resourceName.split("/").pop()] = op.status; return ok({ results: [{ resourceName: op.resourceName }] }); }
  if (url.endsWith("campaignBudgets:mutate")) { google.orcamento = Number(corpo.operations[0].update.amountMicros); return ok({ results: [{}] }); }
  if (url.endsWith("campaigns:mutate")) return ok({ results: [{}] });
  return new Response(JSON.stringify({ error: { message: "não simulado" } }), { status: 400 });
}

function respClaude(init) {
  const corpo = JSON.parse(init.body);
  const p = corpo.messages[0].content;
  const texto = /JSON/.test(p)
    ? JSON.stringify({ ganchos: ["Pare de lutar contra a balança desse jeito", "O erro que trava seu metabolismo depois dos 30"], textos: [{ tipo: "curto", texto: "Um método simples de 15 minutos por dia. Veja como funciona." }, { tipo: "médio", texto: "Se você já tentou de tudo, esse vídeo é para você." }], titulos: ["Método de 15 minutos", "Veja como funciona"], descricoes: ["Acesso imediato"], roteiros: [{ nome: "UGC selfie", duracao: "45s", cenas: [{ tempo: "0-3s", tela: "Selfie na cozinha", fala: "Ninguém me contou isso antes…" }] }], google: { titulos: ["Método Seca 15"], descricoes: ["Conheça o método."], palavrasChave: ["\"como secar barriga\""] }, testes: ["Gancho de dor x gancho de curiosidade"], suposicoes: ["Público feminino 30+"] })
    : p === "Responda só: ok" ? "ok" : "1. Diagnóstico: o AD02 está queimando verba…";
  return new Response(JSON.stringify({ content: [{ type: "text", text: texto }] }), { status: 200 });
}

// Receptor da Cloudflare simulado
export const eventosWorker = [];
let idWorker = 0;
export function empurrarWorker(plataforma, corpo, cabecalhos = {}) { eventosWorker.push({ id: ++idWorker, plataforma, recebido: new Date().toISOString(), tipo: "application/json", cabecalhos: JSON.stringify(cabecalhos), query: "", corpo: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }); }
function respWorker(url, init) {
  const u = new URL(url); const p = u.pathname.split("/").filter(Boolean);
  if (p[0] === "w" && (!init.method || init.method === "GET")) return new Response("Webhook do Paid Traffic Agent ativo ✓");
  if (p[0] === "sync") {
    if (!String(init.headers?.Authorization || "").startsWith("Bearer ")) return new Response("não autorizado", { status: 401 });
    if (p[1] === "limpar") return new Response(JSON.stringify({ ok: true }));
    const desde = Number(u.searchParams.get("desde") || 0);
    return new Response(JSON.stringify({ ok: true, eventos: eventosWorker.filter((e) => e.id > desde) }), { headers: { "Content-Type": "application/json" } });
  }
  return new Response("Paid Traffic Agent 🐉", { status: 404 });
}

export function instalarMockAds() {
  // vendas que "chegaram" no receptor enquanto o computador estava desligado
  const hojeISO = new Date().toISOString();
  const kiwi = (id, ad, adset, camp, nome, valor, status = "paid") => ({ order_id: id, order_status: status, payment_method: status === "waiting_payment" ? "pix" : "credit_card", Product: { product_id: "p1", product_name: "Protocolo Seca" }, Customer: { email: id + "@x.com", full_name: "Cliente " + id }, Commissions: { charge_amount: valor * 100, my_commission: Math.round(valor * 0.9 * 100) }, TrackingParameters: { utm_source: "FB", utm_campaign: `${camp.name}|${camp.id}`, utm_medium: `x|${adset}`, utm_content: `${nome}|${ad}` }, created_at: hojeISO, approved_date: status === "paid" ? hojeISO : null });
  const C1 = { id: "C1", name: "[AG] Protocolo Seca · teste" }, C2 = { id: "C2", name: "Inglês 90D · frio" };
  for (let i = 0; i < 6; i++) empurrarWorker("kiwify", kiwi("KW" + i, "A1", "S1", C1, "AD01 · gancho dor", 97));
  empurrarWorker("kiwify", kiwi("KW9", "A1", "S1", C1, "AD01 · gancho dor", 97, "waiting_payment"));
  empurrarWorker("kiwify", kiwi("KB1", "B1", "S2", C2, "AD01 · aula grátis", 47));
  empurrarWorker("cakto", { secret: "s", event: "purchase_approved", data: { id: "ck-77", refId: "X1", status: "paid", amount: 197, fees: 12, paymentMethod: "pix", paymentMethodName: "Pix", customer: { name: "Bia", email: "bia@x.com" }, product: { id: "m1", name: "Mentoria" }, commissions: [{ type: "producer", totalAmount: 185 }], utm_source: "google", utm_campaign: "77", utm_medium: "11", utm_content: "111", createdAt: hojeISO, paidAt: hojeISO } });
  empurrarWorker("hotmart", { event: "PURCHASE_APPROVED", data: { product: { id: 9, name: "Ebook Receitas" }, buyer: { email: "z@x.com", name: "Zé" }, commissions: [{ source: "PRODUCER", value: 30 }], purchase: { transaction: "HP9", status: "APPROVED", order_date: Date.now(), approved_date: Date.now(), price: { value: 37 }, payment: { type: "BILLET" }, origin: {} } } });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) return respMeta(u, init);
    if (u.includes("googleads.googleapis.com") || u.includes("oauth2.googleapis.com")) return respGoogle(u, init);
    if (u.startsWith("https://api.anthropic.com/")) return respClaude(init);
    if (u.startsWith("https://debian-webhooks.teste.workers.dev")) return respWorker(u, init);
    return original(url, init);
  };
  return globalThis.fetch;
}
