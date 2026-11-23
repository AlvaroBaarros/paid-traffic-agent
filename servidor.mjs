// Node 18+ é obrigatório (fetch, FormData e Blob nativos).
if (Number(process.versions.node.split(".")[0]) < 18) {
  console.log(`\nSeu Node.js é a versão ${process.version}. O Paid Traffic Agent precisa da 18 ou mais nova: https://nodejs.org\n`);
  process.exit(1);
}
// Roda o Paid Traffic Agent no seu computador: abre o painel em http://localhost:3000,
// executa o robô quando você clica em "Minerar agora" e, se ficar aberto, minera todo dia às 8h.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as agente from "./trafego/agente.mjs";
import { promptCriativos, promptAnalise, gerarComClaude, extrairJson } from "./trafego/criativos.mjs";
import * as analytics from "./analytics/central.mjs";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PACOTE = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const VERSAO = PACOTE.version;
const versao = { atual: VERSAO, nova: null, link: null };

// Avisa quando sair uma versão nova no GitHub (Releases).
function repoGitHub() {
  const u = String((PACOTE.repository && (PACOTE.repository.url || PACOTE.repository)) || "");
  const m = u.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
const maior = (a, b) => {
  const p = (v) => String(v).replace(/^v/, "").split(/[.-]/).map((x) => (isNaN(+x) ? x : +x));
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return !/beta|alpha|rc/.test(String(a)) && /beta|alpha|rc/.test(String(b));
};
async function checarAtualizacao() {
  const repo = repoGitHub();
  if (!repo || process.env.MOCK_ADS) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "paid-traffic-agent" } });
    if (!r.ok) return;
    const j = ((await r.json()) || []).find((x) => !x.draft) || {};
    if (j.tag_name && maior(j.tag_name, VERSAO)) {
      Object.assign(versao, { nova: j.tag_name.replace(/^v/, ""), link: j.html_url });
      console.log(`⬆️  Nova versão disponível: ${j.tag_name} → ${j.html_url}`);
    }
  } catch { /* sem internet: tudo bem */ }
}
checarAtualizacao();
setInterval(checarAtualizacao, 12 * 36e5);
agente.configurar({ raiz: RAIZ });
analytics.configurar({ raiz: RAIZ });
if (process.env.MOCK_ADS) { const f = (await import("./test/mock-ads.mjs")).instalarMockAds(); agente.configurar({ fetchFn: f }); analytics.configurar({ fetchFn: f }); } // só para testes
const PORTA = Number(process.env.PORTA || 3000);
const HORA_DIARIA = process.env.HORA_DIARIA === "off" ? null : Number(process.env.HORA_DIARIA || 8);

const TIPOS = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

const estado = { rodando: false, palavras: "", inicio: null, fim: null, ok: null, log: [], ultimaDiaria: null };

function minerar({ palavras = "", pais = "", nicho = "", acompanhar = true } = {}) {
  if (estado.rodando) return false;
  Object.assign(estado, { rodando: true, palavras: palavras || "todas as acompanhadas", inicio: new Date().toISOString(), fim: null, ok: null, log: [] });
  const filho = spawn(process.execPath, [path.join(RAIZ, "scripts", "minerar.mjs")], {
    cwd: RAIZ,
    env: { ...process.env, PALAVRAS: palavras, PAIS: pais, NICHO: nicho, ACOMPANHAR: String(acompanhar), GITHUB_REPOSITORY: "" },
  });
  const anotar = (b) => {
    for (const linha of String(b).split(/\r?\n/)) if (linha.trim()) { estado.log.push(linha); process.stdout.write("   " + linha + "\n"); }
    if (estado.log.length > 300) estado.log.splice(0, estado.log.length - 300);
  };
  filho.stdout.on("data", anotar);
  filho.stderr.on("data", anotar);
  filho.on("close", (codigo) => { Object.assign(estado, { rodando: false, fim: new Date().toISOString(), ok: codigo === 0 }); });
  return true;
}

function enviarArquivo(req, res, arquivo) {
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Não encontrado"); }
    const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range && tipo === "video/mp4") {
      const ini = range[1] ? Number(range[1]) : 0;
      const fim = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fim}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": fim - ini + 1 });
      return fs.createReadStream(arquivo, { start: ini, end: fim }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": tipo, "Content-Length": st.size, "Cache-Control": "no-store", ...(tipo === "video/mp4" ? { "Accept-Ranges": "bytes" } : {}) });
    fs.createReadStream(arquivo).pipe(res);
  });
}

function dentro(base, rel) {
  const alvo = path.resolve(base, "." + path.sep + rel);
  return alvo.startsWith(path.resolve(base) + path.sep) ? alvo : null;
}

function json(res, codigo, obj) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req, limite = 200000) {
  return new Promise((ok, falha) => {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > limite) { falha(new Error("Pedido grande demais")); req.destroy(); } });
    req.on("end", () => { try { ok(corpo ? JSON.parse(corpo) : {}); } catch { ok({}); } });
    req.on("error", falha);
  });
}
// Só aceita pedidos do próprio painel (evita que outro site aberto no navegador mexa nas suas campanhas).
function pedidoSeguro(req) {
  const host = String(req.headers.host || "");
  if (!new RegExp(`^(localhost|127\\.0\\.0\\.1):${PORTA}$`).test(host)) return false;
  if (req.method !== "GET") {
    if (req.headers["x-minerador"] !== "1") return false;
    const origem = req.headers.origin;
    if (origem && !new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${PORTA}$`).test(origem)) return false;
  }
  return true;
}

const criacao = { rodando: false, etapa: "", resultado: null, erro: null };

async function rotaTrafego(req, res, p, url) {
  const r = p.slice("/api/trafego/".length);
  const M = req.method;
  if (r === "config" && M === "GET") return json(res, 200, await agente.configMascarada());
  if (r === "config" && M === "POST") return json(res, 200, await agente.salvarConfig(await lerCorpo(req)));
  if (r === "estado" && M === "GET") return json(res, 200, { ...(await agente.estado()), ocupado: agente.estaOcupado() });
  if (r === "ciclo" && M === "POST") return json(res, 200, await agente.ciclo());
  if (r === "decidir" && M === "POST") { const b = await lerCorpo(req); return json(res, 200, await agente.decidir(b.id, b.decisao)); }
  if (r === "acao" && M === "POST") return json(res, 200, await agente.acaoManual(await lerCorpo(req)));
  if (r === "gerenciar" && M === "POST") { const b = await lerCorpo(req); return json(res, 200, await agente.gerenciar(b.chave, !!b.sim)); }

  if (r === "testar" && M === "POST") {
    const b = await lerCorpo(req);
    const cli = agente.clientes(await agente.carregarConfig());
    if (b.plataforma === "meta") {
      if (!cli.meta) throw new Error("Cole o token da Meta e salve primeiro.");
      const eu = await cli.meta.eu();
      return json(res, 200, { ok: true, usuario: eu.name, contas: await cli.meta.contas() });
    }
    if (b.plataforma === "google") {
      if (!cli.google) throw new Error("Preencha todos os campos do Google e salve primeiro.");
      return json(res, 200, { ok: true, conta: await cli.google.testar() });
    }
    if (b.plataforma === "claude") {
      const c = await agente.carregarConfig();
      const t = await gerarComClaude({ apiKey: c.claude.apiKey, modelo: c.claude.modelo || undefined, prompt: "Responda só: ok", maxTokens: 10 });
      return json(res, 200, { ok: true, resposta: t });
    }
    throw new Error("Plataforma desconhecida");
  }
  if (r === "meta/ativos" && M === "GET") {
    const c = await agente.carregarConfig();
    const cli = agente.clientes(c);
    if (!cli.meta || !c.meta.contaId) throw new Error("Conecte a Meta e escolha a conta de anúncios.");
    return json(res, 200, await cli.meta.ativos(c.meta.contaId));
  }
  if (r === "upload" && M === "POST") {
    const nome = path.basename(String(url.searchParams.get("nome") || "")).replace(/[^\w.\-]+/g, "_").slice(0, 120);
    if (!/\.(mp4|mov|m4v|webm|jpg|jpeg|png|webp)$/i.test(nome)) throw new Error("Envie vídeo (mp4, mov) ou imagem (jpg, png).");
    await fs.promises.mkdir(agente.pastaCriativos(), { recursive: true });
    const destino = path.join(agente.pastaCriativos(), Date.now() + "_" + nome);
    await new Promise((ok, falha) => {
      let tam = 0;
      const out = fs.createWriteStream(destino);
      req.on("data", (c) => { tam += c.length; if (tam > 1024 * 1024 * 1024) { req.destroy(); out.destroy(); falha(new Error("Arquivo acima de 1 GB")); } });
      req.pipe(out);
      out.on("finish", ok);
      out.on("error", falha);
    });
    return json(res, 200, { ok: true, arquivo: path.basename(destino) });
  }
  if (r === "meta/criar" && M === "POST") {
    if (criacao.rodando) throw new Error("Já existe uma campanha sendo criada.");
    const spec = await lerCorpo(req, 2000000);
    const c = await agente.carregarConfig();
    const cli = agente.clientes(c);
    if (!cli.meta || !c.meta.contaId) throw new Error("Conecte a Meta e escolha a conta de anúncios.");
    for (const k of ["nome", "link", "paginaId", "pixelId"]) if (!spec[k]) throw new Error(`Falta preencher: ${k}`);
    if (!(Number(spec.orcamentoDiario) > 0)) throw new Error("Informe o orçamento diário.");
    if (!/^https?:\/\//i.test(spec.link)) throw new Error("O link precisa começar com https://");
    spec.criativos = (spec.criativos || []).map((x) => ({ ...x, arquivo: path.join(agente.pastaCriativos(), path.basename(String(x.arquivo || ""))) }));
    if (!spec.criativos.length) throw new Error("Adicione pelo menos um criativo.");
    Object.assign(criacao, { rodando: true, etapa: "Começando…", resultado: null, erro: null });
    cli.meta.criarCampanha(c.meta.contaId, spec, (etapa) => { criacao.etapa = etapa; })
      .then(async (resultado) => {
        criacao.resultado = resultado;
        if (resultado.campanha) await agente.gerenciar(`meta:${resultado.campanha}`, true).catch(() => {});
      })
      .catch((e) => { criacao.erro = e.message; })
      .finally(() => { criacao.rodando = false; });
    return json(res, 202, { ok: true });
  }
  if (r === "meta/criar/status" && M === "GET") return json(res, 200, criacao);
  if (r === "meta/ativar" && M === "POST") {
    const b = await lerCorpo(req);
    const cli = agente.clientes(await agente.carregarConfig());
    if (!cli.meta) throw new Error("Meta não conectada.");
    return json(res, 200, await cli.meta.ativarCampanha(String(b.campanhaId)));
  }
  if (r === "criativos/gerar" && M === "POST") {
    const b = await lerCorpo(req, 2000000);
    const c = await agente.carregarConfig();
    if (b.usarApi && c.claude.apiKey) {
      const texto = await gerarComClaude({ apiKey: c.claude.apiKey, modelo: c.claude.modelo || undefined, prompt: promptCriativos({ ...b, formato: "json" }) });
      return json(res, 200, { resultado: extrairJson(texto) });
    }
    return json(res, 200, { prompt: promptCriativos({ ...b, formato: "texto" }) });
  }
  if (r === "analise" && M === "POST") {
    const b = await lerCorpo(req);
    const c = await agente.carregarConfig();
    const est = await agente.estado();
    const prompt = promptAnalise({ resumo: est.resumo, diagnostico: est.diagnostico, entidades: est.entidades, regras: c.regras });
    if (b.usarApi && c.claude.apiKey) return json(res, 200, { texto: await gerarComClaude({ apiKey: c.claude.apiKey, modelo: c.claude.modelo || undefined, prompt, maxTokens: 4000 }) });
    return json(res, 200, { prompt });
  }
  return json(res, 404, { erro: "Rota não encontrada" });
}

async function rotaAnalytics(req, res, p, url) {
  const r = p.slice("/api/analytics/".length);
  const M = req.method;
  if (r === "integracoes" && M === "GET") return json(res, 200, await analytics.painelIntegracoes());
  if (r === "config" && M === "POST") return json(res, 200, await analytics.salvar(await lerCorpo(req)));
  if (r === "testar" && M === "POST") { const b = await lerCorpo(req); return json(res, 200, await analytics.testarReceptor(b.url)); }
  if (r === "sincronizar" && M === "POST") {
    const out = { vendas: null, gastos: null, erros: [] };
    try { out.vendas = await analytics.sincronizarVendas(); } catch (e) { out.erros.push("Vendas: " + e.message); }
    try { out.gastos = await analytics.sincronizarGastos(); } catch (e) { out.erros.push("Gastos: " + e.message); }
    return json(res, 200, out);
  }
  if (r === "relatorio" && M === "GET") {
    const q = Object.fromEntries(url.searchParams);
    return json(res, 200, await analytics.gerarRelatorio({ ...q, incluirTestes: q.testes === "1" }));
  }
  if (r === "vendas" && M === "GET") return json(res, 200, await analytics.listarVendas(Object.fromEntries(url.searchParams)));
  if (r === "simular" && M === "POST") return json(res, 200, await analytics.simularVenda());
  if (r === "apagar-testes" && M === "POST") return json(res, 200, await analytics.apagarTestes());
  return json(res, 404, { erro: "Rota não encontrada" });
}

// Webhook direto no computador (útil para testes ou com um túnel). Protegido pelo segredo na URL.
async function rotaWebhook(req, res, p, url) {
  const [, , segredo, plataforma = "generico"] = p.split("/");
  const a = await analytics.config();
  if (!segredo || segredo !== a.segredo) return json(res, 404, { erro: "não encontrado" });
  if (req.method === "GET") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Webhook do Paid Traffic Agent ativo ✓"); }
  let corpo = "";
  await new Promise((ok, falha) => { req.on("data", (c) => { corpo += c; if (corpo.length > 300000) { req.destroy(); falha(new Error("grande")); } }); req.on("end", ok); req.on("error", falha); });
  const cab = {};
  for (const k of ["content-type", "x-hotmart-hottok", "x-kiwify-digital-signature", "x-cakto-signature", "x-cakto-timestamp"]) if (req.headers[k]) cab[k] = req.headers[k];
  await analytics.processarEventos([{ plataforma: plataforma.slice(0, 30), corpo, tipo: req.headers["content-type"] || "", query: url.search, cabecalhos: cab, recebido: new Date().toISOString() }]);
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);

  if (p.startsWith("/webhook/")) { rotaWebhook(req, res, p, url).catch((e) => json(res, 400, { erro: e.message })); return; }

  if (p.startsWith("/api/")) {
    if (!pedidoSeguro(req)) return json(res, 403, { erro: "Pedido bloqueado por segurança." });
    if (p.startsWith("/api/trafego/")) {
      rotaTrafego(req, res, p, url).catch((e) => json(res, 400, { erro: e.message }));
      return;
    }
    if (p.startsWith("/api/analytics/")) {
      rotaAnalytics(req, res, p, url).catch((e) => json(res, 400, { erro: e.message }));
      return;
    }
  }

  if (p === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ local: true, versao, ...estado, log: estado.log.slice(-15) }));
  }
  if (p === "/api/minerar" && req.method === "POST") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on("end", () => {
      let dados = {};
      try { dados = JSON.parse(corpo || "{}"); } catch {}
      const ok = minerar({
        palavras: String(dados.palavras || "").slice(0, 500),
        pais: String(dados.pais || "").slice(0, 3),
        nicho: String(dados.nicho || "").slice(0, 60),
        acompanhar: dados.acompanhar !== false,
      });
      res.writeHead(ok ? 202 : 409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok, mensagem: ok ? "Mineração iniciada" : "Já existe uma mineração rodando" }));
    });
    return;
  }
  if (p === "/" || p === "/index.html") return enviarArquivo(req, res, path.join(RAIZ, "site", "index.html"));
  if (p === "/vendor/chart.umd.js") return enviarArquivo(req, res, path.join(RAIZ, "node_modules", "chart.js", "dist", "chart.umd.js"));
  if (p.startsWith("/data/")) { const a = dentro(path.join(RAIZ, "data"), p.slice(6)); return a ? enviarArquivo(req, res, a) : res.writeHead(404).end(); }
  if (p.startsWith("/videos/")) { const a = dentro(path.join(RAIZ, "videos"), p.slice(8)); return a ? enviarArquivo(req, res, a) : res.writeHead(404).end(); }
  const a = dentro(path.join(RAIZ, "site"), p.slice(1));
  return a ? enviarArquivo(req, res, a) : res.writeHead(404).end();
});

servidor.listen(PORTA, "127.0.0.1", () => {
  const link = `http://localhost:${PORTA}`;
  console.log(`\n🐉  Paid Traffic Agent v${VERSAO} rodando em ${link}`);
  console.log(HORA_DIARIA === null ? "   Mineração diária desligada." : `   Enquanto esta janela ficar aberta, ele minera as palavras acompanhadas todo dia às ${HORA_DIARIA}h.`);
  console.log("   Para parar: feche esta janela ou aperte Ctrl+C.\n");
  if (!process.env.NAO_ABRIR) {
    const cmd = process.platform === "win32" ? `start "" "${link}"` : process.platform === "darwin" ? `open "${link}"` : `xdg-open "${link}"`;
    exec(cmd, () => {});
  }
});
servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.log(`A porta ${PORTA} já está em uso. O minerador já está aberto? Acesse http://localhost:${PORTA}`);
  else console.log("Erro no servidor:", e.message);
  process.exit(1);
});

// Piloto automático do tráfego: roda a cada N horas enquanto o servidor estiver aberto.
let ultimoCiclo = 0;
setInterval(async () => {
  try {
    const c = await agente.carregarConfig();
    const conectado = (c.meta.token && c.meta.contaId) || (c.google.refreshToken && c.google.customerId);
    if (!conectado || c.regras.modo === "desligado" || agente.estaOcupado()) return;
    const horas = Number(c.regras.intervaloCicloHoras) || 3;
    if (Date.now() - ultimoCiclo < horas * 36e5) return;
    ultimoCiclo = Date.now();
    const est = await agente.ciclo();
    const n = (est.pendentes || []).length, h = (est.historico || []).filter((x) => x.origem === "automatico" && Date.now() - Date.parse(x.em) < 6e5).length;
    console.log(`📈 Agente de tráfego: ${h} ação(ões) automática(s), ${n} sugestão(ões) esperando aprovação.`);
  } catch (e) {
    console.log("📈 Agente de tráfego: " + e.message);
  }
}, 10 * 60000);

// Debian Analytics: busca vendas a cada 2 min e gastos a cada 20 min enquanto o servidor estiver aberto.
let ultimaGastos = 0;
setInterval(async () => {
  try {
    const a = await analytics.config();
    if (a.workerUrl) {
      const r = await analytics.sincronizarVendas();
      if (r.novas) console.log(`💰 Debian Analytics: ${r.novas} venda(s) nova(s)!`);
    }
    const c = await agente.carregarConfig();
    const conectado = (c.meta.token && c.meta.contaId) || (c.google.refreshToken && c.google.customerId);
    if (conectado && Date.now() - ultimaGastos > 20 * 60000) { ultimaGastos = Date.now(); await analytics.sincronizarGastos(); }
  } catch (e) { console.log("💰 Debian Analytics: " + e.message); }
}, 2 * 60000);

if (HORA_DIARIA !== null) {
  setInterval(() => {
    const agora = new Date();
    const dia = agora.toDateString();
    if (agora.getHours() === HORA_DIARIA && estado.ultimaDiaria !== dia && !estado.rodando) {
      estado.ultimaDiaria = dia;
      console.log("⏰ Mineração diária começando…");
      minerar({});
    }
  }, 60000);
}
