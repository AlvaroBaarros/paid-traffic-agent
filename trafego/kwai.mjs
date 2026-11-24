// Cliente da Kwai for Business Marketing API (MAPI). Lê dados por criativo e liga/desliga/ajusta orçamento.
// Observação do próprio Kwai: só dá para pausar e mudar orçamento pela API dos anúncios criados pela API.
// Para os criados no painel do Kwai, o agente analisa e avisa, e você aplica a mudança lá.
const BASE = "https://developers.kwai.com/rest/n/mapi";
const OAUTH = "https://business.kwai.com/oauth/token";

// Macros do Kwai (só IDs). Cole depois do link, no conjunto de anúncios.
export const UTM_KWAI = "utm_source=kwai&utm_campaign=__CMPNID__&utm_medium=__ADSETID__&utm_content=__ADID__";

const num = (v) => Number(v) || 0;
const pega = (o, ...ks) => { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return undefined; };
const idNum = (v) => { const x = Number(v); return Number.isSafeInteger(x) ? x : String(v); };

export function criarKwai({ clientId, clientSecret, refreshToken, contaId, fuso = "UTC-3", divisorCusto = 1e6, cotacao = 1, fetchFn = fetch, aoNovoRefresh = null }) {
  for (const [k, v] of Object.entries({ clientId, clientSecret, refreshToken, contaId })) if (!v) throw new Error(`Kwai: falta configurar "${k}".`);
  const offset = Number(String(fuso).replace(/^UTC/i, "")) || 0; // horas
  const conta = idNum(contaId);
  const div = Number(divisorCusto) || 1e6;
  const fx = Number(cotacao) || 1;
  let acesso = null, expira = 0, rt = refreshToken;

  async function token() {
    if (acesso && Date.now() < expira - 60000) return acesso;
    const u = new URL(OAUTH);
    for (const [k, v] of Object.entries({ grant_type: "refresh_token", refresh_token: rt, client_id: clientId, client_secret: clientSecret })) u.searchParams.set(k, v);
    const r = await fetchFn(u.toString(), { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Kwai: não consegui autenticar (${j.error_description || j.message || j.error || r.status}). Gere um refresh token novo no Kwai for Business.`);
    acesso = j.access_token;
    expira = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    if (j.refresh_token && j.refresh_token !== rt) { rt = j.refresh_token; if (aoNovoRefresh) await Promise.resolve(aoNovoRefresh(rt)).catch(() => {}); }
    return acesso;
  }
  async function chamar(caminho, corpo) {
    const r = await fetchFn(BASE + caminho, { method: "POST", headers: { "Access-Token": await token(), "Content-Type": "application/json" }, body: JSON.stringify({ accountId: conta, ...corpo }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || Number(j.status) !== 200) throw new Error(`Kwai: ${j?.message || "HTTP " + r.status}`);
    return j.data || {};
  }
  async function paginado(caminho, corpo = {}) {
    const out = [];
    for (let pageNo = 1; pageNo <= 40; pageNo++) {
      const d = await chamar(caminho, { ...corpo, pageNo, pageSize: 500 });
      const lista = d.data || d.list || [];
      out.push(...lista);
      if (lista.length < 500 || out.length >= num(d.total)) break;
    }
    return out;
  }
  // dia local (no fuso escolhido) → milissegundos do começo/fim do dia
  const inicioDia = (dia) => Date.parse(dia + "T00:00:00Z") - offset * 36e5;
  const diaLocal = (ms) => new Date(Number(ms) + offset * 36e5).toISOString().slice(0, 10);
  const hojeLocal = () => diaLocal(Date.now());
  const somar = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const relCriativo = (de, ate) => paginado("/report/dspCreativeEffectQuery", { granularity: 3, dataBeginTime: inicioDia(de), dataEndTime: inicioDia(ate) + 864e5 - 1, timeZoneIana: `UTC${offset >= 0 ? "+" : ""}${offset}` });

  const idCri = (r) => String(pega(r, "creativeId", "id"));
  const status = (o) => { const s = pega(o, "openStatus", "putStatus", "status"); return s === undefined ? "ativo" : Number(s) === 1 ? "ativo" : Number(s) === 2 ? "pausado" : "outro"; };

  async function listas() {
    const tenta = (p) => paginado(p).catch(() => null); // sem permissão de leitura: monta só pelo relatório
    const [campanhas, conjuntos, criativos] = await Promise.all([tenta("/campaign/dspCampaignPageQueryPerformance"), tenta("/unit/dspUnitPageQueryPerformance"), tenta("/creative/dspCreativePageQueryPerformance")]);
    return { campanhas: campanhas || [], conjuntos: conjuntos || [], criativos: criativos || [] };
  }

  return {
    async testar() {
      const d = await chamar("/report/dspAccountEffectQuery", { granularity: 3, dataBeginTime: inicioDia(hojeLocal()), dataEndTime: inicioDia(hojeLocal()) + 864e5 - 1, timeZoneIana: `UTC${offset >= 0 ? "+" : ""}${offset}`, pageNo: 1, pageSize: 1 });
      const l = (d.data || [])[0] || {};
      return { id: String(contaId), nome: l.accountName || String(contaId) };
    },

    async entidades() {
      const hoje = hojeLocal();
      const vazia = () => ({ gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 });
      const metricas = {}, nomes = {};
      for (const [chave, a, b] of [["hoje", hoje, hoje], ["d3", somar(hoje, -3), somar(hoje, -1)], ["d7", somar(hoje, -7), somar(hoje, -1)]]) {
        for (const r of await relCriativo(a, b)) {
          const id = idCri(r);
          nomes[id] ||= { nome: pega(r, "creativeName", "name"), conjuntoId: String(pega(r, "unitId") ?? ""), conjunto: pega(r, "unitName"), campanhaId: String(pega(r, "campaignId") ?? ""), campanha: pega(r, "campaignName") };
          const m = ((metricas[id] ||= {})[chave] ||= vazia());
          m.gasto += (num(r.cost) / div) * fx; m.impressoes += num(pega(r, "exposure", "impression")); m.cliques += num(pega(r, "click", "clicks")); m.conversoes += num(pega(r, "action", "conversion"));
        }
      }
      const { campanhas, conjuntos, criativos } = await listas();
      const out = [], visto = new Set();
      const add = (e) => { const k = e.nivel + ":" + e.id; if (!visto.has(k)) { visto.add(k); out.push(e); } };
      for (const c of campanhas) {
        const id = String(pega(c, "campaignId", "id"));
        add({ plataforma: "kwai", nivel: "campanha", id, nome: pega(c, "campaignName", "name") || `Campanha ${id}`, status: status(c), campanhaId: id, orcamento: null });
      }
      for (const s of conjuntos) {
        const id = String(pega(s, "unitId", "id")), camp = String(pega(s, "campaignId") ?? "");
        const db = num(pega(s, "dayBudget"));
        add({ plataforma: "kwai", nivel: "conjunto", id, nome: pega(s, "unitName", "name") || `Conjunto ${id}`, status: status(s), paiId: camp, campanhaId: camp, orcamento: db ? { valor: (db / div) * fx, editavel: num(pega(s, "budgetType")) !== 3, recurso: `unit:${id}` } : null });
      }
      const listaCri = criativos.length ? criativos : Object.keys(nomes).map((id) => ({ creativeId: id }));
      for (const c of listaCri) {
        const id = String(pega(c, "creativeId", "id")), n = nomes[id] || {}, m = metricas[id] || {};
        const conj = String(pega(c, "unitId") ?? n.conjuntoId ?? ""), camp = String(pega(c, "campaignId") ?? n.campanhaId ?? "");
        if (camp && !visto.has("campanha:" + camp)) add({ plataforma: "kwai", nivel: "campanha", id: camp, nome: n.campanha || `Campanha ${camp}`, status: "ativo", campanhaId: camp, orcamento: null });
        if (conj && !visto.has("conjunto:" + conj)) add({ plataforma: "kwai", nivel: "conjunto", id: conj, nome: n.conjunto || `Conjunto ${conj}`, status: "ativo", paiId: camp, campanhaId: camp, orcamento: null });
        add({
          plataforma: "kwai", nivel: "anuncio", id, nome: pega(c, "creativeName", "name") || n.nome || `Criativo ${id}`, status: status(c), paiId: conj, campanhaId: camp,
          viaApi: Number(pega(c, "dataGenerationSource")) === 2,
          metricas: { hoje: m.hoje || vazia(), d3: m.d3 || vazia(), d7: m.d7 || vazia() },
        });
      }
      return out;
    },

    async gastosDiarios(desde, ate) {
      const out = [];
      for (let ini = desde; ini <= ate;) {
        const fim = somar(ini, 29) < ate ? somar(ini, 29) : ate;
        for (const r of await relCriativo(ini, fim)) {
          const id = idCri(r);
          out.push({
            dia: r.time ? diaLocal(r.time) : ini, chave: `kwai:${id}`,
            gasto: (num(r.cost) / div) * fx, impressoes: num(pega(r, "exposure", "impression")), cliques: num(pega(r, "click", "clicks")),
            nomes: { anuncio: pega(r, "creativeName", "name") || `Criativo ${id}`, conjunto: pega(r, "unitName"), conjuntoId: String(pega(r, "unitId") ?? ""), campanha: pega(r, "campaignName"), campanhaId: String(pega(r, "campaignId") ?? "") },
          });
        }
        ini = somar(fim, 1);
      }
      return out;
    },

    async mudarStatus(id, ativo, nivel = "anuncio") {
      const openStatus = ativo ? 1 : 2;
      const [caminho, campo] = nivel === "campanha" ? ["/campaign/dspCampaignUpdateOpenStatusPerformance", "campaignIdList"] : nivel === "conjunto" ? ["/unit/dspUnitUpdateOpenStatusPerformance", "unitIdList"] : ["/creative/dspCreativeUpdateOpenStatusPerformance", "creativeIdList"];
      const d = await chamar(caminho, { [campo]: [idNum(id)], openStatus });
      const ok = (d.successIdList || []).map(String);
      if (d.successIdList && !ok.includes(String(id))) throw new Error("O Kwai só deixa a API mudar anúncios criados pela API. Faça essa mudança no painel do Kwai.");
      return d;
    },

    async mudarOrcamento(recurso, valorDia) {
      const [tipo, id] = String(recurso || "").split(":");
      if (tipo !== "unit") throw new Error("Esse item do Kwai não tem orçamento editável pela API.");
      const micro = Math.round((Number(valorDia) / fx) * 1e6);
      if (!(micro >= 1e6)) throw new Error("Orçamento inválido (mínimo 1 na moeda da conta).");
      const lista = [{ unitId: idNum(id), budgetType: 2, dayBudget: micro, budgetSchedule: null }];
      return chamar("/unit/dspUnitUpdateBudgetPerformance", { unitUpdateBudgetModelList: lista, unitUpdateModelList: lista });
    },
  };
}
