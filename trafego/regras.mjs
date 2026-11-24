// Motor de regras do agente de tráfego. Funções puras (sem rede), para poderem ser testadas.
// Todo motivo sai em português (motivo) e inglês (motivoEn).
import { formatarMoeda } from "./plataformas.mjs";
import { cansaco } from "./ciclo.mjs";
//
// Modelo de entidade (igual para Meta, Google, TikTok e Kwai):
// { plataforma, nivel: "campanha"|"conjunto"|"anuncio", id, nome, status: "ativo"|"pausado"|"outro",
//   paiId, campanhaId, orcamento: { valor (R$/dia), editavel, recurso? } | null,
//   metricas: { hoje, d3, d7 }  // cada uma: { gasto, impressoes, cliques, conversoes, receita, frequencia }
//   gerenciada: boolean }

export const REGRAS_PADRAO = {
  modo: "sugerir", // "desligado" | "sugerir" | "automatico"
  cpaAlvo: 50,
  roasAlvo: null,
  orcamentoMinimo: 10,
  tetoOrcamentoDiario: 500,
  campanhasGerenciadas: [], // ids (prefixados com a plataforma: "meta:123")
  pausar: { ativo: true, gastoSemVendaMult: 1.5, cpaMult: 1.6, ctrMin: 0.6, impressoesMinCtr: 3000 },
  escalar: { ativo: true, cpaMult: 0.85, minConversoes: 3, aumentoPct: 20, intervaloHoras: 24 },
  reduzir: { ativo: true, cpaMult: 1.3, reducaoPct: 20, intervaloHoras: 24 },
  alertas: { frequenciaMax: 3 },
  intervaloCicloHoras: 3,
  fonteConversoes: "plataforma", // "plataforma" (pixel) | "vendas" (vendas reais do Debian Analytics)
  roi: { minEscalar: 30, maxPausar: -30, descontarPct: 0 },
  reembolso: { ativo: true, taxaMax: 15, minVendas: 4, bloquearEscala: true },
  ciclo: { quedaCtrPct: 30, impressoesMin: 2000 },
  moeda: "BRL",
};

export function mesclarRegras(cfg = {}) {
  const r = structuredClone(REGRAS_PADRAO);
  for (const [k, v] of Object.entries(cfg || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && r[k] && typeof r[k] === "object" && !Array.isArray(r[k])) Object.assign(r[k], v);
    else if (v !== undefined) r[k] = v;
  }
  return r;
}

const VAZIA = { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 };

export function somar(...lista) {
  const t = { ...VAZIA };
  for (const m of lista) {
    if (!m) continue;
    t.gasto += +m.gasto || 0;
    t.impressoes += +m.impressoes || 0;
    t.cliques += +m.cliques || 0;
    t.conversoes += +m.conversoes || 0;
    t.receita += +m.receita || 0;
    t.frequencia = Math.max(t.frequencia, +m.frequencia || 0);
  }
  return t;
}

export function derivar(m) {
  const x = somar(m);
  return {
    ...x,
    ctr: x.impressoes ? (x.cliques / x.impressoes) * 100 : null,
    cpc: x.cliques ? x.gasto / x.cliques : null,
    cpm: x.impressoes ? (x.gasto / x.impressoes) * 1000 : null,
    cpa: x.conversoes ? x.gasto / x.conversoes : null,
    roas: x.gasto && x.receita ? x.receita / x.gasto : null,
  };
}

// Janela de decisão: últimos 3 dias completos + hoje.
export const janela = (e) => derivar(somar(e.metricas?.hoje, e.metricas?.d3));

// Monta campanha/conjunto a partir dos anúncios (soma as métricas de baixo para cima).
export function agregar(entidades) {
  const filhos = (pai) => entidades.filter((e) => e.plataforma === pai.plataforma && e.paiId === pai.id);
  const calcular = (e) => {
    if (e.nivel === "anuncio") return e.metricas;
    const fs = filhos(e);
    if (!fs.length) return e.metricas || { hoje: { ...VAZIA }, d3: { ...VAZIA }, d7: { ...VAZIA } };
    const ms = fs.map(calcular);
    e.metricas = { hoje: somar(...ms.map((m) => m.hoje)), d3: somar(...ms.map((m) => m.d3)), d7: somar(...ms.map((m) => m.d7)) };
    return e.metricas;
  };
  for (const e of entidades) if (e.nivel === "campanha") calcular(e);
  for (const e of entidades) if (e.nivel === "conjunto") calcular(e);
  return entidades;
}

const r2 = (n) => Math.round(n * 100) / 100;
let MOEDA = "BRL";
const brl = (n) => formatarMoeda(n, MOEDA);
const pct = (n) => (n === null || n === undefined ? "–" : n.toFixed(2).replace(".", ",") + "%");
const pctEn = (n) => (n === null || n === undefined ? "–" : n.toFixed(2) + "%");
const M = (pt, en) => ({ pt, en });

// Reembolsos por item: soma os anúncios filhos (e.reembolso = { vendas, reembolsos, chargebacks }).
export function taxaReembolso(r) {
  if (!r) return null;
  const tot = (r.vendas || 0) + (r.reembolsos || 0) + (r.chargebacks || 0);
  return tot ? (((r.reembolsos || 0) + (r.chargebacks || 0)) / tot) * 100 : null;
}
export function agregarReembolso(entidades) {
  const soma = (a, b) => ({ vendas: (a?.vendas || 0) + (b?.vendas || 0), reembolsos: (a?.reembolsos || 0) + (b?.reembolsos || 0), chargebacks: (a?.chargebacks || 0) + (b?.chargebacks || 0) });
  const porId = new Map(entidades.map((e) => [e.plataforma + ":" + e.id, e]));
  for (const e of entidades) if (e.nivel !== "anuncio") e.reembolso = null;
  for (const e of entidades) {
    if (e.nivel !== "anuncio" || !e.reembolso) continue;
    for (const paiId of [e.paiId, e.campanhaId]) {
      const pai = porId.get(e.plataforma + ":" + paiId);
      if (pai && pai !== e) pai.reembolso = soma(pai.reembolso, e.reembolso);
    }
  }
  return entidades;
}

function horasDesde(historico, alvoId, tipos, agora) {
  const ult = historico.filter((h) => h.alvoId === alvoId && tipos.includes(h.tipo)).map((h) => Date.parse(h.em)).filter(Boolean).sort((a, b) => b - a)[0];
  return ult ? (agora.getTime() - ult) / 36e5 : Infinity;
}

export function avaliar(entidades, cfgBruta, agora = new Date(), historico = []) {
  const cfg = mesclarRegras(cfgBruta);
  MOEDA = cfg.moeda || "BRL";
  const acoes = [];
  const dia = agora.toISOString().slice(0, 10);
  const gerenciadas = new Set(cfg.campanhasGerenciadas || []);
  const ehGerenciada = (e) => gerenciadas.has(`${e.plataforma}:${e.campanhaId || e.id}`);
  const nova = (e, tipo, motivo, extra = {}) => ({
    id: `${dia}:${e.plataforma}:${tipo}:${e.id}`,
    plataforma: e.plataforma, tipo, nivel: e.nivel, alvoId: e.id, nome: e.nome, campanhaId: e.campanhaId || e.id,
    recurso: e.recurso || null, recursoOrcamento: e.orcamento?.recurso || null,
    motivo: motivo.pt ?? motivo, motivoEn: motivo.en ?? motivo, gerenciada: ehGerenciada(e), automatizavel: tipo !== "alerta" && ehGerenciada(e), criadaEm: agora.toISOString(), ...extra,
  });
  const cpaAlvo = Number(cfg.cpaAlvo) || 0;
  const modoRoi = cfg.fonteConversoes === "vendas";
  const roiDe = (j) => (j.gasto > 0 ? ((j.receita * (1 - (Number(cfg.roi.descontarPct) || 0) / 100) - j.gasto) / j.gasto) * 100 : null);
  const fmtRoi = (r) => (r === null ? "–" : `${r > 0 ? "+" : ""}${Math.round(r)}%`);

  // 1) Anúncios ruins → pausar (mantendo ao menos 1 ativo por conjunto)
  const ativosPorConjunto = new Map();
  for (const e of entidades) if (e.nivel === "anuncio" && e.status === "ativo") ativosPorConjunto.set(e.plataforma + ":" + e.paiId, (ativosPorConjunto.get(e.plataforma + ":" + e.paiId) || 0) + 1);

  if (cfg.pausar.ativo && cpaAlvo > 0) {
    const candidatos = [];
    for (const e of entidades) {
      if (e.nivel !== "anuncio" || e.status !== "ativo") continue;
      const j = janela(e);
      let motivo = null;
      const lim = cfg.pausar.gastoSemVendaMult;
      if (j.conversoes === 0 && j.gasto >= cpaAlvo * lim) motivo = M(`gastou ${brl(j.gasto)} sem nenhuma conversão (limite: ${lim}× o CPA alvo)`, `spent ${brl(j.gasto)} with no conversions (limit: ${lim}× the target CPA)`);
      else if (modoRoi && j.conversoes > 0 && roiDe(j) !== null && roiDe(j) <= cfg.roi.maxPausar && j.gasto >= cpaAlvo * 2) motivo = M(`vendas reais com ROI de ${fmtRoi(roiDe(j))} (${j.conversoes} venda(s), ${brl(j.receita)} de faturamento para ${brl(j.gasto)} de gasto)`, `real sales at ${fmtRoi(roiDe(j))} ROI (${j.conversoes} sale(s), ${brl(j.receita)} revenue for ${brl(j.gasto)} spent)`);
      else if (!modoRoi && j.conversoes > 0 && j.cpa > cpaAlvo * cfg.pausar.cpaMult && j.gasto >= cpaAlvo * 2) motivo = M(`CPA de ${brl(j.cpa)}, ${Math.round((j.cpa / cpaAlvo - 1) * 100)}% acima do alvo de ${brl(cpaAlvo)}`, `CPA of ${brl(j.cpa)}, ${Math.round((j.cpa / cpaAlvo - 1) * 100)}% above the ${brl(cpaAlvo)} target`);
      else if (j.conversoes === 0 && j.impressoes >= cfg.pausar.impressoesMinCtr && j.ctr !== null && j.ctr < cfg.pausar.ctrMin) motivo = M(`CTR de ${pct(j.ctr)} com ${j.impressoes} impressões e nenhuma conversão (mínimo: ${pct(cfg.pausar.ctrMin)})`, `CTR of ${pctEn(j.ctr)} after ${j.impressoes} impressions and no conversions (minimum: ${pctEn(cfg.pausar.ctrMin)})`);
      if (motivo) candidatos.push({ e, j, motivo });
    }
    candidatos.sort((a, b) => b.j.gasto - a.j.gasto);
    for (const { e, j, motivo } of candidatos) {
      const k = e.plataforma + ":" + e.paiId;
      const ativos = ativosPorConjunto.get(k) || 0;
      if (ativos <= 1) {
        acoes.push(nova(e, "alerta", M(`${motivo.pt}. É o último anúncio ativo do conjunto: avalie pausar o conjunto ou subir criativos novos.`, `${motivo.en}. It is the last active ad in the ad set: consider pausing the ad set or launching new creatives.`), { gravidade: "alta", janela: j }));
        continue;
      }
      ativosPorConjunto.set(k, ativos - 1);
      acoes.push(nova(e, "pausar", motivo, { de: "ativo", para: "pausado", janela: j }));
    }
  }

  // 2) Quem tem orçamento → escalar ou reduzir
  for (const e of entidades) {
    if (e.nivel === "anuncio" || e.status !== "ativo" || !e.orcamento || !e.orcamento.editavel) continue;
    const j = janela(e);
    const atual = Number(e.orcamento.valor) || 0;
    if (!atual) continue;
    const roi = roiDe(j);
    const bomParaEscalar = modoRoi
      ? j.conversoes >= cfg.escalar.minConversoes && roi !== null && roi >= cfg.roi.minEscalar
      : cpaAlvo > 0 && j.conversoes >= cfg.escalar.minConversoes && j.cpa !== null && j.cpa <= cpaAlvo * cfg.escalar.cpaMult && (!cfg.roasAlvo || (j.roas !== null && j.roas >= cfg.roasAlvo));
    const tr = taxaReembolso(e.reembolso);
    const reembolsoAlto = cfg.reembolso?.ativo && cfg.reembolso.bloquearEscala && tr !== null && tr > cfg.reembolso.taxaMax && ((e.reembolso.vendas || 0) + (e.reembolso.reembolsos || 0) + (e.reembolso.chargebacks || 0)) >= cfg.reembolso.minVendas;
    if (cfg.escalar.ativo && bomParaEscalar && reembolsoAlto) {
      acoes.push(nova(e, "alerta", M(`está com ROI para escalar, mas ${Math.round(tr)}% das vendas viraram reembolso ou chargeback (limite ${cfg.reembolso.taxaMax}%). Não escalei: confira a oferta e a página antes.`, `has the ROI to scale, but ${Math.round(tr)}% of sales turned into refunds or chargebacks (limit ${cfg.reembolso.taxaMax}%). Not scaling: check the offer and the page first.`), { gravidade: "alta", janela: j }));
      continue;
    }
    if (cfg.escalar.ativo && bomParaEscalar) {
      const h = horasDesde(historico, e.id, ["escalar", "reduzir"], agora);
      const para = r2(Math.min(atual * (1 + cfg.escalar.aumentoPct / 100), Number(cfg.tetoOrcamentoDiario) || Infinity));
      if (h < cfg.escalar.intervaloHoras) continue;
      if (para <= atual + 0.5) {
        if (atual >= cfg.tetoOrcamentoDiario) acoes.push(nova(e, "alerta", M(`está vendendo bem (CPA ${brl(j.cpa)}, ${j.conversoes} conversões), mas já bateu o teto de ${brl(cfg.tetoOrcamentoDiario)}/dia. Suba o teto se quiser escalar mais.`, `is selling well (CPA ${brl(j.cpa)}, ${j.conversoes} conversions) but already hit the ${brl(cfg.tetoOrcamentoDiario)}/day ceiling. Raise the ceiling to scale further.`), { gravidade: "info", janela: j }));
        continue;
      }
      acoes.push(nova(e, "escalar", modoRoi ? M(`vendas reais: ROI de ${fmtRoi(roi)} com ${j.conversoes} venda(s) (${brl(j.receita)} faturados para ${brl(j.gasto)} gastos)`, `real sales: ${fmtRoi(roi)} ROI with ${j.conversoes} sale(s) (${brl(j.receita)} revenue for ${brl(j.gasto)} spent)`) : M(`CPA de ${brl(j.cpa)} (alvo ${brl(cpaAlvo)}) com ${j.conversoes} conversões${j.roas ? `, ROAS ${j.roas.toFixed(2)}` : ""}`, `CPA of ${brl(j.cpa)} (target ${brl(cpaAlvo)}) with ${j.conversoes} conversions${j.roas ? `, ROAS ${j.roas.toFixed(2)}` : ""}`), { de: atual, para, janela: j, roi }));
      continue;
    }
    const caro = modoRoi ? j.conversoes >= 1 && roi !== null && roi < 0 : cpaAlvo > 0 && j.conversoes >= 1 && j.cpa > cpaAlvo * cfg.reduzir.cpaMult;
    if (cfg.reduzir.ativo && caro) {
      const h = horasDesde(historico, e.id, ["escalar", "reduzir"], agora);
      const para = r2(Math.max(atual * (1 - cfg.reduzir.reducaoPct / 100), Number(cfg.orcamentoMinimo) || 0));
      if (h >= cfg.reduzir.intervaloHoras && para < atual - 0.5) acoes.push(nova(e, "reduzir", modoRoi ? M(`vendas reais no prejuízo: ROI de ${fmtRoi(roi)}`, `real sales at a loss: ${fmtRoi(roi)} ROI`) : M(`CPA de ${brl(j.cpa)}, acima do alvo de ${brl(cpaAlvo)}`, `CPA of ${brl(j.cpa)}, above the ${brl(cpaAlvo)} target`), { de: atual, para, janela: j, roi }));
      continue;
    }
    if (j.conversoes === 0 && cpaAlvo > 0 && j.gasto >= cpaAlvo * cfg.pausar.gastoSemVendaMult * 2) {
      acoes.push(nova(e, "alerta", M(`gastou ${brl(j.gasto)} sem conversões nos últimos dias. Considere pausar ou trocar a oferta/criativos.`, `spent ${brl(j.gasto)} with no conversions in the last days. Consider pausing it or changing the offer/creatives.`), { gravidade: "alta", janela: j }));
    }
  }

  // 3) Criativo cansado (frequência alta ou CTR caindo)
  for (const e of entidades) {
    const c = cansaco(e, cfg);
    if (c) acoes.push(nova(e, "alerta", M(`${c.pt}. Hora de criativos novos: veja os ganchos sugeridos em Ciclo de criativos.`, `${c.en}. Time for new creatives: see the suggested hooks in Creative refresh.`), { gravidade: "media", cansado: true }));
  }

  // 4) Reembolso alto por anúncio
  if (cfg.reembolso?.ativo) {
    for (const e of entidades) {
      if (e.nivel !== "anuncio" || !e.reembolso) continue;
      const r = e.reembolso, tot = (r.vendas || 0) + (r.reembolsos || 0) + (r.chargebacks || 0), tx = taxaReembolso(r);
      if (tot >= cfg.reembolso.minVendas && tx !== null && tx > cfg.reembolso.taxaMax) {
        acoes.push(nova(e, "alerta", M(`${Math.round(tx)}% das vendas dos últimos 30 dias viraram reembolso ou chargeback (${r.reembolsos || 0} reembolso(s), ${r.chargebacks || 0} chargeback(s) em ${tot} vendas). O anúncio pode estar prometendo algo que a oferta não entrega.`, `${Math.round(tx)}% of the last 30 days' sales turned into refunds or chargebacks (${r.reembolsos || 0} refund(s), ${r.chargebacks || 0} chargeback(s) out of ${tot} sales). The ad may be promising something the offer does not deliver.`), { gravidade: "alta", reembolso: true, taxa: tx }));
      }
    }
  }
  return acoes;
}

export function resumo(entidades, periodo = "d7") {
  const anuncios = entidades.filter((e) => e.nivel === "anuncio");
  const pegar = (e) => (periodo === "janela" ? somar(e.metricas?.hoje, e.metricas?.d3) : e.metricas?.[periodo]);
  const porPlat = {};
  for (const e of anuncios) (porPlat[e.plataforma] ||= []).push(pegar(e));
  const out = { total: derivar(somar(...anuncios.map(pegar))) };
  for (const [p, ms] of Object.entries(porPlat)) out[p] = derivar(somar(...ms));
  return out;
}

export function diagnostico(entidades, acoes, cfgBruta, idioma = "pt") {
  const cfg = mesclarRegras(cfgBruta);
  MOEDA = cfg.moeda || "BRL";
  const en = idioma === "en";
  const T = (pt, ing) => (en ? ing : pt);
  const linhas = [];
  const r = resumo(entidades, "janela");
  const t = r.total;
  if (!t.gasto) return [T("Nenhum gasto nos últimos 3 dias. Não há o que analisar ainda.", "No spend in the last 3 days. Nothing to analyze yet.")];
  linhas.push(T(`Últimos 3 dias + hoje: ${brl(t.gasto)} investidos, ${t.conversoes} conversões${t.cpa ? `, CPA ${brl(t.cpa)}` : ""}${t.roas ? `, ROAS ${t.roas.toFixed(2)}` : ""}.`, `Last 3 days + today: ${brl(t.gasto)} spent, ${t.conversoes} conversions${t.cpa ? `, CPA ${brl(t.cpa)}` : ""}${t.roas ? `, ROAS ${t.roas.toFixed(2)}` : ""}.`));
  if (cfg.cpaAlvo && t.cpa) {
    const dif = Math.round((t.cpa / cfg.cpaAlvo - 1) * 100);
    linhas.push(dif <= 0 ? T(`✅ CPA geral ${Math.abs(dif)}% abaixo do alvo (${brl(cfg.cpaAlvo)}). Bom momento para escalar o que está vendendo.`, `✅ Overall CPA ${Math.abs(dif)}% below target (${brl(cfg.cpaAlvo)}). Good time to scale what is selling.`) : T(`⚠️ CPA geral ${dif}% acima do alvo (${brl(cfg.cpaAlvo)}). Prioridade: cortar o que não converte.`, `⚠️ Overall CPA ${dif}% above target (${brl(cfg.cpaAlvo)}). Priority: cut what does not convert.`));
  }
  const ads = entidades.filter((e) => e.nivel === "anuncio" && e.status === "ativo").map((e) => ({ e, j: janela(e) }));
  if (cfg.fonteConversoes === "vendas") {
    const desc = (Number(cfg.roi?.descontarPct) || 0) / 100;
    const roiX = (j) => (j.gasto > 0 ? ((j.receita * (1 - desc) - j.gasto) / j.gasto) * 100 : null);
    const topRoi = ads.filter((x) => x.j.conversoes > 0 && x.j.gasto > 0).sort((a, b) => roiX(b.j) - roiX(a.j)).slice(0, 3);
    if (topRoi.length) linhas.push(T("🏆 Criativos campeões (vendas reais): ", "🏆 Winning creatives (real sales): ") + topRoi.map((x) => `${x.e.nome} (${x.j.conversoes} ${T("venda(s)", "sale(s)")}, ROI ${Math.round(roiX(x.j))}%)`).join("; ") + T(". Faça variações deles.", ". Make variations of them."));
  } else {
    const top = ads.filter((x) => x.j.conversoes > 0).sort((a, b) => a.j.cpa - b.j.cpa).slice(0, 3);
    if (top.length) linhas.push(T("🏆 Melhores anúncios: ", "🏆 Best ads: ") + top.map((x) => `${x.e.nome} (${x.j.conversoes} conv., CPA ${brl(x.j.cpa)})`).join("; ") + ".");
  }
  const ralo = ads.filter((x) => x.j.conversoes === 0 && x.j.gasto > 0).sort((a, b) => b.j.gasto - a.j.gasto).slice(0, 3);
  if (ralo.length) linhas.push(T("🕳️ Gastando sem converter: ", "🕳️ Spending without converting: ") + ralo.map((x) => `${x.e.nome} (${brl(x.j.gasto)})`).join("; ") + ".");
  const ctrBaixo = ads.filter((x) => x.j.impressoes > 1000 && x.j.ctr !== null && x.j.ctr < 0.8).length;
  if (ctrBaixo) linhas.push(T(`🎯 ${ctrBaixo} anúncio(s) com CTR abaixo de 0,8%: o gancho dos primeiros 3 segundos não está prendendo.`, `🎯 ${ctrBaixo} ad(s) with CTR below 0.8%: the hook in the first 3 seconds is not grabbing attention.`));
  const reemb = acoes.filter((a) => a.reembolso).length;
  if (reemb) linhas.push(T(`↩️ ${reemb} anúncio(s) com reembolso acima do limite.`, `↩️ ${reemb} ad(s) with refunds above the limit.`));
  const conta = (tipo) => acoes.filter((a) => a.tipo === tipo).length;
  const partes = [];
  if (conta("pausar")) partes.push(T(`${conta("pausar")} para pausar`, `${conta("pausar")} to pause`));
  if (conta("escalar")) partes.push(T(`${conta("escalar")} para escalar`, `${conta("escalar")} to scale`));
  if (conta("reduzir")) partes.push(T(`${conta("reduzir")} para reduzir orçamento`, `${conta("reduzir")} budget cut(s)`));
  if (conta("alerta")) partes.push(T(`${conta("alerta")} alerta(s)`, `${conta("alerta")} alert(s)`));
  linhas.push(partes.length ? T(`🤖 O agente encontrou: ${partes.join(", ")}.`, `🤖 The agent found: ${partes.join(", ")}.`) : T("🤖 Nada a ajustar agora. As campanhas estão dentro das regras.", "🤖 Nothing to adjust right now. Campaigns are within the rules."));
  return linhas;
}
