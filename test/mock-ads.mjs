// Imitação das APIs da Meta, Google Ads, TikTok, Kwai, Telegram, Mercado Pago e Claude, para testar o agente sem mexer em contas reais.
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


// ---------- TikTok ----------
const tt = {
  camp: [{ campaign_id: "1801", campaign_name: "TT · Protocolo Seca", operation_status: "ENABLE", budget: 120, budget_mode: "BUDGET_MODE_DAY", budget_optimize_on: true }],
  conj: [{ adgroup_id: "1802", adgroup_name: "TT · Amplo BR", campaign_id: "1801", operation_status: "ENABLE", budget_mode: "BUDGET_MODE_INFINITE" }],
  ads: [
    { ad_id: "1803", ad_name: "TT01 · gancho dor", adgroup_id: "1802", campaign_id: "1801", operation_status: "ENABLE", ad_text: "Pare de lutar contra a balança." },
    { ad_id: "1804", ad_name: "TT02 · trend", adgroup_id: "1802", campaign_id: "1801", operation_status: "ENABLE", ad_text: "Esse truque viralizou." },
  ],
  rel: { hoje: { 1803: [25, 6000, 90, 1, 1.2], 1804: [20, 5000, 20, 0, 1.3] }, d3: { 1803: [90, 20000, 300, 3, 1.6], 1804: [85, 18000, 60, 0, 1.8] }, d7: { 1803: [180, 40000, 640, 6, 3.2], 1804: [170, 36000, 140, 0, 3.4] } },
};
function respTiktok(url, init) {
  const u = new URL(url), caminho = u.pathname.replace("/open_api/v1.3/", "");
  const ok = (data) => new Response(JSON.stringify({ code: 0, message: "OK", data }), { status: 200 });
  if (init.headers?.["Access-Token"] === "ruim") return new Response(JSON.stringify({ code: 40105, message: "Access token is incorrect or has been revoked." }), { status: 200 });
  const pag = (list) => ok({ list, page_info: { page: 1, page_size: 1000, total_number: list.length, total_page: 1 } });
  if (caminho === "advertiser/info/") return ok({ list: [{ advertiser_id: "7000", name: "TikTok do Debian", currency: "BRL" }] });
  if (caminho === "campaign/get/") return pag(tt.camp);
  if (caminho === "adgroup/get/") return pag(tt.conj);
  if (caminho === "ad/get/") return pag(tt.ads);
  if (caminho === "report/integrated/get/") {
    const dims = JSON.parse(u.searchParams.get("dimensions")), a = u.searchParams.get("start_date"), b = u.searchParams.get("end_date");
    const hoje = new Date().toISOString().slice(0, 10);
    if (dims.includes("stat_time_day")) {
      const list = [];
      for (let d = a; d <= b; d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) for (const [id, [g, imp, cl]] of Object.entries(tt.rel.d7)) list.push({ dimensions: { ad_id: id, stat_time_day: d + " 00:00:00" }, metrics: { spend: String(g / 7), impressions: String(imp / 7), clicks: String(cl / 7) } });
      return pag(list);
    }
    const j = a === hoje ? "hoje" : b === a ? "hoje" : (Date.parse(b) - Date.parse(a)) / 864e5 > 3 ? "d7" : "d3";
    return pag(Object.entries(tt.rel[j]).map(([id, [g, imp, cl, conv, f]]) => ({ dimensions: { ad_id: id }, metrics: { spend: String(g), impressions: String(imp), clicks: String(cl), conversion: String(conv), frequency: String(f) } })));
  }
  const corpo = JSON.parse(init.body || "{}");
  registro.push({ plataforma: "tiktok", caminho, corpo });
  if (caminho === "ad/status/update/") { for (const id of corpo.ad_ids) { const a = tt.ads.find((x) => x.ad_id === id); if (a) a.operation_status = corpo.operation_status; } return ok({ ad_ids: corpo.ad_ids }); }
  if (caminho === "adgroup/status/update/" || caminho === "campaign/status/update/") return ok({});
  if (caminho === "campaign/update/") { tt.camp[0].budget = corpo.budget; return ok({}); }
  if (caminho === "adgroup/budget/update/") return ok({});
  return new Response(JSON.stringify({ code: 40002, message: "não simulado: " + caminho }), { status: 200 });
}

// ---------- Kwai ----------
const kw = { cri: [{ creativeId: 5501, creativeName: "KW01 · depoimento", unitId: 5502, campaignId: 5503, openStatus: 1, dataGenerationSource: 2 }, { creativeId: 5504, creativeName: "KW02 · antes e depois", unitId: 5502, campaignId: 5503, openStatus: 1, dataGenerationSource: 1 }] };
function respKwai(url, init) {
  const ok = (data) => new Response(JSON.stringify({ status: 200, message: "成功", data }), { status: 200 });
  if (url.startsWith("https://business.kwai.com/oauth/token")) return new Response(JSON.stringify({ access_token: "kw-acesso", refresh_token: "kw-refresh-2", expires_in: 3599 }));
  const caminho = new URL(url).pathname.replace("/rest/n/mapi", "");
  const corpo = JSON.parse(init.body || "{}");
  if (caminho === "/report/dspAccountEffectQuery") return ok({ total: 1, data: [{ accountId: corpo.accountId, accountName: "Kwai do Debian", cost: 50e6 }] });
  if (caminho === "/report/dspCreativeEffectQuery") {
    const dias = Math.max(1, Math.round((corpo.dataEndTime - corpo.dataBeginTime) / 864e5));
    return ok({ total: 2, data: kw.cri.map((c, i) => ({ time: corpo.dataBeginTime, campaignId: c.campaignId, campaignName: "Kwai · Seca", unitId: c.unitId, unitName: "Kwai · amplo", id: c.creativeId, creativeName: c.creativeName, cost: (i ? 30 : 60) * 1e6 * dias, exposure: 8000 * dias, click: (i ? 40 : 160) * dias, action: i ? 0 : dias })) });
  }
  if (caminho === "/campaign/dspCampaignPageQueryPerformance") return ok({ total: 1, data: [{ campaignId: 5503, campaignName: "Kwai · Seca", openStatus: 1 }] });
  if (caminho === "/unit/dspUnitPageQueryPerformance") return ok({ total: 1, data: [{ unitId: 5502, unitName: "Kwai · amplo", campaignId: 5503, openStatus: 1, budgetType: 2, dayBudget: 80e6 }] });
  if (caminho === "/creative/dspCreativePageQueryPerformance") return ok({ total: kw.cri.length, data: kw.cri });
  registro.push({ plataforma: "kwai", caminho, corpo });
  if (caminho === "/creative/dspCreativeUpdateOpenStatusPerformance") {
    const okIds = corpo.creativeIdList.filter((id) => kw.cri.find((c) => c.creativeId === id)?.dataGenerationSource === 2);
    for (const id of okIds) kw.cri.find((c) => c.creativeId === id).openStatus = corpo.openStatus;
    return ok({ total: okIds.length, successIdList: okIds });
  }
  if (caminho === "/unit/dspUnitUpdateBudgetPerformance") return ok({ total: 1, data: [{ accountId: corpo.accountId, unitId: 5502 }] });
  return new Response(JSON.stringify({ status: 400, message: "não simulado: " + caminho }), { status: 200 });
}

// ---------- Telegram e Mercado Pago ----------
export const telegramEnviadas = [];
function respTelegram(url, init) {
  const metodo = url.split("/").pop();
  const ok = (result) => new Response(JSON.stringify({ ok: true, result }));
  if (url.includes("/botruim/")) return new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 });
  if (metodo === "getMe") return ok({ id: 1, username: "debian_avisos_bot" });
  if (metodo === "getUpdates") return ok([{ update_id: 1, message: { chat: { id: 987654, first_name: "Debian" }, text: "oi" } }]);
  if (metodo === "sendMessage") { telegramEnviadas.push(JSON.parse(init.body)); return ok({ message_id: telegramEnviadas.length }); }
  return ok(true);
}
function respMercadoPago(url) {
  const id = url.split("/").pop();
  return new Response(JSON.stringify({ id: Number(id), status: "approved", transaction_amount: 67, transaction_details: { net_received_amount: 63.5 }, currency_id: "BRL", payment_method_id: "pix", payment_type_id: "bank_transfer", description: "Guia Cachorro Vizinho", payer: { email: "mp@x.com" }, metadata: { utm_source: "tiktok", utm_campaign: "TT · Protocolo Seca|1801", utm_medium: "TT · Amplo BR|1802", utm_content: "TT01 · gancho dor|1803" }, date_created: new Date().toISOString(), date_approved: new Date().toISOString() }));
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
  empurrarWorker("mercadopago", { action: "payment.created", type: "payment", data: { id: "9911" } });
  empurrarWorker("stripe", { id: "evt_1", object: "event", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: true, data: { object: { id: "cs_1", object: "checkout.session", payment_intent: "pi_1", amount_total: 4900, currency: "usd", payment_status: "paid", customer_details: { email: "us@x.com", name: "John" }, metadata: { produto: "Dog Guide (EN)", utm_source: "kwai", utm_campaign: "5503", utm_medium: "5502", utm_content: "5501" } } } });
  empurrarWorker("hotmart", { event: "PURCHASE_APPROVED", data: { product: { id: 9, name: "Ebook Receitas" }, buyer: { email: "z@x.com", name: "Zé" }, commissions: [{ source: "PRODUCER", value: 30 }], purchase: { transaction: "HP9", status: "APPROVED", order_date: Date.now(), approved_date: Date.now(), price: { value: 37 }, payment: { type: "BILLET" }, origin: {} } } });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) return respMeta(u, init);
    if (u.includes("googleads.googleapis.com") || u.includes("oauth2.googleapis.com")) return respGoogle(u, init);
    if (u.startsWith("https://api.anthropic.com/")) return respClaude(init);
    if (u.startsWith("https://business-api.tiktok.com/")) return respTiktok(u, init);
    if (u.startsWith("https://developers.kwai.com/") || u.startsWith("https://business.kwai.com/")) return respKwai(u, init);
    if (u.startsWith("https://api.telegram.org/")) return respTelegram(u, init);
    if (u.startsWith("https://api.mercadopago.com/")) return respMercadoPago(u);
    if (u.startsWith("https://debian-webhooks.teste.workers.dev")) return respWorker(u, init);
    return original(url, init);
  };
  return globalThis.fetch;
}
