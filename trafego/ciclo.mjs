// Ciclo de criativos: acha criativos cansados e sugere ganchos novos a partir das ofertas escaladas do Clonador.
// Funções puras (sem rede), para poderem ser testadas.
import { somar, derivar } from "./regras.mjs";

const PALAVRAS_VAZIAS = new Set("de da do das dos para por com sem em no na nos nas um uma o a os as e ou que se seu sua the of for and to in on with by ad ads anuncio anúncio criativo campanha conjunto teste test frio quente br cbo abo v1 v2 v3 cpa adv".split(" "));
const palavras = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(w) && !/^\d+$/.test(w));

// Retorna o motivo (pt/en) se o anúncio está cansado, ou null.
export function cansaco(e, cfg = {}) {
  if (e.nivel !== "anuncio" || e.status !== "ativo") return null;
  const freqMax = Number(cfg.alertas?.frequenciaMax) || 3;
  const f = e.metricas?.d7?.frequencia || 0;
  if (f > freqMax) return { pt: `frequência de ${f.toFixed(1)} em 7 dias: o público já viu demais`, en: `frequency of ${f.toFixed(1)} in 7 days: the audience has seen it too often`, tipo: "frequencia" };
  // CTR dos últimos 3 dias + hoje × CTR dos 4 dias anteriores
  const rec = derivar(somar(e.metricas?.hoje, e.metricas?.d3));
  const d7 = e.metricas?.d7 || {}, d3 = e.metricas?.d3 || {};
  const ant = derivar({ gasto: (d7.gasto || 0) - (d3.gasto || 0), impressoes: (d7.impressoes || 0) - (d3.impressoes || 0), cliques: (d7.cliques || 0) - (d3.cliques || 0), conversoes: 0, receita: 0, frequencia: 0 });
  const minImp = Number(cfg.ciclo?.impressoesMin) || 2000;
  const queda = Number(cfg.ciclo?.quedaCtrPct) || 30;
  if (rec.impressoes >= minImp && ant.impressoes >= minImp && ant.ctr && rec.ctr !== null && rec.ctr < ant.ctr * (1 - queda / 100)) {
    const p = Math.round((1 - rec.ctr / ant.ctr) * 100);
    return { pt: `CTR caiu ${p}% (de ${ant.ctr.toFixed(2)}% para ${rec.ctr.toFixed(2)}%): o criativo está cansando`, en: `CTR dropped ${p}% (from ${ant.ctr.toFixed(2)}% to ${rec.ctr.toFixed(2)}%): the creative is wearing out`, tipo: "ctr" };
  }
  return null;
}

// Primeira frase do texto do anúncio = gancho.
export function gancho(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.{12,140}?[.!?…])(\s|$)/);
  const g = (m ? m[1] : t.slice(0, 120)).trim();
  return g.length < 12 ? "" : g;
}

// Ofertas parecidas: mesmas palavras no nome da campanha/anúncio × nicho/palavra/título da oferta.
export function ofertasParecidas(nomes, ofertas = [], max = 3) {
  const alvo = new Set(nomes.flatMap(palavras));
  const fortes = ofertas.filter((o) => ["escalada", "escalando"].includes(o.status));
  const base = fortes.length ? fortes : ofertas;
  const pont = base.map((o) => {
    const ws = new Set([...palavras(o.nicho), ...palavras(o.palavra), ...palavras(o.titulo), ...(o.palavras || []).flatMap(palavras)]);
    let comum = 0; for (const w of alvo) if (ws.has(w)) comum++;
    return { o, comum, score: o.score ?? o.pontuacao ?? 0 };
  });
  const comMatch = pont.filter((x) => x.comum > 0);
  return (comMatch.length ? comMatch : pont).sort((a, b) => b.comum - a.comum || b.score - a.score).slice(0, max).map((x) => x.o);
}

// Monta/atualiza a lista do ciclo. anteriores = lista salva no estado (mantém o "feito" e a data de detecção).
export function cicloCriativos(entidades, ofertas, cfg = {}, anteriores = [], agora = new Date()) {
  const antes = new Map((anteriores || []).map((i) => [i.id, i]));
  const nomeDe = new Map(entidades.map((e) => [e.plataforma + ":" + e.id, e.nome]));
  const out = [];
  for (const e of entidades) {
    const mot = cansaco(e, cfg);
    if (!mot) continue;
    const id = `${e.plataforma}:${e.id}`;
    const ant = antes.get(id);
    const camp = nomeDe.get(e.plataforma + ":" + e.campanhaId) || "";
    const refs = ofertasParecidas([camp, e.nome], ofertas, 3);
    const ganchos = [];
    for (const o of refs) for (const c of o.criativos || []) {
      const g = gancho(c.texto || c.titulo);
      if (g && !ganchos.some((x) => x.texto === g)) ganchos.push({ texto: g, de: o.anunciante || "", anuncios: c.criativosIguais || 1 });
    }
    ganchos.sort((a, b) => b.anuncios - a.anuncios);
    out.push({
      id, plataforma: e.plataforma, anuncioId: e.id, nome: e.nome, campanha: camp, tipo: mot.tipo, motivo: mot.pt, motivoEn: mot.en,
      desde: ant?.desde || agora.toISOString(), feito: !!ant?.feito, novo: !ant,
      referencias: refs.map((o) => ({ chave: o.chave, anunciante: o.anunciante, titulo: o.titulo, dominio: o.dominio, nicho: o.nicho, status: o.status, anunciosOferta: o.anunciosOferta, diasRodando: o.diasRodando, score: o.score ?? null, funil: o.funil ? { tipo: o.funil.tipo, checkout: o.funil.checkout } : null, criativos: (o.criativos || []).slice(0, 3).map((c) => ({ titulo: c.titulo, texto: c.texto, criativosIguais: c.criativosIguais })) })),
      ganchos: ganchos.slice(0, 6),
    });
  }
  // itens marcados como feitos continuam por 7 dias para você ver o histórico
  for (const i of anteriores || []) if (!out.find((x) => x.id === i.id) && i.feito && agora - Date.parse(i.desde) < 7 * 864e5) out.push({ ...i, novo: false, resolvido: true });
  return out;
}
