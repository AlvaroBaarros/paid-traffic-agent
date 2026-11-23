// Cliente da Marketing API da Meta (Facebook/Instagram Ads).
import fs from "node:fs/promises";
import path from "node:path";

export const EVENTOS = {
  PURCHASE: { nome: "Compra", acoes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"], objetivo: "OUTCOME_SALES" },
  LEAD: { nome: "Lead", acoes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"], objetivo: "OUTCOME_LEADS" },
  INITIATED_CHECKOUT: { nome: "Início de checkout", acoes: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"], objetivo: "OUTCOME_SALES" },
  COMPLETE_REGISTRATION: { nome: "Cadastro", acoes: ["omni_complete_registration", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"], objetivo: "OUTCOME_LEADS" },
};

// Parâmetros de URL padrão: deixam o Debian Analytics saber de qual campanha/conjunto/anúncio veio cada venda.
export const UTM_META = "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";

export const CTAS = ["LEARN_MORE", "SHOP_NOW", "BUY_NOW", "ORDER_NOW", "SIGN_UP", "GET_OFFER", "SUBSCRIBE", "DOWNLOAD", "CONTACT_US", "APPLY_NOW", "WHATSAPP_MESSAGE"];

const STATUS = (s) => (s === "ACTIVE" ? "ativo" : /PAUSED/.test(s || "") ? "pausado" : "outro");
const STATUS_VALIDOS = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO"];

export function lerAcao(lista, tipos) {
  if (!Array.isArray(lista)) return 0;
  for (const t of tipos) {
    const a = lista.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

export function criarMeta({ token, versao = "v25.0", fetchFn = fetch, base = "https://graph.facebook.com" }) {
  if (!token) throw new Error("Token da Meta não configurado.");
  const raiz = `${base}/${versao}`;

  async function tratar(r) {
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch { throw new Error(`Resposta inesperada da Meta (HTTP ${r.status})`); }
    if (j.error) {
      const e = j.error;
      const msg = e.error_user_msg || e.error_user_title || e.message || "erro desconhecido";
      const err = new Error(`Meta: ${msg} (código ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})`);
      err.meta = e;
      throw err;
    }
    return j;
  }

  async function get(caminho, params = {}, { todos = false, maxPaginas = 20 } = {}) {
    const u = new URL(caminho.startsWith("http") ? caminho : `${raiz}/${caminho.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    u.searchParams.set("access_token", token);
    let j = await tratar(await fetchFn(u.toString()));
    if (!todos) return j;
    const dados = [...(j.data || [])];
    let pag = 1;
    while (j.paging && j.paging.next && pag < maxPaginas) {
      j = await tratar(await fetchFn(j.paging.next));
      dados.push(...(j.data || []));
      pag++;
    }
    return dados;
  }

  async function post(caminho, params = {}) {
    const corpo = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) corpo.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    corpo.set("access_token", token);
    return tratar(await fetchFn(`${raiz}/${caminho.replace(/^\//, "")}`, { method: "POST", body: corpo, headers: { "Content-Type": "application/x-www-form-urlencoded" } }));
  }

  async function postArquivo(caminho, campo, arquivo, extras = {}) {
    const buf = await fs.readFile(arquivo);
    const fd = new FormData();
    fd.set("access_token", token);
    for (const [k, v] of Object.entries(extras)) fd.set(k, String(v));
    fd.set(campo, new Blob([buf]), path.basename(arquivo));
    return tratar(await fetchFn(`${raiz}/${caminho.replace(/^\//, "")}`, { method: "POST", body: fd }));
  }

  const act = (conta) => (String(conta).startsWith("act_") ? String(conta) : `act_${conta}`);

  return {
    get, post,

    async eu() { return get("me", { fields: "id,name" }); },

    async contas() {
      return get("me/adaccounts", { fields: "id,name,account_status,currency,timezone_name,amount_spent", limit: 100 }, { todos: true });
    },

    async ativos(conta) {
      let paginas = [];
      try { paginas = await get(`${act(conta)}/promote_pages`, { fields: "id,name", limit: 100 }, { todos: true }); } catch { /* sem permissão: tenta outra rota */ }
      if (!paginas.length) { try { paginas = await get("me/accounts", { fields: "id,name", limit: 100 }, { todos: true }); } catch { paginas = []; } }
      let pixels = [];
      try { pixels = await get(`${act(conta)}/adspixels`, { fields: "id,name", limit: 100 }, { todos: true }); } catch { pixels = []; }
      return { paginas, pixels };
    },

    // Estrutura + métricas (hoje, últimos 3 dias, últimos 7 dias) → entidades normalizadas
    async entidades(conta, evento = "PURCHASE") {
      const filtro = [{ field: "effective_status", operator: "IN", value: STATUS_VALIDOS }];
      const [campanhas, conjuntos, anuncios] = await Promise.all([
        get(`${act(conta)}/campaigns`, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy", filtering: filtro, limit: 200 }, { todos: true }),
        get(`${act(conta)}/adsets`, { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal", filtering: filtro, limit: 300 }, { todos: true }),
        get(`${act(conta)}/ads`, { fields: "id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url,title,body}", filtering: filtro, limit: 300 }, { todos: true }),
      ]);
      const tipos = (EVENTOS[evento] || EVENTOS.PURCHASE).acoes;
      const metricas = {};
      for (const [chave, preset] of [["hoje", "today"], ["d3", "last_3d"], ["d7", "last_7d"]]) {
        const linhas = await get(`${act(conta)}/insights`, { level: "ad", date_preset: preset, fields: "ad_id,spend,impressions,inline_link_clicks,clicks,frequency,actions,action_values", limit: 500 }, { todos: true });
        for (const l of linhas) {
          (metricas[l.ad_id] ||= {})[chave] = {
            gasto: Number(l.spend) || 0,
            impressoes: Number(l.impressions) || 0,
            cliques: Number(l.inline_link_clicks ?? l.clicks) || 0,
            conversoes: lerAcao(l.actions, tipos),
            receita: lerAcao(l.action_values, tipos),
            frequencia: Number(l.frequency) || 0,
          };
        }
      }
      const vazia = { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 };
      const orc = (o) => (o.daily_budget ? { valor: Number(o.daily_budget) / 100, editavel: true } : o.lifetime_budget ? { valor: Number(o.lifetime_budget) / 100, editavel: false, total: true } : null);
      const out = [];
      for (const c of campanhas) out.push({ plataforma: "meta", nivel: "campanha", id: c.id, nome: c.name, status: STATUS(c.effective_status), statusBruto: c.effective_status, configurado: c.status, campanhaId: c.id, orcamento: orc(c), objetivo: c.objective });
      for (const s of conjuntos) out.push({ plataforma: "meta", nivel: "conjunto", id: s.id, nome: s.name, status: STATUS(s.effective_status), statusBruto: s.effective_status, configurado: s.status, paiId: s.campaign_id, campanhaId: s.campaign_id, orcamento: orc(s) });
      for (const a of anuncios) {
        const m = metricas[a.id] || {};
        out.push({
          plataforma: "meta", nivel: "anuncio", id: a.id, nome: a.name, status: STATUS(a.effective_status), statusBruto: a.effective_status, configurado: a.status,
          paiId: a.adset_id, campanhaId: a.campaign_id, thumb: a.creative?.thumbnail_url || "", texto: a.creative?.body || "", titulo: a.creative?.title || "",
          metricas: { hoje: m.hoje || { ...vazia }, d3: m.d3 || { ...vazia }, d7: m.d7 || { ...vazia } },
        });
      }
      return out;
    },

    // Gasto por dia e por anúncio (para o Debian Analytics)
    async gastosDiarios(conta, desde, ate) {
      const linhas = await get(`${act(conta)}/insights`, {
        level: "ad", time_range: { since: desde, until: ate }, time_increment: 1, limit: 500,
        fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,date_start",
      }, { todos: true, maxPaginas: 60 });
      return linhas.map((l) => ({
        dia: l.date_start, chave: `meta:${l.ad_id}`, gasto: Number(l.spend) || 0, impressoes: Number(l.impressions) || 0, cliques: Number(l.inline_link_clicks) || 0,
        nomes: { anuncio: l.ad_name, conjunto: l.adset_name, conjuntoId: l.adset_id, campanha: l.campaign_name, campanhaId: l.campaign_id },
      }));
    },

    async mudarStatus(id, ativo) { return post(id, { status: ativo ? "ACTIVE" : "PAUSED" }); },
    async mudarOrcamento(id, valorDia) {
      const centavos = Math.round(Number(valorDia) * 100);
      if (!(centavos > 0)) throw new Error("Orçamento inválido");
      return post(id, { daily_budget: centavos });
    },

    async enviarImagem(conta, arquivo) {
      const r = await postArquivo(`${act(conta)}/adimages`, "filename", arquivo);
      const img = Object.values(r.images || {})[0];
      if (!img || !img.hash) throw new Error("A Meta não devolveu o hash da imagem.");
      return img.hash;
    },

    async enviarVideo(conta, arquivo, { esperarSeg = 180 } = {}) {
      const r = await postArquivo(`${act(conta)}/advideos`, "source", arquivo, { name: path.basename(arquivo) });
      const id = r.id;
      const fim = Date.now() + esperarSeg * 1000;
      let thumb = "";
      while (Date.now() < fim) {
        await new Promise((x) => setTimeout(x, 5000));
        const v = await get(id, { fields: "status,picture,thumbnails{uri,is_preferred}" });
        const pronto = v.status && (v.status.video_status === "ready" || v.status.processing_progress === 100);
        const ts = v.thumbnails?.data || [];
        thumb = (ts.find((t) => t.is_preferred) || ts[0] || {}).uri || v.picture || thumb;
        if (v.status?.video_status === "error") throw new Error("A Meta não conseguiu processar o vídeo " + path.basename(arquivo));
        if (pronto && thumb) break;
      }
      if (!thumb) throw new Error("O vídeo ainda está sendo processado pela Meta. Tente criar a campanha de novo em alguns minutos.");
      return { id, thumb };
    },

    // Cria campanha (orçamento na campanha) + 1 conjunto (público Advantage+) + 1 anúncio por criativo. Tudo PAUSADO.
    async criarCampanha(conta, s, aoProgresso = () => {}) {
      const ev = EVENTOS[s.evento] || EVENTOS.PURCHASE;
      const criados = { campanha: null, conjunto: null, anuncios: [], erros: [] };
      const tag = s.tag || "[AG]";
      aoProgresso("Criando campanha…");
      const camp = await post(`${act(conta)}/campaigns`, {
        name: `${tag} ${s.nome}`, objective: ev.objetivo, status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION",
        daily_budget: Math.round(Number(s.orcamentoDiario) * 100), bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      });
      criados.campanha = camp.id;
      aoProgresso("Criando conjunto de anúncios…");
      const targeting = {
        geo_locations: { countries: (s.paises && s.paises.length ? s.paises : ["BR"]).map((p) => p.toUpperCase()) },
        age_min: Math.min(25, Math.max(18, Number(s.idadeMin) || 18)),
        targeting_automation: { advantage_audience: 1 },
      };
      const conj = await post(`${act(conta)}/adsets`, {
        name: `${tag} ${s.nome} · Advantage+`, campaign_id: camp.id, status: "PAUSED",
        billing_event: "IMPRESSIONS", optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE",
        promoted_object: { pixel_id: s.pixelId, custom_event_type: s.evento || "PURCHASE" }, targeting,
      });
      criados.conjunto = conj.id;
      let i = 0;
      for (const c of s.criativos || []) {
        i++;
        try {
          aoProgresso(`Enviando criativo ${i} de ${s.criativos.length}…`);
          const cta = { type: CTAS.includes(c.cta || s.cta) ? (c.cta || s.cta) : "LEARN_MORE", value: { link: s.link } };
          let spec;
          if (/\.(mp4|mov|m4v|webm)$/i.test(c.arquivo)) {
            const v = await this.enviarVideo(conta, c.arquivo);
            spec = { page_id: s.paginaId, video_data: { video_id: v.id, image_url: v.thumb, message: c.texto || "", title: c.titulo || "", link_description: c.descricao || "", call_to_action: cta } };
          } else {
            const hash = await this.enviarImagem(conta, c.arquivo);
            spec = { page_id: s.paginaId, link_data: { image_hash: hash, link: s.link, message: c.texto || "", name: c.titulo || "", description: c.descricao || "", call_to_action: cta } };
          }
          if (s.instagramId) spec.instagram_user_id = s.instagramId;
          const cri = await post(`${act(conta)}/adcreatives`, { name: `${tag} ${s.nome} · criativo ${i}`, object_story_spec: spec, url_tags: s.urlTags || UTM_META });
          const anuncio = await post(`${act(conta)}/ads`, { name: `${tag} ${s.nome} · AD${String(i).padStart(2, "0")}`, adset_id: conj.id, creative: { creative_id: cri.id }, status: "PAUSED" });
          criados.anuncios.push(anuncio.id);
        } catch (e) {
          criados.erros.push(`Criativo ${i} (${path.basename(c.arquivo || "")}): ${e.message}`);
        }
      }
      return criados;
    },

    async ativarCampanha(campanhaId) {
      const conjs = await get(`${campanhaId}/adsets`, { fields: "id", limit: 100 }, { todos: true });
      const ads = await get(`${campanhaId}/ads`, { fields: "id", limit: 300 }, { todos: true });
      for (const a of ads) await post(a.id, { status: "ACTIVE" });
      for (const s of conjs) await post(s.id, { status: "ACTIVE" });
      await post(campanhaId, { status: "ACTIVE" });
      return { conjuntos: conjs.length, anuncios: ads.length };
    },
  };
}
