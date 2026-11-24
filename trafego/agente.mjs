// Agente de tráfego: junta Meta, Google, TikTok e Kwai, roda as regras, aplica ou sugere ações e guarda tudo em trafego-dados/.
import fs from "node:fs/promises";
import path from "node:path";
import { criarMeta } from "./meta.mjs";
import { criarGoogle } from "./google.mjs";
import { criarTiktok } from "./tiktok.mjs";
import { criarKwai } from "./kwai.mjs";
import { PLATAFORMAS, NOME_PLAT } from "./plataformas.mjs";
import { avaliar, agregar, agregarReembolso, resumo, diagnostico, mesclarRegras } from "./regras.mjs";
import { cicloCriativos } from "./ciclo.mjs";
import { vendasPorAnuncio, lerVendasArquivo, lerGastosArquivo } from "../analytics/vendas.mjs";
import * as avisos from "../notificacoes/telegram.mjs";

let RAIZ = process.cwd();
let FETCH = fetch;
export function configurar({ raiz, fetchFn } = {}) { if (raiz) RAIZ = raiz; if (fetchFn) FETCH = fetchFn; }

const arqConfig = () => path.join(RAIZ, "trafego.local.json");
const arqEstado = () => path.join(RAIZ, "trafego-dados", "estado.json");
export const pastaCriativos = () => path.join(RAIZ, "trafego-dados", "criativos");

async function ler(arq, padrao) { try { return JSON.parse(await fs.readFile(arq, "utf8")); } catch { return padrao; } }
async function gravar(arq, v) { await fs.mkdir(path.dirname(arq), { recursive: true }); await fs.writeFile(arq, JSON.stringify(v, null, 1)); }

const SEGREDOS = { meta: ["token"], google: ["developerToken", "clientSecret", "refreshToken"], tiktok: ["token"], kwai: ["clientSecret", "refreshToken"], claude: ["apiKey"], telegram: ["token"] };
const GRUPOS = ["meta", "google", "tiktok", "kwai", "claude", "analytics", "telegram"];
const mascara = (v) => (v ? "••••" + String(v).slice(-4) : "");

export async function carregarConfig() {
  const c = await ler(arqConfig(), {});
  for (const g of GRUPOS) c[g] ||= {};
  c.regras = mesclarRegras(c.regras);
  return c;
}

export async function configMascarada() {
  const c = await carregarConfig();
  const out = JSON.parse(JSON.stringify(c));
  for (const [g, campos] of Object.entries(SEGREDOS)) for (const k of campos) out[g][k] = mascara(c[g][k]);
  out.status = { ...statusContas(c), claude: !!c.claude.apiKey, telegram: !!(c.telegram.token && c.telegram.chatId) };
  return out;
}

export function statusContas(c) {
  return {
    meta: !!(c.meta?.token && c.meta?.contaId),
    google: !!(c.google?.developerToken && c.google?.refreshToken && c.google?.customerId && c.google?.clientId),
    tiktok: !!(c.tiktok?.token && c.tiktok?.anuncianteId),
    kwai: !!(c.kwai?.clientId && c.kwai?.clientSecret && c.kwai?.refreshToken && c.kwai?.contaId),
  };
}
export const algumaConta = (c) => Object.values(statusContas(c)).some(Boolean);

export async function salvarConfig(parcial = {}) {
  const c = await carregarConfig();
  for (const g of GRUPOS) {
    if (!parcial[g]) continue;
    for (const [k, v] of Object.entries(parcial[g])) {
      if (typeof v === "string" && v.startsWith("••••")) continue; // valor mascarado: mantém o atual
      c[g][k] = typeof v === "string" ? v.trim() : v;
    }
  }
  if (parcial.regras) c.regras = mesclarRegras({ ...c.regras, ...parcial.regras });
  await gravar(arqConfig(), c);
  return configMascarada();
}

export function clientes(c) {
  const out = {};
  if (c.meta.token) out.meta = criarMeta({ token: c.meta.token, versao: c.meta.versao || "v25.0", fetchFn: FETCH });
  if (c.google.developerToken && c.google.refreshToken && c.google.customerId) out.google = criarGoogle({ ...c.google, versao: c.google.versao || "v26", fetchFn: FETCH });
  if (c.tiktok?.token && c.tiktok?.anuncianteId) out.tiktok = criarTiktok({ token: c.tiktok.token, anuncianteId: c.tiktok.anuncianteId, fetchFn: FETCH });
  if (c.kwai?.clientId && c.kwai?.clientSecret && c.kwai?.refreshToken && c.kwai?.contaId) out.kwai = criarKwai({ ...c.kwai, fetchFn: FETCH, aoNovoRefresh: (rt) => salvarConfig({ kwai: { refreshToken: rt } }) });
  return out;
}

export async function estado() {
  return ler(arqEstado(), { atualizadoEm: null, entidades: [], resumo: {}, diagnostico: [], alertas: [], pendentes: [], historico: [], erros: {} });
}

let ocupado = false;
export const estaOcupado = () => ocupado;

export async function ciclo({ agora = new Date() } = {}) {
  if (ocupado) throw new Error("O agente já está rodando. Espere terminar.");
  ocupado = true;
  try {
    const c = await carregarConfig();
    const cli = clientes(c);
    const est = await estado();
    est.erros = {};
    let entidades = [];
    for (const plat of PLATAFORMAS) {
      if (!cli[plat] || (plat === "meta" && !c.meta.contaId)) continue;
      try { entidades.push(...(plat === "meta" ? await cli.meta.entidades(c.meta.contaId, c.meta.evento || "PURCHASE") : await cli[plat].entidades())); }
      catch (e) { est.erros[plat] = e.message; }
    }
    if (!PLATAFORMAS.some((p) => cli[p])) est.erros.geral = "Nenhuma conta de anúncios conectada. Vá em Gerenciador de anúncios → Contas de anúncio.";
    const regras = c.regras;
    regras.moeda = c.analytics.moedaAnuncios || c.analytics.moeda || "BRL";
    // Vendas reais: troca as conversões do pixel pelas vendas atribuídas via UTM (Debian Analytics)
    const [vendas, gastos] = await Promise.all([lerVendasArquivo(RAIZ), lerGastosArquivo(RAIZ)]);
    const porAnuncio = vendasPorAnuncio(vendas, gastos.nomes || {}, { fuso: c.analytics.fuso || "America/Sao_Paulo", agora, cfg: c.analytics });
    // reembolsos e chargebacks por anúncio (últimos 30 dias), em qualquer modo
    for (const e of entidades) if (e.nivel === "anuncio") e.reembolso = porAnuncio[`${e.plataforma}:${e.id}`]?.reembolso || null;
    agregarReembolso(entidades);
    if (regras.fonteConversoes === "vendas") {
      for (const e of entidades) {
        if (e.nivel !== "anuncio") continue;
        const v = porAnuncio[`${e.plataforma}:${e.id}`] || {};
        for (const j of ["hoje", "d3", "d7"]) if (e.metricas?.[j]) { e.metricas[j].conversoes = v[j]?.conversoes || 0; e.metricas[j].receita = v[j]?.receita || 0; }
      }
      regras.roi = { ...regras.roi, descontarPct: (Number(c.analytics.impostoPct) || 0) + (Number(c.analytics.taxaExtraPct) || 0) };
      est.fonte = "vendas";
    } else est.fonte = "plataforma";
    agregar(entidades);
    const gerenciadas = new Set(regras.campanhasGerenciadas || []);
    for (const e of entidades) e.gerenciada = gerenciadas.has(`${e.plataforma}:${e.campanhaId || e.id}`);

    const acoes = regras.modo === "desligado" ? [] : avaliar(entidades, regras, agora, est.historico || []);
    const alertas = acoes.filter((a) => a.tipo === "alerta");
    const executaveis = acoes.filter((a) => a.tipo !== "alerta");
    const pendentes = [];
    const executadas = [];
    est.entidades = entidades; // ações automáticas já refletem na foto nova
    for (const a of executaveis) {
      if (regras.modo === "automatico" && a.automatizavel) {
        executadas.push({ ...a, ...(await executar(a, "automatico", { cli, est })) });
      } else {
        pendentes.push(a);
      }
    }
    // ciclo de criativos (usa as ofertas do Clonador)
    let ofertas = [];
    try { ofertas = (JSON.parse(await fs.readFile(path.join(RAIZ, "data", "ofertas.json"), "utf8")).ofertas || []); } catch {}
    est.ciclo = cicloCriativos(entidades, ofertas, regras, est.ciclo || [], agora);
    const pausadosAgora = new Set((est.historico || []).filter((h) => h.ok && h.tipo === "pausar" && Date.parse(h.em) >= agora.getTime() - 1000).map((h) => h.plataforma + ":" + h.alvoId));
    Object.assign(est, {
      atualizadoEm: agora.toISOString(),
      modo: regras.modo,
      entidades,
      resumo: { hoje: resumo(entidades, "hoje"), janela: resumo(entidades, "janela"), d7: resumo(entidades, "d7") },
      diagnostico: entidades.length ? diagnostico(entidades, acoes, regras) : [],
      diagnosticoEn: entidades.length ? diagnostico(entidades, acoes, regras, "en") : [],
      alertas: alertas.filter((a) => !pausadosAgora.has(a.plataforma + ":" + a.alvoId)),
      pendentes,
    });
    // avisos no Telegram: só o que é novo desde o último aviso
    const avisados = new Set(est.avisados || []);
    const novo = (k) => { if (avisados.has(k)) return false; avisados.add(k); return true; };
    const novasPend = pendentes.filter((a) => novo("p:" + a.id));
    const alertasNovos = est.alertas.filter((a) => (a.reembolso || a.gravidade === "alta") && !a.cansado && novo("a:" + a.id));
    const cicloNovos = est.ciclo.filter((i) => !i.feito && !i.resolvido && novo("c:" + i.id + ":" + i.desde.slice(0, 10)));
    est.avisados = [...avisados].slice(-600);
    await gravar(arqEstado(), est);
    if (c.telegram?.ativo) {
      await avisos.avisar(c, executadas.length ? "piloto" : "sugestoes", avisos.msgPiloto(c, executadas, novasPend));
      await avisos.avisar(c, "piloto", avisos.msgAlertas(c, alertasNovos));
      await avisos.avisar(c, "criativos", avisos.msgCriativos(c, cicloNovos));
    }
    return est;
  } finally {
    ocupado = false;
  }
}

async function aplicar(acao, cli) {
  const p = cli[acao.plataforma];
  if (!p) throw new Error(`Conta ${NOME_PLAT[acao.plataforma] || acao.plataforma} não conectada.`);
  const alvoStatus = acao.plataforma === "google" ? acao.recurso : acao.alvoId;
  const alvoOrc = acao.plataforma === "meta" ? acao.alvoId : acao.recursoOrcamento;
  if (acao.tipo === "pausar") return p.mudarStatus(alvoStatus, false, acao.nivel);
  if (acao.tipo === "ativar") return p.mudarStatus(alvoStatus, true, acao.nivel);
  if (["escalar", "reduzir", "orcamento"].includes(acao.tipo)) {
    if (!alvoOrc) throw new Error("Esse item não tem orçamento editável.");
    return p.mudarOrcamento(alvoOrc, acao.para);
  }
  throw new Error("Ação desconhecida: " + acao.tipo);
}

export async function executar(acao, origem, ctx = {}) {
  const c = ctx.cli ? null : await carregarConfig();
  const cli = ctx.cli || clientes(c);
  const est = ctx.est || (await estado());
  const reg = { alvoId: acao.alvoId, tipo: acao.tipo, plataforma: acao.plataforma, nome: acao.nome, nivel: acao.nivel, de: acao.de ?? null, para: acao.para ?? null, motivo: acao.motivo || "", motivoEn: acao.motivoEn || acao.motivo || "", origem, em: new Date().toISOString(), ok: true };
  try { await aplicar(acao, cli); }
  catch (e) { reg.ok = false; reg.erro = e.message; }
  est.historico = [reg, ...(est.historico || [])].slice(0, 400);
  // reflete na foto atual para o painel não mostrar status velho
  const e = reg.ok && (est.entidades || []).find((x) => x.plataforma === acao.plataforma && x.id === acao.alvoId);
  if (e) {
    if (acao.tipo === "pausar") e.status = "pausado";
    if (acao.tipo === "ativar") e.status = "ativo";
    if (["escalar", "reduzir", "orcamento"].includes(acao.tipo) && e.orcamento) e.orcamento.valor = Number(acao.para);
  }
  if (!ctx.est) await gravar(arqEstado(), est);
  return reg;
}

export async function decidir(id, decisao) {
  const est = await estado();
  const a = (est.pendentes || []).find((x) => x.id === id);
  if (!a) throw new Error("Sugestão não encontrada (talvez já tenha sido decidida).");
  est.pendentes = est.pendentes.filter((x) => x.id !== id);
  let reg = null;
  if (decisao === "aprovar") {
    const cli = clientes(await carregarConfig());
    reg = await executar(a, "aprovada", { cli, est });
  } else {
    est.historico = [{ alvoId: a.alvoId, tipo: a.tipo, plataforma: a.plataforma, nome: a.nome, motivo: a.motivo, origem: "ignorada", em: new Date().toISOString(), ok: true, ignorada: true }, ...(est.historico || [])].slice(0, 400);
  }
  await gravar(arqEstado(), est);
  return reg || { ok: true, ignorada: true };
}

export async function acaoManual(dados) {
  const acao = {
    plataforma: dados.plataforma, tipo: dados.tipo, nivel: dados.nivel, alvoId: dados.id, nome: dados.nome || dados.id,
    recurso: dados.recurso || null, recursoOrcamento: dados.recursoOrcamento || null, de: dados.de ?? null, para: dados.valor ?? null, motivo: "ação manual no painel", motivoEn: "manual action in the app",
  };
  return executar(acao, "manual");
}

export async function gerenciar(chaveCampanha, sim) {
  const c = await carregarConfig();
  const s = new Set(c.regras.campanhasGerenciadas || []);
  if (sim) s.add(chaveCampanha); else s.delete(chaveCampanha);
  return salvarConfig({ regras: { campanhasGerenciadas: [...s] } });
}

// Ciclo de criativos: marca um item como resolvido ("já subi criativo novo").
export async function marcarCiclo(id, feito = true) {
  const est = await estado();
  const i = (est.ciclo || []).find((x) => x.id === id);
  if (!i) throw new Error("Item não encontrado.");
  i.feito = !!feito;
  await gravar(arqEstado(), est);
  return est.ciclo;
}
