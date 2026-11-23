// Testes do Debian Analytics: leitura de webhooks, atribuição por UTM, relatório e integração com o agente.
import assert from "node:assert/strict";
import { normalizarEvento, aplicarVenda, atribuir, relatorio, vendasPorAnuncio, idsDasUtms, statusPadrao, lerCorpo } from "../analytics/vendas.mjs";
import { avaliar, agregar } from "../trafego/regras.mjs";

const hoje = "2026-11-23";
const hotmart = (evento, transacao, extra = {}) => JSON.stringify({
  id: "evt-" + transacao, event: evento, version: "2.0.0", creation_date: Date.parse(hoje + "T15:00:00Z"),
  data: {
    product: { id: 123, name: "Protocolo Seca" },
    buyer: { email: "Maria@Email.com", name: "Maria" },
    commissions: [{ value: 88.3, source: "MARKETPLACE" }, { value: 85.5, source: "PRODUCER" }],
    purchase: { transaction: transacao, status: evento.replace("PURCHASE_", ""), order_date: Date.parse(hoje + "T14:58:00Z"), approved_date: Date.parse(hoje + "T15:00:00Z"),
      price: { value: 97, currency_value: "BRL" }, payment: { type: "PIX", installments_number: 1 }, origin: { sck: "FB_111_222_333", src: "FB_111_222_333" }, ...extra },
  },
});
// 1) Hotmart aprovada com sck compacto
let v = normalizarEvento({ plataforma: "hotmart", corpo: hotmart("PURCHASE_APPROVED", "HP001"), recebido: hoje + "T15:00:05Z" });
assert.equal(v.id, "hotmart:HP001"); assert.equal(v.status, "aprovada"); assert.equal(v.valor, 97); assert.equal(v.liquido, 85.5);
assert.equal(v.metodo, "pix"); assert.equal(v.email, "maria@email.com"); assert.deepEqual([v.ids.plataforma, v.ids.campanha, v.ids.conjunto, v.ids.anuncio], ["meta", "111", "222", "333"]);
// 2) mesma venda reembolsada depois
const vendas = [];
assert.equal(aplicarVenda(vendas, v), "nova");
const reemb = normalizarEvento({ plataforma: "hotmart", corpo: hotmart("PURCHASE_REFUNDED", "HP001", { origin: {} }), recebido: hoje + "T18:00:00Z" });
assert.equal(aplicarVenda(vendas, reemb), "atualizada");
assert.equal(vendas[0].status, "reembolsada"); assert.equal(vendas[0].ids.anuncio, "333", "mantém a atribuição original"); assert.equal(vendas[0].historico.length, 2);
// evento atrasado não "desfaz" a aprovação
const pend = normalizarEvento({ plataforma: "hotmart", corpo: hotmart("PURCHASE_BILLET_PRINTED", "HP002"), recebido: hoje + "T15:10:00Z" });
const apr = normalizarEvento({ plataforma: "hotmart", corpo: hotmart("PURCHASE_APPROVED", "HP002"), recebido: hoje + "T15:20:00Z" });
aplicarVenda(vendas, apr); aplicarVenda(vendas, pend);
assert.equal(vendas.find((x) => x.id === "hotmart:HP002").status, "aprovada");

// 3) Kiwify com UTMs "nome|id"
const kiwi = (id, status, ad = "444", valor = 19700) => ({ order_id: id, order_status: status, payment_method: "credit_card", installments: 3,
  Product: { product_id: "k1", product_name: "Curso Inglês" }, Customer: { email: "joao@x.com", full_name: "João" },
  Commissions: { charge_amount: valor, my_commission: Math.round(valor * 0.9) },
  TrackingParameters: { utm_source: "FB", utm_campaign: "Inglês 90D|555", utm_medium: "Advantage|666", utm_content: `AD01 · aula|${ad}`, utm_term: "Instagram_Reels" },
  created_at: "2026-11-23 10:00", approved_date: "2026-11-23 10:01" });
v = normalizarEvento({ plataforma: "kiwify", corpo: JSON.stringify(kiwi("K1", "paid")) });
assert.equal(v.status, "aprovada"); assert.equal(v.valor, 197); assert.equal(v.liquido, 177.3); assert.equal(v.metodo, "cartao");
assert.deepEqual([v.ids.campanha, v.ids.conjunto, v.ids.anuncio], ["555", "666", "444"]);
assert.equal(v.criadaEm, "2026-11-23T13:00:00.000Z", "horário de Brasília");
aplicarVenda(vendas, v);
aplicarVenda(vendas, normalizarEvento({ plataforma: "kiwify", corpo: JSON.stringify(kiwi("K2", "waiting_payment")) }));
aplicarVenda(vendas, normalizarEvento({ plataforma: "kiwify", corpo: JSON.stringify(kiwi("K3", "chargedback")) }));

// 4) Genérico (form-urlencoded, estilo postback) e venda sem UTM
const generico = normalizarEvento({ plataforma: "monetizze", corpo: "venda[codigo]=M77&venda[status]=Finalizada&venda[valor]=67,00&produto[nome]=Ebook%20Receitas&venda[formaPagamento]=Boleto&comprador[email]=ana@x.com", tipo: "application/x-www-form-urlencoded", recebido: hoje + "T15:00:00Z" });
assert.equal(generico.transacao, "M77"); assert.equal(generico.status, "aprovada"); assert.equal(generico.valor, 67); assert.equal(generico.produto, "Ebook Receitas"); assert.equal(generico.metodo, "boleto");
aplicarVenda(vendas, generico);
// Google (ValueTrack só com IDs)
const g = normalizarEvento({ plataforma: "kiwify", corpo: JSON.stringify({ ...kiwi("K4", "paid", "0", 9700), TrackingParameters: { utm_source: "google", utm_campaign: "77001", utm_medium: "11001", utm_content: "111001" } }) });
assert.equal(g.ids.plataforma, "google"); assert.equal(g.ids.anuncio, "111001");
aplicarVenda(vendas, g);
assert.equal(normalizarEvento({ corpo: "{}" }), null);
assert.equal(statusPadrao("PURCHASE_CHARGEBACK"), "chargeback");
assert.equal(lerCorpo("a=1&b[c]=2").b.c, "2");
assert.equal(idsDasUtms({ utm: { source: "ig", content: "sem id" } }).plataforma, "meta");

// 4b) Cakto (formato documentado: { secret, event, data })
const cakto = (ev, status, extra = {}) => JSON.stringify({ secret: "seg-cakto", event: ev, data: { id: "ck-001", refId: "4852F91", status, baseAmount: 147, amount: 147, currency: "BRL", fees: 9.9, installments: 1,
  paymentMethod: "pix", paymentMethodName: "Pix", customer: { name: "Carla", email: "Carla@x.com" }, product: { id: "pc1", name: "Mentoria Cakto" },
  commissions: [{ user: "eu@x.com", type: "producer", percentage: 100, totalAmount: 137.1 }],
  utm_source: "FB", utm_medium: "Advantage|666", utm_campaign: "Inglês 90D|555", utm_term: null, utm_content: "AD01 · aula|444", sck: null,
  createdAt: "2026-11-23T11:00:00.000-03:00", paidAt: status === "paid" ? "2026-11-23T11:01:00.000-03:00" : null, ...extra } });
const ck1 = normalizarEvento({ plataforma: "cakto", corpo: cakto("pix_gerado", "waiting_payment") });
assert.equal(ck1.checkout, "Cakto"); assert.equal(ck1.status, "pendente"); assert.equal(ck1.ids.anuncio, "444");
const ck2 = normalizarEvento({ plataforma: "cakto", corpo: cakto("purchase_approved", "paid") });
assert.equal(ck2.status, "aprovada"); assert.equal(ck2.valor, 147); assert.equal(ck2.liquido, 137.1); assert.equal(ck2.metodo, "pix"); assert.equal(ck2.email, "carla@x.com");
assert.equal(ck2.aprovadaEm, "2026-11-23T14:01:00.000Z");
const ck3 = normalizarEvento({ plataforma: "cakto", corpo: cakto("refund_requested", "refund_requested", { paidAt: "2026-11-23T11:01:00.000-03:00" }) });
assert.equal(ck3.status, "aprovada", "pedido de reembolso ainda não é reembolso"); assert.ok(ck3.reembolsoSolicitado);
assert.equal(normalizarEvento({ plataforma: "cakto", corpo: JSON.stringify({ event: "checkout_abandonment", data: { customer: {} } }) }), null);
const ckAuto = normalizarEvento({ corpo: cakto("purchase_approved", "paid") });
assert.equal(ckAuto.checkout, "Cakto", "reconhece a Cakto mesmo pela URL genérica");
aplicarVenda(vendas, ck1); aplicarVenda(vendas, ck2);
assert.equal(vendas.find((x) => x.id === "cakto:ck-001").status, "aprovada");

// 5) relatório
const nomes = {
  "meta:333": { anuncio: "AD03 · dor", conjunto: "Advantage+", conjuntoId: "222", campanha: "[AG] Protocolo", campanhaId: "111" },
  "meta:334": { anuncio: "AD04 · ruim", conjunto: "Advantage+", conjuntoId: "222", campanha: "[AG] Protocolo", campanhaId: "111" },
  "meta:444": { anuncio: "AD01 · aula", conjunto: "Advantage", conjuntoId: "666", campanha: "Inglês 90D", campanhaId: "555" },
  "google:11001~111001": { anuncio: "RSA 1", conjunto: "Grupo", conjuntoId: "11001", campanha: "Pesquisa", campanhaId: "77001" },
};
const gastos = { nomes, dias: { [hoje]: { "meta:333": { gasto: 50, impressoes: 5000, cliques: 100 }, "meta:334": { gasto: 80, impressoes: 6000, cliques: 30 }, "meta:444": { gasto: 60, impressoes: 4000, cliques: 90 }, "google:11001~111001": { gasto: 40, impressoes: 900, cliques: 80 } } } };
const entidades = [{ plataforma: "meta", nivel: "anuncio", id: "334", status: "ativo", thumb: "t.jpg" }];
const r = relatorio({ vendas, gastos, de: hoje, ate: hoje, cfg: { impostoPct: 10 }, entidades });
// aprovadas: HP002 (85,5) + K1 (177,3) + M77 (67) + K4 (87,3) + Cakto (137,1) = 554,2 ; gasto 230
assert.equal(r.total.vendas, 5);
assert.equal(+r.total.liquido.toFixed(2), 554.2);
assert.equal(r.total.gasto, 230);
assert.equal(+r.total.impostos.toFixed(2), 55.42);
assert.equal(+r.total.lucro.toFixed(2), 268.78);
assert.equal(+r.total.roi.toFixed(1), 116.9);
assert.equal(r.total.pendentes, 1); assert.equal(r.total.reembolsos, 1); assert.equal(r.total.chargebacks, 1);
const prot = r.campanhas.find((c) => c.id === "111");
assert.equal(prot.vendas, 1); assert.equal(prot.gasto, 130);
const ad334 = prot.conjuntos[0].anuncios.find((a) => a.id === "334");
assert.equal(ad334.vendas, 0); assert.equal(ad334.status, "ativo", "traz o status do agente");
assert.equal(r.semAtribuicao.length, 1, "Monetizze sem UTM vai para sem atribuição");
assert.equal(r.criativos.melhores[0].id, "444", "AD01 é o criativo campeão");
assert.equal(r.criativos.piores[0].id, "334");
assert.ok(r.metodos.find((m) => m.nome === "cartao"));
assert.equal(r.porDia.length, 1);
assert.equal(atribuir({ ids: {}, utm: { content: "AD04 · ruim" } }, nomes).anuncioKey, "meta:334", "casa pelo nome quando não há id");

// 6) integração com o agente: ROI real decide
const pa = vendasPorAnuncio(vendas, nomes, { agora: new Date(hoje + "T20:00:00Z") });
assert.equal(pa["meta:444"].hoje.conversoes, 2, "Kiwify + Cakto");
const m = (gasto, conv, receita) => ({ gasto, conversoes: conv, receita, impressoes: 10000, cliques: 200, frequencia: 1.2 });
const ents = agregar([
  { plataforma: "meta", nivel: "campanha", id: "C", nome: "C", status: "ativo", campanhaId: "C", orcamento: { valor: 100, editavel: true } },
  { plataforma: "meta", nivel: "conjunto", id: "S", nome: "S", status: "ativo", paiId: "C", campanhaId: "C" },
  { plataforma: "meta", nivel: "anuncio", id: "A", nome: "Vende", status: "ativo", paiId: "S", campanhaId: "C", metricas: { hoje: m(50, 2, 300), d3: m(150, 4, 700), d7: m(150, 4, 700) } },
  { plataforma: "meta", nivel: "anuncio", id: "B", nome: "Prejuízo", status: "ativo", paiId: "S", campanhaId: "C", metricas: { hoje: m(60, 1, 40), d3: m(100, 0, 0), d7: m(100, 0, 0) } },
]);
const acoes = avaliar(ents, { cpaAlvo: 50, fonteConversoes: "vendas", roi: { minEscalar: 30, maxPausar: -30, descontarPct: 10 } }, new Date(hoje + "T20:00:00Z"), []);
const tipos = acoes.map((a) => `${a.tipo}:${a.alvoId}`);
assert.ok(tipos.includes("pausar:B"), "pausa o anúncio no prejuízo (ROI real)");
const esc = acoes.find((a) => a.tipo === "escalar");
assert.ok(esc && esc.alvoId === "C", "escala a campanha com ROI positivo");
assert.ok(/ROI/.test(esc.motivo));

console.log("✅ Debian Analytics: todos os testes passaram");
