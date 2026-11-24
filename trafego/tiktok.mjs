// Cliente da TikTok API for Business (Marketing API v1.3). Lê campanhas/conjuntos/anúncios e ajusta status e orçamento.
const BASE = "https://business-api.tiktok.com/open_api/v1.3";

// Parâmetros de URL (macros do TikTok) no mesmo formato "nome|id" usado na Meta.
export const UTM_TIKTOK = "utm_source=tiktok&utm_campaign=__CAMPAIGN_NAME__|__CAMPAIGN_ID__&utm_medium=__AID_NAME__|__AID__&utm_content=__CID_NAME__|__CID__&utm_term=__PLACEMENT__";

const STATUS = (s) => (s === "ENABLE" ? "ativo" : s === "DISABLE" ? "pausado" : "outro");
const dataISO = (d) => d.toISOString().slice(0, 10);
const n = (v) => Number(v) || 0;

export function criarTiktok({ token, anuncianteId, fetchFn = fetch }) {
  if (!token) throw new Error('TikTok: falta configurar o "token de acesso".');
  if (!anuncianteId) throw new Error('TikTok: falta configurar o "ID da conta de anúncios (advertiser ID)".');
  const adv = String(anuncianteId).trim();

  async function chamar(caminho, { metodo = "GET", query = {}, corpo = null, semConta = false } = {}) {
    const u = new URL(`${BASE}/${caminho}`);
    const q = semConta ? query : { advertiser_id: adv, ...query };
    if (metodo === "GET") for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const r = await fetchFn(u.toString(), {
      method: metodo,
      headers: { "Access-Token": token, "Content-Type": "application/json" },
      body: metodo === "POST" ? JSON.stringify({ advertiser_id: adv, ...(corpo || {}) }) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.code !== 0) throw new Error(`TikTok: ${j?.message || "HTTP " + r.status}`);
    return j.data || {};
  }
  async function paginado(caminho, query = {}) {
    const out = [];
    for (let page = 1; page <= 30; page++) {
      const d = await chamar(caminho, { query: { ...query, page, page_size: 1000 } });
      out.push(...(d.list || []));
      const tot = d.page_info?.total_page || 1;
      if (page >= tot) break;
    }
    return out;
  }
  async function relatorio(dimensoes, metricas, desde, ate) {
    const base = { report_type: "BASIC", data_level: "AUCTION_AD", dimensions: dimensoes, start_date: desde, end_date: ate };
    try { return await paginado("report/integrated/get/", { ...base, metrics: metricas }); }
    catch (e) {
      // algumas contas não liberam "frequency": tenta de novo sem ela
      if (metricas.includes("frequency")) return paginado("report/integrated/get/", { ...base, metrics: metricas.filter((m) => m !== "frequency") });
      throw e;
    }
  }
  async function estrutura() {
    const [campanhas, conjuntos, anuncios] = await Promise.all([
      paginado("campaign/get/", { fields: ["campaign_id", "campaign_name", "operation_status", "secondary_status", "budget", "budget_mode", "budget_optimize_on"] }),
      paginado("adgroup/get/", { fields: ["adgroup_id", "adgroup_name", "campaign_id", "operation_status", "secondary_status", "budget", "budget_mode"] }),
      paginado("ad/get/", { fields: ["ad_id", "ad_name", "adgroup_id", "campaign_id", "operation_status", "secondary_status", "ad_text"] }),
    ]);
    return { campanhas, conjuntos, anuncios };
  }
  const orc = (o, tipo) => {
    if (!o.budget || !o.budget_mode || o.budget_mode === "BUDGET_MODE_INFINITE") return null;
    const diario = o.budget_mode === "BUDGET_MODE_DAY" || o.budget_mode === "BUDGET_MODE_DYNAMIC_DAILY_BUDGET";
    return { valor: n(o.budget), editavel: diario, total: !diario, recurso: `${tipo}:${tipo === "campaign" ? o.campaign_id : o.adgroup_id}` };
  };

  return {
    async testar() {
      const d = await chamar("advertiser/info/", { query: { advertiser_ids: [adv] }, semConta: true });
      const a = (d.list || [])[0] || {};
      return { id: adv, nome: a.name || adv, moeda: a.currency || "" };
    },

    async entidades() {
      const hoje = new Date();
      const ontem = dataISO(new Date(hoje.getTime() - 864e5));
      const { campanhas, conjuntos, anuncios } = await estrutura();
      const metricas = {};
      const janelas = [["hoje", dataISO(hoje), dataISO(hoje)], ["d3", dataISO(new Date(hoje.getTime() - 3 * 864e5)), ontem], ["d7", dataISO(new Date(hoje.getTime() - 7 * 864e5)), ontem]];
      for (const [chave, a, b] of janelas) {
        const linhas = await relatorio(["ad_id"], ["spend", "impressions", "clicks", "conversion", "frequency"], a, b);
        for (const l of linhas) {
          const m = l.metrics || {};
          (metricas[l.dimensions?.ad_id] ||= {})[chave] = { gasto: n(m.spend), impressoes: n(m.impressions), cliques: n(m.clicks), conversoes: n(m.conversion), receita: 0, frequencia: n(m.frequency) };
        }
      }
      const vazia = { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 };
      const cbo = new Set(campanhas.filter((c) => c.budget_optimize_on).map((c) => String(c.campaign_id)));
      const stCamp = Object.fromEntries(campanhas.map((c) => [String(c.campaign_id), c.operation_status]));
      const stConj = Object.fromEntries(conjuntos.map((s) => [String(s.adgroup_id), s.operation_status]));
      const out = [];
      for (const c of campanhas) out.push({ plataforma: "tiktok", nivel: "campanha", id: String(c.campaign_id), nome: c.campaign_name, status: STATUS(c.operation_status), statusBruto: c.secondary_status || c.operation_status, campanhaId: String(c.campaign_id), orcamento: orc(c, "campaign") });
      for (const s of conjuntos) {
        const camp = String(s.campaign_id);
        out.push({ plataforma: "tiktok", nivel: "conjunto", id: String(s.adgroup_id), nome: s.adgroup_name, status: stCamp[camp] === "ENABLE" ? STATUS(s.operation_status) : "pausado", statusBruto: s.secondary_status || s.operation_status, paiId: camp, campanhaId: camp, orcamento: cbo.has(camp) ? null : orc(s, "adgroup") });
      }
      for (const a of anuncios) {
        const camp = String(a.campaign_id), conj = String(a.adgroup_id), m = metricas[String(a.ad_id)] || {};
        const efetivo = stCamp[camp] === "ENABLE" && stConj[conj] === "ENABLE" ? STATUS(a.operation_status) : a.operation_status === "ENABLE" ? "pausado" : STATUS(a.operation_status);
        out.push({
          plataforma: "tiktok", nivel: "anuncio", id: String(a.ad_id), nome: a.ad_name || `Anúncio ${a.ad_id}`, status: efetivo, statusBruto: a.secondary_status || a.operation_status,
          paiId: conj, campanhaId: camp, texto: a.ad_text || "",
          metricas: { hoje: m.hoje || { ...vazia }, d3: m.d3 || { ...vazia }, d7: m.d7 || { ...vazia } },
        });
      }
      return out;
    },

    async gastosDiarios(desde, ate) {
      const { campanhas, conjuntos, anuncios } = await estrutura();
      const nCamp = Object.fromEntries(campanhas.map((c) => [String(c.campaign_id), c.campaign_name]));
      const nConj = Object.fromEntries(conjuntos.map((s) => [String(s.adgroup_id), s.adgroup_name]));
      const ad = Object.fromEntries(anuncios.map((a) => [String(a.ad_id), a]));
      // o relatório diário do TikTok aceita no máximo 30 dias por pedido
      const linhas = [];
      for (let ini = desde; ini <= ate;) {
        const fimD = new Date(Date.parse(ini + "T12:00:00Z") + 29 * 864e5).toISOString().slice(0, 10);
        const fim = fimD < ate ? fimD : ate;
        linhas.push(...(await relatorio(["ad_id", "stat_time_day"], ["spend", "impressions", "clicks"], ini, fim)));
        ini = new Date(Date.parse(fim + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
      }
      return linhas.map((l) => {
        const id = String(l.dimensions?.ad_id), a = ad[id] || {};
        return {
          dia: String(l.dimensions?.stat_time_day || "").slice(0, 10), chave: `tiktok:${id}`,
          gasto: n(l.metrics?.spend), impressoes: n(l.metrics?.impressions), cliques: n(l.metrics?.clicks),
          nomes: { anuncio: a.ad_name || `Anúncio ${id}`, conjunto: nConj[String(a.adgroup_id)], conjuntoId: a.adgroup_id ? String(a.adgroup_id) : "", campanha: nCamp[String(a.campaign_id)], campanhaId: a.campaign_id ? String(a.campaign_id) : "" },
        };
      });
    },

    async mudarStatus(id, ativo, nivel = "anuncio") {
      const operation_status = ativo ? "ENABLE" : "DISABLE";
      if (nivel === "campanha") return chamar("campaign/status/update/", { metodo: "POST", corpo: { campaign_ids: [String(id)], operation_status } });
      if (nivel === "conjunto") return chamar("adgroup/status/update/", { metodo: "POST", corpo: { adgroup_ids: [String(id)], operation_status } });
      return chamar("ad/status/update/", { metodo: "POST", corpo: { ad_ids: [String(id)], operation_status } });
    },

    async mudarOrcamento(recurso, valorDia) {
      const valor = Math.round(Number(valorDia) * 100) / 100;
      if (!(valor > 0)) throw new Error("Orçamento inválido");
      const [tipo, id] = String(recurso || "").split(":");
      if (tipo === "campaign") return chamar("campaign/update/", { metodo: "POST", corpo: { campaign_id: id, budget: valor } });
      if (tipo === "adgroup") return chamar("adgroup/budget/update/", { metodo: "POST", corpo: { budget: [{ adgroup_id: id, budget: valor }] } });
      throw new Error("Esse item do TikTok não tem orçamento editável.");
    },
  };
}
