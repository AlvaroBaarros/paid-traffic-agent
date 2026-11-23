// Robô minerador: abre a Biblioteca de Anúncios do Facebook, busca cada palavra-chave,
// agrupa os anúncios por oferta, conta anúncios ativos e salva tudo em data/.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hoje, analisarResposta, analisarHtml, normalizarAnuncio, agruparOfertas, lerNumeroResultados,
  bibliotecaAnunciante, bibliotecaBusca, registrarHistorico, normalizarPalavra, diasEntre,
  analisarFunil, sinaisEstrutura,
} from "./lib.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arq = (...p) => path.join(RAIZ, ...p);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = (a, b) => a + Math.random() * (b - a);

async function lerJson(caminho, padrao) {
  try { return JSON.parse(await fs.readFile(caminho, "utf8")); } catch { return padrao; }
}
async function gravarJson(caminho, valor) {
  await fs.mkdir(path.dirname(caminho), { recursive: true });
  await fs.writeFile(caminho, JSON.stringify(valor, null, 1) + "\n");
}

const cfg = await lerJson(arq("config.json"), {});
const DIA = hoje();
const PAIS_PADRAO = (process.env.PAIS || cfg.pais || "BR").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "BR";
const NICHO = String(process.env.NICHO || "").trim().slice(0, 60);
const ACOMPANHAR = String(process.env.ACOMPANHAR || "true") !== "false";
const REPO = process.env.GITHUB_REPOSITORY || "";

const dados = await lerJson(arq("data/ofertas.json"), { buscas: {}, ofertas: [] });
const historico = await lerJson(arq("data/historico.json"), { ofertas: {}, anunciantes: {} });
const videos = await lerJson(arq("data/videos.json"), {});
// Lista de buscas acompanhadas: [{palavra, pais, nicho}]
const monitoradas = (await lerJson(arq("data/monitoradas.json"), []))
  .map((m) => (typeof m === "string" ? { palavra: m, pais: PAIS_PADRAO, nicho: "" } : m))
  .filter((m) => m && m.palavra);
const chaveBusca = (b) => `${b.pais}:${b.palavra}`;

const pedidas = (process.env.PALAVRAS || "").split(/[,;\n]/).map(normalizarPalavra).filter(Boolean)
  .map((palavra) => ({ palavra, pais: PAIS_PADRAO, nicho: NICHO }));
let buscas;
if (pedidas.length) {
  buscas = pedidas;
  if (ACOMPANHAR) for (const b of pedidas) {
    const i = monitoradas.findIndex((m) => chaveBusca(m) === chaveBusca(b));
    if (i >= 0) monitoradas[i] = b; else monitoradas.push(b);
  }
} else {
  const daConfig = (cfg.palavrasChave || []).map((p) => (typeof p === "string" ? { palavra: normalizarPalavra(p), pais: PAIS_PADRAO, nicho: "" } : { palavra: normalizarPalavra(p.palavra), pais: (p.pais || PAIS_PADRAO).toUpperCase(), nicho: p.nicho || "" }));
  const mapa = new Map();
  for (const b of [...daConfig, ...monitoradas]) if (b.palavra) mapa.set(chaveBusca(b), b);
  buscas = [...mapa.values()];
}
buscas = buscas.slice(0, cfg.maxPalavrasPorExecucao ?? 20);
if (!buscas.length) {
  console.log("Nenhuma palavra-chave para minerar. Adicione em config.json ou rode o workflow com uma palavra.");
  process.exit(0);
}
console.log(`📅 ${DIA} · buscas: ${buscas.map((b) => `${b.palavra} (${b.pais})`).join(", ")}`);

async function abrirNavegador() {
  const opcoes = { headless: !process.env.MOSTRAR, args: ["--disable-blink-features=AutomationControlled"] };
  try { return await chromium.launch(opcoes); }
  catch (e) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(e.message)) throw e;
    console.log("O navegador do robô ainda não está instalado. Instalando agora (só uma vez)…");
    const { spawnSync } = await import("node:child_process");
    spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], { stdio: "inherit", shell: process.platform === "win32" });
    return chromium.launch(opcoes);
  }
}
const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  locale: "en-US",
  viewport: { width: 1366, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
});
if (process.env.MOCK_FB) (await import("../test/mock.mjs")).instalarMock(contexto); // só para testes locais
const pagina = await contexto.newPage();

let coletor = null; // Map que recebe anúncios das respostas enquanto uma busca está ativa
pagina.on("response", async (resp) => {
  if (!coletor) return;
  const url = resp.url();
  if (!url.includes("/api/graphql") && !url.includes("/ads/library/async")) return;
  try { analisarResposta(await resp.text(), coletor); } catch { /* resposta sem corpo */ }
});

async function recusarCookies() {
  // Escolhe sempre a opção que só permite cookies essenciais.
  for (const nome of [/decline optional cookies/i, /only allow essential cookies/i, /recusar cookies opcionais/i, /permitir somente cookies essenciais/i]) {
    const b = pagina.getByRole("button", { name: nome });
    if (await b.count().catch(() => 0)) { await b.first().click().catch(() => {}); await esperar(800); return; }
  }
}

async function textoPagina() {
  return pagina.innerText("body").catch(() => "");
}

// Plano B: se o Facebook mudar o formato dos dados, lê os cartões direto da tela.
async function lerCartoesDaTela() {
  return pagina.evaluate(() => {
    const saida = [];
    const vistos = new Set();
    const nos = [...document.querySelectorAll("span, div")].filter((el) => el.childElementCount === 0 && /^Library ID:\s*\d+/.test(el.textContent.trim()));
    for (const el of nos) {
      const id = el.textContent.match(/(\d{6,})/)?.[1];
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      let card = el;
      for (let i = 0; i < 12 && card.parentElement; i++) {
        card = card.parentElement;
        if (/Sponsored/.test(card.innerText) && card.querySelector("img, video")) break;
      }
      const t = card.innerText;
      const pag = [...card.querySelectorAll('a[href*="facebook.com/"]')].find((a) => !/ads\/library|l\.php/.test(a.href) && a.textContent.trim());
      const ext = [...card.querySelectorAll("a[href]")].find((a) => /l\.facebook\.com\/l\.php|^https?:\/\/(?!([^/]*\.)?facebook\.com)/.test(a.href));
      const video = card.querySelector("video");
      const img = [...card.querySelectorAll("img")].sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
      let pageId = "";
      try { pageId = pag ? new URL(pag.href).pathname.split("/").filter(Boolean)[0] : ""; } catch {}
      const inicio = t.match(/Started running on ([A-Za-z]{3} \d{1,2}, \d{4})/)?.[1];
      saida.push({
        ad_archive_id: id,
        page_id: pageId,
        page_name: pag ? pag.textContent.trim() : "",
        is_active: /\bActive\b/.test(t),
        start_date: inicio ? Math.floor(Date.parse(inicio) / 1000) : null,
        collation_count: Number(t.match(/(\d+) ads? use this creative/)?.[1] || 1),
        snapshot: {
          body: { text: card.querySelector('[style*="pre-wrap"]')?.innerText || "" },
          link_url: ext ? ext.href : "",
          videos: video ? [{ video_hd_url: video.currentSrc || video.src, video_preview_image_url: video.poster }] : [],
          images: img ? [{ original_image_url: img.src }] : [],
        },
      });
    }
    return saida;
  });
}

async function minerarPalavra(palavra, pais) {
  const mapa = new Map();
  coletor = mapa;
  const url = bibliotecaBusca(palavra, pais);
  console.log(`\n🔎 "${palavra}" · ${pais}`);
  await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await esperar(4000);
  await recusarCookies();
  analisarHtml(await pagina.content(), mapa);

  let total = null;
  for (let i = 0; i < 6 && total === null; i++) {
    total = lerNumeroResultados(await textoPagina());
    if (total === null) await esperar(1500);
  }

  const limite = cfg.anunciosPorBusca ?? 300;
  let parado = 0;
  for (let i = 0; i < (cfg.maxRolagens ?? 40) && mapa.size < limite; i++) {
    const antes = mapa.size;
    await pagina.mouse.wheel(0, 4000);
    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await esperar(aleatorio(1400, 2400));
    if (mapa.size === antes) { if (++parado >= 5) break; } else parado = 0;
  }

  if (mapa.size === 0) {
    for (const n of await lerCartoesDaTela().catch(() => [])) mapa.set(String(n.ad_archive_id), n);
    if (mapa.size) console.log("   (dados lidos direto da tela — modo reserva)");
  }
  coletor = null;

  const anuncios = [...mapa.values()].map(normalizarAnuncio);
  console.log(`   ${total ?? "?"} resultados na biblioteca · ${anuncios.length} anúncios coletados`);
  if (!anuncios.length) {
    await fs.mkdir(arq("out/debug"), { recursive: true });
    await pagina.screenshot({ path: arq("out/debug", `${palavra.replace(/[^a-z0-9]+/gi, "_")}.png`), fullPage: false }).catch(() => {});
  }
  return { total, anuncios };
}

const contagensExecucao = {};
const contagensPorPais = {};
async function contarAnunciante(pageId, pais) {
  if (!/^\d+$/.test(pageId)) return null;
  const cache = (contagensPorPais[pais] ||= {});
  if (pageId in cache) return cache[pageId];
  let n = null;
  try {
    await pagina.goto(bibliotecaAnunciante(pageId, pais), { waitUntil: "domcontentloaded", timeout: 45000 });
    for (let i = 0; i < 6 && n === null; i++) {
      await esperar(1500);
      n = lerNumeroResultados(await textoPagina());
    }
  } catch (e) {
    console.log(`   ⚠️ não consegui contar o anunciante ${pageId}: ${e.message}`);
  }
  cache[pageId] = n;
  if (n !== null) contagensExecucao[pageId] = n;
  return n;
}

// Abre o link do anúncio e descobre o tipo de funil e a plataforma de checkout.
const funisExecucao = new Map();
const funisAnteriores = new Map(dados.ofertas.filter((o) => o.funil && o.link).map((o) => [o.link, o.funil]));
async function analisarLink(link) {
  if (!link || !/^https?:\/\//i.test(link)) return null;
  if (funisExecucao.has(link)) return funisExecucao.get(link);
  const anterior = funisAnteriores.get(link);
  if (anterior && anterior.verificadoEm && diasEntre(anterior.verificadoEm, DIA) < (cfg.funil?.revisarAposDias ?? 7)) {
    funisExecucao.set(link, anterior);
    return anterior;
  }
  const aba = await contexto.newPage();
  let res = null;
  try {
    await aba.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });
    await aba.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const info = await aba.evaluate(() => ({
      html: document.documentElement.outerHTML.slice(0, 1500000),
      titulo: document.title,
      links: [
        ...[...document.querySelectorAll("a[href]")].map((a) => a.href),
        ...[...document.querySelectorAll("form[action]")].map((f) => f.action),
        ...[...document.querySelectorAll("iframe[src], script[src]")].map((e) => e.src),
      ].slice(0, 3000),
    }));
    res = analisarFunil({ ...info, urlFinal: aba.url() });
    res.verificadoEm = DIA;
  } catch (e) {
    res = { tipo: "Não abriu", checkout: null, linkCheckout: "", pixelMeta: false, urlFinal: "", titulo: "", erro: e.message.slice(0, 120), verificadoEm: DIA };
  } finally {
    await aba.close().catch(() => {});
  }
  funisExecucao.set(link, res);
  return res;
}

const resultados = {};
for (const busca of buscas) {
  const { palavra, pais, nicho } = busca;
  const chave = chaveBusca(busca);
  try {
    const { total, anuncios } = await minerarPalavra(palavra, pais);
    const previa = agruparOfertas(anuncios, { palavra, pais, dia: DIA, historico, cfg, nichoFixo: nicho });
    const topo = [...new Set(previa.map((o) => o.pageId))].slice(0, cfg.anunciantesContadosPorBusca ?? 15);
    for (const id of topo) {
      await contarAnunciante(id, pais);
      await esperar(aleatorio(800, 1800));
    }
    const minSalvar = cfg.minAnunciosParaSalvar ?? 2;
    const ofertas = agruparOfertas(anuncios, { palavra, pais, dia: DIA, contagens: contagensPorPais[pais] || {}, historico, cfg, nichoFixo: nicho })
      .filter((o) => Math.max(o.anunciosOferta, o.anunciosAnunciante || 0) >= minSalvar);

    // Funil: abre as páginas das ofertas mais fortes
    const statusFunil = cfg.funil?.status || ["escalada", "escalando", "rodando", "teste"];
    const paraAbrir = ofertas.filter((o) => statusFunil.includes(o.status) && o.link).slice(0, cfg.funil?.maxPorBusca ?? 20);
    for (const o of paraAbrir) o.funil = await analisarLink(o.link);
    for (const o of ofertas) o.estrutura = sinaisEstrutura(o);

    const escaladas = ofertas.filter((o) => o.status === "escalada").length;
    console.log(`   ✅ ${ofertas.length} ofertas · ${escaladas} escaladas · ${paraAbrir.length} funis analisados`);
    resultados[chave] = { ...busca, total, coletados: anuncios.length, ofertas, ok: anuncios.length > 0 };
  } catch (e) {
    console.log(`   ❌ erro em "${palavra}": ${e.message}`);
    resultados[chave] = { ...busca, total: null, coletados: 0, ofertas: [], ok: false, erro: e.message };
  }
  await esperar(aleatorio(3000, 6000));
}
await navegador.close();

// ---------- Vídeos: guarda uma cópia dos vídeos das ofertas escaladas ----------
const cfgV = cfg.videos || {};
// No GitHub: vai para a release "videos". No computador: fica na pasta videos/.
const LOCAL = !REPO;
const pastaVideos = LOCAL ? arq("videos") : arq("out/videos");
if (cfgV.salvar !== false) {
  const statusSalvar = cfgV.status || ["escalada", "escalando"];
  const max = cfgV.maxPorExecucao ?? 20;
  const limiteBytes = (cfgV.tamanhoMaxMB ?? 95) * 1024 * 1024;
  const candidatas = Object.values(resultados).flatMap((r) => r.ofertas).filter((o) => statusSalvar.includes(o.status)).sort((a, b) => b.pontuacao - a.pontuacao);
  await fs.mkdir(pastaVideos, { recursive: true });
  let salvos = 0;
  for (const o of candidatas) {
    if (salvos >= max) break;
    const c = o.criativos.find((x) => x.video && !videos[x.id]);
    if (!c) continue;
    const fonte = c.video.hd || c.video.sd;
    try {
      const r = await fetch(fonte, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const tam = Number(r.headers.get("content-length") || 0);
      if (tam > limiteBytes) { console.log(`   vídeo ${c.id} grande demais (${Math.round(tam / 1048576)} MB), pulando`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > limiteBytes || buf.length < 10000) continue;
      await fs.writeFile(path.join(pastaVideos, `${c.id}.mp4`), buf);
      videos[c.id] = { url: LOCAL ? `videos/${c.id}.mp4` : `https://github.com/${REPO}/releases/download/videos/${c.id}.mp4`, anunciante: o.anunciante, oferta: o.chave, salvoEm: DIA, mb: +(buf.length / 1048576).toFixed(1) };
      salvos++;
    } catch (e) {
      console.log(`   ⚠️ não consegui baixar o vídeo ${c.id}: ${e.message}`);
    }
  }
  console.log(`\n🎬 ${salvos} vídeos novos salvos`);
}

// ---------- Junta com os dados anteriores ----------
const todasNovas = [];
const acompanhadas = new Set([...monitoradas.map(chaveBusca), ...(cfg.palavrasChave || []).map((p) => typeof p === "string" ? `${PAIS_PADRAO}:${normalizarPalavra(p)}` : `${(p.pais || PAIS_PADRAO).toUpperCase()}:${normalizarPalavra(p.palavra)}`)]);
for (const [chave, r] of Object.entries(resultados)) {
  dados.buscas[chave] = {
    palavra: r.palavra, pais: r.pais, nicho: r.nicho || "",
    totalResultados: r.total, anunciosColetados: r.coletados, ofertas: r.ofertas.length,
    escaladas: r.ofertas.filter((o) => o.status === "escalada").length,
    atualizadoEm: DIA, ok: r.ok, erro: r.erro || null,
    acompanhando: acompanhadas.has(chave),
  };
  if (r.ok) {
    dados.ofertas = dados.ofertas.filter((o) => !(o.palavra === r.palavra && o.pais === r.pais));
    todasNovas.push(...r.ofertas);
  }
}
dados.ofertas.push(...todasNovas);

// Remove buscas antigas que não estão mais sendo acompanhadas
const manter = cfg.manterBuscasDias ?? 30;
for (const [chave, b] of Object.entries(dados.buscas)) {
  b.acompanhando = acompanhadas.has(chave);
  if (!b.acompanhando && diasEntre(b.atualizadoEm, DIA) > manter) {
    delete dados.buscas[chave];
    dados.ofertas = dados.ofertas.filter((o) => !(o.palavra === b.palavra && o.pais === b.pais));
  }
}
for (const o of dados.ofertas) for (const c of o.criativos || []) if (videos[c.id]) c.videoSalvo = videos[c.id].url;

dados.atualizadoEm = new Date().toISOString();
dados.repo = REPO;
dados.config = { minAnuncios: cfg.minAnuncios ?? 5, escalada: cfg.escalada || {} };
registrarHistorico(historico, todasNovas, contagensExecucao, DIA, cfg.manterHistoricoDias ?? 60);

await gravarJson(arq("data/ofertas.json"), dados);
await gravarJson(arq("data/historico.json"), historico);
await gravarJson(arq("data/videos.json"), videos);
await gravarJson(arq("data/monitoradas.json"), monitoradas);

const falhas = Object.entries(resultados).filter(([, r]) => !r.ok).map(([p]) => p);
console.log(`\n🏁 Pronto: ${todasNovas.length} ofertas atualizadas${falhas.length ? ` · sem resultado em: ${falhas.join(", ")}` : ""}`);
if (falhas.length === buscas.length) {
  console.log("Nenhuma busca trouxe anúncios. O Facebook pode ter bloqueado o acesso desta vez; veja as capturas no artefato 'debug'.");
}
