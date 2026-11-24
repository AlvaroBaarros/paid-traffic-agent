// Testes da v0.2: TikTok, Kwai, gateways, moedas, reembolsos, ciclo de criativos, força da oferta e Telegram.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { instalarMockAds, registro, telegramEnviadas } from "./mock-ads.mjs";
import { criarTiktok, UTM_TIKTOK } from "../trafego/tiktok.mjs";
import { criarKwai } from "../trafego/kwai.mjs";
import { normalizarEvento, aplicarVenda, relatorio, vendasPorAnuncio, conversor, idsDasUtms } from "../analytics/vendas.mjs";
import { decifrarClickbank, salvar as salvarAnalytics, config as configAnalytics } from "../analytics/central.mjs";
import { avaliar, agregar, agregarReembolso, taxaReembolso, diagnostico } from "../trafego/regras.mjs";
import { cansaco, cicloCriativos, gancho } from "../trafego/ciclo.mjs";
import { scoreEscala } from "../scripts/lib.mjs";
import * as avisos from "../notificacoes/telegram.mjs";
import * as agente from "../trafego/agente.mjs";

const f = instalarMockAds();

// ---------- TikTok ----------
const tt = criarTiktok({ token: "tt", anuncianteId: "7000", fetchFn: f });
assert.equal((await tt.testar()).nome, "TikTok do Debian");
const ents = await tt.entidades();
const ad1 = ents.find((e) => e.id === "1803"), camp = ents.find((e) => e.nivel === "campanha");
assert.equal(ad1.status, "ativo"); assert.equal(ad1.metricas.d3.gasto, 90); assert.equal(ad1.metricas.d7.frequencia, 3.2);
assert.deepEqual(camp.orcamento, { valor: 120, editavel: true, total: false, recurso: "campaign:1801" }, "orçamento na campanha (CBO)");
assert.equal(ents.find((e) => e.nivel === "conjunto").orcamento, null);
await tt.mudarStatus("1804", false, "anuncio");
assert.deepEqual(registro.at(-1), { plataforma: "tiktok", caminho: "ad/status/update/", corpo: { advertiser_id: "7000", ad_ids: ["1804"], operation_status: "DISABLE" } });
await tt.mudarOrcamento("campaign:1801", 144);
assert.equal(registro.at(-1).corpo.budget, 144);
const gTT = await tt.gastosDiarios("2026-11-01", "2026-11-03");
assert.equal(gTT.length, 6); assert.equal(gTT[0].chave, "tiktok:1803"); assert.equal(gTT[0].nomes.campanha, "TT · Protocolo Seca");
assert.ok(UTM_TIKTOK.includes("__CID__"));

// ---------- Kwai ----------
let novoRT = null;
const kw = criarKwai({ clientId: "c", clientSecret: "s", refreshToken: "r1", contaId: "123", fetchFn: f, aoNovoRefresh: (r) => (novoRT = r) });
assert.equal((await kw.testar()).nome, "Kwai do Debian");
assert.equal(novoRT, "kw-refresh-2", "guarda o refresh token novo");
const ek = await kw.entidades();
const k1 = ek.find((e) => e.id === "5501");
assert.equal(k1.nivel, "anuncio"); assert.equal(k1.metricas.hoje.gasto, 60); assert.equal(k1.metricas.d3.gasto, 180); assert.equal(k1.paiId, "5502");
assert.equal(ek.find((e) => e.nivel === "conjunto").orcamento.valor, 80);
await kw.mudarStatus("5501", false);
await assert.rejects(kw.mudarStatus("5504", false), /criados pela API/);
await kw.mudarOrcamento("unit:5502", 96);
assert.equal(registro.at(-1).corpo.unitUpdateBudgetModelList[0].dayBudget, 96e6);
const kwUsd = criarKwai({ clientId: "c", clientSecret: "s", refreshToken: "r1", contaId: "123", cotacao: 5, fetchFn: f });
assert.equal((await kwUsd.entidades()).find((e) => e.id === "5501").metricas.hoje.gasto, 300, "conta em dólar convertida");

// ---------- gateways ----------
const ev = (plataforma, corpo, tipo = "application/json") => normalizarEvento({ plataforma, corpo: typeof corpo === "string" ? corpo : JSON.stringify(corpo), tipo, recebido: "2026-11-23T15:00:00Z" });
let v = ev("stripe", { object: "event", type: "checkout.session.completed", created: 1795440000, data: { object: { payment_intent: "pi_9", amount_total: 4900, currency: "usd", payment_status: "paid", customer_details: { email: "A@x.com" }, metadata: { produto: "Guide", utm_source: "FB", utm_campaign: "C|111", utm_medium: "S|222", utm_content: "A|333" } } } });
assert.deepEqual([v.checkout, v.transacao, v.status, v.valor, v.moeda, v.email, v.ids.anuncio], ["Stripe", "pi_9", "aprovada", 49, "USD", "a@x.com", "333"]);
const lista = []; aplicarVenda(lista, v);
aplicarVenda(lista, ev("stripe", { object: "event", type: "charge.refunded", data: { object: { payment_intent: "pi_9", amount: 4900, amount_refunded: 4900, currency: "usd" } } }));
assert.equal(lista[0].status, "reembolsada"); assert.equal(lista[0].ids.anuncio, "333");
assert.equal(ev("stripe", { object: "event", type: "customer.created", data: { object: {} } }), null, "evento que não é venda");
v = ev("paypal", { event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture", resource: { id: "CAP1", amount: { value: "29.90", currency_code: "EUR" }, seller_receivable_breakdown: { net_amount: { value: "28.50" } }, custom_id: "utm_source=tiktok&utm_campaign=X|1801&utm_content=Y|1803" } });
assert.deepEqual([v.transacao, v.status, v.liquido, v.moeda, v.ids.plataforma, v.ids.anuncio], ["CAP1", "aprovada", 28.5, "EUR", "tiktok", "1803"]);
v = ev("paypal", { event_type: "PAYMENT.CAPTURE.REFUNDED", resource_type: "refund", resource: { id: "RF1", amount: { value: "29.90", currency_code: "EUR" }, links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/CAP1" }] } });
assert.deepEqual([v.transacao, v.status], ["CAP1", "reembolsada"]);
v = ev("shopify", { id: 450789, order_number: 1001, financial_status: "paid", total_price: "59.00", currency: "USD", email: "s@x.com", line_items: [{ title: "Dog Guide" }, { title: "Bonus" }], landing_site: "/?utm_source=kwai&utm_campaign=5503&utm_medium=5502&utm_content=5501", created_at: "2026-11-23T10:00:00-05:00" });
assert.deepEqual([v.produto, v.status, v.ids.plataforma, v.ids.anuncio], ["Dog Guide +1", "aprovada", "kwai", "5501"]);
v = ev("woocommerce", { id: 77, order_key: "wc_1", status: "processing", total: "39.90", currency: "EUR", billing: { email: "w@x.com" }, line_items: [{ name: "Guia" }], meta_data: [{ key: "_wc_order_attribution_utm_source", value: "FB" }, { key: "_wc_order_attribution_utm_content", value: "AD|444" }] });
assert.deepEqual([v.checkout, v.status, v.utm.source, v.ids.anuncio], ["WooCommerce", "aprovada", "FB", "444"]);
v = ev("mercadopago", { id: 9911, status: "refunded", transaction_amount: 67, transaction_details: { net_received_amount: 63.5 }, currency_id: "BRL", payment_method_id: "pix", payment_type_id: "bank_transfer", payer: { email: "mp@x.com" } });
assert.deepEqual([v.checkout, v.status, v.liquido, v.metodo], ["Mercado Pago", "reembolsada", 63.5, "pix"]);
v = ev("digistore24", "event=on_payment&order_id=DS1&amount_brutto=47.00&amount_netto=40.10&currency=EUR&product_name=Hundeguide&email=d%40x.de&utm_source=FB&utm_content=AD%7C555", "application/x-www-form-urlencoded");
assert.deepEqual([v.checkout, v.status, v.valor, v.liquido, v.ids.anuncio], ["Digistore24", "aprovada", 47, 40.1, "555"]);
v = ev("eduzz", "trans_cod=E1&trans_status=7&trans_value=97.00&product_name=Curso&cus_email=e%40x.com", "application/x-www-form-urlencoded");
assert.equal(v.status, "reembolsada", "Eduzz status 7 = reembolsado");
v = ev("perfectpay", { code: "PPC1", sale_status_enum: 2, sale_amount: 67, product: { name: "Guia" }, customer: { email: "p@x.com" }, metadata: { utm_source: "kwai", utm_content: "5501" } });
assert.deepEqual([v.status, v.ids.plataforma, v.ids.anuncio], ["aprovada", "kwai", "5501"]);
v = ev("paddle", { event_type: "transaction.completed", data: { id: "txn_1", currency_code: "EUR", details: { totals: { total: "2900", earnings: "2600" } }, custom_data: { utm_source: "FB", utm_content: "AD|666" } } });
assert.deepEqual([v.transacao, v.valor, v.liquido, v.ids.anuncio], ["txn_1", 29, 26, "666"]);
v = ev("gumroad", "sale_id=G1&seller_id=s&product_name=Guide&price=1900&currency=usd&email=g%40x.com&refunded=false&url_params%5Butm_source%5D=tiktok&url_params%5Butm_content%5D=X%7C1803", "application/x-www-form-urlencoded");
assert.deepEqual([v.valor, v.status, v.ids.anuncio], [19, "aprovada", "1803"]);
// ClickBank: monta um aviso criptografado do jeito que o ClickBank manda
{
  const chave = "MINHACHAVESECRETA", ins = JSON.stringify({ transactionType: "SALE", receipt: "CB123", totalOrderAmount: 37, totalAccountAmount: 25.4, currency: "USD", lineItems: [{ productTitle: "Dog Guide" }], customer: { billing: { email: "c@x.com" } }, vendorVariables: { utm_source: "FB", utm_content: "AD|777" } });
  const iv = crypto.randomBytes(16), k = Buffer.from(crypto.createHash("sha1").update(chave).digest("hex").slice(0, 32));
  const cif = crypto.createCipheriv("aes-256-cbc", k, iv);
  const corpo = JSON.stringify({ notification: Buffer.concat([cif.update(ins), cif.final()]).toString("base64"), iv: iv.toString("base64") });
  v = ev("clickbank", decifrarClickbank(corpo, chave));
  assert.deepEqual([v.checkout, v.transacao, v.liquido, v.ids.anuncio], ["ClickBank", "CB123", 25.4, "777"]);
}
// atribuição TikTok/Kwai pelo sck compacto e pelas UTMs
assert.deepEqual(idsDasUtms({ sck: "TT_1801_1802_1803" }).plataforma, "tiktok");
assert.deepEqual(idsDasUtms({ utm: { source: "kwai", campaign: "5503", medium: "5502", content: "5501" } }), { plataforma: "kwai", campanha: "5503", conjunto: "5502", anuncio: "5501", origem: "kwai" });

// ---------- moeda e reembolsos ----------
const fx = conversor({ moeda: "BRL", cotacoes: { USD: 5 } });
assert.equal(fx(10, "USD"), 50); assert.equal(fx(10, "BRL"), 10);
assert.equal(conversor({ moeda: "USD", cotacoes: { USD: 5 } })(50, "BRL"), 10);
const hoje = new Date().toISOString().slice(0, 10);
const venda = (id, status, moeda = "BRL", valor = 100) => ({ id, status, valor, liquido: valor, moeda, produto: "P", checkout: "X", aprovadaEm: hoje + "T12:00:00Z", criadaEm: hoje + "T12:00:00Z", ids: { plataforma: "tiktok", anuncio: "1803", conjunto: "1802", campanha: "1801" }, utm: {} });
const vs = [venda("a", "aprovada"), venda("b", "aprovada", "USD", 20), venda("c", "reembolsada"), venda("d", "chargeback")];
const rel = relatorio({ vendas: vs, gastos: { dias: {}, nomes: {} }, de: hoje, ate: hoje, fuso: "UTC", cfg: { moeda: "BRL", cotacoes: { USD: 5 }, custoChargeback: 15 } });
assert.equal(rel.total.liquido, 200, "20 dólares viram 100 reais");
assert.equal(rel.total.taxaReembolso, 50); assert.equal(rel.total.custos, 15);
const pa = vendasPorAnuncio(vs, {}, { fuso: "UTC", cfg: { cotacoes: { USD: 5 } } })["tiktok:1803"];
assert.deepEqual(pa.reembolso, { vendas: 2, reembolsos: 1, chargebacks: 1 }); assert.equal(pa.hoje.receita, 200);
// moeda principal em euro com as contas de anúncio cobrando em reais
const gEur = { dias: { [hoje]: { "tiktok:1803": { gasto: 59, impressoes: 100, cliques: 5 } } }, nomes: {} };
const relEur = relatorio({ vendas: vs, gastos: gEur, de: hoje, ate: hoje, fuso: "UTC", cfg: { moeda: "EUR", moedaAnuncios: "BRL", cotacoes: { USD: 5, EUR: 5.9 } } });
assert.equal(relEur.total.gasto, 10, "R$ 59 de gasto viram € 10");
assert.equal(Math.round(relEur.total.liquido * 100) / 100, 33.9, "vendas em euro");
assert.equal(relatorio({ vendas: [], gastos: gEur, de: hoje, ate: hoje, fuso: "UTC", cfg: { moeda: "EUR" } }).total.gasto, 59, "sem moeda das contas, o gasto já está na moeda principal");
const paEur = vendasPorAnuncio(vs, {}, { fuso: "UTC", cfg: { moeda: "EUR", moedaAnuncios: "BRL", cotacoes: { USD: 5, EUR: 5.9 } } })["tiktok:1803"];
assert.equal(paEur.hoje.receita, 200, "o agente compara receita e gasto na moeda das contas");

// ---------- regras: reembolso, cansaço ----------
const m = (gasto, conv, imp, cl, rec = 0, freq = 1) => ({ gasto, conversoes: conv, impressoes: imp, cliques: cl, receita: rec, frequencia: freq });
const lst = agregar([
  { plataforma: "tiktok", nivel: "campanha", id: "C", nome: "Camp", status: "ativo", campanhaId: "C", orcamento: { valor: 100, editavel: true, recurso: "campaign:C" } },
  { plataforma: "tiktok", nivel: "conjunto", id: "S", nome: "Conj", status: "ativo", paiId: "C", campanhaId: "C", orcamento: null },
  { plataforma: "tiktok", nivel: "anuncio", id: "A", nome: "Ad A", status: "ativo", paiId: "S", campanhaId: "C", metricas: { hoje: m(50, 3, 5000, 100, 600), d3: m(150, 9, 15000, 300, 1800), d7: m(300, 18, 30000, 600, 3600) }, reembolso: { vendas: 6, reembolsos: 3, chargebacks: 1 } },
  { plataforma: "tiktok", nivel: "anuncio", id: "B", nome: "Ad B", status: "ativo", paiId: "S", campanhaId: "C", metricas: { hoje: m(10, 0, 4000, 20), d3: m(30, 0, 12000, 60), d7: m(80, 0, 28000, 400) } },
]);
agregarReembolso(lst);
assert.equal(Math.round(taxaReembolso(lst[0].reembolso)), 40);
const ac = avaliar(lst, { cpaAlvo: 50, fonteConversoes: "vendas", campanhasGerenciadas: ["tiktok:C"] }, new Date(), []);
assert.ok(ac.find((a) => a.alvoId === "A" && a.reembolso), "alerta de reembolso no anúncio");
assert.ok(!ac.find((a) => a.alvoId === "C" && a.tipo === "escalar"), "não escala campanha com reembolso alto");
assert.ok(ac.find((a) => a.alvoId === "C" && a.tipo === "alerta" && /reembolso/.test(a.motivo)));
assert.ok(ac.every((a) => a.motivoEn && a.motivoEn !== a.motivo), "todo motivo tem versão em inglês");
assert.match(diagnostico(lst, ac, { cpaAlvo: 50 }, "en").join(" "), /Last 3 days/);
assert.equal(cansaco(lst[3], {}).tipo, "ctr", "B: CTR caiu de 1,6% para 0,5%");
assert.equal(gancho("Pare de lutar contra a balança. Veja como."), "Pare de lutar contra a balança.");
const ofertas = [{ chave: "BR|x", anunciante: "Dra. Ana", nicho: "Emagrecimento", palavra: "secar barriga", status: "escalada", score: 80, criativos: [{ texto: "O erro que trava seu metabolismo depois dos 30. Assista.", criativosIguais: 12 }] }, { chave: "BR|y", anunciante: "Inglês Já", nicho: "Idiomas", palavra: "inglês", status: "escalada", score: 90, criativos: [{ texto: "Fale inglês em 90 dias sem decorar regras!", criativosIguais: 30 }] }];
lst[3].nome = "TT02 · secar barriga trend";
const cic = cicloCriativos(lst, ofertas, {}, [], new Date());
assert.equal(cic.length, 1); assert.equal(cic[0].referencias[0].anunciante, "Dra. Ana", "acha a oferta do mesmo assunto");
assert.equal(cic[0].ganchos[0].texto, "O erro que trava seu metabolismo depois dos 30.");

// ---------- força da oferta ----------
const forte = scoreEscala({ diasRodando: 40, anunciosOferta: 45, crescimento: 60, criativosDiferentes: 8, anunciosAnunciante: 90 }, { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 });
const fraca = scoreEscala({ diasRodando: 1, anunciosOferta: 1, crescimento: null, criativosDiferentes: 1, anunciosAnunciante: 2 }, {});
assert.ok(forte.score >= 90 && forte.forca === "muito forte" && forte.tendencia === "subindo", JSON.stringify(forte));
assert.ok(fraca.score < 25 && fraca.tendencia === "nova", JSON.stringify(fraca));

// ---------- Telegram ----------
avisos.configurar({ fetchFn: f });
const d = await avisos.descobrirChat("123:abc");
assert.deepEqual([d.bot, d.chatId], ["debian_avisos_bot", "987654"]);
const cfgTg = { telegram: { ativo: true, token: "123:abc", chatId: "987654", idioma: "en" }, analytics: { moeda: "USD" } };
assert.ok(await avisos.avisar(cfgTg, "vendas", avisos.msgVendas(cfgTg, [{ status: "aprovada", liquido: 49, produto: "Guide", anuncio: "TT01", plataforma: "tiktok" }])));
assert.match(telegramEnviadas.at(-1).text, /New sale.*US\$ 49\.00[\s\S]*TT01 \(TikTok\)/);
assert.equal(await avisos.avisar({ ...cfgTg, telegram: { ...cfgTg.telegram, tipos: { vendas: false } } }, "vendas", "x"), false, "tipo desligado");

// ---------- agente com TikTok + Kwai + Telegram ----------
const raiz = await fs.mkdtemp(path.join(os.tmpdir(), "debian-v2-"));
await fs.mkdir(path.join(raiz, "data"));
await fs.writeFile(path.join(raiz, "data", "ofertas.json"), JSON.stringify({ ofertas }));
agente.configurar({ raiz, fetchFn: f });
await agente.salvarConfig({ tiktok: { token: "tt", anuncianteId: "7000" }, kwai: { clientId: "c", clientSecret: "s", refreshToken: "r1", contaId: "123" }, telegram: { ativo: true, token: "123:abc", chatId: "987654", idioma: "pt" }, regras: { cpaAlvo: 30, modo: "automatico", campanhasGerenciadas: ["tiktok:1801"] } });
await tt.mudarStatus("1804", true, "anuncio");
const antes = telegramEnviadas.length;
const est = await agente.ciclo();
assert.deepEqual(Object.keys(est.erros), []);
assert.ok(est.entidades.some((e) => e.plataforma === "tiktok") && est.entidades.some((e) => e.plataforma === "kwai"));
assert.ok(est.historico.some((h) => h.plataforma === "tiktok" && h.tipo === "pausar" && h.ok), "pausou o anúncio do TikTok que só gasta");
assert.ok(est.diagnosticoEn.length && est.ciclo.length, "diagnóstico em inglês e ciclo de criativos");
assert.ok(telegramEnviadas.length > antes && telegramEnviadas.slice(antes).some((x) => /piloto automático/.test(x.text)), "avisou no Telegram");
const cfgM = await agente.configMascarada();
assert.ok(cfgM.status.tiktok && cfgM.status.kwai && cfgM.status.telegram);
assert.ok(cfgM.tiktok.token.startsWith("••••") && cfgM.telegram.token.startsWith("••••"), "segredos mascarados");
assert.equal((await agente.carregarConfig()).kwai.refreshToken, "kw-refresh-2", "salvou o refresh token novo do Kwai");
const marc = await agente.marcarCiclo(est.ciclo[0].id, true);
assert.ok(marc[0].feito);

// seletor de moeda do topo: trocar a moeda principal prende a moeda das contas na anterior
await salvarAnalytics({ moeda: "BRL", moedaAnuncios: "" });
await salvarAnalytics({ moeda: "EUR" });
let ca = await configAnalytics();
assert.equal(ca.moeda, "EUR"); assert.equal(ca.moedaAnuncios, "BRL");
await salvarAnalytics({ moeda: "USD" });
ca = await configAnalytics();
assert.equal(ca.moeda, "USD"); assert.equal(ca.moedaAnuncios, "BRL", "continua em reais");
await salvarAnalytics({ moeda: "BRL", moedaAnuncios: "BRL" });
assert.equal((await configAnalytics()).moedaAnuncios, "", "igual à principal vira vazio");

console.log("✅ Plataformas, gateways e avisos: todos os testes passaram");
