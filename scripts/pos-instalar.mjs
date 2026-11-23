// Depois do "npm install": baixa o navegador que o robô do Clonador usa.
// Nos testes automáticos (CI) dá para pular com SEM_NAVEGADOR=1.
import { spawnSync } from "node:child_process";
if (process.env.SEM_NAVEGADOR === "1") {
  console.log("Pulando o download do navegador (SEM_NAVEGADOR=1).");
  process.exit(0);
}
console.log("🐉 Baixando o navegador do robô (Chromium)…");
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], { stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) console.log("Não consegui baixar o navegador agora. O Clonador vai tentar de novo na próxima vez que você abrir o Minerador.");
