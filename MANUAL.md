# 📖 Manual do Paid Traffic Agent (português)

> Visão geral, download e instalação estão no [README](README.md). Aqui ficam os detalhes de cada parte.

Um site só, com menu lateral dividido em partes:

| Parte | Páginas |
|---|---|
| 🏠 **Início** | Números do dia (faturamento, gasto, lucro, ROI, ROAS), **gráfico de ROI diário** e de faturamento × gasto × lucro dos últimos 30 dias, resumo de cada ferramenta e checklist do que falta conectar |
| 🧬 **Clonador** | Minerar ofertas · Clonar criativos & copy |
| 📣 **Gerenciador de anúncios** | Visão geral · Campanhas · Piloto automático · Criar campanha · Contas de anúncio |
| 💰 **UTMFy do Debian** | Dashboard · Campanhas e ROI · Vendas · Criativos · Produtos e pagamentos · Integrações |

Cada página tem endereço próprio (ex.: `http://localhost:3000/#utmfy/vendas`), então dá para salvar nos favoritos.

Você digita um tema ou palavra-chave. O robô busca na **Biblioteca de Anúncios do Facebook** e mostra, num painel:

- **ofertas escaladas**, **escalando**, **rodando** ou **em teste**
- **anúncios ativos** da oferta e do anunciante (total na página)
- **anunciante**, **oferta**, **nicho** (detectado sozinho), **país** e há quantos **dias está rodando**
- selo **Estruturada**: o robô abre o funil e confere página própria, checkout, pixel, número de criativos e tempo no ar
- **link do funil**, **tipo de funil** (VSL, Quiz, Página de vendas, Advertorial, WhatsApp…), **plataforma de checkout** e **link do checkout**
- **vídeos** para assistir e baixar. Os vídeos das ofertas escaladas ficam guardados no seu GitHub, porque os links do Facebook expiram.
- **copy** dos anúncios com botão de copiar
- filtros por **palavra-chave, nicho, país, status, funil, checkout, mínimo de anúncios**, “só estruturadas” e “só com vídeo”
- **histórico** diário de cada oferta, com crescimento em 7 dias

Dá para usar de dois jeitos, ambos de graça:

- **No seu computador**, sem hospedar nada. É o mais simples e tende a ser bloqueado menos pelo Facebook.
- **No GitHub**, que roda sozinho na nuvem todo dia, mesmo com o computador desligado.

No modo computador ainda tem o **📈 Agente de Tráfego** e o **💰 Debian Analytics**, que mostra as vendas reais, o lucro e o ROI de cada campanha (veja mais abaixo).

---

## 💻 Opção A: rodar no seu computador

1. Instale o **Node.js** (versão LTS) em <https://nodejs.org>. É só avançar até o fim.
2. Descompacte o `.zip` numa pasta.
3. Dê dois cliques em:
   - **Windows:** `iniciar-windows.bat`
   - **Mac:** `iniciar-mac.command`. Na primeira vez: botão direito → **Abrir** → **Abrir**, por causa da segurança do macOS.
   - **Linux / terminal:** `npm install` e depois `npm start`
4. Na primeira vez ele instala o robô e o navegador dele (uns 150 MB, alguns minutos). Depois o painel abre sozinho em **http://localhost:3000**.
5. Digite o tema, escolha o país e clique em **Minerar agora**. O painel mostra o progresso e os resultados ao terminar.

- Os **vídeos** das ofertas escaladas ficam salvos na pasta `videos/`.
- Os **dados e o histórico** ficam na pasta `data/`.
- **Enquanto a janela preta ficar aberta**, ele minera sozinho as palavras acompanhadas **todo dia às 8h**. Fechou a janela, para tudo. É só abrir de novo pelo mesmo atalho.
- Quer ver o robô trabalhando no navegador? Rode com `MOSTRAR=1 npm start` (Mac/Linux) ou `set MOSTRAR=1 && npm start` (Windows).
- Outra porta ou outro horário: `PORTA=4000 HORA_DIARIA=7 npm start` (`HORA_DIARIA=off` desliga a diária).

---

## ☁️ Opção B: rodar no GitHub (nuvem, sozinho todo dia)

O robô roda no GitHub Actions e o painel fica no GitHub Pages. Roda **todo dia às 8h** (horário de Brasília) e também quando você clica em **Minerar agora**.

### Instalação (uns 10 minutos, uma vez só)

#### 1. Crie o repositório
1. Entre em <https://github.com/new> (crie a conta se não tiver).
2. Nome: `minerador-ofertas`. Marque **Public**: repositório público tem Actions ilimitado e Pages grátis.
3. Clique em **Create repository**.

#### 2. Suba os arquivos
**Pelo site (mais fácil):** na página do repositório vazio, clique em **uploading an existing file**, arraste **todo o conteúdo** da pasta descompactada (não a pasta em si) e clique em **Commit changes**.

> ⚠️ A pasta `.github` começa com ponto e pode ficar escondida no seu computador. Depois de subir, confira se aparece `.github/workflows/minerar.yml` no repositório. Se não aparecer: **Add file → Create new file**, digite o nome `.github/workflows/minerar.yml`, cole o conteúdo desse arquivo e salve.

**Pelo terminal (se tiver git):**
```bash
cd minerador-ofertas
git init -b main && git add . && git commit -m "Minerador de ofertas"
git remote add origin https://github.com/SEU-USUARIO/minerador-ofertas.git
git push -u origin main
```

#### 3. Ligue o painel (GitHub Pages)
**Settings → Pages → Build and deployment → Source: GitHub Actions.**

#### 4. Libere o robô para salvar
**Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**

#### 5. (Opcional) Mineração diária automática
Em **Settings → Secrets and variables → Actions → Variables**, crie a variável `MINERAR_AGENDADO` com o valor `true`. Sem ela, o robô só roda quando você clica em **Run workflow**.

#### 6. Primeira mineração
**Actions → Minerar ofertas → Run workflow**, digite um tema (ex.: `emagrecer`) e clique no botão verde.
Em ~5–10 min o painel fica no ar em:

```
https://SEU-USUARIO.github.io/minerador-ofertas/
```

#### 7. Minerar com um clique pelo painel (opcional, recomendado)
No painel, clique em **⚙️ Conectar GitHub** e siga as instruções. É um token que só tem permissão de rodar o robô deste repositório. Depois disso é só digitar o tema e clicar em **Minerar agora**. O painel acompanha o progresso e mostra os resultados quando terminar.

---

## 📈 Agente de Tráfego (aba Tráfego, só no modo computador)

Gerencia suas campanhas da **Meta (Facebook/Instagram)** e do **Google Ads** a partir do mesmo painel.

| Aba | O que faz |
|---|---|
| **📊 Visão geral** | Investido, conversões, CPA, ROAS, CTR e CPM (hoje, 3 dias e 7 dias), diagnóstico automático, sugestões para aprovar e alertas. Tem o botão **🧠 Analisar com Claude**. |
| **📋 Campanhas** | Campanhas, conjuntos e anúncios com métricas. Pausar, ativar, mudar orçamento e marcar 🤖 as campanhas que o piloto automático pode mexer. |
| **🤖 Piloto automático** | Seu CPA alvo, ROAS mínimo, teto de orçamento e as regras: pausar anúncio ruim, escalar o que vende, reduzir o que está caro e alertar fadiga de criativo. |
| **🚀 Criar campanha** | Sobe vídeos/imagens e cria na Meta: campanha com orçamento na campanha, conjunto com público Advantage+ e 1 anúncio por criativo. Tudo **pausado** até você ativar. |
| **✍️ Criativos & copy** | A partir do seu briefing e das ofertas escaladas do Minerador, gera ganchos, textos, títulos, roteiros de vídeo e anúncios do Google. |
| **🔌 Conexões** | Onde você cola os tokens. Cada campo tem o passo a passo. |

**Modos do piloto:**
- **Desligado:** só métricas.
- **Sugerir** (padrão): analisa a cada 3h e você aprova cada ação com um clique.
- **Automático:** age sozinho, **só nas campanhas marcadas com 🤖**. Nunca passa do teto diário, escala no máximo uma vez a cada 24h e nunca pausa o último anúncio ativo de um conjunto.

**Importante:**
- O agente roda enquanto a janela do minerador estiver aberta.
- Os tokens ficam só no arquivo `trafego.local.json`, no seu computador. Esse arquivo não vai para o GitHub.
- **Google Ads:** precisa de um *developer token* aprovado pelo Google (pedido na conta de administrador). Pelo Google o agente analisa, pausa e ajusta orçamento; a criação automática de campanhas é só na Meta.
- **Copy e análise grátis:** sem a chave da API do Claude, os botões copiam o pedido pronto e abrem o Claude no navegador. Com a chave (paga por uso), o resultado aparece direto no painel.
- Use vídeos e copies seus. Modele as ofertas escaladas, não copie: material de terceiros gera denúncia e bloqueio da conta de anúncios.

## 💰 Debian Analytics (aba Resultados, só no modo computador)

Mostra quanto está entrando de verdade, quanto você gasta, o lucro e o ROI de cada campanha, conjunto e anúncio.

- **Painel:** faturamento líquido e bruto, gastos, lucro, ROI, ROAS, margem, vendas, ticket médio, CPA real, pendentes, reembolsos e chargebacks. Também gráfico por dia, criativos campeões e no prejuízo, tabela de campanhas, produtos, aprovação por forma de pagamento, checkouts e últimas vendas. Filtros por período (hoje, ontem, 7 dias, 30 dias, mês, personalizado), plataforma, produto e checkout.
- **Checkouts com leitor próprio:** Hotmart, Kiwify e **Cakto** (com verificação da assinatura). Eduzz, Monetizze, Braip, PerfectPay, Ticto, Greenn, Kirvano, Yampi e Shopify usam um leitor genérico. Se algum campo vier errado, abra ⚙️ Integrações → “Últimos avisos recebidos” e me mande o exemplo.
- **Receptor 24h grátis:** um Cloudflare Worker com banco D1 recebe as vendas mesmo com o computador desligado. O painel gera o código e mostra o passo a passo em ⚙️ Integrações.
- **Atribuição:** UTMs no formato `nome|id` no Meta, IDs do ValueTrack no Google e o `sck` compacto que o script da página repassa para a Hotmart e a Cakto.
- **Integração com o Agente de Tráfego:** com “Usar vendas reais no piloto automático”, o agente passa a escalar campanhas com ROI real acima do mínimo e a pausar anúncios no prejuízo, já descontando impostos e taxas. No painel, “🎯 Variações” manda o criativo campeão para gerar novas copies e roteiros.
- Os dados de vendas ficam em `trafego-dados/` (no seu computador, fora do GitHub).

## Ajustes (`config.json`)

| Campo | O que faz |
|---|---|
| `pais` | País padrão das buscas (`BR`, `PT`, `US`…) |
| `palavrasChave` | Temas minerados todo dia, além dos que você marcar “acompanhar” no painel |
| `minAnuncios` | Abaixo disso a oferta é considerada “em teste” |
| `escalada.minAnunciosOferta` | A partir de quantos anúncios ativos **na oferta** ela é “escalada” (padrão 15) |
| `escalada.minAnunciosAnunciante` | …ou quantos anúncios ativos **do anunciante** (padrão 40) |
| `escalada.crescimentoEscalando` | % de crescimento em 7 dias para marcar “escalando” (padrão 30) |
| `anunciosPorBusca` | Quantos anúncios o robô lê por palavra-chave (padrão 300) |
| `funil.maxPorBusca` | Quantos funis ele abre por busca (padrão 20) |
| `videos.maxPorExecucao` | Quantos vídeos novos ele guarda por execução (padrão 20) |

Para mudar, abra o `config.json` no GitHub, clique no lápis ✏️, edite e salve.

## Como ele decide

- **Escalada**: oferta com 15+ anúncios ativos ou anunciante com 40+.
- **Escalando**: cresceu 30%+ em relação a 3–7 dias atrás. Precisa de alguns dias de histórico.
- **Estruturada**: 4 dos 5 sinais: página própria, checkout identificado, pixel da Meta, 3+ criativos, 7+ dias no ar.
- “Anúncios na oferta” soma os anúncios ativos de cada criativo encontrado (a biblioteca agrupa anúncios iguais e mostra “X anúncios usam este criativo”).

## Se algo der errado

- **No computador, busca sem resultado**: o log aparece na janela preta. Tente de novo mais tarde ou rode com `MOSTRAR=1` para ver o que o Facebook está mostrando.
- **Painel vazio / busca com erro (GitHub)**: abra **Actions**, clique na última execução e veja o log. Se aparecer “Nenhuma busca trouxe anúncios”, o Facebook bloqueou o acesso naquela hora. Baixe o artefato **debug** para ver a captura de tela e tente de novo mais tarde.
- **Vídeo não toca**: os links do Facebook expiram em alguns dias. As ofertas acompanhadas são atualizadas todo dia, e os vídeos das escaladas ficam salvos em **Releases → Vídeos salvos**.
- **Robô parou de rodar sozinho**: o GitHub pausa agendamentos de repositórios sem atividade por 60 dias. Em **Actions**, clique em **Enable workflow**.

## Importante

- O robô lê a Biblioteca de Anúncios pública, sem login. Os termos de uso da Meta não permitem coleta automatizada, então pode haver bloqueios temporários. Use com moderação: os limites do `config.json` já são conservadores.
- O repositório é público, então qualquer pessoa com o link vê suas buscas.
- Use os vídeos e as copies para **estudar e modelar** ofertas. Republicar o vídeo ou o texto de outra pessoa como se fosse seu pode gerar denúncia de direitos autorais e bloqueio da sua conta de anúncios.

## Testes
```bash
npm install && npm test
```
