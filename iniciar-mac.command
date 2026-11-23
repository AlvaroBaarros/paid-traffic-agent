#!/bin/bash
# 🐉 Paid Traffic Agent (beta) — abrir no macOS
# Dê dois cliques neste arquivo. Na primeira vez: botão direito → Abrir → Abrir.

cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "  🐉  Paid Traffic Agent (beta)"
echo "  ─────────────────────────────"
echo ""

# Arquivos baixados da internet ficam em "quarentena" no macOS; libera só os desta pasta.
xattr -dr com.apple.quarantine . 2>/dev/null

# O Finder abre o Terminal sem o PATH completo: procura o Node nos lugares comuns (instalador, Homebrew, nvm, Volta).
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi

if ! command -v node >/dev/null 2>&1; then
  echo "  O Node.js não está instalado."
  echo "  Vou abrir a página de download: baixe a versão LTS (botão verde),"
  echo "  instale e depois abra este arquivo de novo."
  echo ""
  open "https://nodejs.org/pt-br/download"
  read -r -p "  Aperte Enter para fechar..." _
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  Seu Node.js é a versão $(node -v), e o Minerador precisa da 18 ou mais nova."
  echo "  Vou abrir a página de download: instale a versão LTS e abra este arquivo de novo."
  open "https://nodejs.org/pt-br/download"
  read -r -p "  Aperte Enter para fechar..." _
  exit 1
fi

# Instala na primeira vez e sempre que uma atualização trouxer pacotes novos.
if [ ! -d node_modules ] || [ ! -d node_modules/chart.js ] || [ package.json -nt node_modules ]; then
  echo "  Instalando o Minerador e o navegador do robô (só na primeira vez, alguns minutos)..."
  echo ""
  if ! npm install --no-audit --no-fund; then
    echo ""
    echo "  A instalação falhou. Confira sua internet e tente de novo."
    echo "  Se continuar, abra uma issue no GitHub com a mensagem acima (sem tokens!)."
    read -r -p "  Aperte Enter para fechar..." _
    exit 1
  fi
  touch node_modules
fi

node servidor.mjs
echo ""
read -r -p "  O Minerador foi fechado. Aperte Enter para sair..." _
