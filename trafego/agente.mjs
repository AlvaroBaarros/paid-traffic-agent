// Agente de tráfego: junta Meta + Google, roda as regras, aplica ou sugere ações e guarda tudo em trafego-dados/.
import fs from "node:fs/promises";
import path from "node:path";
import { criarMeta } from "./meta.mjs";
import { criarGoogle } from "./google.mjs";
import { avaliar, agregar, resumo, diagnostico, mesclarRegras } from "./regras.mjs";
import { vendasPorAnuncio, lerVendasArquivo, lerGastosArquivo } from "../analytics/vendas.mjs";

let RAIZ = process.cwd();
let FETCH = fetch;
export function configurar({ raiz, fetchFn } = {}) { if (raiz) RAIZ = raiz; if (fetchFn) FETCH = fetchFn; }

const arqConfig = () => path.join(RAIZ, "trafego.local.json");
const arqEstado = () => path.join(RAIZ, "trafego-dados", "estado.json");
export const pastaCriativos = () => path.join(RAIZ, "trafego-dados", "criativos");

async function ler(arq, padrao) { try { return JSON.parse(await fs.readFile(arq, "utf8")); } catch { return padrao; } }
async function gravar(arq, v) { await fs.mkdir(path.dirname(arq), { recursive: true }); await fs.writeFile(arq, JSON.stringify(v, null, 1)); }

const SEGREDOS = { meta: ["token"], google: ["developerToken", "clientSecret", "refreshToken"], claude: ["apiKey"] };
const GRUPOS = ["meta", "google", "claude", "analytics"];
const mascara = (v) => (v ? "••••" + String(v).slice(-4) : "");

export async function carregarConfig() {
  const c = await ler(arqConfig(), {});
  c.meta ||= {}; c.google ||= {}; c.claude ||= {}; c.analytics ||= {};
  c.regras = mesclarRegras(c.regras);
  return c;
}

export async function configMascarada() {
  const c = await carregarConfig();
  const out = JSON.parse(JSON.stringify(c));
  for (const [g, campos] of Object.entries(SEGREDOS)) for (const k of campos) out[g][k] = mascara(c[g][k]);
  out.status = {
    meta: !!(c.meta.token && c.meta.contaId),
    google: !!(c.google.developerToken && c.google.refreshToken && c.google.customerId && c.google.clientId),
    claude: !!c.claude.apiKey,
  };
  return out;
}

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
    if (cli.meta && c.meta.contaId) {
      try { entidades.push(...(await cli.meta.entidades(c.meta.contaId, c.meta.evento || "PURCHASE"))); }
      catch (e) { est.erros.meta = e.message; }
    }
    if (cli.google) {
      try { entidades.push(...(await cli.google.entidades())); }
      catch (e) { est.erros.google = e.message; }
    }
    if (!cli.meta && !cli.google) est.erros.geral = "Nenhuma conta de anúncios conectada. Vá em Tráfego → Conexões.";
    const regras = c.regras;
    // Vendas reais: troca as conversões do pixel pelas vendas atribuídas via UTM (Debian Analytics)
    if (regras.fonteConversoes === "vendas") {
      const [vendas, gastos] = await Promise.all([lerVendasArquivo(RAIZ), lerGastosArquivo(RAIZ)]);
      const porAnuncio = vendasPorAnuncio(vendas, gastos.nomes || {}, { fuso: c.analytics.fuso || "America/Sao_Paulo", agora });
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
    est.entidades = entidades; // ações automáticas já refletem na foto nova
    for (const a of executaveis) {
      if (regras.modo === "automatico" && a.automatizavel) {
        await executar(a, "automatico", { cli, est });
      } else {
        pendentes.push(a);
      }
    }
    const pausadosAgora = new Set((est.historico || []).filter((h) => h.ok && h.tipo === "pausar" && Date.parse(h.em) >= agora.getTime() - 1000).map((h) => h.plataforma + ":" + h.alvoId));
    Object.assign(est, {
      atualizadoEm: agora.toISOString(),
      modo: regras.modo,
      entidades,
      resumo: { hoje: resumo(entidades, "hoje"), janela: resumo(entidades, "janela"), d7: resumo(entidades, "d7") },
      diagnostico: entidades.length ? diagnostico(entidades, acoes, regras) : [],
      alertas: alertas.filter((a) => !pausadosAgora.has(a.plataforma + ":" + a.alvoId)),
      pendentes,
    });
    await gravar(arqEstado(), est);
    return est;
  } finally {
    ocupado = false;
  }
}

async function aplicar(acao, cli) {
  const p = cli[acao.plataforma];
  if (!p) throw new Error(`Conta ${acao.plataforma} não conectada.`);
  const alvoStatus = acao.plataforma === "google" ? acao.recurso : acao.alvoId;
  const alvoOrc = acao.plataforma === "google" ? acao.recursoOrcamento : acao.alvoId;
  if (acao.tipo === "pausar") return p.mudarStatus(alvoStatus, false);
  if (acao.tipo === "ativar") return p.mudarStatus(alvoStatus, true);
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
  const reg = { alvoId: acao.alvoId, tipo: acao.tipo, plataforma: acao.plataforma, nome: acao.nome, nivel: acao.nivel, de: acao.de ?? null, para: acao.para ?? null, motivo: acao.motivo || "", origem, em: new Date().toISOString(), ok: true };
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
    recurso: dados.recurso || null, recursoOrcamento: dados.recursoOrcamento || null, de: dados.de ?? null, para: dados.valor ?? null, motivo: "ação manual no painel",
  };
  return executar(acao, "manual");
}

export async function gerenciar(chaveCampanha, sim) {
  const c = await carregarConfig();
  const s = new Set(c.regras.campanhasGerenciadas || []);
  if (sim) s.add(chaveCampanha); else s.delete(chaveCampanha);
  return salvarConfig({ regras: { campanhasGerenciadas: [...s] } });
}
