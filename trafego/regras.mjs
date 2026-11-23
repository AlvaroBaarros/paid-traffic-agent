// Motor de regras do agente de tráfego. Funções puras (sem rede), para poderem ser testadas.
//
// Modelo de entidade (igual para Meta e Google):
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
const brl = (n) => "R$ " + (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
const pct = (n) => (n === null || n === undefined ? "–" : n.toFixed(2).replace(".", ",") + "%");

function horasDesde(historico, alvoId, tipos, agora) {
  const ult = historico.filter((h) => h.alvoId === alvoId && tipos.includes(h.tipo)).map((h) => Date.parse(h.em)).filter(Boolean).sort((a, b) => b - a)[0];
  return ult ? (agora.getTime() - ult) / 36e5 : Infinity;
}

export function avaliar(entidades, cfgBruta, agora = new Date(), historico = []) {
  const cfg = mesclarRegras(cfgBruta);
  const acoes = [];
  const dia = agora.toISOString().slice(0, 10);
  const gerenciadas = new Set(cfg.campanhasGerenciadas || []);
  const ehGerenciada = (e) => gerenciadas.has(`${e.plataforma}:${e.campanhaId || e.id}`);
  const nova = (e, tipo, motivo, extra = {}) => ({
    id: `${dia}:${e.plataforma}:${tipo}:${e.id}`,
    plataforma: e.plataforma, tipo, nivel: e.nivel, alvoId: e.id, nome: e.nome, campanhaId: e.campanhaId || e.id,
    recurso: e.recurso || null, recursoOrcamento: e.orcamento?.recurso || null,
    motivo, gerenciada: ehGerenciada(e), automatizavel: tipo !== "alerta" && ehGerenciada(e), criadaEm: agora.toISOString(), ...extra,
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
      if (j.conversoes === 0 && j.gasto >= cpaAlvo * cfg.pausar.gastoSemVendaMult) motivo = `gastou ${brl(j.gasto)} sem nenhuma conversão (limite: ${cfg.pausar.gastoSemVendaMult}× o CPA alvo)`;
      else if (modoRoi && j.conversoes > 0 && roiDe(j) !== null && roiDe(j) <= cfg.roi.maxPausar && j.gasto >= cpaAlvo * 2) motivo = `vendas reais com ROI de ${fmtRoi(roiDe(j))} (${j.conversoes} venda(s), ${brl(j.receita)} de faturamento para ${brl(j.gasto)} de gasto)`;
      else if (!modoRoi && j.conversoes > 0 && j.cpa > cpaAlvo * cfg.pausar.cpaMult && j.gasto >= cpaAlvo * 2) motivo = `CPA de ${brl(j.cpa)}, ${Math.round((j.cpa / cpaAlvo - 1) * 100)}% acima do alvo de ${brl(cpaAlvo)}`;
      else if (j.conversoes === 0 && j.impressoes >= cfg.pausar.impressoesMinCtr && j.ctr !== null && j.ctr < cfg.pausar.ctrMin) motivo = `CTR de ${pct(j.ctr)} com ${j.impressoes} impressões e nenhuma conversão (mínimo: ${pct(cfg.pausar.ctrMin)})`;
      if (motivo) candidatos.push({ e, j, motivo });
    }
    candidatos.sort((a, b) => b.j.gasto - a.j.gasto);
    for (const { e, j, motivo } of candidatos) {
      const k = e.plataforma + ":" + e.paiId;
      const ativos = ativosPorConjunto.get(k) || 0;
      if (ativos <= 1) {
        acoes.push(nova(e, "alerta", `${motivo}. É o último anúncio ativo do conjunto: avalie pausar o conjunto ou subir criativos novos.`, { gravidade: "alta", janela: j }));
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
    if (cfg.escalar.ativo && bomParaEscalar) {
      const h = horasDesde(historico, e.id, ["escalar", "reduzir"], agora);
      const para = r2(Math.min(atual * (1 + cfg.escalar.aumentoPct / 100), Number(cfg.tetoOrcamentoDiario) || Infinity));
      if (h < cfg.escalar.intervaloHoras) continue;
      if (para <= atual + 0.5) {
        if (atual >= cfg.tetoOrcamentoDiario) acoes.push(nova(e, "alerta", `está vendendo bem (CPA ${brl(j.cpa)}, ${j.conversoes} conversões), mas já bateu o teto de ${brl(cfg.tetoOrcamentoDiario)}/dia. Suba o teto se quiser escalar mais.`, { gravidade: "info", janela: j }));
        continue;
      }
      acoes.push(nova(e, "escalar", modoRoi ? `vendas reais: ROI de ${fmtRoi(roi)} com ${j.conversoes} venda(s) (${brl(j.receita)} faturados para ${brl(j.gasto)} gastos)` : `CPA de ${brl(j.cpa)} (alvo ${brl(cpaAlvo)}) com ${j.conversoes} conversões${j.roas ? `, ROAS ${j.roas.toFixed(2)}` : ""}`, { de: atual, para, janela: j, roi }));
      continue;
    }
    const caro = modoRoi ? j.conversoes >= 1 && roi !== null && roi < 0 : cpaAlvo > 0 && j.conversoes >= 1 && j.cpa > cpaAlvo * cfg.reduzir.cpaMult;
    if (cfg.reduzir.ativo && caro) {
      const h = horasDesde(historico, e.id, ["escalar", "reduzir"], agora);
      const para = r2(Math.max(atual * (1 - cfg.reduzir.reducaoPct / 100), Number(cfg.orcamentoMinimo) || 0));
      if (h >= cfg.reduzir.intervaloHoras && para < atual - 0.5) acoes.push(nova(e, "reduzir", modoRoi ? `vendas reais no prejuízo: ROI de ${fmtRoi(roi)}` : `CPA de ${brl(j.cpa)}, acima do alvo de ${brl(cpaAlvo)}`, { de: atual, para, janela: j, roi }));
      continue;
    }
    if (j.conversoes === 0 && cpaAlvo > 0 && j.gasto >= cpaAlvo * cfg.pausar.gastoSemVendaMult * 2) {
      acoes.push(nova(e, "alerta", `gastou ${brl(j.gasto)} sem conversões nos últimos dias. Considere pausar ou trocar a oferta/criativos.`, { gravidade: "alta", janela: j }));
    }
  }

  // 3) Fadiga de criativo
  if (cfg.alertas.frequenciaMax) {
    for (const e of entidades) {
      if (e.nivel !== "anuncio" || e.status !== "ativo") continue;
      const f = e.metricas?.d7?.frequencia || 0;
      if (f > cfg.alertas.frequenciaMax) acoes.push(nova(e, "alerta", `frequência de ${f.toFixed(1)} em 7 dias: o público já viu demais. Hora de criativos novos.`, { gravidade: "media" }));
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

export function diagnostico(entidades, acoes, cfgBruta) {
  const cfg = mesclarRegras(cfgBruta);
  const linhas = [];
  const r = resumo(entidades, "janela");
  const t = r.total;
  if (!t.gasto) return ["Nenhum gasto nos últimos 3 dias. Não há o que analisar ainda."];
  linhas.push(`Últimos 3 dias + hoje: ${brl(t.gasto)} investidos, ${t.conversoes} conversões${t.cpa ? `, CPA ${brl(t.cpa)}` : ""}${t.roas ? `, ROAS ${t.roas.toFixed(2)}` : ""}.`);
  if (cfg.cpaAlvo && t.cpa) {
    const dif = Math.round((t.cpa / cfg.cpaAlvo - 1) * 100);
    linhas.push(dif <= 0 ? `✅ CPA geral ${Math.abs(dif)}% abaixo do alvo (${brl(cfg.cpaAlvo)}). Bom momento para escalar o que está vendendo.` : `⚠️ CPA geral ${dif}% acima do alvo (${brl(cfg.cpaAlvo)}). Prioridade: cortar o que não converte.`);
  }
  const ads = entidades.filter((e) => e.nivel === "anuncio" && e.status === "ativo").map((e) => ({ e, j: janela(e) }));
  if (cfg.fonteConversoes === "vendas") {
    const desc = (Number(cfg.roi?.descontarPct) || 0) / 100;
    const roiX = (j) => (j.gasto > 0 ? ((j.receita * (1 - desc) - j.gasto) / j.gasto) * 100 : null);
    const topRoi = ads.filter((x) => x.j.conversoes > 0 && x.j.gasto > 0).sort((a, b) => roiX(b.j) - roiX(a.j)).slice(0, 3);
    if (topRoi.length) linhas.push("🏆 Criativos campeões (vendas reais): " + topRoi.map((x) => `${x.e.nome} (${x.j.conversoes} venda(s), ROI ${Math.round(roiX(x.j))}%)`).join("; ") + ". Faça variações deles.");
  } else {
    const top = ads.filter((x) => x.j.conversoes > 0).sort((a, b) => a.j.cpa - b.j.cpa).slice(0, 3);
    if (top.length) linhas.push("🏆 Melhores anúncios: " + top.map((x) => `${x.e.nome} (${x.j.conversoes} conv., CPA ${brl(x.j.cpa)})`).join("; ") + ".");
  }
  const ralo = ads.filter((x) => x.j.conversoes === 0 && x.j.gasto > 0).sort((a, b) => b.j.gasto - a.j.gasto).slice(0, 3);
  if (ralo.length) linhas.push("🕳️ Gastando sem converter: " + ralo.map((x) => `${x.e.nome} (${brl(x.j.gasto)})`).join("; ") + ".");
  const ctrBaixo = ads.filter((x) => x.j.impressoes > 1000 && x.j.ctr !== null && x.j.ctr < 0.8).length;
  if (ctrBaixo) linhas.push(`🎯 ${ctrBaixo} anúncio(s) com CTR abaixo de 0,8%: o gancho dos primeiros 3 segundos não está prendendo.`);
  const conta = (tipo) => acoes.filter((a) => a.tipo === tipo).length;
  const partes = [];
  if (conta("pausar")) partes.push(`${conta("pausar")} para pausar`);
  if (conta("escalar")) partes.push(`${conta("escalar")} para escalar`);
  if (conta("reduzir")) partes.push(`${conta("reduzir")} para reduzir orçamento`);
  if (conta("alerta")) partes.push(`${conta("alerta")} alerta(s)`);
  linhas.push(partes.length ? `🤖 O agente encontrou: ${partes.join(", ")}.` : "🤖 Nada a ajustar agora. As campanhas estão dentro das regras.");
  return linhas;
}
