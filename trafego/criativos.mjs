// Monta os pedidos (prompts) de copy/roteiros e de análise. Gera direto se houver chave da API do Claude.

const corta = (s, n) => { s = String(s || "").replace(/\s+\n/g, "\n").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

function blocoReferencias(referencias = []) {
  if (!referencias.length) return "";
  const partes = referencias.slice(0, 5).map((o, i) => {
    const f = o.funil || {};
    const copies = (o.criativos || []).filter((c) => c.texto || c.titulo).slice(0, 3)
      .map((c, j) => `  Copy ${j + 1}${c.criativosIguais > 1 ? ` (${c.criativosIguais} anúncios usando)` : ""}:\n  ${corta([c.titulo, c.texto].filter(Boolean).join(" — "), 700).replace(/\n/g, "\n  ")}`).join("\n");
    return `REFERÊNCIA ${i + 1}: ${o.anunciante || "?"} · ${o.titulo || o.dominio || ""}
  Status: ${o.status || "?"} · ${o.anunciosOferta ?? "?"} anúncios ativos na oferta · rodando há ${o.diasRodando ?? "?"} dias
  Funil: ${f.tipo || "?"}${f.checkout ? ` · checkout ${f.checkout}` : ""} · nicho ${o.nicho || "?"}
${copies}`;
  });
  return `\n\nOFERTAS ESCALADAS DE REFERÊNCIA (encontradas na Biblioteca de Anúncios — use para entender ângulos, promessas e estruturas que estão funcionando; NÃO copie frases):\n\n${partes.join("\n\n")}`;
}

const IDIOMAS = { pt: "Português do Brasil", en: "inglês americano (English, US)", es: "espanhol neutro (Latinoamérica/Espanha)" };

export function promptCriativos({ brief = {}, referencias = [], plataformas = ["meta"], formato = "texto", idioma = "pt" }) {
  const b = brief;
  const comGoogle = plataformas.includes("google");
  const comTt = plataformas.includes("tiktok") || plataformas.includes("kwai");
  const lingua = IDIOMAS[idioma] || IDIOMAS.pt;
  const dados = [
    ["Produto/oferta", b.produto], ["Promessa principal", b.promessa], ["Público", b.publico], ["Dor principal", b.dor],
    ["Mecanismo / diferencial", b.mecanismo], ["Preço e condições", b.preco], ["Provas (depoimentos, números)", b.provas],
    ["Tipo de funil", b.funil], ["Tom de voz", b.tom || (idioma === "pt" ? "conversa direta, brasileira, sem exagero" : "conversa direta, sem exagero")], ["Link", b.link], ["Observações", b.obs], ["Contexto", b.extra],
  ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `- ${k}: ${String(v).trim()}`).join("\n");

  const pedido = `Você é um copywriter de resposta direta e gestor de tráfego sênior.
Crie os criativos para a oferta abaixo, prontos para subir no Meta Ads${comGoogle ? ", no Google Ads" : ""}${comTt ? ", no TikTok e no Kwai" : ""}.
Escreva TODOS os textos dos anúncios em ${lingua}.

MINHA OFERTA:
${dados || "- (sem briefing: deduza a partir das referências e diga o que assumiu)"}${blocoReferencias(referencias)}

REGRAS:
- Modele ângulos e estruturas das referências, mas escreva tudo original para a MINHA oferta.
- Respeite as políticas de anúncios da Meta: nada de resultado garantido, nada de "antes e depois" em saúde/emagrecimento, não aponte características pessoais do leitor ("você está acima do peso?"), nada de falsa urgência ou promessas de dinheiro fácil.
- ${lingua}, frases curtas, linguagem falada, natural para o público desse país.${comTt ? "\n- TikTok e Kwai: vídeo vertical 9:16, cara de conteúdo nativo (UGC), gancho falado e escrito na tela nos 2 primeiros segundos, sem cara de anúncio." : ""}

ENTREGUE:
1. 10 ganchos para os 3 primeiros segundos do vídeo (variando ângulo: dor, curiosidade, contraintuitivo, prova, identificação).
2. 5 textos principais para o anúncio: curto (até 125 caracteres), médio, longo, storytelling e focado em prova.
3. 10 títulos (até 40 caracteres) e 5 descrições (até 30 caracteres).
4. ${comTt ? "5" : "3"} roteiros de vídeo de ${comTt ? "15 a 45" : "30 a 60"} segundos (UGC/selfie, demonstração e depoimento${comTt ? ", trend do TikTok e reação/dueto" : ""}), com cenas: tempo, o que aparece na tela e a fala.
${comGoogle ? "5. Google Ads (pesquisa): 15 títulos de até 30 caracteres, 4 descrições de até 90 caracteres e 20 palavras-chave com o tipo de correspondência sugerido.\n" : ""}${comGoogle ? "6" : "5"}. 3 ideias de teste A/B para começar e o que observar em cada uma.`;

  if (formato !== "json") return pedido;
  return `${pedido}

Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:
{"ganchos":["..."],"textos":[{"tipo":"curto","texto":"..."}],"titulos":["..."],"descricoes":["..."],"roteiros":[{"nome":"...","duracao":"45s","cenas":[{"tempo":"0-3s","tela":"...","fala":"..."}]}],"google":{"titulos":["..."],"descricoes":["..."],"palavrasChave":["..."]},"testes":["..."],"suposicoes":["..."]}`;
}

export function promptAnalise({ resumo = {}, diagnostico = [], entidades = [], regras = {} }) {
  const brl = (n) => (n === null || n === undefined ? "–" : "R$ " + Number(n).toFixed(2));
  const linhas = entidades.filter((e) => e.nivel === "anuncio" && (e.metricas?.d7?.gasto || 0) > 0)
    .sort((a, b) => (b.metricas.d7.gasto || 0) - (a.metricas.d7.gasto || 0)).slice(0, 40)
    .map((e) => {
      const m = e.metricas.d7;
      const ctr = m.impressoes ? ((m.cliques / m.impressoes) * 100).toFixed(2) + "%" : "–";
      const cpa = m.conversoes ? brl(m.gasto / m.conversoes) : "–";
      return `${e.plataforma} | ${corta(e.nome, 50)} | ${e.status} | gasto ${brl(m.gasto)} | conv ${m.conversoes} | CPA ${cpa} | CTR ${ctr} | CPM ${m.impressoes ? brl((m.gasto / m.impressoes) * 1000) : "–"} | freq ${m.frequencia ? m.frequencia.toFixed(1) : "–"}`;
    }).join("\n");
  const t = resumo.d7 || resumo.total || {};
  return `Você é um gestor de tráfego pago sênior. Analise minhas campanhas e me diga o que fazer.

META: CPA alvo ${brl(regras.cpaAlvo)}${regras.roasAlvo ? `, ROAS alvo ${regras.roasAlvo}` : ""}. Teto de orçamento diário por campanha ${brl(regras.tetoOrcamentoDiario)}.

ÚLTIMOS 7 DIAS (total): gasto ${brl(t.gasto)}, conversões ${t.conversoes ?? "–"}, CPA ${brl(t.cpa)}, ROAS ${t.roas ? t.roas.toFixed(2) : "–"}, CTR ${t.ctr ? t.ctr.toFixed(2) + "%" : "–"}, CPM ${brl(t.cpm)}.

DIAGNÓSTICO AUTOMÁTICO:
${diagnostico.map((d) => "- " + d).join("\n")}

ANÚNCIOS (7 dias, ordenados por gasto):
plataforma | anúncio | status | gasto | conversões | CPA | CTR | CPM | frequência
${linhas || "(sem gasto)"}

ENTREGUE:
1. Diagnóstico em 5 linhas: onde está o dinheiro sendo bem e mal usado.
2. As 5 ações mais importantes para hoje, em ordem, com o motivo de cada uma.
3. Leitura do funil: o problema parece estar no criativo (CTR/CPM), na página (cliques sem conversão) ou na oferta?
4. 3 hipóteses de criativos novos para testar, com base no que está funcionando.
5. O que observar nos próximos 3 dias.`;
}

export function extrairJson(texto) {
  const t = String(texto || "").replace(/```(?:json)?/gi, "");
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("O Claude não devolveu JSON.");
  return JSON.parse(t.slice(i, f + 1));
}

export async function gerarComClaude({ apiKey, modelo = "claude-sonnet-5-5", prompt, maxTokens = 8000, fetchFn = fetch }) {
  if (!apiKey) throw new Error("Chave da API do Claude não configurada.");
  const r = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API: ${j.error?.message || r.status}`);
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
