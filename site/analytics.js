// 💰 Debian Analytics: faturamento, gastos, lucro e ROI por campanha (aba Resultados do Paid Traffic Agent).
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (n) => (n === null || n === undefined || isNaN(n) ? "–" : "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const num = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const pct = (n, sinal) => (n === null || n === undefined || isNaN(n) ? "–" : (sinal && n > 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + "%");
  const x2 = (n) => (n === null || n === undefined ? "–" : n.toFixed(2).replace(".", ",") + "x");
  const cor = (n) => (n === null || n === undefined ? "" : n > 0 ? "pos" : n < 0 ? "neg" : "");
  const toast = (m, e) => (window.MO && window.MO.toast ? window.MO.toast(m, e) : alert(m));
  const LS = { get(k, d) { try { const v = localStorage.getItem("moa_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("moa_" + k, JSON.stringify(v)); } catch {} } };

  async function api(caminho, opts = {}) {
    const r = await fetch(caminho, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", "X-Minerador": "1" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Erro " + r.status);
    return j;
  }

  const S = { aba: LS.get("aba", "dashboard"), f: LS.get("filtros", { periodo: "hoje", de: "", ate: "", plataforma: "", produto: "", checkout: "", testes: false }), r: null, abertos: new Set(), ordem: LS.get("ordem", "lucro"), chart: null, integ: null, cfgT: null };

  function estilos() {
    if ($("#aStyle")) return;
    const st = document.createElement("style");
    st.id = "aStyle";
    st.textContent = `
    .ahead{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .abrand{font-size:20px;font-weight:800;letter-spacing:-.02em;background:linear-gradient(90deg,#4ade80,#16a34a 60%,#86efac);-webkit-background-clip:text;background-clip:text;color:transparent}
    .abrand small{display:block;font-size:11.5px;font-weight:500;color:var(--muted);-webkit-text-fill-color:var(--muted);letter-spacing:0}
    .anav{display:flex;gap:6px}
    .anav button,.chips button{background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:7px 12px;border-radius:10px;font-weight:600}
    .anav button.on,.chips button.on{color:#052e12;background:var(--accent);border-color:var(--accent)}
    .chips{display:flex;gap:6px;flex-wrap:wrap}
    .afil{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:14px}
    .afil select,.afil input[type=date]{width:auto;padding:7px 10px}
    .hero{display:grid;grid-template-columns:1.4fr repeat(5,1fr);gap:10px;margin-bottom:10px}
    .hk{background:linear-gradient(160deg,rgba(34,197,94,.10),rgba(34,197,94,.02) 70%),var(--panel);border:1px solid rgba(34,197,94,.22);border-radius:16px;padding:14px 16px}
    .hk .l{font-size:12px;color:var(--muted);font-weight:500}
    .hk .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
    .hk.big .v{font-size:34px;color:#4ade80}
    .hk .s{font-size:11.5px;color:var(--dim);margin-top:2px}
    .mini{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:14px}
    .mk{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
    .mk .l{font-size:11px;color:var(--muted)}.mk .v{font-size:17px;font-weight:800}.mk .s{font-size:11px;color:var(--dim)}
    .pos{color:#4ade80}.neg{color:var(--down)}
    .acard{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}
    .acard h3{margin:0 0 10px;font-size:15px;display:flex;align-items:center;gap:8px}
    .ach{height:270px}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .crl{display:grid;gap:8px}
    .cr2{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:8px 10px}
    .cr2 img,.cr2 .ph{width:52px;height:52px;border-radius:8px;object-fit:cover;background:#0a120c;display:grid;place-items:center;color:var(--dim)}
    .cr2 .n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cr2 .d{font-size:12px;color:var(--muted)}
    .rank{font-weight:800;color:#4ade80;margin-right:4px}
    table.at{width:100%;border-collapse:collapse;font-size:13px}
    table.at th{text-align:right;color:var(--muted);font-weight:500;font-size:11.5px;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:default}
    table.at th:first-child,table.at td:first-child{text-align:left}
    table.at td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    table.at tr.n0{background:rgba(34,197,94,.03)}
    table.at tr.n1 td:first-child{padding-left:26px}table.at tr.n2 td:first-child{padding-left:46px;color:var(--muted)}
    table.at tr.sa td{color:var(--muted)}
    .an{max-width:330px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle}
    .ex{cursor:pointer;color:var(--dim);display:inline-block;width:16px}
    .ib{background:var(--panel2);border:1px solid var(--line2);color:var(--text);border-radius:7px;padding:3px 7px;font-size:12px}
    .st2{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
    .st2.aprovada{background:rgba(34,197,94,.15);color:#4ade80}.st2.pendente{background:rgba(245,158,11,.15);color:#fbbf24}
    .st2.reembolsada,.st2.chargeback{background:rgba(240,82,82,.15);color:#fca5a5}.st2.recusada,.st2.cancelada{background:var(--panel2);color:var(--muted)}
    .bar{height:6px;border-radius:99px;background:var(--panel2);overflow:hidden;margin-top:4px}.bar i{display:block;height:100%;background:linear-gradient(90deg,#16a34a,#4ade80)}
    .step{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
    .step h3{margin:0 0 6px;font-size:15px}.step p{margin:0 0 10px;color:var(--muted);font-size:13px}
    .step ol{margin:6px 0 10px;padding-left:20px;color:var(--muted);font-size:13px}.step li{margin:4px 0}
    .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#07100a;border:1px solid var(--line2);border-radius:10px;padding:10px;white-space:pre;overflow:auto;max-height:220px;color:#bbf7d0}
    .wh{display:grid;grid-template-columns:140px 1fr auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
    .wh code{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#bbf7d0}
    .wh .o{grid-column:2/-1;font-size:11.5px;color:var(--dim);margin-top:-4px}
    .ok3{color:#4ade80}.bad3{color:var(--down)}
    .fg2{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .aempty{text-align:center;padding:40px 20px;border:1px dashed rgba(34,197,94,.35);border-radius:16px;background:rgba(34,197,94,.03);margin-bottom:14px}
    .aempty h2{margin:0 0 6px}.aempty p{color:var(--muted);margin:0 auto 14px;max-width:560px}
    .agentbox{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:linear-gradient(90deg,rgba(34,197,94,.12),rgba(34,197,94,.03));border:1px solid rgba(34,197,94,.3);border-radius:14px;padding:10px 14px;margin-bottom:14px;font-size:13px}
    @media(max-width:1100px){.hero{grid-template-columns:repeat(3,1fr)}.mini{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:1fr 1fr}}
    @media(max-width:700px){.hero{grid-template-columns:1fr 1fr}.hk.big{grid-column:1/-1}.mini{grid-template-columns:repeat(2,1fr)}.g2,.g3,.fg2{grid-template-columns:1fr}.wh{grid-template-columns:1fr auto}.wh b{grid-column:1/-1}}`;
    document.head.appendChild(st);
  }

  const raiz = () => $("#viewAnalytics");
  async function iniciar() {
    estilos();
    raiz().innerHTML = `<div class="ahead"><div class="abrand">💰 Debian Analytics<small>vendas reais × gastos × lucro, by Paid Traffic Agent 🐉</small></div><div class="spacer"></div>
      <div class="anav" id="aNav"><button data-a="dashboard">📊 Dashboard</button><button data-a="campanhas">📋 Campanhas</button><button data-a="vendas">🧾 Vendas</button><button data-a="criativos">🏆 Criativos</button><button data-a="produtos">📦 Produtos</button><button data-a="integracoes">🔗 Integrações</button></div></div><div id="aCorpo"></div>`;
    $("#aNav").onclick = (e) => { const b = e.target.closest("[data-a]"); if (b) ir(b.dataset.a); };
    ir(S.aba);
  }
  function ir(aba) {
    if (aba === "painel") aba = "dashboard";
    S.aba = aba; LS.set("aba", aba);
    $$("#aNav button").forEach((b) => b.classList.toggle("on", b.dataset.a === aba));
    if (window.MO && window.MO.sincronizarMenu) window.MO.sincronizarMenu("utmfy/" + aba);
    if (aba === "integracoes") vIntegracoes(); else if (aba === "vendas") vVendas(); else if (S.r && ["dashboard", "campanhas", "criativos", "produtos"].includes(aba) && S.rCarregadoHa && Date.now() - S.rCarregadoHa < 60000) render(); else vPainel();
  }
  const irExterno = (aba) => ir(aba);
  const corpo = (h) => { $("#aCorpo").innerHTML = h; };

  // ---------- PAINEL ----------
  async function carregar() {
    const q = new URLSearchParams({ periodo: S.f.periodo, de: S.f.de, ate: S.f.ate, plataforma: S.f.plataforma, produto: S.f.produto, checkout: S.f.checkout, testes: S.f.testes ? "1" : "" });
    try { [S.r, S.cfgT] = await Promise.all([api("/api/analytics/relatorio?" + q), api("/api/trafego/config")]); S.rCarregadoHa = Date.now(); }
    catch (e) { toast(e.message, true); }
  }
  async function vPainel() {
    corpo(`<div class="acard"><div class="spin" style="display:inline-block"></div> Carregando…</div>`);
    await carregar();
    render();
  }
  const PERIODOS = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["mespassado", "Mês passado"], ["custom", "Personalizado"]];
  function blocoFiltros(r, comProduto = true) {
    return `<div class="afil">
        <div class="chips" id="aPer">${PERIODOS.map(([k, n]) => `<button data-p="${k}" class="${S.f.periodo === k ? "on" : ""}">${n}</button>`).join("")}</div>
        <span id="aCustom" style="display:${S.f.periodo === "custom" ? "flex" : "none"};gap:6px;align-items:center"><input type="date" id="aDe" value="${esc(S.f.de || r.de)}"> até <input type="date" id="aAte" value="${esc(S.f.ate || r.ate)}"></span>
        <div class="spacer"></div>
        <select id="aPlat"><option value="">Meta + Google</option><option value="meta">Só Meta</option><option value="google">Só Google</option></select>
        ${comProduto ? `<select id="aProd"><option value="">Todos os produtos</option>${r.opcoes.produtos.map((p) => `<option>${esc(p)}</option>`).join("")}</select>
        <select id="aChk"><option value="">Todos os checkouts</option>${r.opcoes.checkouts.map((p) => `<option>${esc(p)}</option>`).join("")}</select>` : ""}
        ${r.opcoes.temTestes ? `<label class="chk" style="padding:0"><input type="checkbox" id="aTst" ${S.f.testes ? "checked" : ""}> vendas de teste</label>` : ""}
        <button class="btn sm primary" id="aSync">↻ Atualizar</button>
      </div>`;
  }
  function blocoAgente() {
    const fonteVendas = S.cfgT?.regras?.fonteConversoes === "vendas";
    return `<div class="agentbox">🤖 <b>Gerenciador de anúncios:</b> ${fonteVendas ? `<span class="ok3">decidindo pelas vendas reais (ROI das UTMs)</span>. Ele escala o que dá lucro e pausa o que dá prejuízo.` : `está usando as conversões do pixel.`}
        <div class="spacer"></div><button class="btn sm ${fonteVendas ? "" : "primary"}" id="aFonte">${fonteVendas ? "Voltar a usar o pixel" : "Usar vendas reais no piloto automático"}</button></div>`;
  }
  function blocoHero(t) {
    return `<div class="hero">
        <div class="hk big"><div class="l">Faturamento líquido</div><div class="v">${brl(t.liquido)}</div><div class="s">bruto ${brl(t.bruto)}</div></div>
        <div class="hk"><div class="l">Gastos com anúncios</div><div class="v">${brl(t.gasto)}</div><div class="s">${num(t.cliques)} cliques</div></div>
        <div class="hk"><div class="l">Lucro</div><div class="v ${cor(t.lucro)}">${brl(t.lucro)}</div><div class="s">já tirando impostos e custos</div></div>
        <div class="hk"><div class="l">ROI</div><div class="v ${cor(t.roi)}">${pct(t.roi, true)}</div><div class="s">lucro ÷ gasto</div></div>
        <div class="hk"><div class="l">ROAS</div><div class="v">${x2(t.roas)}</div><div class="s">faturamento ÷ gasto</div></div>
        <div class="hk"><div class="l">Margem</div><div class="v ${cor(t.margem)}">${pct(t.margem)}</div><div class="s">lucro ÷ faturamento</div></div>
      </div>
      <div class="mini">
        <div class="mk"><div class="l">Vendas aprovadas</div><div class="v">${num(t.vendas)}</div></div>
        <div class="mk"><div class="l">Ticket médio</div><div class="v">${brl(t.ticket)}</div></div>
        <div class="mk"><div class="l">CPA real</div><div class="v">${brl(t.cpa)}</div><div class="s">gasto ÷ vendas</div></div>
        <div class="mk"><div class="l">Pendentes</div><div class="v">${num(t.pendentes)}</div><div class="s">${brl(t.valorPendente)}</div></div>
        <div class="mk"><div class="l">Reembolsos</div><div class="v ${t.reembolsos ? "neg" : ""}">${num(t.reembolsos)}</div><div class="s">${brl(t.valorReembolsos)}</div></div>
        <div class="mk"><div class="l">Chargebacks</div><div class="v ${t.chargebacks ? "neg" : ""}">${num(t.chargebacks)}</div><div class="s">${brl(t.valorChargebacks)}</div></div>
        <div class="mk"><div class="l">Impostos + custos</div><div class="v">${brl((t.impostos || 0) + (t.custos || 0))}</div></div>
      </div>`;
  }
  const blocoCampeoes = (r, n = 5) => `<div class="g2">
        <div class="acard"><h3>🏆 Criativos campeões</h3><div class="crl">${criativos(r.criativos.melhores.filter((a) => a.vendas > 0 && a.lucro > 0).slice(0, n), true) || `<div class="note">Nenhum anúncio com lucro neste período ainda.</div>`}</div></div>
        <div class="acard"><h3>🕳️ Criativos no prejuízo</h3><div class="crl">${criativos(r.criativos.piores.filter((a) => a.lucro < 0).slice(0, n), false) || `<div class="note">Nenhum anúncio no prejuízo neste período. 💚</div>`}</div></div>
      </div>`;
  const blocoCampanhas = (r) => `<div class="acard"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><h3 style="margin:0">📋 Campanhas</h3><div class="spacer"></div>
        <select id="aOrd" style="width:auto;padding:6px 10px"><option value="lucro">Maior lucro</option><option value="roi">Maior ROI</option><option value="liquido">Maior faturamento</option><option value="gasto">Maior gasto</option><option value="vendas">Mais vendas</option><option value="pior">Maior prejuízo</option></select>
        <button class="btn sm" id="aExpTudo">Expandir tudo</button></div>
        <div style="overflow:auto">${tabela(r)}</div></div>`;
  const blocoProdutos = (r) => `<div class="g3">
        <div class="acard"><h3>📦 Produtos</h3>${tabelaSimples(r.produtos, "Produto", 30)}</div>
        <div class="acard"><h3>💳 Pagamentos</h3>${metodos(r.metodos)}</div>
        <div class="acard"><h3>🛒 Checkouts</h3>${tabelaSimples(r.checkouts, "Checkout", 30)}</div>
      </div>`;
  function blocoRanking(r) {
    const lista = r.criativos.todos || [];
    if (!lista.length) return `<div class="acard"><div class="note">Sem anúncios com gasto ou vendas neste período.</div></div>`;
    return `<div class="acard"><h3>🏆 Ranking de criativos <span class="note">(${lista.length})</span></h3><div style="overflow:auto"><table class="at"><thead><tr><th>#</th><th style="text-align:left">Criativo</th><th style="text-align:left">Campanha</th><th>Gasto</th><th>Vendas</th><th>Faturamento</th><th>Lucro</th><th>ROI</th><th>CTR</th><th></th></tr></thead><tbody>
      ${lista.map((a, i) => `<tr data-plat="${esc(a.plataforma)}" data-id="${esc(a.id)}" data-nivel="anuncio"><td>${i + 1}</td><td style="text-align:left"><span class="an" title="${esc(a.nome)}">${a.status ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${a.status === "ativo" ? "var(--up)" : "var(--dim)"}"></span>` : ""}${esc(a.nome)}</span></td><td style="text-align:left"><span class="an" style="max-width:200px">${esc(a.campanha)}</span></td><td>${brl(a.gasto)}</td><td>${num(a.vendas)}</td><td>${brl(a.liquido)}</td><td class="${cor(a.lucro)}">${brl(a.lucro)}</td><td class="${cor(a.roi)}">${pct(a.roi, true)}</td><td>${pct(a.ctr)}</td><td style="white-space:nowrap">${a.vendas > 0 && a.lucro > 0 ? `<button class="ib" data-var-tab="1" title="Gerar variações">🎯</button> ` : ""}${acoes(a)}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }
  function render() {
    const r = S.r;
    if (!r) return;
    const t = r.total;
    const vazio = !t.vendas && !t.gasto && !t.pendentes && !r.ultimas.length;
    const aviso = vazio ? `<div class="aempty"><h2>Nenhum dado neste período</h2><p>Para ver faturamento, lucro e ROI, conecte o receptor de vendas e os webhooks do seu checkout em <b>🔗 Integrações</b>, e as contas de anúncio em <b>Gerenciador de anúncios → Contas de anúncio</b>.</p><button class="btn primary" id="aIrInt">🔗 Configurar integrações</button></div>` : "";
    const partes = {
      dashboard: () => blocoFiltros(r) + blocoAgente() + statusLinha(r) + aviso + blocoHero(t) + (r.porDia.length > 1 ? `<div class="acard"><h3>📈 Faturamento × gasto × lucro por dia</h3><div class="ach"><canvas id="aChart"></canvas></div></div>` : "") + blocoCampeoes(r, 5) + `<div class="acard"><h3>🧾 Últimas vendas</h3>${ultimas(r.ultimas.slice(0, 10))}</div>`,
      campanhas: () => blocoFiltros(r) + statusLinha(r) + `<div class="mini" style="grid-template-columns:repeat(5,1fr)"><div class="mk"><div class="l">Gasto</div><div class="v">${brl(t.gasto)}</div></div><div class="mk"><div class="l">Faturamento</div><div class="v">${brl(t.liquido)}</div></div><div class="mk"><div class="l">Lucro</div><div class="v ${cor(t.lucro)}">${brl(t.lucro)}</div></div><div class="mk"><div class="l">ROI</div><div class="v ${cor(t.roi)}">${pct(t.roi, true)}</div></div><div class="mk"><div class="l">Vendas</div><div class="v">${num(t.vendas)}</div></div></div>` + blocoCampanhas(r),
      criativos: () => blocoFiltros(r) + blocoCampeoes(r, 5) + blocoRanking(r),
      produtos: () => blocoFiltros(r) + blocoProdutos(r),
    };
    corpo((partes[S.aba] || partes.dashboard)() + `<p class="note">🐉 UTMFy do Debian · Lucro = faturamento líquido − gasto com anúncios − impostos − custos (configure em 🔗 Integrações → Custos). Fuso ${esc(r.fuso)}.</p>`);
    const val = (id, v) => { const el = $(id); if (el) el.value = v; };
    val("#aPlat", S.f.plataforma); val("#aProd", S.f.produto); val("#aChk", S.f.checkout); val("#aOrd", S.ordem);
    const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
    on("#aPer", "onclick", (e) => { const b = e.target.closest("[data-p]"); if (!b) return; S.f.periodo = b.dataset.p; salvarF(); if (S.f.periodo === "custom") { render(); return; } vPainel(); });
    const de = $("#aDe"), ate = $("#aAte");
    if (de) de.onchange = ate.onchange = () => { S.f.de = de.value; S.f.ate = ate.value; salvarF(); vPainel(); };
    for (const [id, k] of [["#aPlat", "plataforma"], ["#aProd", "produto"], ["#aChk", "checkout"]]) on(id, "onchange", (e) => { S.f[k] = e.target.value; salvarF(); vPainel(); });
    on("#aTst", "onchange", (e) => { S.f.testes = e.target.checked; salvarF(); vPainel(); });
    on("#aOrd", "onchange", (e) => { S.ordem = e.target.value; LS.set("ordem", S.ordem); render(); });
    on("#aExpTudo", "onclick", () => { for (const c of r.campanhas) { S.abertos.add(`c:${c.plataforma}:${c.id}`); for (const sj of c.conjuntos) S.abertos.add(`s:${sj.plataforma}:${sj.id}`); } render(); });
    on("#aSync", "onclick", sincronizar);
    on("#aFonte", "onclick", alternarFonte);
    on("#aIrInt", "onclick", () => irExterno("integracoes"));
    $("#aCorpo").onclick = cliques;
    desenharGrafico(r);
  }

  // ---------- VENDAS (lista completa) ----------
  const SV = { status: "", q: "", pagina: 1, aberta: null };
  async function vVendas() {
    corpo(`<div class="acard"><div class="spin" style="display:inline-block"></div> Carregando…</div>`);
    const q = new URLSearchParams({ periodo: S.f.periodo, de: S.f.de, ate: S.f.ate, produto: S.f.produto, checkout: S.f.checkout, status: SV.status, q: SV.q, pagina: SV.pagina, testes: S.f.testes ? "1" : "" });
    let d, rel;
    try { [d, rel] = await Promise.all([api("/api/analytics/vendas?" + q), S.r ? Promise.resolve(S.r) : api("/api/analytics/relatorio?periodo=" + S.f.periodo)]); S.r = rel; }
    catch (e) { toast(e.message, true); return; }
    const met = { pix: "Pix", cartao: "Cartão", boleto: "Boleto", paypal: "PayPal" };
    const sts = [["", "Todos"], ["aprovada", "Aprovadas"], ["pendente", "Pendentes"], ["reembolsada", "Reembolsadas"], ["chargeback", "Chargeback"], ["recusada", "Recusadas"], ["cancelada", "Canceladas"]];
    corpo(`${blocoFiltros(rel)}
      <div class="afil"><div class="chips" id="vSt">${sts.map(([k, n]) => `<button data-s="${k}" class="${SV.status === k ? "on" : ""}">${n}</button>`).join("")}</div><div class="spacer"></div>
        <input id="vQ" placeholder="🔎 nome, e-mail, transação, campanha…" value="${esc(SV.q)}" style="max-width:300px"><button class="btn sm" id="vCsv">📋 Copiar CSV</button></div>
      <div class="mini" style="grid-template-columns:repeat(4,1fr)"><div class="mk"><div class="l">Vendas encontradas</div><div class="v">${num(d.total)}</div></div><div class="mk"><div class="l">Aprovado (líquido)</div><div class="v pos">${brl(d.resumo.aprovadas)}</div></div><div class="mk"><div class="l">Pendentes</div><div class="v">${num(d.resumo.pendentes)}</div></div><div class="mk"><div class="l">Reembolsado</div><div class="v ${d.resumo.reembolsadas ? "neg" : ""}">${brl(d.resumo.reembolsadas)}</div></div></div>
      <div class="acard"><div style="overflow:auto"><table class="at" id="vTab"><thead><tr><th>Data</th><th style="text-align:left">Cliente</th><th style="text-align:left">Produto</th><th>Valor</th><th>Líquido</th><th>Status</th><th>Pagamento</th><th style="text-align:left">Campanha › anúncio</th></tr></thead><tbody>
      ${d.itens.map((v) => `<tr data-v="${esc(v.id)}" style="cursor:pointer"><td>${new Date(v.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td style="text-align:left"><span class="an" style="max-width:200px" title="${esc(v.email)}">${esc(v.nome || v.email || "–")}</span></td><td style="text-align:left">${esc(v.produto)} <span class="note">${esc(v.checkout)}</span>${v.teste ? ` <span class="chip">teste</span>` : ""}</td><td>${brl(v.valor)}</td><td>${brl(v.liquido)}</td><td><span class="st2 ${v.status}">${esc(v.status)}</span></td><td>${esc(met[v.metodo] || v.metodo || "–")}${v.parcelas > 1 ? ` ${v.parcelas}x` : ""}</td><td style="text-align:left"><span class="an" style="max-width:300px" title="${esc([v.campanha, v.conjunto, v.anuncio].filter(Boolean).join(" › "))}">${esc(v.anuncio ? v.campanha + " › " + v.anuncio : v.campanha || v.origem)}</span></td></tr>
        ${SV.aberta === v.id ? `<tr><td colspan="8" style="text-align:left;background:rgba(34,197,94,.04);white-space:normal"><div class="note">Transação <b>${esc(v.transacao)}</b> · ${esc(v.email)}<br>UTMs: ${Object.entries(v.utm).map(([k, x]) => `<code>utm_${esc(k)}=${esc(x)}</code>`).join(" ") || "nenhuma"}<br>Histórico: ${v.historico.map((h) => `${esc(h.status)} (${new Date(h.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`).join(" → ")}</div></td></tr>` : ""}`).join("") || `<tr><td colspan="8" class="note" style="text-align:left;padding:14px">Nenhuma venda com esses filtros.</td></tr>`}
      </tbody></table></div>
      ${d.paginas > 1 ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;align-items:center"><button class="btn sm" id="vAnt" ${d.pagina <= 1 ? "disabled" : ""}>← Anterior</button><span class="note">página ${d.pagina} de ${d.paginas}</span><button class="btn sm" id="vProx" ${d.pagina >= d.paginas ? "disabled" : ""}>Próxima →</button></div>` : ""}</div>
      <p class="note">🐉 UTMFy do Debian · clique numa venda para ver as UTMs e o histórico de status.</p>`);
    $("#aPlat").closest("select") && ($("#aPlat").style.display = "none");
    const val = (id, v) => { const el = $(id); if (el) el.value = v; };
    val("#aProd", S.f.produto); val("#aChk", S.f.checkout);
    $("#aPer").onclick = (e) => { const b = e.target.closest("[data-p]"); if (!b) return; S.f.periodo = b.dataset.p; salvarF(); SV.pagina = 1; if (S.f.periodo === "custom") { $("#aCustom").style.display = "flex"; return; } vVendas(); };
    const de = $("#aDe"), ate = $("#aAte");
    if (de) de.onchange = ate.onchange = () => { S.f.de = de.value; S.f.ate = ate.value; salvarF(); vVendas(); };
    for (const [id, k] of [["#aProd", "produto"], ["#aChk", "checkout"]]) { const el = $(id); if (el) el.onchange = (e) => { S.f[k] = e.target.value; salvarF(); SV.pagina = 1; vVendas(); }; }
    const tst = $("#aTst"); if (tst) tst.onchange = (e) => { S.f.testes = e.target.checked; salvarF(); vVendas(); };
    $("#aSync").onclick = async () => { await sincronizar(true); vVendas(); };
    $("#vSt").onclick = (e) => { const b = e.target.closest("[data-s]"); if (!b) return; SV.status = b.dataset.s; SV.pagina = 1; vVendas(); };
    let t; $("#vQ").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { SV.q = e.target.value; SV.pagina = 1; vVendas().then(() => { const i = $("#vQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 400); };
    const ant = $("#vAnt"), prox = $("#vProx");
    if (ant) ant.onclick = () => { SV.pagina--; vVendas(); };
    if (prox) prox.onclick = () => { SV.pagina++; vVendas(); };
    $("#vTab").onclick = (e) => { const tr = e.target.closest("[data-v]"); if (!tr) return; SV.aberta = SV.aberta === tr.dataset.v ? null : tr.dataset.v; vVendas(); };
    $("#vCsv").onclick = async () => {
      const linhas = [["data", "transacao", "checkout", "status", "produto", "valor", "liquido", "pagamento", "cliente", "email", "campanha", "conjunto", "anuncio"].join(";")]
        .concat(d.itens.map((v) => [v.quando, v.transacao, v.checkout, v.status, v.produto, v.valor, v.liquido, v.metodo, v.nome, v.email, v.campanha, v.conjunto, v.anuncio].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")));
      try { await navigator.clipboard.writeText(linhas.join("\n")); toast("CSV copiado ✓ (página atual) · cole no Excel ou Google Sheets"); } catch { toast("Não consegui copiar", true); }
    };
  }
  const salvarF = () => LS.set("filtros", S.f);
  function statusLinha(r) {
    const s = r.status || {};
    const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
    const partes = [
      s.worker ? `<span class="ok3">●</span> Receptor de vendas conectado · última busca ${quando(s.ultimaSync)}` : `<span class="bad3">●</span> Receptor de vendas não configurado`,
      `Gastos atualizados ${quando(s.ultimaSyncGastos)}`,
    ];
    const erros = [s.erroSync, s.erroGastos].filter(Boolean);
    return `<div class="note" style="margin:-4px 0 12px">${partes.join(" · ")}${erros.length ? `<div class="bad3" style="margin-top:4px">⚠️ ${erros.map(esc).join(" · ")}</div>` : ""}</div>`;
  }
  function linhaMetricas(m) {
    return `<td>${brl(m.gasto)}</td><td>${num(m.vendas)}</td><td>${brl(m.liquido)}</td><td class="${cor(m.lucro)}">${brl(m.lucro)}</td><td class="${cor(m.roi)}">${pct(m.roi, true)}</td><td>${x2(m.roas)}</td><td>${brl(m.cpa)}</td>`;
  }
  const ordenadores = { lucro: (a, b) => b.lucro - a.lucro, roi: (a, b) => (b.roi ?? -1e9) - (a.roi ?? -1e9), liquido: (a, b) => b.liquido - a.liquido, gasto: (a, b) => b.gasto - a.gasto, vendas: (a, b) => b.vendas - a.vendas, pior: (a, b) => a.lucro - b.lucro };
  function acoes(item, plataforma) {
    if (!item.status || !["ativo", "pausado"].includes(item.status)) return "";
    return item.status === "ativo" ? `<button class="ib" data-acao="pausar" title="Pausar">⏸</button>` : `<button class="ib" data-acao="ativar" title="Ativar">▶</button>`;
  }
  function tabela(r) {
    const ord = ordenadores[S.ordem] || ordenadores.lucro;
    const linha = (it, n, k, temFilhos) => {
      const aberto = S.abertos.has(k);
      return `<tr class="n${n}" data-k="${esc(k)}" data-plat="${esc(it.plataforma)}" data-id="${esc(it.id)}" data-nivel="${esc(it.nivel)}">
        <td>${temFilhos ? `<span class="ex" data-ex="${esc(k)}">${aberto ? "▾" : "▸"}</span>` : `<span class="ex"></span>`}${it.status ? `<span class="dot ${it.status}" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${it.status === "ativo" ? "var(--up)" : "var(--dim)"}"></span>` : ""}<span class="an" title="${esc(it.nome)}">${esc(it.nome)}</span>${n === 0 && it.plataforma ? ` <span class="chip">${it.plataforma === "meta" ? "Meta" : "Google"}</span>` : ""}</td>
        ${linhaMetricas(it)}<td>${acoes(it)}</td></tr>`;
    };
    let html = "";
    for (const c of [...r.campanhas].sort(ord)) {
      const kc = `c:${c.plataforma}:${c.id}`;
      html += linha(c, 0, kc, c.conjuntos.length);
      if (!S.abertos.has(kc)) continue;
      for (const s of [...c.conjuntos].sort(ord)) {
        const ks = `s:${s.plataforma}:${s.id}`;
        html += linha(s, 1, ks, s.anuncios.length);
        if (!S.abertos.has(ks)) continue;
        for (const a of [...s.anuncios].sort(ord)) html += linha(a, 2, `a:${a.plataforma}:${a.id}`, false);
      }
    }
    for (const sa of r.semAtribuicao) html += `<tr class="sa"><td><span class="ex"></span>🔎 ${esc(sa.nome)}</td>${linhaMetricas(sa)}<td></td></tr>`;
    return `<table class="at"><thead><tr><th>Campanha / conjunto / anúncio</th><th>Gasto</th><th>Vendas</th><th>Faturamento</th><th>Lucro</th><th>ROI</th><th>ROAS</th><th>CPA</th><th></th></tr></thead><tbody>${html || `<tr><td colspan="9" class="note" style="text-align:left;padding:14px">Sem campanhas com gasto ou vendas neste período.</td></tr>`}</tbody></table>`;
  }
  function criativos(lista, bons) {
    return (lista || []).slice(0, 5).map((a, i) => `<div class="cr2" data-cr="${esc(a.plataforma)}:${esc(a.id)}">
      ${a.thumb ? `<img src="${esc(a.thumb)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'🎬'}))">` : `<div class="ph">🎬</div>`}
      <div style="min-width:0"><div class="n"><span class="rank">${bons ? "#" + (i + 1) : ""}</span>${esc(a.nome)}</div><div class="d">${esc(a.campanha)} · ${num(a.vendas)} venda(s) · gasto ${brl(a.gasto)} · lucro <span class="${cor(a.lucro)}">${brl(a.lucro)}</span> · ROI <span class="${cor(a.roi)}">${pct(a.roi, true)}</span></div></div>
      <div style="display:flex;gap:6px">${bons ? `<button class="btn sm" data-var="1" title="Gerar novas copies/roteiros a partir deste criativo">🎯 Variações</button>` : a.status === "ativo" ? `<button class="btn sm" data-acao-cr="pausar">⏸ Pausar</button>` : ""}${a.status === "pausado" ? `<span class="note">pausado</span>` : ""}</div></div>`).join("");
  }
  function tabelaSimples(lista, rotulo, max = 8) {
    if (!lista.length) return `<div class="note">Sem vendas.</div>`;
    return `<table class="at"><thead><tr><th>${rotulo}</th><th>Vendas</th><th>Faturamento</th><th>Reemb.</th></tr></thead><tbody>${lista.slice(0, max).map((p) => `<tr><td><span class="an" style="max-width:170px" title="${esc(p.nome)}">${esc(p.nome)}</span></td><td>${num(p.vendas)}</td><td>${brl(p.liquido)}</td><td>${num(p.reembolsos)}</td></tr>`).join("")}</tbody></table>`;
  }
  function metodos(lista) {
    if (!lista.length) return `<div class="note">Sem vendas.</div>`;
    const nome = { pix: "Pix", cartao: "Cartão", boleto: "Boleto", paypal: "PayPal", outro: "Outro" };
    return lista.map((m) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(nome[m.nome] || m.nome)}</span><span><b>${num(m.vendas)}</b> de ${num(m.tentativas)} · <span class="ok3">${pct(m.aprovacao)}</span> aprovação</span></div><div class="bar"><i style="width:${Math.max(2, Math.min(100, m.aprovacao || 0))}%"></i></div></div>`).join("");
  }
  function ultimas(lista) {
    if (!lista.length) return `<div class="note">Nenhuma venda neste período.</div>`;
    const met = { pix: "Pix", cartao: "Cartão", boleto: "Boleto" };
    return `<div style="overflow:auto"><table class="at"><thead><tr><th>Quando</th><th style="text-align:left">Produto</th><th>Valor</th><th>Status</th><th>Pagamento</th><th style="text-align:left">Origem</th></tr></thead><tbody>${lista.map((v) => `<tr><td>${new Date(v.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td style="text-align:left">${esc(v.produto)}${v.teste ? ` <span class="chip">teste</span>` : ""} <span class="note">${esc(v.checkout)}</span></td><td>${brl(v.valor)}</td><td><span class="st2 ${v.status}">${esc(v.status)}</span></td><td>${esc(met[v.metodo] || v.metodo || "–")}</td><td style="text-align:left"><span class="an" style="max-width:280px" title="${esc(v.campanha + (v.anuncio ? " › " + v.anuncio : ""))}">${esc(v.anuncio || v.campanha)}</span></td></tr>`).join("")}</tbody></table></div>`;
  }
  function desenharGrafico(r) {
    const cv = $("#aChart");
    if (!cv || typeof Chart === "undefined") return;
    if (S.chart) S.chart.destroy();
    const lab = r.porDia.map((d) => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7));
    S.chart = new Chart(cv, {
      data: { labels: lab, datasets: [
        { type: "bar", label: "Faturamento líquido", data: r.porDia.map((d) => +d.liquido.toFixed(2)), backgroundColor: "rgba(34,197,94,.55)", borderRadius: 6, order: 2 },
        { type: "bar", label: "Gasto", data: r.porDia.map((d) => +d.gasto.toFixed(2)), backgroundColor: "rgba(148,163,150,.35)", borderRadius: 6, order: 3 },
        { type: "line", label: "Lucro", data: r.porDia.map((d) => +d.lucro.toFixed(2)), borderColor: "#86efac", backgroundColor: "#86efac", tension: 0.3, pointRadius: 3, order: 1 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: "#8fa595", boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.parsed.y)}` } } },
        scales: { x: { ticks: { color: "#8fa595" }, grid: { color: "rgba(255,255,255,.04)" } }, y: { ticks: { color: "#8fa595", callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR") }, grid: { color: "rgba(255,255,255,.06)" } } } },
    });
  }
  function acharItem(plat, id, nivel) {
    for (const c of S.r.campanhas) {
      if (nivel === "campanha" && c.plataforma === plat && c.id === id) return c;
      for (const s of c.conjuntos) {
        if (nivel === "conjunto" && s.plataforma === plat && s.id === id) return s;
        for (const a of s.anuncios) if ((nivel === "anuncio" || !nivel) && a.plataforma === plat && a.id === id) return a;
      }
    }
    return null;
  }
  async function executar(item, tipo) {
    if (!item) return;
    const ok = await confirmar(`${tipo === "pausar" ? "Pausar" : "Ativar"} “${item.nome}”?`, tipo === "ativar" ? "Volta a gastar dinheiro." : "Você pode reativar depois com um clique.");
    if (!ok) return;
    try {
      const r = await api("/api/trafego/acao", { body: { plataforma: item.plataforma, tipo, nivel: item.nivel, id: item.id, nome: item.nome, recurso: item.recurso } });
      if (!r.ok) throw new Error(r.erro);
      toast("Feito ✓"); await carregar(); render();
    } catch (e) { toast(e.message, true); }
  }
  async function cliques(e) {
    const ex = e.target.closest("[data-ex]");
    if (ex) { const k = ex.dataset.ex; S.abertos.has(k) ? S.abertos.delete(k) : S.abertos.add(k); render(); return; }
    const vt = e.target.closest("[data-var-tab]");
    if (vt) { const tr = vt.closest("tr"); const it = (S.r.criativos.todos || []).find((a) => a.plataforma === tr.dataset.plat && a.id === tr.dataset.id); if (it) variacoes(it); return; }
    const ac = e.target.closest("[data-acao]");
    if (ac) { const tr = ac.closest("tr"); return executar(acharItem(tr.dataset.plat, tr.dataset.id, tr.dataset.nivel), ac.dataset.acao); }
    const cr = e.target.closest("[data-cr]");
    if (!cr) return;
    const [plat, ...resto] = cr.dataset.cr.split(":");
    const item = acharItem(plat, resto.join(":"), "anuncio");
    if (e.target.closest("[data-acao-cr]")) return executar(item, "pausar");
    if (e.target.closest("[data-var]") && item) variacoes(item);
  }
  function variacoes(item) {
    if (!window.MO_T) return;
    window.MO_T.adicionarCriativoProprio({ nome: item.nome, campanha: item.campanha, texto: item.texto, titulo: item.titulo, vendas: item.vendas, roi: item.roi, lucro: item.lucro });
    window.MO.ir("clonador/criativos");
  }
  async function sincronizar(semRecarregar) {
    const b = $("#aSync"); b.disabled = true; b.textContent = "Buscando…";
    try {
      const r = await api("/api/analytics/sincronizar", { body: {} });
      const n = r.vendas?.novas || 0;
      toast(r.erros.length ? r.erros.join(" · ") : `Atualizado ✓${n ? ` · ${n} venda(s) nova(s)` : ""}`, r.erros.length > 0);
    } catch (e) { toast(e.message, true); }
    S.rCarregadoHa = 0;
    if (semRecarregar !== true) await vPainel();
  }
  async function alternarFonte() {
    const atual = S.cfgT?.regras?.fonteConversoes === "vendas";
    if (!atual && !(await confirmar("O piloto automático vai decidir pelas vendas reais?", "Ele passa a escalar campanhas com ROI acima do mínimo e pausar anúncios no prejuízo, usando as vendas atribuídas pelas UTMs. Ajuste os limites em Tráfego → Piloto automático."))) return;
    try { S.cfgT = await api("/api/trafego/config", { body: { regras: { fonteConversoes: atual ? "plataforma" : "vendas" } } }); toast(atual ? "Piloto voltou a usar o pixel" : "Piloto agora decide pelo ROI real ✓"); render(); }
    catch (e) { toast(e.message, true); }
  }
  function confirmar(t, d) {
    return new Promise((ok) => {
      const ov = document.createElement("div");
      ov.className = "overlay open";
      ov.innerHTML = `<div class="modal" style="max-width:440px"><h3 style="margin:0 0 8px">${esc(t)}</h3>${d ? `<p class="note">${esc(d)}</p>` : ""}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn sm" data-r="0">Cancelar</button><button class="btn sm primary" data-r="1">Confirmar</button></div></div>`;
      document.body.appendChild(ov);
      ov.onclick = (e) => { const b = e.target.closest("[data-r]"); if (e.target === ov || b) { ov.remove(); ok(!!b && b.dataset.r === "1"); } };
    });
  }

  // ---------- INTEGRAÇÕES ----------
  async function vIntegracoes() {
    corpo(`<div class="acard"><div class="spin" style="display:inline-block"></div> Carregando…</div>`);
    try { S.integ = await api("/api/analytics/integracoes"); } catch (e) { toast(e.message, true); return; }
    const I = S.integ;
    const st = I.status;
    corpo(`
      <div class="step"><h3>1. Receptor de vendas 24h (Cloudflare, grátis) ${st.worker ? `<span class="ok3">✓ conectado</span>` : ""}</h3>
        <p>Os checkouts avisam cada venda por webhook. Este receptor fica na nuvem e guarda as vendas mesmo com o computador desligado. O Minerador busca as novas a cada 2 minutos.</p>
        <ol>
          <li>Crie uma conta grátis em <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener">dash.cloudflare.com</a>.</li>
          <li>Vá em <b>Storage & Databases → D1 → Create</b> e crie um banco chamado <code>debian-vendas</code>.</li>
          <li>Vá em <b>Workers & Pages → Create → Worker</b>, dê o nome <code>debian-webhooks</code> e clique em <b>Deploy</b>.</li>
          <li>Clique em <b>Edit code</b>, apague tudo, cole o código abaixo e clique em <b>Deploy</b>.</li>
          <li>No Worker, vá em <b>Settings → Bindings → Add → D1 database</b>. Nome da variável: <code>DB</code>. Banco: <code>debian-vendas</code>. Salve.</li>
          <li>Copie o endereço do Worker (algo como <code>https://debian-webhooks.seu-nome.workers.dev</code>), cole abaixo e clique em <b>Testar e salvar</b>.</li>
        </ol>
        <div class="code" id="iCode">${esc(I.codigoWorker)}</div>
        <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap"><button class="btn sm" data-copy="#iCode">📋 Copiar código do Worker</button></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="iUrl" placeholder="https://debian-webhooks.seu-nome.workers.dev" value="${esc(I.workerUrl || "")}" style="max-width:520px"><button class="btn sm primary" id="iTestar">Testar e salvar</button></div>
        ${st.erroSync ? `<div class="bad3" style="margin-top:8px">⚠️ ${esc(st.erroSync)}</div>` : ""}
      </div>
      <div class="step"><h3>2. Webhooks do checkout</h3><p>Cole a URL da sua plataforma no painel dela. Uma URL por plataforma.</p>
        ${!I.workerUrl ? `<div class="warn">Termine o passo 1 primeiro. Sem o endereço do receptor, as URLs abaixo não funcionam.</div>` : ""}
        ${I.webhooks.map((w) => `<div class="wh"><b>${esc(w.nome)}</b><code id="wh-${esc(w.id)}" title="${esc(w.url)}">${esc(w.url)}</code><button class="btn sm" data-copy="#wh-${esc(w.id)}">Copiar</button><div class="o">${esc(w.onde)}</div></div>`).join("")}
      </div>
      <div class="step"><h3>3. UTMs nos anúncios</h3><p>É isso que liga cada venda ao anúncio que trouxe a pessoa. Campanhas criadas pelo agente já saem com isso.</p>
        <b style="font-size:13px">Meta Ads</b>: no anúncio → Rastreamento → <b>Parâmetros de URL</b>:
        <div class="code" id="iUtmMeta" style="margin:6px 0">${esc(I.utmMeta)}</div><button class="btn sm" data-copy="#iUtmMeta">Copiar</button>
        <div style="height:12px"></div>
        <b style="font-size:13px">Google Ads</b>: Configurações da conta/campanha → <b>Sufixo do URL final</b>:
        <div class="code" id="iUtmG" style="margin:6px 0">${esc(I.utmGoogle)}</div><button class="btn sm" data-copy="#iUtmG">Copiar</button>
      </div>
      <div class="step"><h3>4. Script da página de vendas</h3><p>Cole antes do <code>&lt;/body&gt;</code> da sua página. Ele guarda as UTMs e repassa para o link do checkout, inclusive no <code>sck</code> que a Hotmart e a Cakto devolvem no webhook. Sem isso, as vendas que passam pela página chegam sem origem.</p>
        <div class="code" id="iScript">${esc(I.script)}</div><div style="margin-top:8px"><button class="btn sm" data-copy="#iScript">📋 Copiar script</button></div>
      </div>
      <div class="step"><h3>5. Custos e segurança</h3>
        <div class="fg2">
          <div><label class="lb">Imposto sobre o faturamento (%)</label><input type="number" id="cImp" step="0.1" min="0" value="${esc(I.impostoPct)}"></div>
          <div><label class="lb">Outras taxas sobre o faturamento (%)</label><input type="number" id="cTax" step="0.1" min="0" value="${esc(I.taxaExtraPct)}"></div>
          <div><label class="lb">Custo fixo por venda (R$)</label><input type="number" id="cCusto" step="0.01" min="0" value="${esc(I.custoPorVenda)}"></div>
          <div><label class="lb">Fuso horário dos relatórios</label><select id="cFuso">${["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Cuiaba", "America/Rio_Branco", "America/Noronha", "Europe/Lisbon", "Europe/Kyiv", "America/New_York"].map((f) => `<option ${f === I.fuso ? "selected" : ""}>${f}</option>`).join("")}</select></div>
          <div><label class="lb">Hottok da Hotmart (opcional)</label><input id="cHot" value="${esc(I.hottok || "")}" placeholder="confere se o aviso veio mesmo da Hotmart"></div>
          <div><label class="lb">Secret do webhook da Cakto (opcional)</label><input id="cCak" value="${esc(I.segredoCakto || "")}" placeholder="confere a assinatura da Cakto"></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm primary" id="cSalvar">Salvar</button><button class="btn sm" id="cNovos" title="Gera novas URLs e um novo código de Worker">🔑 Gerar novos segredos</button></div>
      </div>
      <div class="step"><h3>6. Testar</h3><p>Cria uma venda de teste ligada a um dos seus anúncios, para você ver o painel funcionando. Vendas de teste não entram nos números, a não ser que você marque “vendas de teste” no painel.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm primary" id="tSim">🧪 Simular uma venda</button><button class="btn sm" id="tApagar" ${I.vendasTeste ? "" : "disabled"}>Apagar vendas de teste (${I.vendasTeste})</button></div>
        <div class="note" style="margin-top:10px">Vendas reais recebidas: <b>${num(I.totalVendas)}</b>${I.ultimaVenda ? ` · última em ${new Date(I.ultimaVenda).toLocaleString("pt-BR")}` : ""}</div>
        ${I.ultimosEventos.length ? `<div style="margin-top:10px"><b style="font-size:13px">Últimos avisos recebidos</b>${I.ultimosEventos.map((e) => `<div class="note" style="margin-top:4px">${new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · <b>${esc(e.plataforma)}</b> · ${esc(e.resultado)}</div>`).join("")}</div>` : ""}
      </div>
      <p class="note">🐉 Debian Analytics · Paid Traffic Agent</p>`);
    $("#aCorpo").onclick = async (e) => {
      const cp = e.target.closest("[data-copy]");
      if (cp) { try { await navigator.clipboard.writeText($(cp.dataset.copy).textContent); toast("Copiado ✓"); } catch { toast("Não consegui copiar. Selecione e copie manualmente.", true); } return; }
    };
    $("#iTestar").onclick = async () => { try { await api("/api/analytics/testar", { body: { url: $("#iUrl").value } }); toast("Receptor conectado ✓"); vIntegracoes(); } catch (er) { toast(er.message, true); } };
    $("#cSalvar").onclick = async () => {
      try { await api("/api/analytics/config", { body: { impostoPct: Number($("#cImp").value) || 0, taxaExtraPct: Number($("#cTax").value) || 0, custoPorVenda: Number($("#cCusto").value) || 0, fuso: $("#cFuso").value, hottok: $("#cHot").value.trim(), segredoCakto: $("#cCak").value.trim() } }); toast("Salvo ✓"); }
      catch (er) { toast(er.message, true); }
    };
    $("#cNovos").onclick = async () => {
      if (!(await confirmar("Gerar novos segredos?", "As URLs de webhook mudam e você precisa colar o novo código no Worker e as novas URLs nos checkouts."))) return;
      try { await api("/api/analytics/config", { body: { novosSegredos: true } }); toast("Novos segredos gerados. Atualize o Worker e os checkouts."); vIntegracoes(); } catch (er) { toast(er.message, true); }
    };
    $("#tSim").onclick = async () => { try { await api("/api/analytics/simular", { body: {} }); toast("Venda de teste criada ✓ Veja no Painel com “vendas de teste” marcado."); S.f.testes = true; salvarF(); vIntegracoes(); } catch (er) { toast(er.message, true); } };
    $("#tApagar").onclick = async () => { try { await api("/api/analytics/apagar-testes", { body: {} }); toast("Vendas de teste apagadas"); S.f.testes = false; salvarF(); vIntegracoes(); } catch (er) { toast(er.message, true); } };
  }

  let iniciado = false;
  window.MO_A = {
    iniciar: () => { iniciado = true; iniciar(); },
    ir: (aba) => { S.aba = aba; LS.set("aba", aba); if (iniciado && $("#aNav")) ir(aba); },
  };
})();
