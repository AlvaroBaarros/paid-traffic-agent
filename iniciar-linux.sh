#!/bin/bash
# 🐉 Paid Traffic Agent (beta) — abrir no Linux:  ./iniciar-linux.sh
cd "$(dirname "$0")" || exit 1
echo "🐉 Paid Traffic Agent (beta)"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi
if ! command -v node >/dev/null 2>&1; then
  echo "Instale o Node.js 18 ou mais novo (https://nodejs.org ou o gerenciador de pacotes da sua distro) e rode de novo."
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Seu Node.js é $(node -v); o Minerador precisa da versão 18 ou mais nova."
  exit 1
fi
if [ ! -d node_modules ] || [ ! -d node_modules/chart.js ] || [ package.json -nt node_modules ]; then
  echo "Instalando (só na primeira vez)..."
  npm install --no-audit --no-fund || exit 1
  # Dependências do navegador do robô (pode pedir a senha do sistema)
  npx playwright install-deps chromium 2>/dev/null || echo "Se o robô não abrir o navegador, rode: sudo npx playwright install-deps chromium"
  touch node_modules
fi
exec node servidor.mjs
