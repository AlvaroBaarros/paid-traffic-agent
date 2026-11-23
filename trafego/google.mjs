// Cliente da Google Ads API (REST). Lê campanhas/anúncios e ajusta status e orçamento.

const STATUS = (s) => (s === "ENABLED" ? "ativo" : s === "PAUSED" ? "pausado" : "outro");
const digitos = (s) => String(s || "").replace(/\D/g, "");

function dataISO(d) { return d.toISOString().slice(0, 10); }

export function criarGoogle({ developerToken, clientId, clientSecret, refreshToken, customerId, loginCustomerId, versao = "v26", fetchFn = fetch }) {
  for (const [k, v] of Object.entries({ developerToken, clientId, clientSecret, refreshToken, customerId })) if (!v) throw new Error(`Google Ads: falta configurar "${k}".`);
  const cid = digitos(customerId);
  const raiz = `https://googleads.googleapis.com/${versao}/customers/${cid}`;
  let acesso = null, expira = 0;

  async function token() {
    if (acesso && Date.now() < expira - 60000) return acesso;
    const r = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Google: não consegui autenticar (${j.error_description || j.error || r.status}). Gere um refresh token novo.`);
    acesso = j.access_token;
    expira = Date.now() + (j.expires_in || 3600) * 1000;
    return acesso;
  }

  async function chamar(caminho, corpo) {
    const headers = { Authorization: `Bearer ${await token()}`, "developer-token": developerToken, "Content-Type": "application/json" };
    if (loginCustomerId) headers["login-customer-id"] = digitos(loginCustomerId);
    const r = await fetchFn(`${raiz}/${caminho}`, { method: "POST", headers, body: JSON.stringify(corpo) });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch { j = null; }
    const erro = Array.isArray(j) ? j.find((x) => x.error)?.error : j?.error;
    if (!r.ok || erro) {
      const det = erro?.details?.[0]?.errors?.[0]?.message || erro?.message || `HTTP ${r.status}`;
      throw new Error(`Google Ads: ${det}`);
    }
    return j;
  }

  async function buscar(gaql) {
    const lotes = await chamar("googleAds:searchStream", { query: gaql });
    return (Array.isArray(lotes) ? lotes : [lotes]).flatMap((l) => l.results || []);
  }

  return {
    buscar,
    async testar() {
      const r = await buscar("SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1");
      return r[0]?.customer || {};
    },

    async entidades() {
      const hoje = new Date();
      const d3ini = dataISO(new Date(hoje.getTime() - 3 * 864e5));
      const ontem = dataISO(new Date(hoje.getTime() - 864e5));
      const campanhas = await buscar("SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'");
      const anuncios = await buscar("SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.id, ad_group.name, ad_group.status, campaign.id FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND campaign.status != 'REMOVED'");
      const metricas = {};
      const janelas = [["hoje", "segments.date DURING TODAY"], ["d3", `segments.date BETWEEN '${d3ini}' AND '${ontem}'`], ["d7", "segments.date DURING LAST_7_DAYS"]];
      for (const [chave, cond] of janelas) {
        const linhas = await buscar(`SELECT ad_group.id, ad_group_ad.ad.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE ${cond} AND ad_group_ad.status != 'REMOVED'`);
        for (const l of linhas) {
          const id = `${l.adGroup?.id}~${l.adGroupAd?.ad?.id}`;
          const m = l.metrics || {};
          const atual = (metricas[id] ||= {})[chave] || { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 };
          atual.gasto += Number(m.costMicros || 0) / 1e6;
          atual.impressoes += Number(m.impressions || 0);
          atual.cliques += Number(m.clicks || 0);
          atual.conversoes += Number(m.conversions || 0);
          atual.receita += Number(m.conversionsValue || 0);
          metricas[id][chave] = atual;
        }
      }
      const vazia = { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 };
      const out = [];
      const statusCamp = {};
      for (const l of campanhas) {
        const c = l.campaign, b = l.campaignBudget || {};
        statusCamp[c.id] = c.status;
        out.push({
          plataforma: "google", nivel: "campanha", id: String(c.id), nome: c.name, status: STATUS(c.status), statusBruto: c.status, campanhaId: String(c.id),
          recurso: `customers/${cid}/campaigns/${c.id}`, tipoCanal: c.advertisingChannelType,
          orcamento: b.amountMicros ? { valor: Number(b.amountMicros) / 1e6, editavel: !b.explicitlyShared, recurso: b.resourceName, compartilhado: !!b.explicitlyShared } : null,
        });
      }
      const grupos = new Map();
      for (const l of anuncios) {
        const g = l.adGroup, a = l.adGroupAd, campId = String(l.campaign.id);
        if (!grupos.has(g.id)) {
          grupos.set(g.id, true);
          const st = statusCamp[campId] === "ENABLED" ? STATUS(g.status) : "pausado";
          out.push({ plataforma: "google", nivel: "conjunto", id: String(g.id), nome: g.name, status: st, statusBruto: g.status, paiId: campId, campanhaId: campId, recurso: `customers/${cid}/adGroups/${g.id}`, orcamento: null });
        }
        const id = `${g.id}~${a.ad.id}`;
        const efetivo = statusCamp[campId] !== "ENABLED" || g.status !== "ENABLED" ? (a.status === "ENABLED" ? "pausado" : STATUS(a.status)) : STATUS(a.status);
        const m = metricas[id] || {};
        out.push({
          plataforma: "google", nivel: "anuncio", id, nome: a.ad.name || `Anúncio ${a.ad.id} · ${g.name}`, status: efetivo, statusBruto: a.status,
          paiId: String(g.id), campanhaId: campId, recurso: `customers/${cid}/adGroupAds/${id}`,
          metricas: { hoje: m.hoje || { ...vazia }, d3: m.d3 || { ...vazia }, d7: m.d7 || { ...vazia } },
        });
      }
      return out;
    },

    async gastosDiarios(desde, ate) {
      const linhas = await buscar(`SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, metrics.cost_micros, metrics.impressions, metrics.clicks FROM ad_group_ad WHERE segments.date BETWEEN '${desde}' AND '${ate}'`);
      return linhas.map((l) => ({
        dia: l.segments?.date, chave: `google:${l.adGroup?.id}~${l.adGroupAd?.ad?.id}`,
        gasto: Number(l.metrics?.costMicros || 0) / 1e6, impressoes: Number(l.metrics?.impressions || 0), cliques: Number(l.metrics?.clicks || 0),
        nomes: { anuncio: l.adGroupAd?.ad?.name || `Anúncio ${l.adGroupAd?.ad?.id} · ${l.adGroup?.name}`, conjunto: l.adGroup?.name, conjuntoId: String(l.adGroup?.id), campanha: l.campaign?.name, campanhaId: String(l.campaign?.id) },
      }));
    },

    async mudarStatus(recurso, ativo) {
      const servico = recurso.includes("/adGroupAds/") ? "adGroupAds" : recurso.includes("/adGroups/") ? "adGroups" : "campaigns";
      return chamar(`${servico}:mutate`, { operations: [{ update: { resourceName: recurso, status: ativo ? "ENABLED" : "PAUSED" }, updateMask: "status" }] });
    },

    async mudarOrcamento(recursoOrcamento, valorDia) {
      const micros = Math.round(Number(valorDia) * 100) * 10000; // múltiplo de 1 centavo
      if (!(micros > 0)) throw new Error("Orçamento inválido");
      return chamar("campaignBudgets:mutate", { operations: [{ update: { resourceName: recursoOrcamento, amountMicros: String(micros) }, updateMask: "amount_micros" }] });
    },
  };
}
