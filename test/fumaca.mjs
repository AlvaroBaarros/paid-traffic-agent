// Teste de fumaça: liga o servidor de verdade e confere que as páginas e a API respondem (roda no CI em Windows, macOS e Linux).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = 3999;
const srv = spawn(process.execPath, ["servidor.mjs"], { cwd: raiz, env: { ...process.env, PORTA: String(PORTA), NAO_ABRIR: "1", HORA_DIARIA: "off" } });
let saida = "";
srv.stdout.on("data", (d) => (saida += d));
srv.stderr.on("data", (d) => (saida += d));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://localhost:${PORTA}`;
let falhas = 0;
const conferir = (nome, ok, extra = "") => { console.log(`${ok ? "✅" : "❌"} ${nome}${extra ? " · " + extra : ""}`); if (!ok) falhas++; };
try {
  for (let i = 0; i < 40 && !/rodando em/.test(saida); i++) await esperar(250);
  conferir("servidor ligou", /rodando em/.test(saida), saida.split("\n").find((l) => /rodando/.test(l))?.trim());
  const home = await fetch(base + "/");
  const html = await home.text();
  conferir("página inicial", home.ok && html.includes("Paid Traffic Agent") && html.includes("🐉"));
  for (const arq of ["/trafego.js", "/analytics.js", "/data/ofertas.json"]) conferir(arq, (await fetch(base + arq)).ok);
  const st = await (await fetch(base + "/api/status")).json();
  conferir("api/status", st.local === true && !!st.versao?.atual, "v" + st.versao?.atual);
  conferir("api/trafego/config", (await fetch(base + "/api/trafego/config")).ok);
  conferir("api/analytics/relatorio", (await fetch(base + "/api/analytics/relatorio?periodo=7d")).ok);
  conferir("bloqueia POST sem cabeçalho", (await fetch(base + "/api/trafego/ciclo", { method: "POST" })).status === 403);
  conferir("gráficos locais", (await fetch(base + "/vendor/chart.umd.js")).ok);
} catch (e) {
  conferir("erro inesperado", false, e.message);
} finally {
  srv.kill();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\n🐉 Fumaça ok");
process.exit(falhas ? 1 : 0);
