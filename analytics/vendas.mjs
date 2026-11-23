// Debian Analytics: lê webhooks dos checkouts, normaliza vendas, atribui a campanhas pelas UTMs e monta os relatórios.
import fs from "node:fs/promises";
import path from "node:path";

// ---------- utilidades ----------
export function dataNoFuso(iso, fuso = "America/Sao_Paulo") {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function hojeNoFuso(fuso = "America/Sao_Paulo", agora = new Date()) { return dataNoFuso(agora.toISOString(), fuso); }
export function somarDias(dia, n) { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function parseQs(txt) {
  const out = {};
  for (const [k, v] of new URLSearchParams(txt)) {
    const partes = k.replace(/\]/g, "").split("[");
    let o = out;
    partes.forEach((p, i) => { if (i === partes.length - 1) o[p] = v; else o = o[p] = typeof o[p] === "object" ? o[p] : {}; });
  }
  return out;
}
export function lerCorpo(corpo, tipo = "", query = "") {
  let obj = {};
  const t = String(corpo || "").trim();
  if (t.startsWith("{") || t.startsWith("[")) { try { obj = JSON.parse(t); } catch { obj = {}; } }
  else if (/urlencoded/i.test(tipo) || /^[\w%\[\]]+=/.test(t)) obj = parseQs(t);
  if (query) { const q = parseQs(String(query).replace(/^\?/, "")); for (const [k, v] of Object.entries(q)) if (!(k in obj)) obj[k] = v; }
  return obj;
}

// Procura um campo em qualquer profundidade (primeiro que bater, em largura).
function achar(obj, teste, maxProf = 8) {
  const fila = [[obj, 0, ""]];
  while (fila.length) {
    const [o, prof, caminho] = fila.shift();
    if (!o || typeof o !== "object" || prof > maxProf) continue;
    for (const [k, v] of Object.entries(o)) {
      const c = caminho ? caminho + "." + k : k;
      if (v !== null && typeof v !== "object" && teste(k.toLowerCase(), v, c.toLowerCase())) return v;
    }
    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") fila.push([v, prof + 1, caminho ? caminho + "." + k : k]);
  }
  return undefined;
}
const get = (o, caminho) => caminho.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const numero = (v) => { if (v === undefined || v === null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : null; };

export function statusPadrao(bruto) {
  const s = String(bruto || "").toLowerCase();
  if (/chargeback|charged_?back|dispute|contesta/.test(s)) return "chargeback";
  if (/refund|reembols|estorn|devolvid/.test(s)) return "reembolsada";
  if (/refus|recusad|declin|denied|negad|failed|falh|blocked/.test(s)) return "recusada";
  if (/cancel|expir|abandon/.test(s)) return "cancelada";
  if (/approv|aprovad|paid|pago|complete|conclu|confirm|succe|captur|authoriz|finaliz/.test(s)) return "aprovada";
  if (/wait|pend|aguard|billet|boleto|printed|gerad|creat|process|analys|anális|delay|atras|overdue|open/.test(s)) return "pendente";
  return "pendente";
}
export function metodoPadrao(bruto) {
  const s = String(bruto || "").toLowerCase();
  if (/pix/.test(s)) return "pix";
  if (/billet|boleto|bank_slip/.test(s)) return "boleto";
  if (/card|cart|credit|credito|crédito|debit/.test(s)) return "cartao";
  if (/paypal/.test(s)) return "paypal";
  return s ? "outro" : "";
}
function dataISO(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || /^\d{10,13}$/.test(String(v))) { const n = Number(v); return new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
  const s = String(v).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "-03:00");
  return isNaN(d) ? null : d.toISOString();
}

// ---------- UTMs ----------
export function lerUtm(obj) {
  const utm = {};
  for (const k of ["source", "medium", "campaign", "content", "term"]) {
    const v = achar(obj, (key) => key === "utm_" + k || key === "utm" + k);
    if (v !== undefined && v !== null && String(v).trim() && String(v) !== "null") utm[k] = String(v).trim();
  }
  const sck = achar(obj, (k) => k === "sck");
  const src = achar(obj, (k) => k === "src");
  const xcod = achar(obj, (k) => k === "xcod");
  return { utm, sck: sck ? String(sck) : "", src: src ? String(src) : "", xcod: xcod ? String(xcod) : "" };
}

const ultimoId = (v) => { const t = String(v || ""); const m = t.match(/\|\s*(\d+)\s*$/) || t.match(/^\s*(\d{5,})\s*$/); return m ? m[1] : ""; };
export function plataformaDaFonte(s) {
  const t = String(s || "").toLowerCase();
  if (/^(fb|facebook|ig|instagram|meta|an|msg|messenger)$|facebook|instagram|^fb/.test(t)) return "meta";
  if (/google|gads|adwords|youtube|^yt$|^g$/.test(t)) return "google";
  if (/tiktok|^tt$/.test(t)) return "tiktok";
  return t ? "outros" : "";
}

// Identifica campanha/conjunto/anúncio a partir das UTMs (formato "nome|id") ou do sck compacto.
export function idsDasUtms({ utm = {}, sck = "", src = "" }) {
  const r = { plataforma: "", campanha: "", conjunto: "", anuncio: "", origem: "" };
  const m = String(sck).match(/^([A-Za-z]{1,3})_(\d+)_(\d+)_(\d+)$/) || String(src).match(/^([A-Za-z]{1,3})_(\d+)_(\d+)_(\d+)$/);
  if (m) {
    r.plataforma = /^g/i.test(m[1]) ? "google" : "meta";
    [r.campanha, r.conjunto, r.anuncio] = [m[2], m[3], m[4]];
    r.origem = m[1];
    return r;
  }
  r.origem = utm.source || src || sck || "";
  r.plataforma = plataformaDaFonte(utm.source || src || sck);
  // No Google (ValueTrack) as UTMs são só o número do ID: aceita qualquer tamanho
  const idG = (v) => (/^\s*\d+\s*$/.test(String(v || "")) ? String(v).trim() : ultimoId(v));
  const pega = r.plataforma === "google" ? idG : ultimoId;
  r.campanha = pega(utm.campaign);
  r.conjunto = pega(utm.medium);
  r.anuncio = pega(utm.content);
  return r;
}

// ---------- normalização de eventos ----------
export function normalizarEvento({ plataforma = "generico", corpo = "", tipo = "", query = "", cabecalhos = {}, recebido = new Date().toISOString() }) {
  const o = typeof corpo === "object" ? corpo : lerCorpo(corpo, tipo, query);
  if (!o || typeof o !== "object" || !Object.keys(o).length) return null;
  const p = String(plataforma).toLowerCase();
  let v;
  if (p === "cakto" || (o.event && o.data && (o.data.refId !== undefined || o.data.paymentMethodName !== undefined))) {
    // Cakto: { secret, event, data: { id, refId, status, amount, fees, commissions[], paymentMethod, utm_*, sck, createdAt, paidAt… } }
    const d = o.data || {};
    const ev = String(o.event || "");
    if (ev === "checkout_abandonment" || !d.id) return null;
    const porEvento = { purchase_approved: "aprovada", subscription_created: "aprovada", subscription_renewed: "aprovada", purchase_refused: "recusada", subscription_renewal_refused: "recusada", refund: "reembolsada", chargeback: "chargeback", dispute_defense_requested: "chargeback", pix_expirado: "cancelada" };
    let status = porEvento[ev] || (/_gerado$/.test(ev) ? "pendente" : statusPadrao(d.status || ev));
    if (ev === "refund_requested" || d.status === "refund_requested") status = d.paidAt ? "aprovada" : "pendente"; // pedido de reembolso ainda não é reembolso
    const prod = (d.commissions || []).find((c) => String(c.type).toLowerCase() === "producer");
    const valor = numero(d.amount ?? d.baseAmount ?? d.offer?.price);
    v = {
      checkout: "Cakto",
      transacao: d.id,
      statusBruto: d.status || ev, status, reembolsoSolicitado: ev === "refund_requested" || d.status === "refund_requested",
      produto: d.product?.name || d.offer?.name, produtoId: d.product?.id,
      valor,
      liquido: prod ? numero(prod.totalAmount) : valor !== null && numero(d.fees) !== null ? valor - numero(d.fees) : valor,
      moeda: d.currency || "BRL",
      metodo: metodoPadrao(d.paymentMethod), parcelas: numero(d.installments),
      email: d.customer?.email, nome: d.customer?.name,
      criadaEm: dataISO(d.createdAt), aprovadaEm: dataISO(d.paidAt),
      segredoCakto: o.secret || "",
    };
  } else if (p === "hotmart" || (o.event && o.data && o.data.purchase)) {
    const d = o.data || {};
    const pu = d.purchase || {};
    const prod = (d.commissions || []).find((c) => c.source === "PRODUCER");
    v = {
      checkout: "Hotmart",
      transacao: pu.transaction || o.id,
      statusBruto: pu.status || o.event,
      status: statusPadrao(o.event === "PURCHASE_PROTEST" ? "refund" : (o.event || pu.status)),
      produto: d.product?.name, produtoId: d.product?.id,
      valor: numero(pu.price?.value ?? pu.full_price?.value),
      liquido: numero(prod?.value ?? d.producer?.commission?.value ?? pu.price?.value),
      moeda: pu.price?.currency_value || "BRL",
      metodo: metodoPadrao(pu.payment?.type), parcelas: numero(pu.payment?.installments_number),
      email: d.buyer?.email, nome: d.buyer?.name,
      criadaEm: dataISO(pu.order_date), aprovadaEm: dataISO(pu.approved_date),
      hottok: o.hottok || cabecalhos["x-hotmart-hottok"] || "",
    };
  } else if (p === "kiwify" || o.order_status || o.Commissions || o.TrackingParameters) {
    const c = o.Commissions || {};
    v = {
      checkout: "Kiwify",
      transacao: o.order_id || o.order_ref,
      statusBruto: o.order_status || o.webhook_event_type,
      status: statusPadrao(o.order_status || o.webhook_event_type),
      produto: o.Product?.product_name, produtoId: o.Product?.product_id,
      valor: c.charge_amount !== undefined ? numero(c.charge_amount) / 100 : numero(c.product_base_price) / 100 || null,
      liquido: c.my_commission !== undefined ? numero(c.my_commission) / 100 : null,
      moeda: c.currency || "BRL",
      metodo: metodoPadrao(o.payment_method), parcelas: numero(o.installments),
      email: o.Customer?.email, nome: o.Customer?.full_name || o.Customer?.first_name,
      criadaEm: dataISO(o.created_at), aprovadaEm: dataISO(o.approved_date),
    };
  } else {
    // Leitor genérico: Eduzz, Monetizze, Braip, PerfectPay, Ticto, Cakto, Greenn, Yampi, Shopify…
    const temCent = (k) => /cent/.test(k);
    let valor = null;
    const vk = achar(o, (k, val) => /^(total_price|total_amount|amount_total|sale_amount|valor_total|total|amount|price|valor|value|sale_value|valor_venda|full_price|charge_amount)$/.test(k) && numero(val) !== null && !/commission|comiss|fee|taxa|discount|desconto|shipping|frete/.test(k));
    if (vk !== undefined) valor = numero(vk);
    const ck = achar(o, (k, val) => temCent(k) && /(amount|price|total|valor)/.test(k) && numero(val) !== null);
    if (valor === null && ck !== undefined) valor = numero(ck) / 100;
    const liq = achar(o, (k, val) => /^(net_amount|valor_liquido|liquido|producer_commission|comissao_produtor|my_commission|net_value|amount_net)$/.test(k) && numero(val) !== null);
    const statusBruto = achar(o, (k) => /^(status|order_status|sale_status|payment_status|financial_status|trans_status|status_name|event|evento|type)$/.test(k));
    v = {
      checkout: p.charAt(0).toUpperCase() + p.slice(1),
      transacao: achar(o, (k) => /^(transaction|transaction_id|transacao|order_id|orderid|sale_id|venda_id|trans_cod|codigo|code|chave_unica|id)$/.test(k)),
      statusBruto, status: statusPadrao(statusBruto),
      produto: achar(o, (k, val, c) => /^(product_name|produto_nome|nome_produto|name|title|nome)$/.test(k) && /(product|produto|item|plan|offer)/.test(c) && typeof val === "string"),
      valor,
      liquido: liq !== undefined ? numero(liq) : null,
      moeda: achar(o, (k) => /^(currency|moeda|currency_code)$/.test(k)) || "BRL",
      metodo: metodoPadrao(achar(o, (k) => /^(payment_?method|payment_?type|metodo_?pagamento|forma_?pagamento|forma_?de_?pagamento|method|tipo_?pagamento|gateway)$/.test(k))),
      email: achar(o, (k, val) => /email/.test(k) && /@/.test(String(val))),
      nome: achar(o, (k, val, c) => /^(name|nome|full_name|first_name)$/.test(k) && /(customer|buyer|client|comprador|cliente)/.test(c)),
      criadaEm: dataISO(achar(o, (k) => /^(created_?at|data_?criacao|date_?created|order_?date|data_?venda|data_?inicio|created)$/.test(k))),
      aprovadaEm: dataISO(achar(o, (k) => /^(approved_?date|paid_?at|data_?aprovacao|data_?finalizada|approved_?at|date_?approved)$/.test(k))),
    };
  }
  if (!v.transacao) return null;
  const rastreio = lerUtm(o);
  const ids = idsDasUtms(rastreio);
  const teste = !!achar(o, (k, val) => /^(test|is_test|istest|teste|sandbox)$/.test(k) && (val === true || val === "true" || val === 1 || val === "1"));
  if (v.liquido === null || v.liquido === undefined) v.liquido = v.valor;
  return {
    id: `${v.checkout.toLowerCase()}:${v.transacao}`,
    ...v,
    transacao: String(v.transacao),
    produto: v.produto ? String(v.produto) : "Produto sem nome",
    email: v.email ? String(v.email).toLowerCase() : "",
    utm: rastreio.utm, sck: rastreio.sck, src: rastreio.src,
    ids, teste,
    recebidaEm: recebido,
    criadaEm: v.criadaEm || recebido,
    atualizadaEm: recebido,
  };
}

// Junta o evento novo com o que já existe (a mesma venda muda de status: pendente → aprovada → reembolsada).
export function aplicarVenda(lista, nova) {
  const i = lista.findIndex((x) => x.id === nova.id);
  if (i < 0) { lista.push({ ...nova, historico: [{ status: nova.status, em: nova.recebidaEm }] }); return "nova"; }
  const atual = lista[i];
  const hist = [...(atual.historico || []), { status: nova.status, em: nova.recebidaEm }];
  const ordem = { recusada: 0, cancelada: 0, pendente: 1, aprovada: 2, reembolsada: 3, chargeback: 4 };
  // não volta de aprovada para pendente se os eventos chegarem fora de ordem
  const status = (ordem[nova.status] ?? 1) >= (ordem[atual.status] ?? 1) || (["cancelada", "recusada"].includes(nova.status) && atual.status === "pendente") ? nova.status : atual.status;
  const mesclado = { ...atual };
  for (const [k, val] of Object.entries(nova)) if (val !== null && val !== undefined && val !== "" && !(typeof val === "object" && !Array.isArray(val) && !Object.keys(val).length)) mesclado[k] = val;
  if (!nova.ids?.anuncio && atual.ids?.anuncio) mesclado.ids = atual.ids;
  if (!Object.keys(nova.utm || {}).length) mesclado.utm = atual.utm;
  mesclado.status = status;
  mesclado.aprovadaEm = atual.aprovadaEm || nova.aprovadaEm || (status === "aprovada" ? nova.recebidaEm : null);
  mesclado.historico = hist.slice(-20);
  lista[i] = mesclado;
  return "atualizada";
}

// ---------- atribuição ----------
// nomes: { "meta:ID_ANUNCIO": { anuncio, conjunto, conjuntoId, campanha, campanhaId } }
export function atribuir(venda, nomes = {}) {
  const ids = venda.ids || {};
  const plat = ids.plataforma;
  if ((plat === "meta" || plat === "google") && ids.anuncio) {
    let chave = `${plat}:${ids.anuncio}`;
    if (!nomes[chave] && plat === "google") chave = Object.keys(nomes).find((k) => k.startsWith("google:") && k.endsWith("~" + ids.anuncio)) || chave;
    const n = nomes[chave];
    return { plataforma: plat, anuncioKey: chave, anuncioId: chave.split(":")[1], conjuntoId: n?.conjuntoId || ids.conjunto, campanhaId: n?.campanhaId || ids.campanha, nome: n?.anuncio };
  }
  if ((plat === "meta" || plat === "google") && (ids.conjunto || ids.campanha)) return { plataforma: plat, anuncioKey: null, conjuntoId: ids.conjunto, campanhaId: ids.campanha };
  // sem IDs: tenta casar pelos nomes das UTMs
  const u = venda.utm || {};
  const limpa = (s) => String(s || "").split("|")[0].trim().toLowerCase();
  if (u.content || u.campaign) {
    for (const [k, n] of Object.entries(nomes)) {
      if ((u.content && limpa(u.content) === String(n.anuncio || "").toLowerCase()) || (!u.content && u.campaign && limpa(u.campaign) === String(n.campanha || "").toLowerCase())) {
        return { plataforma: k.split(":")[0], anuncioKey: u.content ? k : null, anuncioId: u.content ? k.split(":")[1] : null, conjuntoId: n.conjuntoId, campanhaId: n.campanhaId };
      }
    }
  }
  return { plataforma: plat || "", anuncioKey: null, origem: ids.origem || "" };
}

// ---------- relatório ----------
const vazio = () => ({ gasto: 0, impressoes: 0, cliques: 0, vendas: 0, bruto: 0, liquido: 0, pendentes: 0, valorPendente: 0, reembolsos: 0, valorReembolsos: 0, chargebacks: 0, valorChargebacks: 0 });
export function fechar(m, cfg = {}) {
  const impostos = m.liquido * ((Number(cfg.impostoPct) || 0) / 100);
  const custos = m.vendas * (Number(cfg.custoPorVenda) || 0) + m.liquido * ((Number(cfg.taxaExtraPct) || 0) / 100);
  const lucro = m.liquido - m.gasto - impostos - custos;
  return {
    ...m, impostos, custos, lucro,
    roi: m.gasto > 0 ? (lucro / m.gasto) * 100 : null,
    roas: m.gasto > 0 ? m.liquido / m.gasto : null,
    cpa: m.vendas > 0 ? m.gasto / m.vendas : null,
    ticket: m.vendas > 0 ? m.bruto / m.vendas : null,
    margem: m.liquido > 0 ? (lucro / m.liquido) * 100 : null,
    ctr: m.impressoes > 0 ? (m.cliques / m.impressoes) * 100 : null,
  };
}

export function relatorio({ vendas = [], gastos = { dias: {}, nomes: {} }, de, ate, fuso = "America/Sao_Paulo", cfg = {}, filtros = {}, entidades = [] }) {
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) { dias.push(d); if (dias.length > 400) break; }
  const nomes = gastos.nomes || {};
  const okPlat = (p) => !filtros.plataforma || p === filtros.plataforma;
  const total = vazio();
  const porDia = Object.fromEntries(dias.map((d) => [d, vazio()]));
  const arvore = new Map(); // campanhaKey → { ..., conjuntos: Map → { ..., anuncios: Map } }
  const no = (mapa, k, base) => { if (!mapa.has(k)) mapa.set(k, { ...vazio(), ...base }); return mapa.get(k); };
  const somaEm = (alvos, campo, n) => { for (const a of alvos) a[campo] += n; };

  // gastos
  for (const d of dias) {
    for (const [k, g] of Object.entries(gastos.dias?.[d] || {})) {
      const [plat] = k.split(":");
      if (!okPlat(plat)) continue;
      const n = nomes[k] || {};
      const c = no(arvore, `${plat}:${n.campanhaId || "?"}`, { plataforma: plat, id: n.campanhaId || "?", nome: n.campanha || "Campanha", conjuntos: new Map() });
      const s = no(c.conjuntos, `${plat}:${n.conjuntoId || "?"}`, { plataforma: plat, id: n.conjuntoId || "?", nome: n.conjunto || "Conjunto", anuncios: new Map() });
      const a = no(s.anuncios, k, { plataforma: plat, id: k.split(":")[1], nome: n.anuncio || "Anúncio" });
      const alvos = [total, porDia[d], c, s, a];
      somaEm(alvos, "gasto", +g.gasto || 0); somaEm(alvos, "impressoes", +g.impressoes || 0); somaEm(alvos, "cliques", +g.cliques || 0);
    }
  }

  // vendas
  const produtos = new Map(), metodos = new Map(), checkouts = new Map(), semAtrib = new Map();
  const ultimas = [];
  for (const v of vendas) {
    if (v.teste && !filtros.incluirTestes) continue;
    if (filtros.produto && v.produto !== filtros.produto) continue;
    if (filtros.checkout && v.checkout !== filtros.checkout) continue;
    const dRef = dataNoFuso(v.aprovadaEm || v.criadaEm, fuso);
    if (!dRef || dRef < de || dRef > ate) continue;
    const at = atribuir(v, nomes);
    if (filtros.plataforma && at.plataforma !== filtros.plataforma) continue;
    const met = no(metodos, v.metodo || "outro", { nome: v.metodo || "outro", total: 0 });
    met.total++;
    const alvosBase = [];
    let c = null, s = null, a = null;
    if (at.campanhaId || at.anuncioKey) {
      const plat = at.plataforma;
      const n = at.anuncioKey ? nomes[at.anuncioKey] || {} : {};
      const campId = at.campanhaId || n.campanhaId || "?";
      const campNome = n.campanha || Object.values(nomes).find((x) => x.campanhaId === campId)?.campanha || `Campanha ${campId}`;
      c = no(arvore, `${plat}:${campId}`, { plataforma: plat, id: campId, nome: campNome, conjuntos: new Map() });
      const conjId = at.conjuntoId || n.conjuntoId || "?";
      const conjNome = n.conjunto || Object.values(nomes).find((x) => x.conjuntoId === conjId)?.conjunto || `Conjunto ${conjId}`;
      s = no(c.conjuntos, `${plat}:${conjId}`, { plataforma: plat, id: conjId, nome: conjNome, anuncios: new Map() });
      if (at.anuncioKey) a = no(s.anuncios, at.anuncioKey, { plataforma: plat, id: at.anuncioKey.split(":")[1], nome: n.anuncio || at.nome || `Anúncio ${at.anuncioKey.split(":")[1]}` });
    } else {
      const origem = at.origem || (Object.keys(v.utm || {}).length ? "sem identificação" : "sem UTM (orgânico/direto)");
      c = no(semAtrib, origem, { plataforma: "", id: origem, nome: origem, semAtribuicao: true, conjuntos: new Map() });
    }
    const prod = no(produtos, v.produto, { nome: v.produto });
    const chk = no(checkouts, v.checkout, { nome: v.checkout });
    alvosBase.push(total, porDia[dRef], c, prod, chk);
    if (s) alvosBase.push(s);
    if (a) alvosBase.push(a);
    if (v.status === "aprovada") {
      somaEm(alvosBase, "vendas", 1); somaEm(alvosBase, "bruto", +v.valor || 0); somaEm(alvosBase, "liquido", +v.liquido || 0);
      met.vendas++;
    } else if (v.status === "pendente") {
      somaEm(alvosBase, "pendentes", 1); somaEm(alvosBase, "valorPendente", +v.valor || 0);
    } else if (v.status === "reembolsada") {
      somaEm(alvosBase, "reembolsos", 1); somaEm(alvosBase, "valorReembolsos", +v.liquido || 0);
    } else if (v.status === "chargeback") {
      somaEm(alvosBase, "chargebacks", 1); somaEm(alvosBase, "valorChargebacks", +v.liquido || 0);
    }
    ultimas.push({ id: v.id, quando: v.aprovadaEm || v.criadaEm, produto: v.produto, valor: v.valor, liquido: v.liquido, status: v.status, metodo: v.metodo, checkout: v.checkout, campanha: c.nome, anuncio: a?.nome || "", plataforma: at.plataforma, teste: v.teste });
  }

  // status e dados das entidades do agente (para pausar/ativar direto do relatório)
  const ent = new Map(entidades.map((e) => [e.plataforma + ":" + e.id, e]));
  const info = (k) => { const e = ent.get(k); return e ? { status: e.status, recurso: e.recurso || null, recursoOrcamento: e.orcamento?.recurso || null, orcamento: e.orcamento || null, thumb: e.thumb || "", texto: e.texto || "", titulo: e.titulo || "", gerenciada: !!e.gerenciada } : {}; };
  const ordenar = (arr) => arr.sort((x, y) => (y.lucro - x.lucro) || (y.gasto - x.gasto));
  const campanhas = ordenar([...arvore.values()].map((c) => ({
    ...fechar(c, cfg), ...info(`${c.plataforma}:${c.id}`), nivel: "campanha",
    conjuntos: ordenar([...c.conjuntos.values()].map((s) => ({
      ...fechar(s, cfg), ...info(`${s.plataforma}:${s.id}`), nivel: "conjunto", campanhaId: c.id,
      anuncios: ordenar([...s.anuncios.values()].map((a) => ({ ...fechar(a, cfg), ...info(`${a.plataforma}:${a.id}`), nivel: "anuncio", campanhaId: c.id, conjuntoId: s.id }))),
    }))),
  })));
  const semAtribuicao = ordenar([...semAtrib.values()].map((c) => ({ ...fechar(c, cfg), conjuntos: [] })));
  const todosAnuncios = campanhas.flatMap((c) => c.conjuntos.flatMap((s) => s.anuncios.map((a) => ({ ...a, campanha: c.nome, conjunto: s.nome }))));
  const criativos = todosAnuncios.filter((a) => a.vendas > 0 || a.gasto > 0).sort((x, y) => (y.lucro - x.lucro) || (y.vendas - x.vendas));
  const fat = fechar(total, cfg);
  const tentativas = (m) => m.total;
  return {
    de, ate, fuso,
    total: fat,
    porDia: dias.map((d) => ({ dia: d, ...fechar(porDia[d], cfg) })),
    campanhas, semAtribuicao,
    criativos: { melhores: criativos.slice(0, 10), piores: criativos.filter((a) => a.gasto > 0).sort((x, y) => x.lucro - y.lucro).slice(0, 10), todos: criativos.slice(0, 300) },
    produtos: ordenar([...produtos.values()].map((p) => fechar(p, cfg))),
    checkouts: ordenar([...checkouts.values()].map((p) => fechar(p, cfg))),
    metodos: [...metodos.values()].map((m) => ({ nome: m.nome, vendas: m.vendas, tentativas: tentativas(m), aprovacao: m.total ? (m.vendas / m.total) * 100 : null })).sort((a, b) => b.vendas - a.vendas),
    ultimas: ultimas.sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 40),
  };
}

// Vendas aprovadas por anúncio em cada janela (para o agente de tráfego decidir pelo ROI real).
export function vendasPorAnuncio(vendas, nomes, { fuso = "America/Sao_Paulo", agora = new Date() } = {}) {
  const hoje = hojeNoFuso(fuso, agora);
  const janelas = { hoje: [hoje, hoje], d3: [somarDias(hoje, -3), somarDias(hoje, -1)], d7: [somarDias(hoje, -7), somarDias(hoje, -1)] };
  const out = {};
  for (const v of vendas) {
    if (v.teste || v.status !== "aprovada") continue;
    const at = atribuir(v, nomes);
    if (!at.anuncioKey) continue;
    const d = dataNoFuso(v.aprovadaEm || v.criadaEm, fuso);
    for (const [j, [a, b]] of Object.entries(janelas)) {
      if (d >= a && d <= b) {
        const m = ((out[at.anuncioKey] ||= {})[j] ||= { conversoes: 0, receita: 0 });
        m.conversoes += 1;
        m.receita += +v.liquido || +v.valor || 0;
      }
    }
  }
  return out;
}

export async function lerVendasArquivo(raiz) {
  try { return JSON.parse(await fs.readFile(path.join(raiz, "trafego-dados", "vendas.json"), "utf8")); } catch { return []; }
}
export async function lerGastosArquivo(raiz) {
  try { return JSON.parse(await fs.readFile(path.join(raiz, "trafego-dados", "gastos.json"), "utf8")); } catch { return { dias: {}, nomes: {} }; }
}
