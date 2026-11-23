// Central do Debian Analytics: recebe/sincroniza vendas, puxa gastos dos anúncios e monta o relatório.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Confere a assinatura da Cakto (HMAC-SHA256 de "timestamp.corpo") ou o campo secret do corpo.
function caktoValido(segredo, corpo, cab, segredoCorpo) {
  const assin = String(cab["x-cakto-signature"] || "").replace(/^v1=/, "");
  const ts = cab["x-cakto-timestamp"];
  const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  if (assin && ts) return igual(crypto.createHmac("sha256", segredo).update(`${ts}.${corpo}`).digest("hex"), assin);
  return !!segredoCorpo && igual(segredoCorpo, segredo);
}
import * as agente from "../trafego/agente.mjs";
import { normalizarEvento, aplicarVenda, relatorio, hojeNoFuso, somarDias, lerVendasArquivo, lerGastosArquivo, dataNoFuso, atribuir } from "./vendas.mjs";
import { codigoWorker, PLATAFORMAS_CHECKOUT, scriptPagina, UTM_GOOGLE } from "./worker.mjs";
import { UTM_META } from "../trafego/meta.mjs";

let RAIZ = process.cwd();
let FETCH = fetch;
export function configurar({ raiz, fetchFn } = {}) { if (raiz) RAIZ = raiz; if (fetchFn) FETCH = fetchFn; }

const arq = (n) => path.join(RAIZ, "trafego-dados", n);
async function gravar(nome, v) { await fs.mkdir(path.join(RAIZ, "trafego-dados"), { recursive: true }); const tmp = arq(nome) + ".tmp"; await fs.writeFile(tmp, JSON.stringify(v)); await fs.rename(tmp, arq(nome)); }
async function ler(nome, padrao) { try { return JSON.parse(await fs.readFile(arq(nome), "utf8")); } catch { return padrao; } }

const PADRAO = { fuso: "America/Sao_Paulo", impostoPct: 0, taxaExtraPct: 0, custoPorVenda: 0, hottok: "", segredoCakto: "", workerUrl: "", ultimoEvento: 0 };

export async function config() {
  const c = await agente.carregarConfig();
  const a = { ...PADRAO, ...(c.analytics || {}) };
  if (!a.segredo || !a.token) {
    a.segredo = a.segredo || crypto.randomBytes(12).toString("hex");
    a.token = a.token || crypto.randomBytes(18).toString("hex");
    await agente.salvarConfig({ analytics: { segredo: a.segredo, token: a.token } });
  }
  return a;
}

export async function salvar(parcial = {}) {
  const permitido = {};
  for (const k of ["fuso", "impostoPct", "taxaExtraPct", "custoPorVenda", "hottok", "segredoCakto", "workerUrl"]) if (parcial[k] !== undefined) permitido[k] = k === "workerUrl" ? String(parcial[k]).trim().replace(/\/+$/, "") : parcial[k];
  if (parcial.novosSegredos) { permitido.segredo = crypto.randomBytes(12).toString("hex"); permitido.token = crypto.randomBytes(18).toString("hex"); permitido.ultimoEvento = 0; }
  await agente.salvarConfig({ analytics: permitido });
  return painelIntegracoes();
}

export async function painelIntegracoes() {
  const a = await config();
  const base = a.workerUrl || "https://SEU-WORKER.workers.dev";
  const vendas = await lerVendasArquivo(RAIZ);
  const log = await ler("eventos-log.json", []);
  return {
    ...a,
    codigoWorker: codigoWorker({ segredo: a.segredo, token: a.token }),
    webhooks: PLATAFORMAS_CHECKOUT.map(([id, nome, onde]) => ({ id, nome, onde, url: `${base}/w/${a.segredo}/${id}` })),
    utmMeta: UTM_META, utmGoogle: UTM_GOOGLE, script: scriptPagina(),
    totalVendas: vendas.filter((v) => !v.teste).length,
    vendasTeste: vendas.filter((v) => v.teste).length,
    ultimaVenda: vendas.filter((v) => !v.teste).map((v) => v.recebidaEm).sort().pop() || null,
    ultimosEventos: log.slice(0, 15),
    status: { worker: !!a.workerUrl, ultimaSync: a.ultimaSync || null, ultimaSyncGastos: a.ultimaSyncGastos || null, erroSync: a.erroSync || null, erroGastos: a.erroGastos || null },
  };
}

// ---------- vendas ----------
let filaVendas = Promise.resolve();
export function processarEventos(eventos) {
  const job = filaVendas.then(async () => {
    const a = await config();
    const vendas = await lerVendasArquivo(RAIZ);
    const log = await ler("eventos-log.json", []);
    let novas = 0, atualizadas = 0, ignorados = 0;
    for (const ev of eventos) {
      let cab = {};
      try { cab = typeof ev.cabecalhos === "string" ? JSON.parse(ev.cabecalhos || "{}") : ev.cabecalhos || {}; } catch {}
      let v = null, motivo = "";
      try { v = normalizarEvento({ plataforma: ev.plataforma, corpo: ev.corpo, tipo: ev.tipo, query: ev.query, cabecalhos: cab, recebido: ev.recebido }); }
      catch (e) { motivo = e.message; }
      if (v && v.checkout === "Hotmart" && a.hottok && v.hottok && v.hottok !== a.hottok) { v = null; motivo = "hottok não confere"; }
      if (v && v.checkout === "Cakto" && a.segredoCakto && !caktoValido(a.segredoCakto, String(ev.corpo || ""), cab, v.segredoCakto)) { v = null; motivo = "assinatura da Cakto não confere"; }
      if (v) { delete v.hottok; delete v.segredoCakto; const r = aplicarVenda(vendas, v); r === "nova" ? novas++ : atualizadas++; }
      else ignorados++;
      log.unshift({ em: ev.recebido, plataforma: ev.plataforma, resultado: v ? `${v.status} · ${v.produto} · R$ ${(v.valor ?? 0).toFixed(2)}${v.ids?.anuncio ? " · anúncio " + v.ids.anuncio : v.ids?.origem ? " · " + v.ids.origem : " · sem UTM"}` : `ignorado${motivo ? ": " + motivo : " (não parece uma venda)"}` });
    }
    await gravar("vendas.json", vendas);
    await gravar("eventos-log.json", log.slice(0, 100));
    return { novas, atualizadas, ignorados };
  });
  filaVendas = job.catch(() => {});
  return job;
}

export async function sincronizarVendas() {
  const a = await config();
  if (!a.workerUrl) return { ok: false, motivo: "receptor não configurado" };
  let total = { novas: 0, atualizadas: 0, ignorados: 0 }, cursor = Number(a.ultimoEvento) || 0;
  try {
    for (let rodada = 0; rodada < 20; rodada++) {
      const r = await FETCH(`${a.workerUrl}/sync?desde=${cursor}`, { headers: { Authorization: `Bearer ${a.token}` } });
      if (r.status === 401) throw new Error("O receptor recusou o token. Cole de novo o código do Worker gerado aqui.");
      if (!r.ok) throw new Error(`Receptor respondeu ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const j = await r.json();
      const evs = j.eventos || [];
      if (!evs.length) break;
      const res = await processarEventos(evs);
      for (const k in total) total[k] += res[k];
      cursor = Math.max(cursor, ...evs.map((e) => Number(e.id) || 0));
      await agente.salvarConfig({ analytics: { ultimoEvento: cursor } });
      if (evs.length < 500) break;
    }
    if (cursor) FETCH(`${a.workerUrl}/sync/limpar?ate=${cursor}`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` } }).catch(() => {});
    await agente.salvarConfig({ analytics: { ultimaSync: new Date().toISOString(), erroSync: null } });
    return { ok: true, ...total };
  } catch (e) {
    await agente.salvarConfig({ analytics: { erroSync: e.message } });
    throw e;
  }
}

export async function testarReceptor(url) {
  const a = await config();
  const base = String(url || a.workerUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("Cole o endereço do Worker (começa com https://).");
  const r1 = await FETCH(`${base}/w/${a.segredo}/teste`);
  const t1 = await r1.text();
  if (!/ativo/.test(t1)) throw new Error(/D1|DB/.test(t1) ? t1 : "O Worker não respondeu como esperado. Confira se colou o código gerado aqui e clicou em Deploy.");
  const r2 = await FETCH(`${base}/sync?desde=999999999`, { headers: { Authorization: `Bearer ${a.token}` } });
  if (!r2.ok) throw new Error(r2.status === 401 ? "Token diferente: cole de novo o código do Worker gerado aqui." : `Erro ${r2.status} ao ler o banco. Confira o banco D1 com o nome DB.`);
  await agente.salvarConfig({ analytics: { workerUrl: base } });
  return { ok: true };
}

export async function simularVenda() {
  const g = await lerGastosArquivo(RAIZ);
  const chaves = Object.keys(g.nomes || {});
  const k = chaves[Math.floor(Math.random() * chaves.length)];
  const n = k ? g.nomes[k] : null;
  const plat = k ? k.split(":")[0] : "meta";
  const adId = k ? k.split(":")[1].split("~").pop() : "120000000000001";
  const valor = [47, 97, 147, 197][Math.floor(Math.random() * 4)];
  const corpo = {
    order_id: "TESTE-" + Date.now(), order_status: "paid", payment_method: ["pix", "credit_card", "boleto"][Math.floor(Math.random() * 3)], is_test: true,
    Product: { product_id: "p1", product_name: "Produto de teste" }, Customer: { email: "teste@debian.dev", full_name: "Cliente Teste" },
    Commissions: { charge_amount: valor * 100, my_commission: Math.round(valor * 0.9 * 100) },
    TrackingParameters: plat === "google"
      ? { utm_source: "google", utm_campaign: n?.campanhaId || "1", utm_medium: n?.conjuntoId || "1", utm_content: adId }
      : { utm_source: "FB", utm_campaign: `${n?.campanha || "Campanha"}|${n?.campanhaId || "1"}`, utm_medium: `${n?.conjunto || "Conjunto"}|${n?.conjuntoId || "1"}`, utm_content: `${n?.anuncio || "Anúncio"}|${adId}` },
    created_at: new Date().toISOString(), approved_date: new Date().toISOString(),
  };
  return processarEventos([{ plataforma: "kiwify", corpo: JSON.stringify(corpo), tipo: "application/json", recebido: new Date().toISOString() }]);
}

export async function apagarTestes() {
  await filaVendas;
  const vendas = (await lerVendasArquivo(RAIZ)).filter((v) => !v.teste);
  await gravar("vendas.json", vendas);
  return { ok: true };
}

// ---------- gastos ----------
export async function sincronizarGastos({ dias } = {}) {
  const c = await agente.carregarConfig();
  const a = await config();
  const cli = agente.clientes(c);
  const g = await lerGastosArquivo(RAIZ);
  g.dias ||= {}; g.nomes ||= {};
  const hoje = hojeNoFuso(a.fuso);
  const n = dias || (g.primeiraSync ? 3 : 30);
  const desde = somarDias(hoje, -(n - 1));
  const erros = [];
  const lotes = [];
  if (cli.meta && c.meta.contaId) { try { lotes.push(["meta", await cli.meta.gastosDiarios(c.meta.contaId, desde, hoje)]); } catch (e) { erros.push("Meta: " + e.message); } }
  if (cli.google) { try { lotes.push(["google", await cli.google.gastosDiarios(desde, hoje)]); } catch (e) { erros.push("Google: " + e.message); } }
  for (const [plat, linhas] of lotes) {
    // limpa o período dessa plataforma antes de regravar (valores do dia mudam ao longo do dia)
    for (let d = desde; d <= hoje; d = somarDias(d, 1)) if (g.dias[d]) for (const k of Object.keys(g.dias[d])) if (k.startsWith(plat + ":")) delete g.dias[d][k];
    for (const l of linhas) {
      if (!l.dia) continue;
      (g.dias[l.dia] ||= {})[l.chave] = { gasto: +l.gasto.toFixed(2), impressoes: l.impressoes, cliques: l.cliques };
      g.nomes[l.chave] = { ...(g.nomes[l.chave] || {}), ...Object.fromEntries(Object.entries(l.nomes).filter(([, v]) => v)) };
    }
  }
  // guarda no máximo ~13 meses
  const limite = somarDias(hoje, -400);
  for (const d of Object.keys(g.dias)) if (d < limite) delete g.dias[d];
  if (lotes.length) g.primeiraSync = true;
  await gravar("gastos.json", g);
  await agente.salvarConfig({ analytics: { ultimaSyncGastos: new Date().toISOString(), erroGastos: erros.join(" · ") || null } });
  if (!lotes.length && erros.length) throw new Error(erros.join(" · "));
  return { ok: true, dias: n, erros };
}

// ---------- lista de vendas (página Vendas da UTMFy) ----------
export async function listarVendas({ periodo: per = "30d", de, ate, status, produto, checkout, q, pagina = 1, testes } = {}) {
  const a = await config();
  const [d1, d2] = periodo(per, de, ate, a.fuso);
  const [vendas, gastos] = await Promise.all([lerVendasArquivo(RAIZ), lerGastosArquivo(RAIZ)]);
  const busca = String(q || "").trim().toLowerCase();
  const lista = vendas.filter((v) => {
    if (v.teste && testes !== "1") return false;
    const d = dataNoFuso(v.aprovadaEm || v.criadaEm, a.fuso);
    if (!d || d < d1 || d > d2) return false;
    if (status && v.status !== status) return false;
    if (produto && v.produto !== produto) return false;
    if (checkout && v.checkout !== checkout) return false;
    if (busca && ![v.email, v.nome, v.transacao, v.produto, v.utm?.campaign, v.utm?.content].join(" ").toLowerCase().includes(busca)) return false;
    return true;
  }).sort((x, y) => String(y.aprovadaEm || y.criadaEm).localeCompare(String(x.aprovadaEm || x.criadaEm)));
  const porPagina = 50, total = lista.length, pag = Math.max(1, Number(pagina) || 1);
  const nomes = gastos.nomes || {};
  const itens = lista.slice((pag - 1) * porPagina, pag * porPagina).map((v) => {
    const at = atribuir(v, nomes);
    const n = at.anuncioKey ? nomes[at.anuncioKey] || {} : {};
    return {
      id: v.id, transacao: v.transacao, checkout: v.checkout, status: v.status, produto: v.produto, valor: v.valor, liquido: v.liquido,
      metodo: v.metodo, parcelas: v.parcelas, nome: v.nome, email: v.email, quando: v.aprovadaEm || v.criadaEm, teste: v.teste,
      plataforma: at.plataforma, campanha: n.campanha || v.utm?.campaign || "", conjunto: n.conjunto || v.utm?.medium || "", anuncio: n.anuncio || v.utm?.content || "",
      origem: at.anuncioKey ? "" : (v.ids?.origem || (Object.keys(v.utm || {}).length ? "UTM sem identificação" : "sem UTM")), utm: v.utm || {}, historico: v.historico || [],
    };
  });
  const soma = (st) => lista.filter((v) => v.status === st).reduce((t, v) => t + (+v.liquido || 0), 0);
  return { de: d1, ate: d2, total, pagina: pag, paginas: Math.max(1, Math.ceil(total / porPagina)), itens, resumo: { aprovadas: soma("aprovada"), pendentes: lista.filter((v) => v.status === "pendente").length, reembolsadas: soma("reembolsada") } };
}

// ---------- relatório ----------
export function periodo(nome, de, ate, fuso) {
  const hoje = hojeNoFuso(fuso);
  const mes = hoje.slice(0, 8) + "01";
  switch (nome) {
    case "hoje": return [hoje, hoje];
    case "ontem": return [somarDias(hoje, -1), somarDias(hoje, -1)];
    case "7d": return [somarDias(hoje, -6), hoje];
    case "30d": return [somarDias(hoje, -29), hoje];
    case "mes": return [mes, hoje];
    case "mespassado": { const fim = somarDias(mes, -1); return [fim.slice(0, 8) + "01", fim]; }
    default: return [/^\d{4}-\d{2}-\d{2}$/.test(de || "") ? de : hoje, /^\d{4}-\d{2}-\d{2}$/.test(ate || "") ? ate : hoje];
  }
}

export async function gerarRelatorio({ periodo: per = "hoje", de, ate, plataforma, produto, checkout, incluirTestes } = {}) {
  const a = await config();
  const [d1, d2] = periodo(per, de, ate, a.fuso);
  const [vendas, gastos, est] = await Promise.all([lerVendasArquivo(RAIZ), lerGastosArquivo(RAIZ), agente.estado()]);
  const r = relatorio({ vendas, gastos, de: d1 <= d2 ? d1 : d2, ate: d1 <= d2 ? d2 : d1, fuso: a.fuso, cfg: a, filtros: { plataforma, produto, checkout, incluirTestes: !!incluirTestes }, entidades: est.entidades || [] });
  r.opcoes = {
    produtos: [...new Set(vendas.map((v) => v.produto))].sort(),
    checkouts: [...new Set(vendas.map((v) => v.checkout))].sort(),
    temTestes: vendas.some((v) => v.teste),
  };
  r.status = { worker: !!a.workerUrl, ultimaSync: a.ultimaSync, ultimaSyncGastos: a.ultimaSyncGastos, erroSync: a.erroSync, erroGastos: a.erroGastos, contasConectadas: !!(est.entidades || []).length || !!(await agente.configMascarada()).status.meta };
  return r;
}
