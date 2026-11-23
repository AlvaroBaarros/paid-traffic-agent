// Testes do motor de regras do agente de tráfego.
import assert from "node:assert/strict";
import { avaliar, agregar, resumo, diagnostico, derivar, mesclarRegras } from "../trafego/regras.mjs";

const m = (gasto, conv = 0, imp = 10000, cliques = 150, receita = 0, freq = 1.5) => ({ gasto, conversoes: conv, impressoes: imp, cliques, receita, frequencia: freq });
const zero = m(0, 0, 0, 0);
const ad = (id, paiId, hoje, d3, extra = {}) => ({ plataforma: "meta", nivel: "anuncio", id, nome: "Anúncio " + id, status: "ativo", paiId, campanhaId: "C1", metricas: { hoje, d3, d7: d3 }, ...extra });

function cenario() {
  return agregar([
    { plataforma: "meta", nivel: "campanha", id: "C1", nome: "Campanha [AG]", status: "ativo", campanhaId: "C1", orcamento: { valor: 100, editavel: true } },
    { plataforma: "meta", nivel: "conjunto", id: "S1", nome: "Conjunto 1", status: "ativo", paiId: "C1", campanhaId: "C1", orcamento: null },
    ad("A1", "S1", m(20, 1), m(130, 5, 20000, 400, 900)),          // vendendo bem
    ad("A2", "S1", m(30, 0), m(60, 0, 8000, 90)),                  // R$90 sem venda → pausar (alvo 50 × 1,5 = 75)
    ad("A3", "S1", m(10, 0, 5000, 10), m(20, 0, 9000, 30), { metricas: { hoje: m(10, 0, 5000, 10), d3: m(20, 0, 9000, 30), d7: m(25, 0, 12000, 40, 0, 3.6) } }), // CTR baixo + fadiga
    { plataforma: "meta", nivel: "campanha", id: "C2", nome: "Campanha 2", status: "ativo", campanhaId: "C2", orcamento: null },
    { plataforma: "meta", nivel: "conjunto", id: "S2", nome: "Conjunto 2", status: "ativo", paiId: "C2", campanhaId: "C2", orcamento: { valor: 80, editavel: true } },
    ad("B1", "S2", m(40, 1), m(160, 1)),                          // CPA 100, último ativo → alerta; conjunto → reduzir
  ].map((e) => (e.campanhaId === "C2" && e.nivel === "anuncio" ? { ...e, campanhaId: "C2" } : e)));
}

const cfg = { cpaAlvo: 50, campanhasGerenciadas: ["meta:C1"], tetoOrcamentoDiario: 300 };
const agora = new Date("2026-11-23T12:00:00Z");
const ents = cenario();

// agregação
const c1 = ents.find((e) => e.id === "C1");
assert.equal(c1.metricas.d3.gasto, 210);
assert.equal(c1.metricas.hoje.conversoes, 1);

const acoes = avaliar(ents, cfg, agora, []);
const tipos = Object.fromEntries(acoes.map((a) => [a.alvoId + ":" + a.tipo, a]));
assert.ok(tipos["A2:pausar"], "A2 deve ser pausado");
assert.ok(tipos["A2:pausar"].automatizavel, "C1 é gerenciada");
assert.ok(tipos["A3:pausar"], "A3 CTR baixo");
assert.ok(tipos["A3:alerta"], "A3 fadiga");
assert.ok(!tipos["A1:pausar"], "A1 vende bem, não pausa");
// C1: 6+1=7 conv?  hoje 1 + d3 5 (A1) = 6 conv, gasto janela C1 = 150+90+30 = 270 → CPA 45 > 42,5 (0,85×50) → não escala
assert.ok(!tipos["C1:escalar"], "CPA 45 não atinge 0,85× alvo");
assert.ok(tipos["B1:alerta"], "B1 é o último ativo do conjunto → alerta em vez de pausar");
assert.ok(!tipos["B1:pausar"]);
assert.equal(tipos["S2:reduzir"].para, 64, "reduz 20%");
assert.equal(tipos["S2:reduzir"].automatizavel, false, "C2 não é gerenciada");

// escalar quando o CPA está bom
const bom = agregar([
  { plataforma: "meta", nivel: "campanha", id: "C9", nome: "Boa", status: "ativo", campanhaId: "C9", orcamento: { valor: 100, editavel: true } },
  { plataforma: "meta", nivel: "conjunto", id: "S9", nome: "S9", status: "ativo", paiId: "C9", campanhaId: "C9" },
  ad("X1", "S9", m(30, 1), m(120, 4, 20000, 400, 1000)),
].map((e) => ({ ...e, campanhaId: "C9" })));
let a2 = avaliar(bom, { cpaAlvo: 50, tetoOrcamentoDiario: 110 }, agora, []);
const esc = a2.find((a) => a.tipo === "escalar");
assert.equal(esc.para, 110, "respeita o teto");
a2 = avaliar(bom, { cpaAlvo: 50 }, agora, [{ alvoId: "C9", tipo: "escalar", em: "2026-11-23T02:00:00Z" }]);
assert.ok(!a2.find((a) => a.tipo === "escalar"), "respeita o intervalo de 24h");
a2 = avaliar(bom, { cpaAlvo: 50, roasAlvo: 3 }, agora, []);
assert.ok(a2.find((a) => a.tipo === "escalar"), "ROAS 6.67 ≥ 3 escala");
a2 = avaliar(bom, { cpaAlvo: 50, roasAlvo: 8 }, agora, []);
assert.ok(!a2.find((a) => a.tipo === "escalar"), "ROAS abaixo do alvo não escala");

// métricas
const d = derivar(m(100, 4, 10000, 200, 400));
assert.equal(d.cpa, 25); assert.equal(d.ctr, 2); assert.equal(d.cpm, 10); assert.equal(d.roas, 4);
assert.equal(resumo(ents, "janela").total.gasto, 470);
const diag = diagnostico(ents, acoes, cfg);
assert.ok(diag.length >= 3 && diag[0].includes("R$ 470,00"));
assert.equal(mesclarRegras({ pausar: { cpaMult: 2 } }).pausar.gastoSemVendaMult, 1.5, "mescla sem perder padrões");

console.log("✅ Motor de regras: todos os testes passaram");
