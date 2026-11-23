// Funções puras do minerador: extrair anúncios, agrupar em ofertas e classificar.
// Separadas do robô para poderem ser testadas sem abrir o navegador.

export function hoje(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function diasEntre(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}

function texto(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v.text === "string") return v.text;
  if (v.markup && typeof v.markup.__html === "string") return v.markup.__html;
  return "";
}

function limparHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

// Placeholders de anúncios dinâmicos (ex.: {{product.name}}) não servem como texto.
function semPlaceholder(s) {
  return s && !/^\s*\{\{[^}]+\}\}\s*$/.test(s) ? s : "";
}

export function linkReal(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const u = new URL(url);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname.startsWith("/l.php")) {
      const alvo = u.searchParams.get("u");
      if (alvo) return alvo;
    }
    return url;
  } catch {
    return "";
  }
}

export function dominio(url) {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Percorre qualquer JSON e guarda os objetos que parecem anúncios da biblioteca.
export function coletarAnuncios(obj, saida, profundidade = 0) {
  if (!obj || typeof obj !== "object" || profundidade > 60) return;
  if (Array.isArray(obj)) {
    for (const item of obj) coletarAnuncios(item, saida, profundidade + 1);
    return;
  }
  if (obj.ad_archive_id && (obj.snapshot || obj.page_id)) {
    const id = String(obj.ad_archive_id);
    if (!saida.has(id)) saida.set(id, obj);
  }
  for (const k in obj) {
    const v = obj[k];
    if (v && typeof v === "object") coletarAnuncios(v, saida, profundidade + 1);
  }
}

// Lê respostas do Facebook (podem vir com "for (;;);" e várias linhas de JSON).
export function analisarResposta(textoBruto, saida) {
  if (!textoBruto) return 0;
  const antes = saida.size;
  const limpo = textoBruto.replace(/^for \(;;\);/, "");
  const partes = limpo.split(/\n(?=\{)/);
  for (const p of partes) {
    try {
      coletarAnuncios(JSON.parse(p), saida);
    } catch {
      /* linha que não é JSON: ignora */
    }
  }
  return saida.size - antes;
}

export function analisarHtml(html, saida) {
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes("ad_archive_id")) continue;
    try {
      coletarAnuncios(JSON.parse(m[1]), saida);
    } catch { /* ignora */ }
  }
}

export function normalizarAnuncio(n) {
  const s = n.snapshot || {};
  const cards = Array.isArray(s.cards) ? s.cards : [];
  const c0 = cards[0] || {};
  const videos = Array.isArray(s.videos) ? s.videos : [];
  const v0 = videos[0] || {};
  const imgs = Array.isArray(s.images) ? s.images : [];
  const i0 = imgs[0] || {};

  const videoHd = v0.video_hd_url || c0.video_hd_url || "";
  const videoSd = v0.video_sd_url || c0.video_sd_url || "";
  const thumb = v0.video_preview_image_url || c0.video_preview_image_url || i0.original_image_url || i0.resized_image_url || c0.original_image_url || c0.resized_image_url || "";

  const link = linkReal(s.link_url || c0.link_url || n.link_url || "");
  const corpo = semPlaceholder(limparHtml(texto(s.body))) || semPlaceholder(limparHtml(texto(c0.body)));
  const titulo = semPlaceholder(limparHtml(texto(s.title))) || semPlaceholder(limparHtml(texto(c0.title)));

  let inicio = "";
  if (n.start_date) {
    const t = Number(n.start_date);
    inicio = isFinite(t) && t > 1e9 ? new Date(t * 1000).toISOString().slice(0, 10) : String(n.start_date).slice(0, 10);
  }

  const pageId = String(n.page_id || s.page_id || "");
  return {
    id: String(n.ad_archive_id),
    pageId,
    anunciante: n.page_name || s.page_name || "",
    paginaUrl: s.page_profile_uri || (pageId ? `https://www.facebook.com/${pageId}` : ""),
    avatar: s.page_profile_picture_url || "",
    ativo: n.is_active !== false,
    inicio,
    criativosIguais: Math.max(1, Number(n.collation_count) || 1),
    grupo: n.collation_id ? String(n.collation_id) : String(n.ad_archive_id),
    plataformas: Array.isArray(n.publisher_platform) ? n.publisher_platform : [],
    texto: corpo.slice(0, 2000),
    titulo: titulo.slice(0, 200),
    legenda: limparHtml(texto(s.caption) || texto(c0.caption)).slice(0, 200),
    cta: s.cta_text || c0.cta_text || "",
    link,
    dominio: dominio(link),
    formato: s.display_format || "",
    video: videoHd || videoSd ? { hd: videoHd, sd: videoSd } : null,
    thumb,
  };
}

export function chaveOferta(ad) {
  if (ad.link) {
    try {
      const u = new URL(ad.link);
      const caminho = u.pathname.split("/").filter(Boolean).slice(0, 2).join("/").toLowerCase();
      return `${ad.pageId}|${dominio(ad.link)}/${caminho}`;
    } catch { /* cai no próximo */ }
  }
  return `${ad.pageId}|${(ad.titulo || ad.texto || ad.grupo).toLowerCase().replace(/\s+/g, " ").slice(0, 50)}`;
}

export function bibliotecaAnunciante(pageId, pais) {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(pais)}&view_all_page_id=${encodeURIComponent(pageId)}&search_type=page&media_type=all`;
}

export function bibliotecaBusca(palavra, pais) {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(pais)}&q=${encodeURIComponent(palavra)}&search_type=keyword_unordered&media_type=all`;
}

// Crescimento em % comparando com o registro mais próximo de 3 a 7 dias atrás.
export function crescimento(serie, valorHoje, dia) {
  if (!serie) return null;
  let melhor = null;
  for (const [d, v] of Object.entries(serie)) {
    const dist = diasEntre(d, dia);
    if (dist >= 3 && dist <= 7 && (melhor === null || dist < melhor.dist)) melhor = { dist, v: Number(v) };
  }
  if (!melhor || !(melhor.v > 0)) return null;
  return Math.round(((valorHoje - melhor.v) / melhor.v) * 100);
}

export function classificar(o, cfg) {
  const e = cfg.escalada || {};
  const minOferta = e.minAnunciosOferta ?? 15;
  const minAnunciante = e.minAnunciosAnunciante ?? 40;
  const minCresc = e.crescimentoEscalando ?? 30;
  const min = cfg.minAnuncios ?? 5;
  const a = o.anunciosAnunciante ?? 0;
  if (o.anunciosOferta >= minOferta || a >= minAnunciante) return "escalada";
  if (o.crescimento !== null && o.crescimento >= minCresc && o.anunciosOferta >= min) return "escalando";
  if (o.anunciosOferta >= min || a >= min) return "rodando";
  return "teste";
}

export function agruparOfertas(anuncios, { palavra, pais, dia, contagens = {}, historico = { ofertas: {} }, cfg = {}, nichoFixo = "" }) {
  const mapa = new Map();
  for (const ad of anuncios) {
    if (!ad.ativo || !ad.pageId) continue;
    const chave = chaveOferta(ad);
    let o = mapa.get(chave);
    if (!o) {
      o = { chave, pageId: ad.pageId, anunciante: ad.anunciante, paginaUrl: ad.paginaUrl, avatar: ad.avatar, grupos: new Map(), dominio: ad.dominio, link: ad.link };
      mapa.set(chave, o);
    }
    if (!o.avatar && ad.avatar) o.avatar = ad.avatar;
    const atual = o.grupos.get(ad.grupo);
    if (!atual || ad.criativosIguais > atual.criativosIguais) o.grupos.set(ad.grupo, ad);
  }

  const ofertas = [];
  for (const o of mapa.values()) {
    const ads = [...o.grupos.values()].sort((x, y) => y.criativosIguais - x.criativosIguais || (y.video ? 1 : 0) - (x.video ? 1 : 0));
    const anunciosOferta = ads.reduce((s, a) => s + a.criativosIguais, 0);
    const inicios = ads.map((a) => a.inicio).filter(Boolean).sort();
    const principal = ads.find((a) => a.titulo || a.texto) || ads[0];
    const oferta = {
      chave: `${pais}|${o.chave}`,
      palavra,
      pais,
      pageId: o.pageId,
      anunciante: o.anunciante,
      paginaUrl: o.paginaUrl,
      avatar: o.avatar,
      biblioteca: bibliotecaAnunciante(o.pageId, pais),
      link: o.link,
      dominio: o.dominio,
      titulo: principal.titulo || principal.legenda || "",
      cta: principal.cta || "",
      anunciosOferta,
      criativosDiferentes: ads.length,
      anunciosAnunciante: contagens[o.pageId] ?? null,
      inicioMaisAntigo: inicios[0] || "",
      diasRodando: inicios[0] ? Math.max(0, diasEntre(inicios[0], dia)) : null,
      temVideo: ads.some((a) => a.video),
      crescimento: crescimento(historico.ofertas?.[`${pais}|${o.chave}`], anunciosOferta, dia),
      criativos: ads.slice(0, cfg.maxCriativosPorOferta ?? 8).map((a) => ({
        id: a.id, inicio: a.inicio, criativosIguais: a.criativosIguais, texto: a.texto, titulo: a.titulo,
        cta: a.cta, link: a.link, formato: a.formato, video: a.video, thumb: a.thumb, plataformas: a.plataformas,
      })),
      atualizadoEm: dia,
    };
    const nichoTexto = detectarNicho(oferta.titulo, ...ads.slice(0, 4).map((a) => a.texto));
    oferta.nicho = nichoFixo || (nichoTexto !== "Outros" ? nichoTexto : detectarNicho(palavra));
    oferta.status = classificar(oferta, cfg);
    oferta.pontuacao = Math.round(anunciosOferta * 2 + (oferta.anunciosAnunciante || 0) * 0.5 + (oferta.diasRodando || 0) * 0.3 + Math.max(0, oferta.crescimento || 0) * 0.2);
    ofertas.push(oferta);
  }
  return ofertas.sort((a, b) => b.pontuacao - a.pontuacao);
}

export function lerNumeroResultados(textoPagina) {
  const m = String(textoPagina || "").match(/~?\s*([\d][\d.,\s]*)\s*(?:results?|resultados?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,\s]/g, ""));
  return isFinite(n) ? n : null;
}

export function registrarHistorico(historico, ofertas, contagens, dia, manterDias = 60) {
  historico.ofertas ||= {};
  historico.anunciantes ||= {};
  for (const o of ofertas) {
    (historico.ofertas[o.chave] ||= {})[dia] = o.anunciosOferta;
  }
  for (const [id, n] of Object.entries(contagens)) {
    if (n !== null && n !== undefined) (historico.anunciantes[id] ||= {})[dia] = n;
  }
  for (const grupo of [historico.ofertas, historico.anunciantes]) {
    for (const [k, serie] of Object.entries(grupo)) {
      for (const d of Object.keys(serie)) if (diasEntre(d, dia) > manterDias) delete serie[d];
      if (!Object.keys(serie).length) delete grupo[k];
    }
  }
  return historico;
}

export function normalizarPalavra(p) {
  return String(p || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

// ---------- Nicho ----------
const NICHOS = [
  ["Emagrecimento", /emagre|perder peso|barriga|gordura|dieta|quilos|\bkg\b|metabolismo|secar|seca barriga|jejum|low ?carb/i],
  ["Fitness", /treino|muscula|academia|hipertrofia|abdomin|gl[uú]teo|corrida|calistenia/i],
  ["Saúde", /diabet|press[aã]o alta|colesterol|dor (nas|no|na)|articula|pr[oó]stata|ciátic|intestin|imunidade|sa[uú]de|menopausa|tireoide|varizes|zumbido|vis[aã]o/i],
  ["Beleza", /pele|rugas|cabelo|calv|skin ?care|maquiagem|est[eé]tica|celulite|estrias|unhas/i],
  ["Renda extra", /renda extra|ganhar dinheiro|trabalhar de casa|home office|afiliad|dropshipping|tiktok shop|vender (no|na)|faturar|lucrar|primeira venda|marketing digital/i],
  ["Finanças", /investi|a[cç][oõ]es|bolsa de valores|cripto|bitcoin|d[ií]vida|cr[eé]dito|empr[eé]stimo|cart[aã]o|score|educa[cç][aã]o financeira/i],
  ["Relacionamento", /conquist|reconquist|ex-?namorad|namoro|casamento|relacionamento|sedu[cç]|atra[cç][aã]o|crush/i],
  ["Desenvolvimento pessoal", /ansiedade|autoestima|procrastina|foco|produtividade|h[aá]bito|disciplina|mente|depress|medita/i],
  ["Espiritualidade", /ora[cç][aã]o|b[ií]blia|deus|jesus|f[eé]\b|espiritual|salmo|manifesta|lei da atra|signo|tar[oô]|astrolog/i],
  ["Idiomas", /ingl[eê]s|espanhol|idioma|franc[eê]s|alem[aã]o|flu[eê]ncia/i],
  ["Concursos e estudos", /concurso|enem|vestibular|oab|faculdade|estudar|aprova[cç][aã]o/i],
  ["Maternidade e infantil", /beb[eê]|gestante|gravidez|maternidade|crian[cç]a|filhos|amamenta|autismo|tdah/i],
  ["Culinária", /receita|confeitaria|bolo|doces|culin[aá]ria|marmita|cozinha|salgados|p[aã]o/i],
  ["Pets", /cachorro|c[aã]o|gato|pet\b|pets|adestra/i],
  ["Artesanato e DIY", /croch[eê]|artesanato|costura|bordado|amigurumi|velas|sabonete|resina/i],
  ["Tecnologia e IA", /intelig[eê]ncia artificial|\bia\b|chatgpt|programa[cç][aã]o|excel|curso de tecnologia|app\b/i],
  ["Apostas e jogos", /aposta|bet\b|cassino|tigrinho|blaze|roleta/i],
];

export function detectarNicho(...textos) {
  const t = textos.filter(Boolean).join(" ");
  let melhor = null;
  for (const [nome, re] of NICHOS) {
    const n = (t.match(new RegExp(re.source, "gi")) || []).length;
    if (n && (!melhor || n > melhor.n)) melhor = { nome, n };
  }
  return melhor ? melhor.nome : "Outros";
}

// ---------- Funil ----------
const CHECKOUTS = [
  ["Hotmart", /pay\.hotmart\.com|hotmart\.com\/(product|checkout)|go\.hotmart\.com/i],
  ["Kiwify", /pay\.kiwify\.com\.br|kiwify\.com\.br\/[a-z0-9]/i],
  ["Eduzz", /sun\.eduzz\.com|eduzz\.com\/checkout|chk\.eduzz\.com/i],
  ["Monetizze", /app\.monetizze\.com\.br\/checkout|monetizze\.com\.br\/r\//i],
  ["Braip", /ev\.braip\.com|braip\.com\/checkout/i],
  ["PerfectPay", /checkout\.perfectpay\.com\.br|perfectpay\.com\.br\/checkout/i],
  ["Ticto", /checkout\.ticto\.app|ticto\.com\.br/i],
  ["Cakto", /pay\.cakto\.com\.br/i],
  ["Greenn", /payfast\.greenn\.com\.br|greenn\.com\.br\/checkout/i],
  ["Kirvano", /pay\.kirvano\.com/i],
  ["Lastlink", /lastlink\.com\/p\//i],
  ["Payt", /checkout\.payt\.com\.br/i],
  ["Appmax", /appmax\.com\.br/i],
  ["Yampi", /seguro\.[a-z0-9-]+\.com|yampi\.com\.br/i],
  ["Cartpanda", /cartpanda\.com/i],
  ["Shopify", /cdn\.shopify\.com|myshopify\.com|\/cart\b.*shopify/i],
  ["ClickBank", /clickbank\.net|hop\.clickbank|pay\.clickbank/i],
  ["Digistore24", /digistore24\.com/i],
  ["Stripe", /checkout\.stripe\.com|buy\.stripe\.com/i],
];

export function analisarFunil({ html = "", urlFinal = "", links = [], titulo = "" }) {
  const h = String(html);
  const tudo = h + "\n" + links.join("\n") + "\n" + urlFinal;
  let checkout = null, linkCheckout = "";
  for (const [nome, re] of CHECKOUTS) {
    if (re.test(tudo)) {
      checkout = nome;
      linkCheckout = links.find((l) => re.test(l)) || (re.test(urlFinal) ? urlFinal : "");
      break;
    }
  }
  let tipo = "Página de vendas";
  if (/wa\.me\/|api\.whatsapp\.com\/send/i.test(urlFinal)) tipo = "WhatsApp";
  else if (checkout && linkCheckout && linkCheckout === urlFinal) tipo = "Direto para o checkout";
  else if (/inlead\.digital|quiz|typeform\.com|respondi\.app|heyflow|perguntas?\s*\d|pergunta \d de/i.test(urlFinal + " " + h.slice(0, 200000))) tipo = "Quiz";
  else if (/converteai\.net|vturb|scripts\.converteai|pandavideo|player\.vimeo|wistia|smartplayer|vsl/i.test(h)) tipo = "VSL";
  else if (/<form[\s\S]{0,2000}(type=["']?email|name=["']?email)/i.test(h) && !checkout) tipo = "Captura de leads";
  else if (/not[ií]cia|reportagem|publicado em|portal de not/i.test(h.slice(0, 50000)) && h.length > 60000) tipo = "Advertorial";
  else if (/\/products?\/|add to cart|adicionar ao carrinho|comprar agora/i.test(h) && /shopify|yampi|cartpanda|woocommerce/i.test(h)) tipo = "Loja / E-commerce";

  return {
    tipo,
    checkout,
    linkCheckout,
    pixelMeta: /fbq\(|connect\.facebook\.net\/[^"']+fbevents/i.test(h),
    googleAds: /gtag\(|googletagmanager\.com/i.test(h),
    urlFinal,
    titulo: String(titulo || "").slice(0, 160),
  };
}

// "Estruturada" = oferta com funil completo e validada pelo tempo/volume.
export function sinaisEstrutura(o) {
  const f = o.funil || {};
  const sinais = {
    paginaPropria: !!(o.link && f.urlFinal && !/wa\.me|whatsapp/i.test(f.urlFinal)),
    checkout: !!f.checkout,
    pixel: !!f.pixelMeta,
    variosCriativos: (o.criativosDiferentes || 0) >= 3,
    rodando7dias: (o.diasRodando || 0) >= 7,
  };
  const pontos = Object.values(sinais).filter(Boolean).length;
  return { sinais, pontos, estruturada: pontos >= 4 };
}
