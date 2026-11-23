// Testes das funções do minerador com dados no formato da Biblioteca de Anúncios.
import assert from "node:assert/strict";
import {
  analisarResposta, normalizarAnuncio, agruparOfertas, lerNumeroResultados, analisarFunil,
  sinaisEstrutura, detectarNicho, crescimento, registrarHistorico, linkReal,
} from "../scripts/lib.mjs";

const dia = "2026-11-22";
const ts = (d) => Math.floor(Date.parse(d) / 1000);
function ad(id, page, nome, link, coll, inicio, extra = {}) {
  return {
    ad_archive_id: id, page_id: page, page_name: nome, is_active: true, start_date: ts(inicio),
    collation_count: coll, collation_id: "c" + id, publisher_platform: ["FACEBOOK", "INSTAGRAM"],
    snapshot: {
      body: { text: extra.texto || "Descubra o método para secar a barriga em 21 dias sem dieta maluca" },
      title: extra.titulo || "Protocolo Seca Barriga", link_url: link, cta_text: "Saiba mais", display_format: "VIDEO",
      page_profile_picture_url: "https://scontent.xx.fbcdn.net/p.jpg",
      videos: extra.semVideo ? [] : [{ video_hd_url: `https://video.xx.fbcdn.net/${id}.mp4`, video_preview_image_url: `https://scontent.xx.fbcdn.net/${id}.jpg` }],
      images: [], cards: [],
    },
  };
}

// Resposta GraphQL com prefixo e várias linhas
const resposta = "for (;;);" + JSON.stringify({ data: { ad_library_main: { search_results_connection: { count: 39000, edges: [
  { node: { collated_results: [
    ad("1001", "111", "Dra. Ana Saúde", "https://l.facebook.com/l.php?u=https%3A%2F%2Fsecabarriga.com.br%2Fvsl%3Futm_source%3Dfb", 12, "2026-10-01"),
    ad("1002", "111", "Dra. Ana Saúde", "https://secabarriga.com.br/vsl?utm_campaign=x", 9, "2026-11-10"),
    ad("1003", "111", "Dra. Ana Saúde", "https://secabarriga.com.br/vsl", 4, "2026-11-18", { semVideo: true }),
  ] } },
  { node: { collated_results: [ad("2001", "222", "Renda Já", "https://rendaja.com/quiz", 2, "2026-11-20", { texto: "Ganhe dinheiro como afiliado trabalhando de casa", titulo: "Renda extra" })] } },
] } } } }) + "\n" + JSON.stringify({ extensions: { ok: true } });

const mapa = new Map();
assert.equal(analisarResposta(resposta, mapa), 4, "deve achar 4 anúncios");
const anuncios = [...mapa.values()].map(normalizarAnuncio);
const a1 = anuncios.find((a) => a.id === "1001");
assert.equal(a1.link, "https://secabarriga.com.br/vsl?utm_source=fb", "desembrulha l.facebook.com");
assert.equal(a1.dominio, "secabarriga.com.br");
assert.equal(a1.inicio, "2026-10-01");
assert.ok(a1.video.hd.endsWith("1001.mp4"));

const historico = { ofertas: { "BR|111|secabarriga.com.br/vsl": { "2026-11-18": 10 } } };
const cfg = { minAnuncios: 5, escalada: { minAnunciosOferta: 15, minAnunciosAnunciante: 40, crescimentoEscalando: 30 } };
const ofertas = agruparOfertas(anuncios, { palavra: "emagrecer", pais: "BR", dia, contagens: { "111": 63 }, historico, cfg });
assert.equal(ofertas.length, 2);
const top = ofertas[0];
assert.equal(top.anunciante, "Dra. Ana Saúde");
assert.equal(top.anunciosOferta, 25, "soma dos criativos iguais");
assert.equal(top.criativosDiferentes, 3);
assert.equal(top.anunciosAnunciante, 63);
assert.equal(top.status, "escalada");
assert.equal(top.diasRodando, 52);
assert.equal(top.crescimento, 150);
assert.equal(top.nicho, "Emagrecimento");
assert.equal(top.criativos[0].id, "1001", "criativo mais usado primeiro");
const renda = ofertas[1];
assert.equal(renda.status, "teste");
assert.equal(renda.nicho, "Renda extra");

assert.equal(lerNumeroResultados("~39,000 results\nThese results include"), 39000);
assert.equal(lerNumeroResultados("~1.200 resultados"), 1200);
assert.equal(lerNumeroResultados("7 results"), 7);
assert.equal(lerNumeroResultados("nada aqui"), null);

const f1 = analisarFunil({ html: '<script src="https://scripts.converteai.net/x/player.js"></script><script>fbq("init")</script><a href="https://pay.kiwify.com.br/abc">Comprar</a>', urlFinal: "https://secabarriga.com.br/vsl", links: ["https://pay.kiwify.com.br/abc"], titulo: "Seca Barriga" });
assert.equal(f1.tipo, "VSL"); assert.equal(f1.checkout, "Kiwify"); assert.equal(f1.linkCheckout, "https://pay.kiwify.com.br/abc"); assert.ok(f1.pixelMeta);
const f2 = analisarFunil({ html: "<div>Pergunta 1 de 8</div>", urlFinal: "https://rendaja.com/quiz", links: [] });
assert.equal(f2.tipo, "Quiz");
const f3 = analisarFunil({ html: "", urlFinal: "https://pay.hotmart.com/X123", links: [] });
assert.equal(f3.checkout, "Hotmart"); assert.equal(f3.tipo, "Direto para o checkout");

top.funil = f1;
const est = sinaisEstrutura(top);
assert.equal(est.pontos, 5); assert.ok(est.estruturada);

assert.equal(detectarNicho("curso de inglês para fluência"), "Idiomas");
assert.equal(crescimento({ "2026-11-01": 5 }, 10, dia), null, "fora da janela de 3–7 dias");
assert.equal(linkReal("nada"), "");

const h = registrarHistorico({}, ofertas, { "111": 63 }, dia);
assert.equal(h.ofertas[top.chave][dia], 25);
assert.equal(h.anunciantes["111"][dia], 63);

console.log("✅ Todos os testes passaram");
