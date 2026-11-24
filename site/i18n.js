// Tradução da interface (português ⇄ inglês). O app é escrito em português; em inglês, este arquivo troca
// os textos na tela usando o dicionário de i18n-en.js. Números e valores em dinheiro viram {0}, {1}… no dicionário.
(function () {
  "use strict";
  const ler = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const meta = document.querySelector('meta[name="idioma-padrao"]');
  const padrao = meta ? meta.content : "pt";
  const auto = /^pt/i.test(navigator.language || "pt") ? "pt" : "en";
  let lang = ler("mo_idioma", null) || (padrao === "auto" ? auto : padrao);
  if (lang !== "en") lang = "pt";
  const DIC = (window.I18N_EN && window.I18N_EN.d) || {};
  const FALTA = new Set();
  const NUM = /(?:R\$|US\$|€|£)\s?-?[\d.,]+|[+\-−]?\d[\d.,:]*(?:%|x\b)?/g;

  function traduzir(txt) {
    if (lang !== "en" || !txt) return txt;
    const k = txt.trim();
    if (!k || !/[A-Za-zÀ-ú]/.test(k)) return txt;
    let r = DIC[k];
    if (r === undefined) {
      const nums = [];
      const modelo = k.replace(NUM, (m) => { nums.push(m); return "{" + (nums.length - 1) + "}"; });
      if (nums.length && DIC[modelo] !== undefined) r = DIC[modelo].replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? "");
    }
    if (r === undefined) { FALTA.add(k); return txt; }
    return txt.replace(k, r);
  }

  const PULAR = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);
  const CLASSES_PULAR = ["tname", "an", "tit", "tx", "code", "notr"];
  function pular(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (PULAR.has(e.tagName) || e.getAttribute?.("translate") === "no") return true;
      if (e.classList && CLASSES_PULAR.some((c) => e.classList.contains(c))) return true;
    }
    return false;
  }
  const feitos = new WeakMap();
  function noTexto(n) {
    if (feitos.get(n) === n.data) return;
    if (!n.parentElement || pular(n.parentElement)) return;
    const novo = traduzir(n.data);
    if (novo !== n.data) n.data = novo;
    feitos.set(n, n.data);
  }
  const ATRS = ["placeholder", "title", "aria-label"];
  function atributos(el) {
    if (pular(el)) return;
    for (const a of ATRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const chave = "__i18n_" + a;
      if (el[chave] === v) continue;
      const novo = traduzir(v);
      el[chave] = novo;
      if (novo !== v) el.setAttribute(a, novo);
    }
  }
  function varrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) return noTexto(raiz);
    if (raiz.nodeType !== 1) return;
    if (pular(raiz)) return;
    atributos(raiz);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? noTexto(n) : atributos(n);
  }

  function marcarBotoes() {
    document.querySelectorAll("#idioma [data-lang]").forEach((b) => {
      b.classList.toggle("on", b.dataset.lang === lang);
      b.onclick = () => { if (b.dataset.lang === lang) return; try { localStorage.setItem("mo_idioma", JSON.stringify(b.dataset.lang)); } catch {} location.reload(); };
    });
  }

  function iniciar() {
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    marcarBotoes();
    if (lang !== "en") return;
    document.title = traduzir(document.title);
    varrer(document.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") noTexto(m.target);
        else if (m.type === "attributes") atributos(m.target);
        else m.addedNodes.forEach(varrer);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRS });
  }

  window.I18N = { lang, t: (s) => (lang === "en" ? traduzir(String(s ?? "")) : s), faltando: () => [...FALTA] };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
