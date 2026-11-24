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
    let v = achar(obj, (key) => key === "utm_" + k || key === "utm" + k || key.endsWith("_utm_" + k));
    if (v !== undefined && v !== null && String(v).trim() && String(v) !== "null") utm[k] = String(v).trim();
  }
  // listas { key, value } (WooCommerce) e URLs de chegada com UTMs (Shopify landing_site)
  for (const lista of [obj?.meta_data, obj?.note_attributes].filter(Array.isArray)) for (const it of lista) {
    const k = String(it.key ?? it.name ?? "").toLowerCase().match(/utm_(source|medium|campaign|content|term)$/);
    if (k && it.value && !utm[k[1]]) utm[k[1]] = String(it.value).trim();
  }
  for (const campo of ["landing_site", "landing_page", "referring_site", "url"]) {
    const u = obj?.[campo];
    if (typeof u === "string" && /utm_/.test(u)) { try { const q = new URL(u, "https://x.y").searchParams; for (const k of ["source", "medium", "campaign", "content", "term"]) if (q.get("utm_" + k) && !utm[k]) utm[k] = q.get("utm_" + k); } catch {} }
  }
  const sck = achar(obj, (k, v) => k === "sck" || ((k === "client_reference_id" || k === "external_reference" || k === "custom_id" || k === "tid" || k === "custom") && /^[A-Za-z]{1,3}_\d+_\d+_\d+$/.test(String(v))));
  const src = achar(obj, (k) => k === "src");
  const xcod = achar(obj, (k) => k === "xcod");
  return { utm, sck: sck ? String(sck) : "", src: src ? String(src) : "", xcod: xcod ? String(xcod) : "" };
}

export const PLATS_ANUNCIO = new Set(["meta", "google", "tiktok", "kwai"]);
const ultimoId = (v) => { const t = String(v || ""); const m = t.match(/\|\s*(\d+)\s*$/) || t.match(/^\s*(\d{5,})\s*$/); return m ? m[1] : ""; };
export function plataformaDaFonte(s) {
  const t = String(s || "").toLowerCase();
  if (/^(fb|facebook|ig|instagram|meta|an|msg|messenger)$|facebook|instagram|^fb/.test(t)) return "meta";
  if (/google|gads|adwords|youtube|^yt$|^g$/.test(t)) return "google";
  if (/tiktok|^tt$/.test(t)) return "tiktok";
  if (/kwai|^kw$|kuaishou/.test(t)) return "kwai";
  return t ? "outros" : "";
}

// Identifica campanha/conjunto/anúncio a partir das UTMs (formato "nome|id") ou do sck compacto.
export function idsDasUtms({ utm = {}, sck = "", src = "" }) {
  const r = { plataforma: "", campanha: "", conjunto: "", anuncio: "", origem: "" };
  const m = String(sck).match(/^([A-Za-z]{1,3})_(\d+)_(\d+)_(\d+)$/) || String(src).match(/^([A-Za-z]{1,3})_(\d+)_(\d+)_(\d+)$/);
  if (m) {
    r.plataforma = /^g/i.test(m[1]) ? "google" : /^t/i.test(m[1]) ? "tiktok" : /^k/i.test(m[1]) ? "kwai" : "meta";
    [r.campanha, r.conjunto, r.anuncio] = [m[2], m[3], m[4]];
    r.origem = m[1];
    return r;
  }
  r.origem = utm.source || src || sck || "";
  r.plataforma = plataformaDaFonte(utm.source || src || sck);
  // No Google (ValueTrack) e no Kwai as UTMs são só o número do ID: aceita qualquer tamanho
  const idG = (v) => (/^\s*\d+\s*$/.test(String(v || "")) ? String(v).trim() : ultimoId(v));
  const pega = r.plataforma === "google" || r.plataforma === "kwai" ? idG : ultimoId;
  r.campanha = pega(utm.campaign);
  r.conjunto = pega(utm.medium);
  r.anuncio = pega(utm.content);
  return r;
}


// Algumas plataformas mandam o status como número.
const STATUS_NUM = {
  eduzz: { 1: "pendente", 3: "aprovada", 4: "cancelada", 6: "aprovada", 7: "reembolsada", 9: "cancelada", 10: "cancelada", 11: "pendente", 15: "pendente" },
  perfectpay: { 1: "pendente", 2: "aprovada", 3: "pendente", 4: "chargeback", 5: "recusada", 6: "cancelada", 7: "reembolsada", 8: "pendente", 9: "chargeback", 10: "aprovada", 11: "recusada", 12: "pendente", 13: "cancelada", 16: "pendente" },
};
function statusNumerico(p, bruto) {
  if (bruto === undefined || bruto === null || !/^\d+$/.test(String(bruto))) return null;
  const mapa = STATUS_NUM[p];
  return mapa?.[Number(bruto)] ? { aprovada: "approved", pendente: "pending", cancelada: "canceled", reembolsada: "refunded", chargeback: "chargeback", recusada: "refused" }[mapa[Number(bruto)]] : null;
}
const centavos = (v) => (numero(v) === null ? null : numero(v) / 100);
function utmDeTexto(t) {
  const s = String(t || "");
  if (!/utm_/.test(s)) return {};
  try { const q = new URLSearchParams(s.replace(/^[^?]*\?/, "")); const u = {}; for (const k of ["source", "medium", "campaign", "content", "term"]) if (q.get("utm_" + k)) u["utm_" + k] = q.get("utm_" + k); return u; } catch { return {}; }
}

// Leitores dedicados das gateways mais usadas no Brasil, EUA e Europa.
// Devolve o objeto da venda, "ignorar" (evento que não é venda) ou null (não reconheceu).
function leitorGateway(p, o, cab = {}) {
  // ---- Stripe (EUA/Europa/Brasil) ----
  if (p === "stripe" || (o.object === "event" && o.type && o.data?.object)) {
    const ev = String(o.type), x = o.data?.object || {};
    const pi = typeof x.payment_intent === "string" ? x.payment_intent : x.payment_intent?.id;
    let status = null, valor = null;
    if (ev === "checkout.session.completed" || ev === "checkout.session.async_payment_succeeded") { status = ev.endsWith("succeeded") || x.payment_status === "paid" || x.payment_status === "no_payment_required" ? "aprovada" : "pendente"; valor = centavos(x.amount_total); }
    else if (ev === "checkout.session.async_payment_failed") { status = "recusada"; valor = centavos(x.amount_total); }
    else if (ev === "payment_intent.succeeded") { status = "aprovada"; valor = centavos(x.amount_received ?? x.amount); }
    else if (ev === "payment_intent.payment_failed") { status = "recusada"; valor = centavos(x.amount); }
    else if (ev === "invoice.paid" || ev === "invoice.payment_succeeded") { status = "aprovada"; valor = centavos(x.amount_paid); }
    else if (ev === "charge.refunded") { status = (x.amount_refunded || 0) >= (x.amount || 0) ? "reembolsada" : "aprovada"; valor = centavos(x.amount); }
    else if (/^charge\.dispute\./.test(ev)) { status = /closed/.test(ev) && x.status === "won" ? "aprovada" : "chargeback"; valor = centavos(x.amount); }
    else return "ignorar";
    const md = { ...(x.metadata || {}), ...utmDeTexto(x.metadata?.url || x.success_url) };
    return {
      checkout: "Stripe", transacao: pi || (ev.startsWith("invoice") ? x.id : x.id), statusBruto: ev, status,
      produto: md.produto || md.product || md.product_name || x.description || x.lines?.data?.[0]?.description || "Stripe",
      valor, liquido: valor, moeda: String(x.currency || "usd").toUpperCase(), metodo: metodoPadrao(x.payment_method_types?.[0] || "card"),
      email: x.customer_details?.email || x.receipt_email || x.customer_email || x.billing_details?.email, nome: x.customer_details?.name || x.billing_details?.name,
      criadaEm: dataISO(x.created || o.created), aprovadaEm: status === "aprovada" ? dataISO(o.created) : null, _extra: md, _sck: x.client_reference_id,
    };
  }
  // ---- PayPal ----
  if (p === "paypal" || (o.event_type && o.resource && o.resource_type)) {
    const ev = String(o.event_type), x = o.resource || {};
    const mapa = { "PAYMENT.CAPTURE.COMPLETED": "aprovada", "PAYMENT.CAPTURE.PENDING": "pendente", "PAYMENT.CAPTURE.DENIED": "recusada", "PAYMENT.CAPTURE.DECLINED": "recusada", "PAYMENT.CAPTURE.REFUNDED": "reembolsada", "PAYMENT.CAPTURE.REVERSED": "chargeback", "PAYMENT.SALE.COMPLETED": "aprovada", "PAYMENT.SALE.REFUNDED": "reembolsada", "PAYMENT.SALE.REVERSED": "chargeback", "CUSTOMER.DISPUTE.CREATED": "chargeback" };
    if (!mapa[ev]) return "ignorar";
    const captura = /REFUNDED|REVERSED/.test(ev) ? (x.links || []).find((l) => l.rel === "up")?.href?.split("/").pop() || x.sale_id || x.id : x.id;
    const valor = numero(x.amount?.value ?? x.amount?.total);
    return {
      checkout: "PayPal", transacao: ev === "CUSTOMER.DISPUTE.CREATED" ? x.disputed_transactions?.[0]?.seller_transaction_id || x.dispute_id : captura, statusBruto: ev, status: mapa[ev],
      produto: x.custom_id && !/utm_|^[A-Za-z]{1,3}_\d/.test(x.custom_id) ? x.custom_id : x.invoice_id || "PayPal",
      valor, liquido: numero(x.seller_receivable_breakdown?.net_amount?.value) ?? valor, moeda: x.amount?.currency_code || x.amount?.currency || "USD", metodo: "paypal",
      email: x.payer?.email_address, nome: x.payer?.name?.given_name, criadaEm: dataISO(x.create_time || o.create_time), aprovadaEm: mapa[ev] === "aprovada" ? dataISO(x.update_time || o.create_time) : null,
      _extra: utmDeTexto(x.custom_id), _sck: x.custom_id,
    };
  }
  // ---- Shopify ----
  if (p === "shopify" || (o.order_number !== undefined && o.line_items && o.financial_status !== undefined)) {
    const mapa = { paid: "aprovada", partially_refunded: "aprovada", authorized: "pendente", pending: "pendente", partially_paid: "pendente", refunded: "reembolsada", voided: "cancelada" };
    const itens = o.line_items || [];
    return {
      checkout: "Shopify", transacao: o.id || o.order_number, statusBruto: o.financial_status, status: mapa[o.financial_status] || statusPadrao(o.financial_status),
      produto: itens[0]?.title ? itens[0].title + (itens.length > 1 ? ` +${itens.length - 1}` : "") : "Pedido Shopify",
      valor: numero(o.current_total_price ?? o.total_price), liquido: numero(o.current_total_price ?? o.total_price), moeda: o.currency || o.presentment_currency || "USD",
      metodo: metodoPadrao((o.payment_gateway_names || [])[0] || o.gateway), email: o.email || o.customer?.email, nome: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" "),
      criadaEm: dataISO(o.created_at), aprovadaEm: o.financial_status === "paid" ? dataISO(o.processed_at || o.updated_at) : null,
    };
  }
  // ---- WooCommerce ----
  if (p === "woocommerce" || (o.order_key && Array.isArray(o.line_items) && o.status)) {
    const mapa = { processing: "aprovada", completed: "aprovada", "on-hold": "pendente", pending: "pendente", refunded: "reembolsada", cancelled: "cancelada", failed: "recusada" };
    return {
      checkout: "WooCommerce", transacao: o.id || o.number, statusBruto: o.status, status: mapa[o.status] || statusPadrao(o.status),
      produto: o.line_items[0]?.name ? o.line_items[0].name + (o.line_items.length > 1 ? ` +${o.line_items.length - 1}` : "") : "Pedido WooCommerce",
      valor: numero(o.total), liquido: numero(o.total), moeda: o.currency || "USD", metodo: metodoPadrao(o.payment_method_title || o.payment_method),
      email: o.billing?.email, nome: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" "), criadaEm: dataISO(o.date_created_gmt ? o.date_created_gmt + "Z" : o.date_created), aprovadaEm: dataISO(o.date_paid_gmt ? o.date_paid_gmt + "Z" : o.date_paid),
    };
  }
  // ---- Mercado Pago (o pagamento já vem buscado pela API: veja central.mjs) ----
  if (p === "mercadopago" || (o.transaction_amount !== undefined && o.status && o.payment_method_id !== undefined)) {
    if (o.transaction_amount === undefined) return "ignorar"; // aviso sem detalhes (falta o token do Mercado Pago)
    const mapa = { approved: "aprovada", authorized: "pendente", pending: "pendente", in_process: "pendente", in_mediation: "chargeback", rejected: "recusada", cancelled: "cancelada", refunded: "reembolsada", charged_back: "chargeback" };
    return {
      checkout: "Mercado Pago", transacao: o.id, statusBruto: o.status, status: mapa[o.status] || statusPadrao(o.status),
      produto: o.description || o.additional_info?.items?.[0]?.title || "Mercado Pago",
      valor: numero(o.transaction_amount), liquido: numero(o.transaction_details?.net_received_amount) ?? numero(o.transaction_amount), moeda: o.currency_id || "BRL",
      metodo: metodoPadrao(o.payment_type_id === "bank_transfer" ? "pix" : o.payment_type_id === "ticket" ? "boleto" : o.payment_type_id), parcelas: numero(o.installments),
      email: o.payer?.email, nome: [o.payer?.first_name, o.payer?.last_name].filter(Boolean).join(" "), criadaEm: dataISO(o.date_created), aprovadaEm: dataISO(o.date_approved),
      _extra: { ...(o.metadata || {}) }, _sck: o.external_reference,
    };
  }
  // ---- ClickBank (INS já descriptografado em central.mjs) ----
  if (p === "clickbank" || (o.transactionType && o.receipt)) {
    const t = String(o.transactionType || "").toUpperCase();
    const mapa = { SALE: "aprovada", BILL: "aprovada", RFND: "reembolsada", CGBK: "chargeback", INSF: "recusada", "CANCEL-REBILL": "cancelada", "UNCANCEL-REBILL": "aprovada", TEST_SALE: "aprovada", TEST_BILL: "aprovada", TEST_RFND: "reembolsada", TEST: "aprovada" };
    const vv = o.vendorVariables || {};
    return {
      checkout: "ClickBank", transacao: o.receipt, statusBruto: t, status: mapa[t] || statusPadrao(t),
      produto: o.lineItems?.[0]?.productTitle || "ClickBank", valor: numero(o.totalOrderAmount), liquido: numero(o.totalAccountAmount) ?? numero(o.totalOrderAmount), moeda: o.currency || "USD",
      metodo: metodoPadrao(o.paymentMethod === "PYPL" ? "paypal" : "card"), email: o.customer?.billing?.email || o.customer?.shipping?.email, nome: o.customer?.billing?.fullName || o.customer?.billing?.firstName,
      criadaEm: dataISO(o.transactionTime), aprovadaEm: mapa[t] === "aprovada" ? dataISO(o.transactionTime) : null, _extra: vv, _sck: (o.trackingCodes || [])[0], _teste: /^TEST/.test(t),
    };
  }
  // ---- Digistore24 (Europa) ----
  if (p === "digistore24" || (o.event && /^on_/.test(String(o.event)) && (o.order_id || o.transaction_id))) {
    const mapa = { on_payment: "aprovada", on_refund: "reembolsada", on_chargeback: "chargeback", on_payment_missed: "recusada", on_rebill_cancelled: "cancelada", on_rebill_resumed: "aprovada", connection_test: null };
    if (!(o.event in mapa) || mapa[o.event] === null) return "ignorar";
    return {
      checkout: "Digistore24", transacao: o.order_id || o.transaction_id, statusBruto: o.event, status: mapa[o.event],
      produto: o.product_name || "Digistore24", valor: numero(o.amount_brutto ?? o.amount ?? o.transaction_amount), liquido: numero(o.amount_netto ?? o.earned_amount ?? o.amount), moeda: o.currency || "EUR",
      metodo: metodoPadrao(o.pay_method), email: o.email || o.buyer_email, nome: [o.address_first_name, o.address_last_name].filter(Boolean).join(" "),
      criadaEm: dataISO(o.order_date_time || o.order_date), aprovadaEm: mapa[o.event] === "aprovada" ? dataISO(o.transaction_date || o.order_date_time) : null, _sck: o.custom || o.trackingkey, _teste: o.transaction_type === "test" || o.test_mode === "1",
    };
  }
  // ---- Paddle (Europa) ----
  if (p === "paddle" || (o.event_type && /^(transaction|subscription|adjustment)\./.test(String(o.event_type)) && o.data)) {
    const ev = String(o.event_type), x = o.data || {};
    const mapa = { "transaction.completed": "aprovada", "transaction.paid": "aprovada", "transaction.payment_failed": "recusada", "transaction.canceled": "cancelada", "adjustment.created": x.action === "chargeback" ? "chargeback" : x.action === "refund" ? "reembolsada" : null };
    if (!mapa[ev]) return "ignorar";
    const tot = x.details?.totals || x.totals || {};
    return {
      checkout: "Paddle", transacao: ev.startsWith("adjustment") ? x.transaction_id : x.id, statusBruto: ev, status: mapa[ev],
      produto: x.items?.[0]?.price?.description || x.items?.[0]?.product?.name || "Paddle", valor: centavos(tot.total ?? tot.grand_total), liquido: centavos(tot.earnings ?? tot.total), moeda: x.currency_code || "EUR",
      metodo: metodoPadrao(x.payments?.[0]?.method_details?.type || "card"), email: x.customer?.email, criadaEm: dataISO(x.created_at), aprovadaEm: mapa[ev] === "aprovada" ? dataISO(x.billed_at || x.updated_at) : null, _extra: x.custom_data || {},
    };
  }
  // ---- Lemon Squeezy ----
  if (p === "lemonsqueezy" || (o.meta?.event_name && o.data?.attributes)) {
    const ev = String(o.meta.event_name), a = o.data.attributes || {};
    if (!/^order_/.test(ev)) return "ignorar";
    const st = ev === "order_refunded" || a.status === "refunded" ? "reembolsada" : a.status === "paid" ? "aprovada" : statusPadrao(a.status);
    return {
      checkout: "Lemon Squeezy", transacao: o.data.id, statusBruto: a.status || ev, status: st, produto: a.first_order_item?.product_name || "Lemon Squeezy",
      valor: centavos(a.total), liquido: centavos(a.total - (a.tax || 0)), moeda: a.currency || "USD", metodo: "cartao", email: a.user_email, nome: a.user_name,
      criadaEm: dataISO(a.created_at), aprovadaEm: st === "aprovada" ? dataISO(a.updated_at || a.created_at) : null, _extra: o.meta.custom_data || {}, _teste: !!a.test_mode,
    };
  }
  // ---- Gumroad ----
  if (p === "gumroad" || (o.sale_id && o.product_name && o.seller_id)) {
    const st = String(o.refunded) === "true" ? "reembolsada" : String(o.disputed) === "true" ? "chargeback" : "aprovada";
    return {
      checkout: "Gumroad", transacao: o.sale_id, statusBruto: st, status: st, produto: o.product_name, valor: centavos(o.price), liquido: centavos(o.price), moeda: String(o.currency || "usd").toUpperCase(),
      metodo: "cartao", email: o.email, nome: o.full_name, criadaEm: dataISO(o.sale_timestamp), aprovadaEm: st === "aprovada" ? dataISO(o.sale_timestamp) : null, _extra: o.url_params || {}, _teste: String(o.test) === "true",
    };
  }
  return null;
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
  } else if ((v = leitorGateway(p, o, cabecalhos))) {
    if (v === "ignorar") return null;
  } else {
    // Leitor genérico: Eduzz, Monetizze, Braip, PerfectPay, Ticto, Cakto, Greenn, Yampi, Shopify…
    const temCent = (k) => /cent/.test(k);
    let valor = null;
    const vk = achar(o, (k, val) => /^(total_price|total_amount|amount_total|sale_amount|valor_total|total|amount|price|valor|value|sale_value|valor_venda|full_price|charge_amount|trans_value|trans_total_value|valor_bruto|amount_brutto|order_total|grand_total)$/.test(k) && numero(val) !== null && !/commission|comiss|fee|taxa|discount|desconto|shipping|frete/.test(k));
    if (vk !== undefined) valor = numero(vk);
    const ck = achar(o, (k, val) => temCent(k) && /(amount|price|total|valor)/.test(k) && numero(val) !== null);
    if (valor === null && ck !== undefined) valor = numero(ck) / 100;
    const liq = achar(o, (k, val) => /^(net_amount|valor_liquido|liquido|producer_commission|comissao_produtor|my_commission|net_value|amount_net|amount_netto|valor_recebido|net_received_amount)$/.test(k) && numero(val) !== null);
    let statusBruto = achar(o, (k) => /^(sale_status_enum|status|order_status|sale_status|payment_status|financial_status|trans_status|status_name|event|evento|type)$/.test(k));
    statusBruto = statusNumerico(p, statusBruto) ?? statusBruto;
    v = {
      checkout: p.charAt(0).toUpperCase() + p.slice(1),
      transacao: achar(o, (k) => /^(transaction|transaction_id|transacao|order_id|orderid|sale_id|venda_id|trans_cod|trans_key|codigo|code|chave_unica|receipt|id)$/.test(k)),
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
  const rastreio = lerUtm(v._extra && Object.keys(v._extra).length ? { ...o, _gw: v._extra } : o);
  if (!rastreio.sck && v._sck && /^[A-Za-z]{1,3}_\d+_\d+_\d+$/.test(String(v._sck))) rastreio.sck = String(v._sck);
  if (!Object.keys(rastreio.utm).length && v._sck) { const u = utmDeTexto(v._sck); for (const k of Object.keys(u)) rastreio.utm[k.slice(4)] = u[k]; }
  const ids = idsDasUtms(rastreio);
  const teste = !!v._teste || o.livemode === false || !!achar(o, (k, val) => /^(test|is_test|istest|teste|sandbox|test_mode)$/.test(k) && (val === true || val === "true" || val === 1 || val === "1"));
  delete v._extra; delete v._sck; delete v._teste;
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
  if (PLATS_ANUNCIO.has(plat) && ids.anuncio) {
    let chave = `${plat}:${ids.anuncio}`;
    if (!nomes[chave] && plat === "google") chave = Object.keys(nomes).find((k) => k.startsWith("google:") && k.endsWith("~" + ids.anuncio)) || chave;
    const n = nomes[chave];
    return { plataforma: plat, anuncioKey: chave, anuncioId: chave.split(":")[1], conjuntoId: n?.conjuntoId || ids.conjunto, campanhaId: n?.campanhaId || ids.campanha, nome: n?.anuncio };
  }
  if (PLATS_ANUNCIO.has(plat) && (ids.conjunto || ids.campanha)) return { plataforma: plat, anuncioKey: null, conjuntoId: ids.conjunto, campanhaId: ids.campanha };
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

// ---------- moedas ----------
// Quanto vale 1 unidade de cada moeda em reais (o usuário ajusta em Integrações → Custos e moeda).
export const COTACOES_PADRAO = { BRL: 1, USD: 5.4, EUR: 5.9, GBP: 6.9 };
export function conversor(cfg = {}) {
  const base = cfg.moeda || "BRL";
  const tab = { ...COTACOES_PADRAO, ...(cfg.cotacoes || {}) };
  return (valor, moeda) => {
    const m = String(moeda || base).toUpperCase();
    if (m === base || valor === null || valor === undefined) return valor;
    const de = Number(tab[m]), para = Number(tab[base]);
    return de > 0 && para > 0 ? (Number(valor) * de) / para : valor;
  };
}

// ---------- relatório ----------
const vazio = () => ({ gasto: 0, impressoes: 0, cliques: 0, vendas: 0, bruto: 0, liquido: 0, pendentes: 0, valorPendente: 0, reembolsos: 0, valorReembolsos: 0, chargebacks: 0, valorChargebacks: 0 });
export function fechar(m, cfg = {}) {
  const impostos = m.liquido * ((Number(cfg.impostoPct) || 0) / 100);
  const custos = m.vendas * (Number(cfg.custoPorVenda) || 0) + m.liquido * ((Number(cfg.taxaExtraPct) || 0) / 100) + (m.chargebacks || 0) * (Number(cfg.custoChargeback) || 0);
  const devolvidas = (m.reembolsos || 0) + (m.chargebacks || 0);
  const lucro = m.liquido - m.gasto - impostos - custos;
  return {
    ...m, impostos, custos, lucro,
    roi: m.gasto > 0 ? (lucro / m.gasto) * 100 : null,
    roas: m.gasto > 0 ? m.liquido / m.gasto : null,
    cpa: m.vendas > 0 ? m.gasto / m.vendas : null,
    ticket: m.vendas > 0 ? m.bruto / m.vendas : null,
    margem: m.liquido > 0 ? (lucro / m.liquido) * 100 : null,
    ctr: m.impressoes > 0 ? (m.cliques / m.impressoes) * 100 : null,
    taxaReembolso: m.vendas + devolvidas > 0 ? (devolvidas / (m.vendas + devolvidas)) * 100 : null,
  };
}

export function relatorio({ vendas = [], gastos = { dias: {}, nomes: {} }, de, ate, fuso = "America/Sao_Paulo", cfg = {}, filtros = {}, entidades = [] }) {
  const fxAdsBase = conversor(cfg), moedaAds = cfg.moedaAnuncios || cfg.moeda || "BRL";
  const fxAds = (n) => fxAdsBase(n, moedaAds);
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) { dias.push(d); if (dias.length > 400) break; }
  const nomes = gastos.nomes || {};
  const fx = conversor(cfg);
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
      somaEm(alvos, "gasto", +fxAds(+g.gasto || 0) || 0); somaEm(alvos, "impressoes", +g.impressoes || 0); somaEm(alvos, "cliques", +g.cliques || 0);
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
    const valor = +fx(v.valor, v.moeda) || 0, liquido = +fx(v.liquido, v.moeda) || 0;
    if (v.status === "aprovada") {
      somaEm(alvosBase, "vendas", 1); somaEm(alvosBase, "bruto", valor); somaEm(alvosBase, "liquido", liquido);
      met.vendas++;
    } else if (v.status === "pendente") {
      somaEm(alvosBase, "pendentes", 1); somaEm(alvosBase, "valorPendente", valor);
    } else if (v.status === "reembolsada") {
      somaEm(alvosBase, "reembolsos", 1); somaEm(alvosBase, "valorReembolsos", liquido);
    } else if (v.status === "chargeback") {
      somaEm(alvosBase, "chargebacks", 1); somaEm(alvosBase, "valorChargebacks", liquido);
    }
    ultimas.push({ id: v.id, quando: v.aprovadaEm || v.criadaEm, produto: v.produto, valor, liquido, moedaOriginal: v.moeda, status: v.status, metodo: v.metodo, checkout: v.checkout, campanha: c.nome, anuncio: a?.nome || "", plataforma: at.plataforma, teste: v.teste });
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
// Também conta reembolsos e chargebacks dos últimos 30 dias (campo "reembolso").
export function vendasPorAnuncio(vendas, nomes, { fuso = "America/Sao_Paulo", agora = new Date(), cfg = {} } = {}) {
  const hoje = hojeNoFuso(fuso, agora);
  const fx = conversor({ ...cfg, moeda: cfg.moedaAnuncios || cfg.moeda });
  const janelas = { hoje: [hoje, hoje], d3: [somarDias(hoje, -3), somarDias(hoje, -1)], d7: [somarDias(hoje, -7), somarDias(hoje, -1)] };
  const ini30 = somarDias(hoje, -30);
  const out = {};
  for (const v of vendas) {
    if (v.teste || !["aprovada", "reembolsada", "chargeback"].includes(v.status)) continue;
    const at = atribuir(v, nomes);
    if (!at.anuncioKey) continue;
    const d = dataNoFuso(v.aprovadaEm || v.criadaEm, fuso);
    if (d >= ini30 && d <= hoje) {
      const r = ((out[at.anuncioKey] ||= {}).reembolso ||= { vendas: 0, reembolsos: 0, chargebacks: 0 });
      if (v.status === "aprovada") r.vendas++; else if (v.status === "reembolsada") r.reembolsos++; else r.chargebacks++;
    }
    if (v.status !== "aprovada") continue;
    for (const [j, [a, b]] of Object.entries(janelas)) {
      if (d >= a && d <= b) {
        const m = ((out[at.anuncioKey] ||= {})[j] ||= { conversoes: 0, receita: 0 });
        m.conversoes += 1;
        m.receita += +fx(v.liquido, v.moeda) || +fx(v.valor, v.moeda) || 0;
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
