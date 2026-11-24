// Aba "Tráfego" do Paid Traffic Agent: agente de tráfego pago (Meta, Google, TikTok e Kwai).
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SIMB = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£" };
  const LOC = () => (window.I18N && window.I18N.lang === "en" ? "en-US" : "pt-BR");
  const LOCD = () => (window.I18N && window.I18N.lang === "en" ? "en-GB" : "pt-BR");
  const EN = () => !!(window.I18N && window.I18N.lang === "en");
  const brl = (n) => (n === null || n === undefined || isNaN(n) ? "–" : (SIMB[window.MO_MOEDA_ADS || window.MO_MOEDA] || "R$") + " " + Number(n).toLocaleString(LOC(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const NOME_P = { meta: "Meta", google: "Google", tiktok: "TikTok", kwai: "Kwai" };
  const PLATS = ["meta", "google", "tiktok", "kwai"];
  const mot = (a) => (EN() && a.motivoEn) || a.motivo || "";
  const optPlats = () => `<option value="">Todas as plataformas</option>` + PLATS.map((p) => `<option value="${p}">Só ${NOME_P[p]}</option>`).join("");
  const num = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString(LOCD(), { maximumFractionDigits: 1 }));
  const pct = (n) => (n === null || n === undefined ? "–" : n.toFixed(2).replace(".", EN() ? "." : ",") + "%");
  const toast = (m, e) => (window.MO && window.MO.toast ? window.MO.toast(m, e) : alert(m));
  const LS = { get(k, d) { try { const v = localStorage.getItem("mot_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("mot_" + k, JSON.stringify(v)); } catch {} } };

  async function api(caminho, opts = {}) {
    const r = await fetch("/api/trafego/" + caminho, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", "X-Minerador": "1" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Erro " + r.status);
    return j;
  }

  // ---------- métricas ----------
  const somar = (...ms) => ms.filter(Boolean).reduce((t, m) => ({ gasto: t.gasto + (+m.gasto || 0), impressoes: t.impressoes + (+m.impressoes || 0), cliques: t.cliques + (+m.cliques || 0), conversoes: t.conversoes + (+m.conversoes || 0), receita: t.receita + (+m.receita || 0), frequencia: Math.max(t.frequencia, +m.frequencia || 0) }), { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0, frequencia: 0 });
  const derivar = (m) => ({ ...m, ctr: m.impressoes ? (m.cliques / m.impressoes) * 100 : null, cpm: m.impressoes ? (m.gasto / m.impressoes) * 1000 : null, cpa: m.conversoes ? m.gasto / m.conversoes : null, roas: m.gasto && m.receita ? m.receita / m.gasto : null });
  const metr = (e, per) => derivar(per === "janela" ? somar(e.metricas?.hoje, e.metricas?.d3) : somar(e.metricas?.[per]));

  // ---------- estado ----------
  const S = { cfg: null, est: null, aba: LS.get("aba", "visao"), periodo: LS.get("periodo", "janela"), abertos: new Set(), refs: LS.get("refs", []), geradas: LS.get("geradas", null), criativosCamp: [], ativos: null, filtroPlat: "" };

  const ABAS = [["visao", "📊 Visão geral"], ["campanhas", "📋 Campanhas"], ["piloto", "🤖 Piloto automático"], ["ciclo", "🔄 Ciclo de criativos"], ["criar", "🚀 Criar campanha"], ["criativos", "✍️ Criativos & copy"], ["conexoes", "🔌 Conexões"], ["avisos", "🔔 Avisos"]];

  function estilos() {
    if ($("#tStyle")) return;
    const st = document.createElement("style");
    st.id = "tStyle";
    st.textContent = `
    .tnav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
    .tnav button{background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:8px 12px;border-radius:10px;font-weight:600}
    .tnav button.on{color:var(--text);border-color:var(--accent);background:rgba(34,197,94,.08)}
    .tsec{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}
    .tsec h3{margin:0 0 10px;font-size:15px}
    .tbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
    .tk{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
    .tk .kpi .s{font-size:11px;color:var(--dim)}
    .tlist{display:grid;gap:8px}
    .sug{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
    .sug .ic{font-size:18px}
    .sug .t{font-weight:600}.sug .d{font-size:12.5px;color:var(--muted)}
    .sug.g-alta{border-color:rgba(240,82,82,.4)}.sug.g-media{border-color:rgba(245,158,11,.35)}.sug.g-info{border-color:rgba(96,165,250,.35)}
    .tag{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--panel);border:1px solid var(--line2);color:var(--muted);margin-left:6px;text-transform:uppercase}
    .tag.meta{color:#93c5fd}.tag.google{color:#fcd34d}.tag.tiktok{color:#f0abfc}.tag.kwai{color:#fdba74}.tag.auto{color:#86efac;border-color:rgba(34,197,94,.4)}
    .cic{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;gap:8px}
    .cic.feito{opacity:.6}
    .cic .g{display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:6px 8px;border:1px dashed var(--line2);border-radius:8px;cursor:pointer}
    .cic .g:hover{border-color:var(--accent)}
    .plats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
    @media(max-width:900px){.plats{grid-template-columns:1fr}}
    table.tt{width:100%;border-collapse:collapse;font-size:13px}
    table.tt th{text-align:right;color:var(--muted);font-weight:500;font-size:11.5px;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
    table.tt th:first-child,table.tt td:first-child{text-align:left}
    table.tt td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    table.tt tr.n1 td:first-child{padding-left:26px}table.tt tr.n2 td:first-child{padding-left:46px;color:var(--muted)}
    table.tt tr.n0{background:rgba(255,255,255,.015)}
    .tname{max-width:340px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle}
    .exp{cursor:pointer;color:var(--dim);display:inline-block;width:16px}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
    .dot.ativo{background:var(--up)}.dot.pausado{background:var(--dim)}.dot.outro{background:var(--warn)}
    .ib{background:var(--panel2);border:1px solid var(--line2);color:var(--text);border-radius:7px;padding:3px 7px;font-size:12px}
    .ib:hover{border-color:#4a4a55}
    .tw{overflow:auto}
    .fg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .fg .full{grid-column:1/-1}.fg .span2{grid-column:span 2}
    .modos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
    .modo{border:1px solid var(--line2);border-radius:12px;padding:12px;cursor:pointer;background:var(--panel2)}
    .modo.on{border-color:var(--accent);background:rgba(34,197,94,.07)}
    .modo b{display:block;margin-bottom:3px}.modo span{font-size:12.5px;color:var(--muted)}
    .regra{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--panel2)}
    .regra h4{margin:0 0 8px;font-size:13.5px;display:flex;gap:8px;align-items:center}
    .rg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .cri{display:grid;grid-template-columns:120px 1fr auto;gap:12px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px}
    .cri .pv{width:120px;height:120px;border-radius:8px;background:#000;object-fit:cover}
    .cri textarea{min-height:64px}
    .refs{display:flex;gap:6px;flex-wrap:wrap}
    .ref{background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:4px 6px 4px 10px;font-size:12.5px;display:inline-flex;gap:6px;align-items:center}
    .ref button{background:none;border:none;color:var(--dim);font-size:15px;padding:0 4px}
    .gen h4{margin:14px 0 6px;font-size:13.5px}
    .gen ol{margin:0;padding-left:20px}.gen li{margin:4px 0}
    .gen .cp{cursor:pointer}.gen .cp:hover{color:var(--accent)}
    .rot{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px}
    .help{font-size:12.5px;color:var(--muted)}.help ol{padding-left:18px;margin:6px 0}.help li{margin:3px 0}
    .warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.35);border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px}
    .err{background:rgba(240,82,82,.08);border:1px solid rgba(240,82,82,.35);border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px;color:#fecaca}
    .ok2{color:var(--up)}
    @media(max-width:900px){.tk{grid-template-columns:repeat(3,1fr)}.fg,.rg,.modos{grid-template-columns:1fr 1fr}.cri{grid-template-columns:1fr}}
    @media(max-width:560px){.tk{grid-template-columns:repeat(2,1fr)}.fg,.rg,.modos{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  // ---------- render principal ----------
  const raiz = () => $("#viewTrafego");
  async function iniciar() {
    estilos();
    raiz().innerHTML = `<div class="tnav" id="tNav">${ABAS.map(([k, n]) => `<button data-aba="${k}">${n}</button>`).join("")}</div><div id="tCorpo"></div>`;
    $("#tNav").onclick = (e) => { const b = e.target.closest("[data-aba]"); if (b) irPara(b.dataset.aba); };
    await recarregar();
    irPara(S.aba);
  }
  async function recarregar() {
    try { [S.cfg, S.est] = await Promise.all([api("config"), api("estado")]); }
    catch (e) { S.cfg = S.cfg || { status: {}, regras: {}, meta: {}, google: {}, tiktok: {}, kwai: {}, claude: {}, telegram: {} }; S.est = S.est || {}; toast(e.message, true); }
    if (S.cfg?.analytics) window.MO_MOEDA_ADS = S.cfg.analytics.moedaAnuncios || S.cfg.analytics.moeda || "BRL";
  }
  function irPara(aba) {
    S.aba = aba; LS.set("aba", aba);
    if (window.MO && window.MO.sincronizarMenu) window.MO.sincronizarMenu(aba === "criativos" ? "clonador/criativos" : aba === "conexoes" ? "gerenciador/contas" : aba === "avisos" ? "avisos" : "gerenciador/" + aba);
    $$("#tNav button").forEach((b) => b.classList.toggle("on", b.dataset.aba === aba));
    ({ visao: vVisao, campanhas: vCampanhas, piloto: vPiloto, ciclo: vCiclo, criar: vCriar, criativos: vCriativos, conexoes: vConexoes, avisos: vAvisos }[aba] || vVisao)();
  }
  const corpo = (html) => { $("#tCorpo").innerHTML = html; };
  const semConta = () => !PLATS.some((p) => S.cfg.status?.[p]);
  const avisoConectar = () => `<div class="warn">Conecte sua conta da Meta, do Google, do TikTok ou do Kwai em <a href="#" data-ir="conexoes">🔌 Contas de anúncio</a> para o agente começar a trabalhar.</div>`;
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-ir]"); if (a && raiz() && raiz().contains(a)) { e.preventDefault(); irPara(a.dataset.ir); } });

  // ---------- VISÃO GERAL ----------
  function vVisao() {
    const est = S.est || {};
    const ents = est.entidades || [];
    const ads = ents.filter((e) => e.nivel === "anuncio");
    const plats = [...new Set(ads.map((e) => e.plataforma))];
    const tot = derivar(somar(...ads.map((e) => metr(e, S.periodo))));
    const porPlat = Object.fromEntries(plats.map((p) => [p, derivar(somar(...ads.filter((e) => e.plataforma === p).map((e) => metr(e, S.periodo))))]));
    const sub = (k, f) => plats.length > 1 ? `<div class="s">${plats.map((p) => `${NOME_P[p] || p}: ${f(porPlat[p][k])}`).join(" · ")}</div>` : "";
    const modoNome = { desligado: "Desligado", sugerir: "Sugerir (você aprova)", automatico: "Automático" }[S.cfg.regras?.modo] || "–";
    const erros = Object.entries(est.erros || {}).map(([k, v]) => `<div class="err"><b>${NOME_P[k] || "Atenção"}:</b> ${esc(v)}</div>`).join("");
    const ciclos = (est.ciclo || []).filter((i) => !i.feito && !i.resolvido).length;
    corpo(`
      ${semConta() ? avisoConectar() : ""}${erros}
      <div class="tbar">
        <span class="pill">🤖 Modo: <b style="color:var(--text)">${esc(modoNome)}</b></span>
        <span class="pill">${S.cfg.regras?.fonteConversoes === "vendas" ? "💰 Decidindo pelas <b style='color:#4ade80'>vendas reais</b>" : "📡 Decidindo pelo pixel"}</span>
        <span class="pill">${est.atualizadoEm ? "Última análise: " + new Date(est.atualizadoEm).toLocaleString(LOCD(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Ainda não rodou"}</span>
        ${ciclos ? `<a class="pill" href="#" data-ir="ciclo" style="color:#fbbf24">🔄 ${ciclos} criativo(s) cansado(s)</a>` : ""}
        <div class="spacer"></div>
        <select id="tPer" style="width:auto"><option value="hoje">Hoje</option><option value="janela">Últimos 3 dias + hoje</option><option value="d7">Últimos 7 dias</option></select>
        <button class="btn sm" id="tAnalise">🧠 Analisar com Claude</button>
        <button class="btn sm primary" id="tRodar" ${semConta() ? "disabled" : ""}>▶ Rodar agente agora</button>
      </div>
      <div class="tk">
        <div class="kpi"><div class="l">Investido</div><div class="v">${brl(tot.gasto)}</div>${sub("gasto", brl)}</div>
        <div class="kpi"><div class="l">Conversões</div><div class="v">${num(tot.conversoes)}</div>${sub("conversoes", num)}</div>
        <div class="kpi"><div class="l">CPA</div><div class="v" style="color:${tot.cpa && S.cfg.regras?.cpaAlvo ? (tot.cpa <= S.cfg.regras.cpaAlvo ? "var(--up)" : "var(--down)") : "inherit"}">${brl(tot.cpa)}</div><div class="s">alvo ${brl(S.cfg.regras?.cpaAlvo)}</div></div>
        <div class="kpi"><div class="l">ROAS</div><div class="v">${tot.roas ? tot.roas.toFixed(2) : "–"}</div>${sub("roas", (v) => (v ? v.toFixed(2) : "–"))}</div>
        <div class="kpi"><div class="l">CTR (link)</div><div class="v">${pct(tot.ctr)}</div></div>
        <div class="kpi"><div class="l">CPM</div><div class="v">${brl(tot.cpm)}</div></div>
      </div>
      <div id="tAnaliseBox"></div>
      ${(est.diagnostico || []).length ? `<div class="tsec"><h3>Diagnóstico do agente</h3><div class="tlist">${((EN() && est.diagnosticoEn?.length ? est.diagnosticoEn : est.diagnostico) || []).map((d) => `<div>${esc(d)}</div>`).join("")}</div></div>` : ""}
      <div class="tsec"><div class="tbar" style="margin-bottom:8px"><h3 style="margin:0">Sugestões esperando sua aprovação (${(est.pendentes || []).length})</h3><div class="spacer"></div>${(est.pendentes || []).length > 1 ? `<button class="btn sm" id="tAprovarTodas">Aprovar todas</button>` : ""}</div>
        <div class="tlist">${(est.pendentes || []).map(cardSugestao).join("") || `<div class="note">Nenhuma sugestão agora.</div>`}</div></div>
      ${(est.alertas || []).length ? `<div class="tsec"><h3>Alertas</h3><div class="tlist">${est.alertas.map(cardAlerta).join("")}</div></div>` : ""}
      <div class="tsec"><h3>O que o agente fez</h3>${tabelaHistorico((est.historico || []).slice(0, 12))}</div>`);
    $("#tPer").value = S.periodo;
    $("#tPer").onchange = (e) => { S.periodo = e.target.value; LS.set("periodo", S.periodo); vVisao(); };
    $("#tRodar").onclick = rodarAgente;
    $("#tAnalise").onclick = analisar;
    const at = $("#tAprovarTodas"); if (at) at.onclick = aprovarTodas;
    $("#tCorpo").onclick = async (e) => {
      const b = e.target.closest("[data-dec]"); if (!b) return;
      b.disabled = true;
      try {
        const r = await api("decidir", { body: { id: b.dataset.id, decisao: b.dataset.dec } });
        toast(b.dataset.dec === "aprovar" ? (r.ok ? "Feito ✓" : "Falhou: " + r.erro) : "Ignorada", r.ok === false);
        await recarregar(); vVisao();
      } catch (er) { toast(er.message, true); b.disabled = false; }
    };
  }
  const icone = { pausar: "⏸", escalar: "📈", reduzir: "📉", ativar: "▶", orcamento: "💰", alerta: "⚠️" };
  const verbo = (a) => ({ pausar: "Pausar", escalar: `Escalar orçamento ${brl(a.de)} → ${brl(a.para)}`, reduzir: `Reduzir orçamento ${brl(a.de)} → ${brl(a.para)}`, ativar: "Ativar", orcamento: `Orçamento → ${brl(a.para)}` }[a.tipo] || a.tipo);
  const nivelNome = { campanha: "campanha", conjunto: "conjunto", anuncio: "anúncio" };
  function cardSugestao(a) {
    return `<div class="sug"><div class="ic">${icone[a.tipo] || "•"}</div><div><div class="t">${esc(verbo(a))} · ${nivelNome[a.nivel] || ""} <span class="notr">“${esc(a.nome)}”</span><span class="tag ${a.plataforma}">${NOME_P[a.plataforma] || a.plataforma}</span>${a.gerenciada ? `<span class="tag auto">gerenciada</span>` : ""}</div><div class="d">${esc(mot(a))}</div></div>
      <div style="display:flex;gap:6px"><button class="btn sm" data-dec="ignorar" data-id="${esc(a.id)}">Ignorar</button><button class="btn sm primary" data-dec="aprovar" data-id="${esc(a.id)}">Aprovar</button></div></div>`;
  }
  function cardAlerta(a) {
    return `<div class="sug g-${a.gravidade || "media"}"><div class="ic">${a.reembolso ? "↩️" : a.cansado ? "🔄" : "⚠️"}</div><div><div class="t">${esc(nivelNome[a.nivel] || "")} <span class="notr">“${esc(a.nome)}”</span><span class="tag ${a.plataforma}">${NOME_P[a.plataforma] || a.plataforma}</span></div><div class="d">${esc(mot(a))}</div></div><div>${a.cansado ? `<a class="btn sm" href="#" data-ir="ciclo">Ver ganchos novos</a>` : ""}</div></div>`;
  }
  function tabelaHistorico(h) {
    if (!h.length) return `<div class="note">Nada ainda.</div>`;
    const origem = { automatico: "🤖 automático", aprovada: "✅ aprovada por você", manual: "🖐 manual", ignorada: "🙈 ignorada" };
    return `<div class="tw"><table class="tt"><thead><tr><th>Quando</th><th>Ação</th><th style="text-align:left">Item</th><th>Origem</th><th>Resultado</th></tr></thead><tbody>${h.map((x) => `<tr><td>${new Date(x.em).toLocaleString(LOCD(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>${icone[x.tipo] || ""} ${esc(verbo(x))}</td><td style="text-align:left"><span class="tname" title="${esc(mot(x))}">${esc(x.nome || x.alvoId)}</span><span class="tag ${x.plataforma}">${NOME_P[x.plataforma] || x.plataforma}</span></td><td>${origem[x.origem] || esc(x.origem)}</td><td>${x.ignorada ? "–" : x.ok ? `<span class="ok2">ok</span>` : `<span style="color:var(--down)" title="${esc(x.erro)}">erro</span>`}</td></tr>`).join("")}</tbody></table></div>`;
  }
  async function rodarAgente() {
    const b = $("#tRodar"); if (b) { b.disabled = true; b.textContent = "Analisando…"; }
    try { S.est = await api("ciclo", { body: {} }); S.cfg = await api("config"); toast("Análise concluída ✓"); }
    catch (e) { toast(e.message, true); }
    if (S.aba === "visao") vVisao(); else if (S.aba === "campanhas") vCampanhas();
  }
  async function aprovarTodas() {
    const ids = (S.est.pendentes || []).map((a) => a.id);
    let ok = 0, falha = 0;
    for (const id of ids) { try { const r = await api("decidir", { body: { id, decisao: "aprovar" } }); r.ok ? ok++ : falha++; } catch { falha++; } }
    toast(`${ok} aplicada(s)${falha ? `, ${falha} com erro` : ""}`, falha > 0);
    await recarregar(); vVisao();
  }
  async function abrirNoClaude(prompt) {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    const url = prompt.length < 6000 ? "https://claude.ai/new?q=" + encodeURIComponent(prompt) : "https://claude.ai/new";
    window.open(url, "_blank", "noopener");
    toast(prompt.length < 6000 ? "Abrindo no Claude (o pedido também foi copiado)" : "Pedido copiado: cole no Claude com Ctrl+V");
  }
  async function analisar() {
    const box = $("#tAnaliseBox");
    try {
      if (S.cfg.status?.claude) {
        box.innerHTML = `<div class="tsec"><div class="spin" style="display:inline-block"></div> O Claude está analisando suas campanhas…</div>`;
        const r = await api("analise", { body: { usarApi: true } });
        box.innerHTML = `<div class="tsec"><h3>🧠 Análise do Claude</h3><div style="white-space:pre-wrap;font-size:13.5px">${esc(r.texto)}</div></div>`;
      } else {
        const r = await api("analise", { body: {} });
        abrirNoClaude(r.prompt);
      }
    } catch (e) { box.innerHTML = ""; toast(e.message, true); }
  }

  // ---------- CAMPANHAS ----------
  function vCampanhas() {
    const ents = (S.est?.entidades || []).filter((e) => !S.filtroPlat || e.plataforma === S.filtroPlat);
    const camps = ents.filter((e) => e.nivel === "campanha").sort((a, b) => (metr(b, S.periodo).gasto - metr(a, S.periodo).gasto) || (a.status === "ativo" ? -1 : 1));
    const filhos = (e) => ents.filter((x) => x.plataforma === e.plataforma && x.paiId === e.id);
    const linha = (e, n) => {
      const m = metr(e, S.periodo);
      const temFilhos = n < 2 && filhos(e).length;
      const k = e.plataforma + ":" + e.id;
      const aberto = S.abertos.has(k);
      const cpaCor = m.cpa && S.cfg.regras?.cpaAlvo ? (m.cpa <= S.cfg.regras.cpaAlvo ? "var(--up)" : m.cpa > S.cfg.regras.cpaAlvo * 1.3 ? "var(--down)" : "inherit") : "inherit";
      const ger = n === 0 ? `<label title="Deixar o piloto automático cuidar desta campanha" style="cursor:pointer"><input type="checkbox" data-ger="${esc(k)}" ${e.gerenciada || (S.cfg.regras?.campanhasGerenciadas || []).includes(k) ? "checked" : ""}> 🤖</label>` : "";
      return `<tr class="n${n}" data-k="${esc(k)}">
        <td>${temFilhos ? `<span class="exp" data-exp="${esc(k)}">${aberto ? "▾" : "▸"}</span>` : `<span class="exp"></span>`}<span class="dot ${e.status}" title="${esc(e.statusBruto || e.status)}"></span><span class="tname" title="${esc(e.nome)}">${esc(e.nome)}</span>${n === 0 ? `<span class="tag ${e.plataforma}">${NOME_P[e.plataforma] || e.plataforma}</span>` : ""}</td>
        <td>${e.orcamento ? brl(e.orcamento.valor) + (e.orcamento.total ? " total" : "/dia") : "–"}</td>
        <td>${brl(m.gasto)}</td><td>${num(m.conversoes)}</td><td style="color:${cpaCor}">${brl(m.cpa)}</td><td>${m.roas ? m.roas.toFixed(2) : "–"}</td><td>${pct(m.ctr)}</td><td>${brl(m.cpm)}</td>
        <td>${e.status === "ativo" ? `<button class="ib" data-act="pausar" title="Pausar">⏸</button>` : e.status === "pausado" ? `<button class="ib" data-act="ativar" title="Ativar">▶</button>` : ""} ${e.orcamento && e.orcamento.editavel ? `<button class="ib" data-act="orcamento" title="Mudar orçamento">💰</button>` : ""}</td>
        <td>${ger}</td></tr>` + (aberto && temFilhos ? filhos(e).sort((a, b) => metr(b, S.periodo).gasto - metr(a, S.periodo).gasto).map((f) => linha(f, n + 1)).join("") : "");
    };
    corpo(`${semConta() ? avisoConectar() : ""}
      <div class="tbar"><select id="tPlat" style="width:auto">${optPlats()}</select>
      <select id="tPer2" style="width:auto"><option value="hoje">Hoje</option><option value="janela">Últimos 3 dias + hoje</option><option value="d7">Últimos 7 dias</option></select>
      <div class="spacer"></div><span class="note">🤖 = piloto automático pode mexer nesta campanha</span><button class="btn sm" id="tAtualizar">↻ Atualizar dados</button></div>
      <div class="tsec tw"><table class="tt"><thead><tr><th>Nome</th><th>Orçamento</th><th>Gasto</th><th>Conv.</th><th>CPA</th><th>ROAS</th><th>CTR</th><th>CPM</th><th>Ações</th><th>Agente</th></tr></thead>
      <tbody>${camps.map((c) => linha(c, 0)).join("") || `<tr><td colspan="10" class="note" style="text-align:left;padding:16px">Nenhuma campanha carregada. Clique em “Atualizar dados”.</td></tr>`}</tbody></table></div>`);
    $("#tPlat").value = S.filtroPlat; $("#tPer2").value = S.periodo;
    $("#tPlat").onchange = (e) => { S.filtroPlat = e.target.value; vCampanhas(); };
    $("#tPer2").onchange = (e) => { S.periodo = e.target.value; LS.set("periodo", S.periodo); vCampanhas(); };
    $("#tAtualizar").onclick = async () => { $("#tAtualizar").disabled = true; await rodarAgente(); };
    $("#tCorpo").onclick = async (ev) => {
      const ex = ev.target.closest("[data-exp]");
      if (ex) { const k = ex.dataset.exp; S.abertos.has(k) ? S.abertos.delete(k) : S.abertos.add(k); vCampanhas(); return; }
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const k = b.closest("tr").dataset.k;
      const e = (S.est.entidades || []).find((x) => x.plataforma + ":" + x.id === k);
      if (!e) return;
      let valor = null;
      if (b.dataset.act === "orcamento") {
        valor = await pedirValor(`Novo orçamento diário para “${e.nome}”`, e.orcamento.valor);
        if (valor === null) return;
      } else if (!(await confirmar(`${b.dataset.act === "pausar" ? "Pausar" : "Ativar"} ${nivelNome[e.nivel]} “${e.nome}”?`, b.dataset.act === "ativar" ? "Isso volta a gastar dinheiro." : ""))) return;
      try {
        const r = await api("acao", { body: { plataforma: e.plataforma, tipo: b.dataset.act, nivel: e.nivel, id: e.id, nome: e.nome, recurso: e.recurso, recursoOrcamento: e.orcamento?.recurso, de: e.orcamento?.valor, valor } });
        if (!r.ok) throw new Error(r.erro);
        toast("Feito ✓"); S.est = await api("estado"); vCampanhas();
      } catch (er) { toast(er.message, true); }
    };
    $("#tCorpo").onchange = async (ev) => {
      const g = ev.target.closest("[data-ger]"); if (!g) return;
      try { S.cfg = await api("gerenciar", { body: { chave: g.dataset.ger, sim: g.checked } }); toast(g.checked ? "Agente pode cuidar desta campanha" : "Agente não mexe mais nesta campanha"); }
      catch (er) { toast(er.message, true); g.checked = !g.checked; }
    };
  }

  // diálogos simples dentro da página
  function dialogo(html, aoOk) {
    return new Promise((ok) => {
      const ov = document.createElement("div");
      ov.className = "overlay open";
      ov.innerHTML = `<div class="modal" style="max-width:440px">${html}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn sm" data-r="0">Cancelar</button><button class="btn sm primary" data-r="1">Confirmar</button></div></div>`;
      document.body.appendChild(ov);
      const fim = (v) => { ov.remove(); ok(v); };
      ov.onclick = (e) => { if (e.target === ov) fim(null); const b = e.target.closest("[data-r]"); if (b) fim(b.dataset.r === "1" ? aoOk(ov) : null); };
      const inp = ov.querySelector("input"); if (inp) { inp.focus(); inp.select(); inp.onkeydown = (e) => { if (e.key === "Enter") fim(aoOk(ov)); }; }
    });
  }
  const confirmar = (t, d) => dialogo(`<h3 style="margin:0 0 8px">${esc(t)}</h3>${d ? `<p class="note">${esc(d)}</p>` : ""}`, () => true).then((v) => !!v);
  const pedirValor = (t, atual) => dialogo(`<h3 style="margin:0 0 10px">${esc(t)}</h3><label class="lb">R$ por dia</label><input type="number" min="1" step="1" value="${esc(atual)}">`, (ov) => { const v = Number(ov.querySelector("input").value); return v > 0 ? v : null; });

  // ---------- PILOTO AUTOMÁTICO ----------
  function vPiloto() {
    const r = S.cfg.regras || {};
    const camps = (S.est?.entidades || []).filter((e) => e.nivel === "campanha");
    const gerenciadas = new Set(r.campanhasGerenciadas || []);
    const n = (id, v, step = "any") => `<input type="number" id="${id}" value="${v ?? ""}" step="${step}" min="0">`;
    const ck = (id, v) => `<input type="checkbox" id="${id}" ${v ? "checked" : ""}>`;
    corpo(`
      <div class="tsec"><h3>Como o agente deve agir</h3>
        <div class="modos">
          <div class="modo" data-modo="desligado"><b>⏹ Desligado</b><span>Só mostra métricas e diagnóstico. Não sugere nem mexe em nada.</span></div>
          <div class="modo" data-modo="sugerir"><b>💡 Sugerir</b><span>Analisa a cada ${r.intervaloCicloHoras || 3}h e deixa sugestões para você aprovar com um clique. Recomendado para começar.</span></div>
          <div class="modo" data-modo="automatico"><b>🤖 Automático</b><span>Pausa e ajusta orçamento sozinho, <strong>só nas campanhas marcadas com 🤖</strong>. O resto continua como sugestão.</span></div>
        </div>
        <div class="warn" id="tAvisoAuto" style="display:none">⚠️ No modo automático o agente mexe em dinheiro de verdade. Ele só atua nas campanhas marcadas abaixo, nunca passa do teto diário e escala no máximo uma vez a cada ${r.escalar?.intervaloHoras || 24}h.</div>
        <div class="regra" style="margin-bottom:12px;border-color:rgba(34,197,94,.35)"><h4>💰 Como o agente mede o resultado</h4>
          <div class="rg"><div class="span2" style="grid-column:span 2"><label class="lb">Contar conversões pelo</label><select id="rFonte"><option value="plataforma">Pixel / conversões de cada plataforma</option><option value="vendas">Vendas reais do Debian Analytics (UTMs): recomendado</option></select></div>
          <div><label class="lb">Escalar se o ROI real for pelo menos (%)</label>${n("rRoiMin", r.roi?.minEscalar)}</div>
          <div><label class="lb">Pausar anúncio com ROI real abaixo de (%)</label>${n("rRoiMax", r.roi?.maxPausar)}</div></div>
          <div class="note" style="margin-top:6px">Com vendas reais, o agente escala o que dá lucro de verdade e pausa o que dá prejuízo, já descontando impostos e taxas do Debian Analytics. Os limites de ROI só valem nesse modo.</div></div>
        <div class="fg">
          <div><label class="lb">CPA alvo (R$): quanto você aceita pagar por conversão</label>${n("rCpa", r.cpaAlvo)}</div>
          <div><label class="lb">ROAS mínimo para escalar (opcional)</label>${n("rRoas", r.roasAlvo)}</div>
          <div><label class="lb">Rodar a análise a cada (horas)</label>${n("rInt", r.intervaloCicloHoras, 1)}</div>
          <div><label class="lb">Teto de orçamento diário por campanha/conjunto (R$)</label>${n("rTeto", r.tetoOrcamentoDiario)}</div>
          <div><label class="lb">Orçamento mínimo ao reduzir (R$)</label>${n("rMin", r.orcamentoMinimo)}</div>
        </div>
      </div>
      <div class="tsec"><h3>Regras</h3><div class="tlist">
        <div class="regra"><h4>${ck("pAtivo", r.pausar?.ativo)} ⏸ Pausar anúncios ruins</h4><div class="rg">
          <div><label class="lb">Gastou X vezes o CPA alvo sem vender</label>${n("pGasto", r.pausar?.gastoSemVendaMult)}</div>
          <div><label class="lb">CPA acima de X vezes o alvo</label>${n("pCpa", r.pausar?.cpaMult)}</div>
          <div><label class="lb">CTR mínimo (%)</label>${n("pCtr", r.pausar?.ctrMin)}</div>
          <div><label class="lb">…depois de quantas impressões</label>${n("pImp", r.pausar?.impressoesMinCtr, 100)}</div></div>
          <div class="note" style="margin-top:6px">Ele nunca pausa o último anúncio ativo de um conjunto: nesse caso, só avisa.</div></div>
        <div class="regra"><h4>${ck("eAtivo", r.escalar?.ativo)} 📈 Escalar o que vende</h4><div class="rg">
          <div><label class="lb">CPA até X vezes o alvo</label>${n("eCpa", r.escalar?.cpaMult)}</div>
          <div><label class="lb">Mínimo de conversões (3 dias)</label>${n("eConv", r.escalar?.minConversoes, 1)}</div>
          <div><label class="lb">Aumentar orçamento em (%)</label>${n("ePct", r.escalar?.aumentoPct, 1)}</div>
          <div><label class="lb">No máximo 1 vez a cada (horas)</label>${n("eInt", r.escalar?.intervaloHoras, 1)}</div></div></div>
        <div class="regra"><h4>${ck("dAtivo", r.reduzir?.ativo)} 📉 Reduzir quem está caro</h4><div class="rg">
          <div><label class="lb">CPA acima de X vezes o alvo</label>${n("dCpa", r.reduzir?.cpaMult)}</div>
          <div><label class="lb">Reduzir orçamento em (%)</label>${n("dPct", r.reduzir?.reducaoPct, 1)}</div>
          <div><label class="lb">No máximo 1 vez a cada (horas)</label>${n("dInt", r.reduzir?.intervaloHoras, 1)}</div></div></div>
        <div class="regra"><h4>🔄 Criativo cansado</h4><div class="rg"><div><label class="lb">Avisar quando a frequência passar de</label>${n("aFreq", r.alertas?.frequenciaMax)}</div>
          <div><label class="lb">…ou quando o CTR cair mais de (%)</label>${n("cQueda", r.ciclo?.quedaCtrPct, 1)}</div>
          <div><label class="lb">…com pelo menos (impressões)</label>${n("cImp", r.ciclo?.impressoesMin, 100)}</div></div>
          <div class="note" style="margin-top:6px">O agente compara o CTR dos últimos 3 dias com o dos 4 dias anteriores e sugere ganchos novos em 🔄 Ciclo de criativos.</div></div>
        <div class="regra"><h4>${ck("reAtivo", r.reembolso?.ativo)} ↩️ Reembolsos e chargebacks</h4><div class="rg">
          <div><label class="lb">Avisar quando passar de (% das vendas)</label>${n("reTaxa", r.reembolso?.taxaMax)}</div>
          <div><label class="lb">…a partir de quantas vendas</label>${n("reMin", r.reembolso?.minVendas, 1)}</div>
          <div class="span2" style="grid-column:span 2;align-self:end"><label class="chk" style="padding:0 0 9px">${ck("reBloq", r.reembolso?.bloquearEscala)} não escalar campanha com reembolso acima do limite</label></div></div>
          <div class="note" style="margin-top:6px">Conta os últimos 30 dias de cada anúncio, pelas vendas reais da UTMFy.</div></div>
      </div></div>
      <div class="tsec"><h3>Campanhas que o piloto automático pode mexer</h3>
        ${camps.length ? `<div class="tlist">${camps.map((c) => { const k = c.plataforma + ":" + c.id; return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-gk="${esc(k)}" ${gerenciadas.has(k) ? "checked" : ""}><span class="dot ${c.status}"></span>${esc(c.nome)}<span class="tag ${c.plataforma}">${NOME_P[c.plataforma] || c.plataforma}</span></label>`; }).join("")}</div>` : `<div class="note">Rode o agente uma vez (Visão geral → Rodar agente agora) para listar suas campanhas.</div>`}
        <div class="note" style="margin-top:8px">Campanhas criadas pelo agente já entram marcadas.</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px"><button class="btn primary" id="rSalvar">Salvar regras</button></div>
      <div class="tsec"><h3>Histórico completo</h3>${tabelaHistorico((S.est?.historico || []).slice(0, 100))}</div>`);
    $("#rFonte").value = r.fonteConversoes || "plataforma";
    let modo = r.modo || "sugerir";
    const marcarModo = () => { $$(".modo").forEach((m) => m.classList.toggle("on", m.dataset.modo === modo)); $("#tAvisoAuto").style.display = modo === "automatico" ? "block" : "none"; };
    marcarModo();
    $$(".modo").forEach((m) => (m.onclick = () => { modo = m.dataset.modo; marcarModo(); }));
    $("#rSalvar").onclick = async () => {
      const v = (id) => { const x = $("#" + id).value; return x === "" ? null : Number(x); };
      const c = (id) => $("#" + id).checked;
      if (modo === "automatico" && !(await confirmar("Ligar o modo automático?", "O agente vai pausar anúncios e mudar orçamentos sozinho nas campanhas marcadas, respeitando o teto que você definiu."))) return;
      const regras = {
        modo, fonteConversoes: $("#rFonte").value, roi: { minEscalar: v("rRoiMin") ?? 30, maxPausar: v("rRoiMax") ?? -30 }, cpaAlvo: v("rCpa"), roasAlvo: v("rRoas") || null, intervaloCicloHoras: v("rInt") || 3, tetoOrcamentoDiario: v("rTeto"), orcamentoMinimo: v("rMin"),
        pausar: { ativo: c("pAtivo"), gastoSemVendaMult: v("pGasto"), cpaMult: v("pCpa"), ctrMin: v("pCtr"), impressoesMinCtr: v("pImp") },
        escalar: { ativo: c("eAtivo"), cpaMult: v("eCpa"), minConversoes: v("eConv"), aumentoPct: v("ePct"), intervaloHoras: v("eInt") },
        reduzir: { ativo: c("dAtivo"), cpaMult: v("dCpa"), reducaoPct: v("dPct"), intervaloHoras: v("dInt") },
        alertas: { frequenciaMax: v("aFreq") },
        ciclo: { quedaCtrPct: v("cQueda") ?? 30, impressoesMin: v("cImp") ?? 2000 },
        reembolso: { ativo: c("reAtivo"), taxaMax: v("reTaxa") ?? 15, minVendas: v("reMin") ?? 4, bloquearEscala: c("reBloq") },
        campanhasGerenciadas: $$("[data-gk]").filter((x) => x.checked).map((x) => x.dataset.gk).concat((r.campanhasGerenciadas || []).filter((k) => !$(`[data-gk="${CSS.escape(k)}"]`))),
      };
      if (!(regras.cpaAlvo > 0)) { toast("Defina o CPA alvo.", true); return; }
      try { S.cfg = await api("config", { body: { regras } }); toast("Regras salvas ✓"); vPiloto(); } catch (e) { toast(e.message, true); }
    };
  }

  // ---------- CRIAR CAMPANHA ----------
  function vCriar() {
    if (!S.cfg.status?.meta) { corpo(`<div class="warn">Para criar campanhas, conecte a Meta em <a href="#" data-ir="conexoes">🔌 Conexões</a> e escolha a conta de anúncios.</div><div class="tsec help">A criação automática de campanhas é para a Meta (Facebook/Instagram). No Google, TikTok e Kwai, o agente analisa, pausa e ajusta orçamentos; as copies e roteiros ficam em ✍️ Criativos & copy.</div>`); return; }
    const d = LS.get("rascunhoCamp", { evento: "PURCHASE", paises: "BR", idadeMin: 18, orcamentoDiario: 50, cta: "LEARN_MORE" });
    corpo(`
      <div class="tsec"><h3>1. Oferta e público</h3><div class="fg">
        <div class="span2"><label class="lb">Nome da campanha</label><input id="cNome" value="${esc(d.nome || "")}" placeholder="ex.: Protocolo X · teste 1"></div>
        <div><label class="lb">Otimizar para</label><select id="cEvento"><option value="PURCHASE">Compra</option><option value="INITIATED_CHECKOUT">Início de checkout</option><option value="LEAD">Lead</option><option value="COMPLETE_REGISTRATION">Cadastro</option></select></div>
        <div class="full"><label class="lb">Link da página (com UTMs, se usar)</label><input id="cLink" value="${esc(d.link || "")}" placeholder="https://suaoferta.com.br/?utm_source=facebook"></div>
        <div><label class="lb">Página do Facebook</label><select id="cPagina"><option value="">carregando…</option></select></div>
        <div><label class="lb">Pixel</label><select id="cPixel"><option value="">carregando…</option></select></div>
        <div><label class="lb">Botão</label><select id="cCta">${["LEARN_MORE:Saiba mais", "SHOP_NOW:Comprar agora", "BUY_NOW:Comprar", "ORDER_NOW:Pedir agora", "SIGN_UP:Cadastre-se", "GET_OFFER:Obter oferta", "SUBSCRIBE:Assinar", "DOWNLOAD:Baixar", "CONTACT_US:Fale conosco", "WHATSAPP_MESSAGE:WhatsApp"].map((x) => `<option value="${x.split(":")[0]}">${x.split(":")[1]}</option>`).join("")}</select></div>
        <div><label class="lb">Países (siglas, separadas por vírgula)</label><input id="cPaises" value="${esc(d.paises)}"></div>
        <div><label class="lb">Idade mínima (18 a 25)</label><input id="cIdade" type="number" min="18" max="25" value="${esc(d.idadeMin)}"></div>
        <div><label class="lb">Orçamento diário da campanha (R$)</label><input id="cOrc" type="number" min="6" step="1" value="${esc(d.orcamentoDiario)}"></div>
      </div><div class="note" style="margin-top:8px">Estrutura: 1 campanha com orçamento na campanha (Advantage+), 1 conjunto com público Advantage+ (a Meta acha o público) e 1 anúncio por criativo. É a estrutura mais usada hoje para testar criativos.</div></div>
      <div class="tsec"><div class="tbar" style="margin-bottom:8px"><h3 style="margin:0">2. Criativos</h3><div class="spacer"></div>${S.geradas ? `<button class="btn sm" id="cUsarGer">✍️ Preencher com as copies geradas</button>` : ""}<label class="btn sm primary" style="cursor:pointer">＋ Adicionar vídeos/imagens<input type="file" id="cFiles" multiple accept="video/*,image/*" hidden></label></div>
        <div class="tlist" id="cCris"></div><div class="note" style="margin-top:8px">Vídeos em formato vertical (9:16) ou quadrado (1:1) funcionam melhor. Use criativos seus: subir o vídeo de outra pessoa pode gerar denúncia e bloqueio da conta.</div></div>
      <div class="tsec"><h3>3. Criar</h3><p class="note" style="margin-top:0">Tudo é criado <b>pausado</b>. Você revisa no Gerenciador de Anúncios e ativa quando quiser, aqui ou lá.</p>
        <button class="btn primary" id="cCriar">🚀 Criar campanha (pausada)</button><div id="cStatus" style="margin-top:12px"></div></div>`);
    $("#cEvento").value = d.evento; $("#cCta").value = d.cta;
    carregarAtivos(d);
    renderCris();
    $("#cFiles").onchange = (e) => enviarArquivos([...e.target.files]);
    const ug = $("#cUsarGer"); if (ug) ug.onclick = usarGeradas;
    $("#cCriar").onclick = criarCampanha;
    $$("#tCorpo input, #tCorpo select").forEach((el) => el.addEventListener("change", salvarRascunho));
  }
  function lerForm() {
    return { nome: $("#cNome").value.trim(), evento: $("#cEvento").value, link: $("#cLink").value.trim(), paginaId: $("#cPagina").value, pixelId: $("#cPixel").value, cta: $("#cCta").value, paises: $("#cPaises").value, idadeMin: Number($("#cIdade").value), orcamentoDiario: Number($("#cOrc").value) };
  }
  function salvarRascunho() { if ($("#cNome")) LS.set("rascunhoCamp", lerForm()); }
  async function carregarAtivos(d) {
    try {
      S.ativos = S.ativos || (await api("meta/ativos"));
      $("#cPagina").innerHTML = `<option value="">Escolha…</option>` + S.ativos.paginas.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      $("#cPixel").innerHTML = `<option value="">Escolha…</option>` + S.ativos.pixels.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)})</option>`).join("");
      if (d.paginaId) $("#cPagina").value = d.paginaId;
      if (d.pixelId) $("#cPixel").value = d.pixelId;
      if (S.ativos.paginas.length === 1) $("#cPagina").value = S.ativos.paginas[0].id;
      if (S.ativos.pixels.length === 1) $("#cPixel").value = S.ativos.pixels[0].id;
    } catch (e) { $("#cPagina").innerHTML = $("#cPixel").innerHTML = `<option value="">erro ao carregar</option>`; toast(e.message, true); }
  }
  function renderCris() {
    const box = $("#cCris"); if (!box) return;
    box.innerHTML = S.criativosCamp.map((c, i) => `<div class="cri" data-i="${i}">
      ${c.preview ? (c.video ? `<video class="pv" src="${c.preview}" muted></video>` : `<img class="pv" src="${c.preview}">`) : `<div class="pv" style="display:grid;place-items:center;color:var(--dim)">${c.video ? "🎬" : "🖼"}</div>`}
      <div style="display:grid;gap:8px"><div class="note">${esc(c.nomeOriginal)} ${c.arquivo ? `<span class="ok2">✓ enviado</span>` : c.erro ? `<span style="color:var(--down)">${esc(c.erro)}</span>` : `<span class="spin" style="display:inline-block;vertical-align:middle"></span> enviando…`}</div>
        <div><label class="lb">Texto principal</label><textarea data-f="texto">${esc(c.texto || "")}</textarea></div>
        <div class="fg" style="grid-template-columns:1fr 1fr"><div><label class="lb">Título</label><input data-f="titulo" value="${esc(c.titulo || "")}"></div><div><label class="lb">Descrição</label><input data-f="descricao" value="${esc(c.descricao || "")}"></div></div></div>
      <div><button class="ib" data-rm="${i}" title="Remover">✕</button></div></div>`).join("") || `<div class="note">Nenhum criativo ainda.</div>`;
    box.oninput = (e) => { const f = e.target.dataset.f; if (!f) return; const i = Number(e.target.closest("[data-i]").dataset.i); S.criativosCamp[i][f] = e.target.value; };
    box.onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { S.criativosCamp.splice(Number(b.dataset.rm), 1); renderCris(); } };
  }
  async function enviarArquivos(files) {
    for (const f of files) {
      const c = { nomeOriginal: f.name, video: f.type.startsWith("video"), preview: URL.createObjectURL(f), arquivo: null };
      S.criativosCamp.push(c);
      renderCris();
      try {
        const r = await fetch("/api/trafego/upload?nome=" + encodeURIComponent(f.name), { method: "POST", headers: { "X-Minerador": "1" }, body: f });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "falhou");
        c.arquivo = j.arquivo;
      } catch (e) { c.erro = e.message; }
      renderCris();
    }
  }
  function usarGeradas() {
    const g = S.geradas || {};
    const textos = (g.textos || []).map((t) => t.texto || t);
    S.criativosCamp.forEach((c, i) => {
      c.texto = c.texto || textos[i % Math.max(1, textos.length)] || "";
      c.titulo = c.titulo || (g.titulos || [])[i % Math.max(1, (g.titulos || []).length)] || "";
      c.descricao = c.descricao || (g.descricoes || [])[i % Math.max(1, (g.descricoes || []).length)] || "";
    });
    renderCris();
    toast(S.criativosCamp.length ? "Copies preenchidas ✓ (revise antes de criar)" : "Adicione os vídeos/imagens primeiro.", !S.criativosCamp.length);
  }
  async function criarCampanha() {
    const f = lerForm();
    const cris = S.criativosCamp.filter((c) => c.arquivo);
    if (!f.nome || !f.link || !f.paginaId || !f.pixelId) { toast("Preencha nome, link, página e pixel.", true); return; }
    if (!cris.length) { toast("Adicione pelo menos um criativo enviado.", true); return; }
    if (cris.some((c) => !c.texto)) { toast("Escreva o texto principal de todos os criativos.", true); return; }
    if (!(await confirmar("Criar a campanha pausada?", `${cris.length} anúncio(s), orçamento de ${brl(f.orcamentoDiario)}/dia. Nada vai gastar até você ativar.`))) return;
    const st = $("#cStatus");
    $("#cCriar").disabled = true;
    try {
      await api("meta/criar", { body: { ...f, paises: f.paises.split(/[,\s]+/).filter(Boolean), criativos: cris.map((c) => ({ arquivo: c.arquivo, texto: c.texto, titulo: c.titulo, descricao: c.descricao })) } });
      const tick = async () => {
        const s = await api("meta/criar/status");
        if (s.rodando) { st.innerHTML = `<div class="spin" style="display:inline-block;vertical-align:middle"></div> ${esc(s.etapa)} <span class="note">(vídeos podem levar alguns minutos para a Meta processar)</span>`; return setTimeout(tick, 2500); }
        $("#cCriar").disabled = false;
        if (s.erro) { st.innerHTML = `<div class="err">${esc(s.erro)}</div>`; return; }
        const r = s.resultado || {};
        const conta = String(S.cfg.meta?.contaId || "").replace(/^act_/, "");
        const link = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(conta)}&selected_campaign_ids=${encodeURIComponent(r.campanha)}`;
        st.innerHTML = `<div class="tsec" style="margin:0"><b class="ok2">✓ Campanha criada (pausada)</b> com ${r.anuncios.length} anúncio(s).${r.erros.length ? `<div class="err" style="margin-top:8px">${r.erros.map(esc).join("<br>")}</div>` : ""}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Revisar no Gerenciador de Anúncios ↗</a>${r.anuncios.length ? `<button class="btn sm primary" id="cAtivar" data-id="${esc(r.campanha)}">▶ Ativar campanha</button>` : ""}</div>
          <div class="note" style="margin-top:6px">Ela já está marcada para o piloto automático (🤖).</div></div>`;
        const at = $("#cAtivar");
        if (at) at.onclick = async () => {
          if (!(await confirmar("Ativar a campanha agora?", `Ela começa a gastar até ${brl(f.orcamentoDiario)} por dia.`))) return;
          try { const x = await api("meta/ativar", { body: { campanhaId: at.dataset.id } }); toast(`Ativada ✓ (${x.anuncios} anúncios)`); at.disabled = true; at.textContent = "Ativa"; } catch (e) { toast(e.message, true); }
        };
        S.criativosCamp = [];
      };
      tick();
    } catch (e) { $("#cCriar").disabled = false; st.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  // ---------- CRIATIVOS & COPY ----------
  function vCriativos() {
    const b = LS.get("brief", {});
    const ofs = (window.MO && window.MO.ofertas ? window.MO.ofertas() : []).filter((o) => ["escalada", "escalando"].includes(o.status)).slice(0, 60);
    corpo(`
      <div class="tsec"><h3>Sua oferta</h3><div class="fg">
        <div><label class="lb">Produto / oferta</label><input data-b="produto" value="${esc(b.produto || "")}" placeholder="ex.: Curso de inglês em 90 dias"></div>
        <div class="span2"><label class="lb">Promessa principal</label><input data-b="promessa" value="${esc(b.promessa || "")}" placeholder="O que a pessoa conquista"></div>
        <div><label class="lb">Público</label><input data-b="publico" value="${esc(b.publico || "")}" placeholder="quem compra"></div>
        <div><label class="lb">Dor principal</label><input data-b="dor" value="${esc(b.dor || "")}"></div>
        <div><label class="lb">Mecanismo / diferencial</label><input data-b="mecanismo" value="${esc(b.mecanismo || "")}"></div>
        <div><label class="lb">Preço e condições</label><input data-b="preco" value="${esc(b.preco || "")}" placeholder="ex.: 12x de R$ 19,70"></div>
        <div><label class="lb">Tipo de funil</label><input data-b="funil" value="${esc(b.funil || "")}" placeholder="VSL, quiz, página de vendas…"></div>
        <div><label class="lb">Tom de voz</label><input data-b="tom" value="${esc(b.tom || "")}" placeholder="direto, divertido, técnico…"></div>
        <div class="full"><label class="lb">Provas (depoimentos, números, autoridade)</label><textarea data-b="provas" rows="2">${esc(b.provas || "")}</textarea></div>
      </div></div>
      <div class="tsec"><h3>Ofertas escaladas para modelar</h3>
        <div class="refs" id="gRefs"></div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <select id="gAdd" style="max-width:520px"><option value="">＋ Adicionar uma oferta escalada do Minerador…</option>${ofs.map((o) => `<option value="${esc(o.chave)}">${esc(o.anunciante)} · ${esc(o.titulo || o.dominio || "")} (${o.anunciosOferta} anúncios)</option>`).join("")}</select>
        </div><div class="note" style="margin-top:6px">Dica: no detalhe de qualquer oferta do Minerador tem o botão “🎯 Modelar no Tráfego”.</div></div>
      <div class="tsec"><h3>Gerar</h3>
        <div class="tbar"><label class="chk" style="padding:0"><input type="checkbox" id="gMeta" checked> Meta Ads</label><label class="chk" style="padding:0"><input type="checkbox" id="gGoogle" ${LS.get("gGoogle", false) ? "checked" : ""}> Google Ads (pesquisa)</label><label class="chk" style="padding:0"><input type="checkbox" id="gTt" ${LS.get("gTt", false) ? "checked" : ""}> TikTok e Kwai (vídeo vertical)</label>
          <select id="gIdioma" style="width:auto"><option value="pt">Copy em português</option><option value="en">Copy em inglês</option><option value="es">Copy em espanhol</option></select></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="gClaude">🧠 Copiar pedido e abrir no Claude (grátis)</button>
          ${S.cfg.status?.claude ? `<button class="btn" id="gApi">⚡ Gerar aqui (API do Claude)</button>` : `<span class="note" style="align-self:center">Para gerar direto aqui, adicione a chave da API do Claude em 🔌 Conexões.</span>`}
        </div><div id="gStatus" style="margin-top:10px"></div></div>
      <div id="gRes"></div>`);
    const salvarBrief = () => { const o = {}; $$("[data-b]").forEach((x) => (o[x.dataset.b] = x.value)); LS.set("brief", o); return o; };
    $$("[data-b]").forEach((x) => x.addEventListener("input", salvarBrief));
    const renderRefs = () => { $("#gRefs").innerHTML = S.refs.map((o, i) => `<span class="ref">${esc(o.anunciante)} · ${esc((o.titulo || o.dominio || "").slice(0, 40))}<button data-rr="${i}">×</button></span>`).join("") || `<span class="note">Nenhuma. O Claude escreve só a partir do seu briefing.</span>`; };
    renderRefs();
    $("#gRefs").onclick = (e) => { const x = e.target.closest("[data-rr]"); if (x) { S.refs.splice(Number(x.dataset.rr), 1); LS.set("refs", S.refs); renderRefs(); } };
    $("#gAdd").onchange = (e) => { const o = ofs.find((x) => x.chave === e.target.value); if (o) adicionarReferencia(o, false); e.target.value = ""; renderRefs(); };
    $("#gGoogle").onchange = (e) => LS.set("gGoogle", e.target.checked);
    $("#gTt").onchange = (e) => LS.set("gTt", e.target.checked);
    $("#gIdioma").value = LS.get("gIdioma", EN() ? "en" : "pt");
    $("#gIdioma").onchange = (e) => LS.set("gIdioma", e.target.value);
    const pedido = () => ({ brief: salvarBrief(), referencias: S.refs, idioma: $("#gIdioma").value, plataformas: [$("#gMeta").checked && "meta", $("#gGoogle").checked && "google", $("#gTt").checked && "tiktok"].filter(Boolean) });
    $("#gClaude").onclick = async () => { try { const r = await api("criativos/gerar", { body: pedido() }); abrirNoClaude(r.prompt); } catch (e) { toast(e.message, true); } };
    const ga = $("#gApi");
    if (ga) ga.onclick = async () => {
      ga.disabled = true;
      $("#gStatus").innerHTML = `<div class="spin" style="display:inline-block;vertical-align:middle"></div> O Claude está escrevendo… (até 1 minuto)`;
      try { const r = await api("criativos/gerar", { body: { ...pedido(), usarApi: true } }); S.geradas = r.resultado; LS.set("geradas", S.geradas); $("#gStatus").innerHTML = ""; renderGeradas(); }
      catch (e) { $("#gStatus").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      ga.disabled = false;
    };
    if (S.geradas) renderGeradas();
  }
  function renderGeradas() {
    const g = S.geradas || {};
    const lista = (arr) => `<ol>${(arr || []).map((t) => `<li class="cp" title="Clique para copiar">${esc(typeof t === "string" ? t : t.texto)}</li>`).join("")}</ol>`;
    const box = $("#gRes"); if (!box) return;
    box.innerHTML = `<div class="tsec gen"><div class="tbar" style="margin-bottom:0"><h3 style="margin:0">Resultado</h3><div class="spacer"></div><button class="btn sm primary" id="gUsar">🚀 Usar na criação de campanha</button></div>
      <h4>Ganchos (3 primeiros segundos)</h4>${lista(g.ganchos)}
      <h4>Textos principais</h4><ol>${(g.textos || []).map((t) => `<li class="cp" title="Clique para copiar"><b>${esc(t.tipo || "")}</b> ${esc(t.texto || t)}</li>`).join("")}</ol>
      <h4>Títulos</h4>${lista(g.titulos)}<h4>Descrições</h4>${lista(g.descricoes)}
      <h4>Roteiros de vídeo</h4>${(g.roteiros || []).map((r) => `<div class="rot"><b>${esc(r.nome)}</b> <span class="note">${esc(r.duracao || "")}</span>${(r.cenas || []).map((c) => `<div style="margin-top:6px"><b>${esc(c.tempo)}</b> · <span class="note">${esc(c.tela)}</span><br>🗣 ${esc(c.fala)}</div>`).join("")}</div>`).join("")}
      ${g.google ? `<h4>Google Ads: títulos</h4>${lista(g.google.titulos)}<h4>Google Ads: descrições</h4>${lista(g.google.descricoes)}<h4>Palavras-chave</h4>${lista(g.google.palavrasChave)}` : ""}
      ${(g.testes || []).length ? `<h4>Testes A/B sugeridos</h4>${lista(g.testes)}` : ""}
      ${(g.suposicoes || []).length ? `<h4>O que o Claude assumiu</h4>${lista(g.suposicoes)}` : ""}</div>`;
    box.onclick = async (e) => { const li = e.target.closest(".cp"); if (!li) return; try { await navigator.clipboard.writeText(li.innerText.trim()); toast("Copiado ✓"); } catch { toast("Não consegui copiar", true); } };
    $("#gUsar").onclick = () => { window.MO && window.MO.ir ? window.MO.ir("gerenciador/criar") : irPara("criar"); setTimeout(() => toast("Adicione os vídeos/imagens e clique em “Preencher com as copies geradas”."), 300); };
  }
  function adicionarReferencia(o, avisar = true) {
    if (!S.refs.find((x) => x.chave === o.chave)) {
      S.refs.push({ chave: o.chave, anunciante: o.anunciante, titulo: o.titulo, dominio: o.dominio, status: o.status, nicho: o.nicho, anunciosOferta: o.anunciosOferta, diasRodando: o.diasRodando, funil: o.funil ? { tipo: o.funil.tipo, checkout: o.funil.checkout } : null, criativos: (o.criativos || []).slice(0, 3).map((c) => ({ titulo: c.titulo, texto: c.texto, criativosIguais: c.criativosIguais })) });
      S.refs = S.refs.slice(-5);
      LS.set("refs", S.refs);
    }
    if (avisar) toast("Oferta adicionada para modelar ✓");
  }

  // ---------- CONEXÕES ----------
  function vConexoes() {
    const c = S.cfg;
    corpo(`
      <div class="tsec"><h3>Meta (Facebook e Instagram) ${c.status?.meta ? `<span class="tag auto">conectada</span>` : ""}</h3>
        <div class="fg">
          <div class="span2"><label class="lb">Token de acesso</label><input id="mTok" type="password" autocomplete="off" value="${esc(c.meta?.token || "")}" placeholder="EAAB…"></div>
          <div><label class="lb">Evento de conversão</label><select id="mEv"><option value="PURCHASE">Compra</option><option value="INITIATED_CHECKOUT">Início de checkout</option><option value="LEAD">Lead</option><option value="COMPLETE_REGISTRATION">Cadastro</option></select></div>
          <div class="span2"><label class="lb">Conta de anúncios</label><select id="mConta"><option value="${esc(c.meta?.contaId || "")}">${c.meta?.contaId ? esc(c.meta.contaNome || c.meta.contaId) : "Salve o token e clique em Testar"}</option></select></div>
          <div><label class="lb">Versão da API</label><input id="mVer" value="${esc(c.meta?.versao || "v25.0")}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm primary" id="mSalvar">Salvar e testar</button></div>
        <details class="help" style="margin-top:12px"><summary style="cursor:pointer;color:var(--text)">Como pegar o token (5 min)</summary><ol>
          <li>Entre no <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener">Gerenciador de Negócios → Usuários do sistema</a> e crie um usuário do sistema (Administrador).</li>
          <li>Clique em <b>Atribuir ativos</b> e dê acesso total à sua <b>conta de anúncios</b>, à <b>página</b> e ao <b>pixel</b>.</li>
          <li>Se ainda não tiver, crie um app em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> (tipo “Empresa”) e adicione o produto <b>Marketing API</b>.</li>
          <li>De volta ao usuário do sistema: <b>Gerar novo token</b> → escolha o app → marque <code>ads_management</code>, <code>ads_read</code>, <code>business_management</code> e <code>pages_show_list</code>. Validade: <b>nunca expira</b>.</li>
          <li>Copie o token e cole aqui. Ele fica salvo só no seu computador, no arquivo <code>trafego.local.json</code>.</li></ol></details>
      </div>
      <div class="tsec"><h3>Google Ads ${c.status?.google ? `<span class="tag auto">conectado</span>` : ""}</h3>
        <div class="fg">
          <div><label class="lb">ID da conta (cliente)</label><input id="gCid" value="${esc(c.google?.customerId || "")}" placeholder="123-456-7890"></div>
          <div><label class="lb">ID da conta de administrador (MCC, se usar)</label><input id="gMcc" value="${esc(c.google?.loginCustomerId || "")}"></div>
          <div><label class="lb">Developer token</label><input id="gDev" type="password" autocomplete="off" value="${esc(c.google?.developerToken || "")}"></div>
          <div><label class="lb">Client ID (OAuth)</label><input id="gCli" value="${esc(c.google?.clientId || "")}"></div>
          <div><label class="lb">Client secret</label><input id="gSec" type="password" autocomplete="off" value="${esc(c.google?.clientSecret || "")}"></div>
          <div><label class="lb">Refresh token</label><input id="gRef" type="password" autocomplete="off" value="${esc(c.google?.refreshToken || "")}"></div>
          <div><label class="lb">Versão da API</label><input id="gVer" value="${esc(c.google?.versao || "v26")}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm primary" id="gSalvar">Salvar e testar</button></div>
        <details class="help" style="margin-top:12px"><summary style="cursor:pointer;color:var(--text)">Como conseguir esses dados</summary><ol>
          <li><b>Developer token:</b> crie uma <a href="https://ads.google.com/home/tools/manager-accounts/" target="_blank" rel="noopener">conta de administrador do Google Ads</a>, vincule sua conta de anúncios a ela e peça o token na Central de API (Administrador → Central de API). O Google analisa o pedido; para contas reais é preciso acesso <b>Explorer</b> ou <b>Básico</b>.</li>
          <li><b>Client ID e secret:</b> no <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>, ative a “Google Ads API” e crie uma credencial OAuth do tipo <b>App para computador</b>.</li>
          <li><b>Refresh token:</b> abra o <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener">OAuth Playground</a>, na engrenagem marque “Use your own OAuth credentials” e cole o client ID/secret, autorize o escopo <code>https://www.googleapis.com/auth/adwords</code> e troque o código pelo refresh token.</li></ol></details>
      </div>
      <div class="tsec"><h3>TikTok Ads ${c.status?.tiktok ? `<span class="tag auto">conectado</span>` : ""}</h3>
        <div class="fg">
          <div class="span2"><label class="lb">Token de acesso (Access Token)</label><input id="ttTok" type="password" autocomplete="off" value="${esc(c.tiktok?.token || "")}"></div>
          <div><label class="lb">ID da conta de anúncios (Advertiser ID)</label><input id="ttAdv" value="${esc(c.tiktok?.anuncianteId || "")}" placeholder="7123456789012345678"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm primary" id="ttSalvar">Salvar e testar</button></div>
        <details class="help" style="margin-top:12px"><summary style="cursor:pointer;color:var(--text)">Como pegar o token (10 min)</summary><ol>
          <li>Entre em <a href="https://business-api.tiktok.com/portal" target="_blank" rel="noopener">TikTok API for Business</a> com a mesma conta do TikTok Ads Manager e crie um app (Developer → My Apps → Create).</li>
          <li>Nas permissões, marque <b>Ads Management</b> e <b>Reporting</b>. O TikTok analisa o pedido em até 2 dias úteis.</li>
          <li>Aprovado, abra o <b>link de autorização</b> do app, escolha sua conta de anúncios e autorize. Você recebe um <code>auth_code</code>; troque pelo <b>access token</b> na própria página do app (ele não expira).</li>
          <li>O <b>Advertiser ID</b> aparece no topo do TikTok Ads Manager, ao lado do nome da conta.</li></ol></details>
      </div>
      <div class="tsec"><h3>Kwai Ads ${c.status?.kwai ? `<span class="tag auto">conectado</span>` : ""}</h3>
        <div class="fg">
          <div><label class="lb">ID da conta de anúncios</label><input id="kwConta" value="${esc(c.kwai?.contaId || "")}"></div>
          <div><label class="lb">Client ID (app)</label><input id="kwCli" value="${esc(c.kwai?.clientId || "")}"></div>
          <div><label class="lb">Client secret</label><input id="kwSec" type="password" autocomplete="off" value="${esc(c.kwai?.clientSecret || "")}"></div>
          <div><label class="lb">Refresh token</label><input id="kwRef" type="password" autocomplete="off" value="${esc(c.kwai?.refreshToken || "")}"></div>
          <div><label class="lb">Fuso da conta</label><select id="kwFuso">${["UTC-3", "UTC-4", "UTC-5", "UTC-6", "UTC-8", "UTC+0", "UTC+1", "UTC+2", "UTC+3", "UTC+5", "UTC+7", "UTC+8"].map((f) => `<option ${f === (c.kwai?.fuso || "UTC-3") ? "selected" : ""}>${f}</option>`).join("")}</select></div>
          <div><label class="lb">Cotação (se a conta for em outra moeda)</label><input id="kwFx" type="number" step="0.01" min="0" value="${esc(c.kwai?.cotacao || 1)}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm primary" id="kwSalvar">Salvar e testar</button></div>
        <details class="help" style="margin-top:12px"><summary style="cursor:pointer;color:var(--text)">Como liberar a API do Kwai</summary><ol>
          <li>Agências e anunciantes diretos liberam a API no <b>Business Center</b> do <a href="https://business.kwai.com" target="_blank" rel="noopener">Kwai for Business</a>. Anunciantes de canal pedem por e-mail ao seu gerente de conta do Kwai.</li>
          <li>Peça os escopos <code>ad_mapi_report</code>, <code>ad_mapi_campaign_read</code>, <code>ad_mapi_unit_read</code>, <code>ad_mapi_creative_read</code> e, para o piloto automático mexer, os de escrita (<code>_write</code>).</li>
          <li>O Kwai entrega o <b>client ID</b>, o <b>client secret</b> e o <b>refresh token</b> (vale 1 ano). O app renova o acesso sozinho.</li>
          <li><b>Importante:</b> o Kwai só deixa a API pausar e mudar o orçamento de anúncios criados pela API. Nos criados no painel do Kwai, o agente analisa e avisa, e você aplica a mudança lá.</li></ol></details>
      </div>
      <div class="tsec"><h3>Claude API (opcional) ${c.status?.claude ? `<span class="tag auto">conectada</span>` : ""}</h3>
        <p class="note" style="margin-top:0">Sem a chave, os botões “Analisar com Claude” e “Gerar copies” abrem o pedido pronto aqui no Claude, grátis no seu plano. Com a chave, a resposta aparece direto no painel. A API é paga por uso: cada geração custa alguns centavos de dólar.</p>
        <div class="fg"><div class="span2"><label class="lb">Chave da API</label><input id="kKey" type="password" autocomplete="off" value="${esc(c.claude?.apiKey || "")}" placeholder="sk-ant-…"></div>
          <div><label class="lb">Modelo</label><input id="kMod" value="${esc(c.claude?.modelo || "claude-sonnet-5-5")}"></div></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm primary" id="kSalvar">Salvar e testar</button><a class="btn sm" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Pegar chave ↗</a></div>
      </div>`);
    $("#mEv").value = c.meta?.evento || "PURCHASE";
    $("#mSalvar").onclick = async () => {
      try {
        S.cfg = await api("config", { body: { meta: { token: $("#mTok").value, evento: $("#mEv").value, versao: $("#mVer").value || "v25.0" } } });
        const t = await api("testar", { body: { plataforma: "meta" } });
        const sel = $("#mConta");
        const atual = S.cfg.meta?.contaId;
        sel.innerHTML = t.contas.map((a) => `<option value="${esc(a.id)}" data-n="${esc(a.name)}">${esc(a.name)} · ${esc(a.id)} · ${esc(a.currency)}${a.account_status !== 1 ? " (inativa)" : ""}</option>`).join("");
        if (atual) sel.value = atual;
        const salvarConta = async () => { const o = sel.selectedOptions[0]; S.cfg = await api("config", { body: { meta: { contaId: sel.value, contaNome: o ? o.dataset.n : "" } } }); S.ativos = null; toast("Conta salva ✓"); };
        sel.onchange = salvarConta;
        await salvarConta();
        toast(`Conectado como ${t.usuario} ✓ (${t.contas.length} conta(s))`);
      } catch (e) { toast(e.message, true); }
    };
    $("#gSalvar").onclick = async () => {
      try {
        S.cfg = await api("config", { body: { google: { customerId: $("#gCid").value, loginCustomerId: $("#gMcc").value, developerToken: $("#gDev").value, clientId: $("#gCli").value, clientSecret: $("#gSec").value, refreshToken: $("#gRef").value, versao: $("#gVer").value || "v26" } } });
        const t = await api("testar", { body: { plataforma: "google" } });
        toast(`Google conectado ✓ ${t.conta.descriptiveName || ""}`);
        vConexoes();
      } catch (e) { toast(e.message, true); }
    };
    $("#ttSalvar").onclick = async () => {
      try {
        S.cfg = await api("config", { body: { tiktok: { token: $("#ttTok").value, anuncianteId: $("#ttAdv").value } } });
        const t = await api("testar", { body: { plataforma: "tiktok" } });
        toast(`TikTok conectado ✓ ${t.conta.nome || ""}`); vConexoes();
      } catch (e) { toast(e.message, true); }
    };
    $("#kwSalvar").onclick = async () => {
      try {
        S.cfg = await api("config", { body: { kwai: { contaId: $("#kwConta").value, clientId: $("#kwCli").value, clientSecret: $("#kwSec").value, refreshToken: $("#kwRef").value, fuso: $("#kwFuso").value, cotacao: Number($("#kwFx").value) || 1 } } });
        const t = await api("testar", { body: { plataforma: "kwai" } });
        toast(`Kwai conectado ✓ ${t.conta.nome || ""}`); vConexoes();
      } catch (e) { toast(e.message, true); }
    };
    $("#kSalvar").onclick = async () => {
      try { S.cfg = await api("config", { body: { claude: { apiKey: $("#kKey").value, modelo: $("#kMod").value } } }); await api("testar", { body: { plataforma: "claude" } }); toast("Claude API conectada ✓"); vConexoes(); }
      catch (e) { toast(e.message, true); }
    };
  }


  // ---------- CICLO DE CRIATIVOS ----------
  function vCiclo() {
    const itens = (S.est?.ciclo || []).slice().sort((a, b) => (a.feito ? 1 : 0) - (b.feito ? 1 : 0));
    corpo(`
      <div class="tsec"><h3>🔄 Ciclo de criativos</h3>
        <p class="note" style="margin-top:0">Quando um anúncio cansa (o público já viu demais ou o CTR começa a cair), o agente busca no Clonador ofertas escaladas do mesmo assunto e separa os ganchos que estão rodando nelas. Use para modelar criativos novos: <b>minerar → criar → testar → medir → escalar</b>.</p>
        <div class="tbar" style="margin:0"><button class="btn sm" id="cRodar">↻ Analisar agora</button><span class="note">Clique num gancho para copiar.</span></div></div>
      ${itens.length ? `<div class="tlist">${itens.map((i, n) => `<div class="cic ${i.feito ? "feito" : ""}" data-n="${n}">
        <div class="tbar" style="margin:0"><b class="notr">${esc(i.nome)}</b><span class="tag ${i.plataforma}">${NOME_P[i.plataforma] || i.plataforma}</span>${i.feito ? `<span class="tag auto">feito</span>` : i.novo ? `<span class="tag" style="color:#fbbf24">novo</span>` : ""}<div class="spacer"></div><span class="note notr">${esc(i.campanha || "")}</span></div>
        <div class="d" style="font-size:13px;color:var(--muted)">${i.tipo === "ctr" ? "📉" : "👀"} ${esc(EN() ? i.motivoEn : i.motivo)}</div>
        ${i.ganchos?.length ? `<div><div class="lb" style="margin-bottom:6px">Ganchos de ofertas escaladas para modelar</div><div style="display:grid;gap:6px">${i.ganchos.map((g) => `<div class="g" data-copiar="${esc(g.texto)}">💬 <span style="flex:1">${esc(g.texto)}</span><span class="note"><span class="notr">${esc(g.de)}</span> · ${g.anuncios} anúncio(s)</span></div>`).join("")}</div></div>` : `<div class="note">Minere ofertas do mesmo assunto no Clonador para receber ganchos aqui.</div>`}
        ${i.referencias?.length ? `<div class="note">Ofertas de referência: <span class="notr">${i.referencias.map((r) => `${esc(r.anunciante)}${r.score != null ? ` (🔥 ${r.score})` : ""}`).join(" · ")}</span></div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm primary" data-gerar="${n}">🧠 Gerar criativos novos com o Claude</button>${i.feito ? `<button class="btn sm" data-feito="${n}" data-v="0">Desfazer</button>` : `<button class="btn sm" data-feito="${n}" data-v="1">✓ Já subi criativo novo</button>`}</div>
      </div>`).join("")}</div>` : `<div class="tsec"><div class="note">Nenhum criativo cansado agora. 💚 O agente confere a cada análise.</div></div>`}`);
    $("#cRodar").onclick = async () => { $("#cRodar").disabled = true; await rodarAgente(); vCiclo(); };
    $("#tCorpo").onclick = async (e) => {
      const g = e.target.closest("[data-copiar]");
      if (g) { try { await navigator.clipboard.writeText(g.dataset.copiar); toast("Gancho copiado ✓"); } catch { toast("Não consegui copiar", true); } return; }
      const ge = e.target.closest("[data-gerar]");
      if (ge) {
        const i = itens[Number(ge.dataset.gerar)];
        for (const r of i.referencias || []) adicionarReferencia(r, false);
        const b = LS.get("brief", {});
        b.extra = (EN() ? "Replace the tired creative: " : "Substituir o criativo cansado: ") + i.nome + ". " + (EN() ? i.motivoEn : i.motivo) + ". " + (EN() ? "Model these hooks: " : "Modelar estes ganchos: ") + (i.ganchos || []).map((x) => `“${x.texto}”`).join(" ");
        LS.set("brief", b);
        window.MO && window.MO.ir ? window.MO.ir("clonador/criativos") : irPara("criativos");
        setTimeout(() => toast("Referências adicionadas. Revise o briefing e gere ✓"), 300);
        return;
      }
      const f = e.target.closest("[data-feito]");
      if (f) {
        try { const r = await api("ciclo-criativos/marcar", { body: { id: itens[Number(f.dataset.feito)].id, feito: f.dataset.v === "1" } }); S.est.ciclo = r.ciclo; vCiclo(); } catch (er) { toast(er.message, true); }
      }
    };
  }

  // ---------- AVISOS NO TELEGRAM ----------
  function vAvisos() {
    const t = S.cfg.telegram || {};
    const tipos = { vendas: "💰 Cada venda aprovada", reembolsos: "↩️ Reembolsos e chargebacks", piloto: "🤖 O que o piloto automático fez", sugestoes: "💡 Sugestões esperando você", criativos: "🔄 Criativo cansado (com ganchos novos)", resumo: "📊 Resumo do dia", clonador: "🛑 Problemas no robô do Clonador" };
    corpo(`
      <div class="tsec"><h3>🔔 Avisos no celular pelo Telegram ${S.cfg.status?.telegram ? `<span class="tag auto">conectado</span>` : ""}</h3>
        <p class="note" style="margin-top:0">Grátis. Você acompanha vendas e o piloto automático sem abrir o app. Os avisos saem do seu computador enquanto o app estiver aberto.</p>
        <ol class="help" style="padding-left:18px">
          <li>No Telegram, abra o <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a>, mande <code>/newbot</code>, escolha um nome e copie o <b>token</b> que ele mandar.</li>
          <li>Cole o token abaixo, abra o seu bot no Telegram e mande qualquer mensagem para ele (por exemplo, “oi”).</li>
          <li>Clique em <b>Encontrar meu chat</b> e depois em <b>Salvar e mandar teste</b>.</li>
        </ol>
        <div class="fg">
          <div class="span2"><label class="lb">Token do bot</label><input id="tgTok" type="password" autocomplete="off" value="${esc(t.token || "")}" placeholder="123456789:AA…"></div>
          <div><label class="lb">ID do chat</label><input id="tgChat" value="${esc(t.chatId || "")}" placeholder="clique em Encontrar meu chat"></div>
          <div><label class="lb">Idioma dos avisos</label><select id="tgIdioma"><option value="pt">Português</option><option value="en">English</option></select></div>
          <div><label class="lb">Hora do resumo do dia</label><input id="tgHora" type="number" min="0" max="23" value="${esc(t.horaResumo ?? 22)}"></div>
          <div style="align-self:end"><label class="chk"><input type="checkbox" id="tgAtivo" ${t.ativo !== false ? "checked" : ""}> avisos ligados</label></div>
        </div>
        <div class="regra" style="margin-top:12px"><h4>O que avisar</h4><div class="fg">${Object.entries(tipos).map(([k, n]) => `<label class="chk" style="padding:0"><input type="checkbox" data-tipo="${k}" ${t.tipos?.[k] === false ? "" : "checked"}> ${n}</label>`).join("")}</div></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm" id="tgAchar">🔎 Encontrar meu chat</button><button class="btn sm primary" id="tgSalvar">Salvar e mandar teste</button></div>
      </div>`);
    $("#tgIdioma").value = t.idioma || (EN() ? "en" : "pt");
    $("#tgAchar").onclick = async () => {
      try { const r = await api("telegram/descobrir", { body: { token: $("#tgTok").value } }); if (!r.chatId) throw new Error(`Mande uma mensagem para @${r.bot} no Telegram e tente de novo.`); $("#tgChat").value = r.chatId; toast(`Chat encontrado ✓ ${r.nome || ""} (@${r.bot})`); }
      catch (e) { toast(e.message, true); }
    };
    $("#tgSalvar").onclick = async () => {
      const tiposSel = Object.fromEntries($$("[data-tipo]").map((x) => [x.dataset.tipo, x.checked]));
      try {
        S.cfg = await api("config", { body: { telegram: { token: $("#tgTok").value, chatId: $("#tgChat").value.trim(), idioma: $("#tgIdioma").value, horaResumo: Number($("#tgHora").value) || 22, ativo: $("#tgAtivo").checked, tipos: tiposSel } } });
        await api("telegram/testar", { body: {} });
        toast("Teste enviado ✓ Confira o Telegram"); vAvisos();
      } catch (e) { toast(e.message, true); }
    };
  }

  function adicionarCriativoProprio(c) {
    const ref = {
      chave: "proprio:" + c.nome, anunciante: "Meu criativo campeão", titulo: c.nome, dominio: c.campanha, status: "escalada", nicho: "",
      anunciosOferta: c.vendas, diasRodando: null, funil: null,
      criativos: [{ titulo: c.titulo || c.nome, texto: (c.texto || "") + `\n\n[Resultado real: ${c.vendas} venda(s), ROI ${c.roi === null || c.roi === undefined ? "–" : Math.round(c.roi) + "%"}. Faça variações mantendo o ângulo que está vendendo.]`, criativosIguais: 1 }],
    };
    S.refs = [ref, ...S.refs.filter((x) => x.chave !== ref.chave)].slice(0, 5);
    LS.set("refs", S.refs);
    toast("Criativo campeão adicionado para gerar variações ✓");
  }
  let iniciado = false;
  window.MO_T = {
    adicionarCriativoProprio: (c) => adicionarCriativoProprio(c),
    iniciar: async () => { iniciado = true; await iniciar(); },
    adicionarReferencia: (o) => { adicionarReferencia(o); },
    irPara: (aba) => { S.aba = aba; LS.set("aba", aba); if (iniciado && $("#tNav")) irPara(aba); },
  };
})();
