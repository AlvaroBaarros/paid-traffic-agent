# 📖 Manual do Paid Traffic Agent

> Visão geral, download e instalação estão no [README](README.md). Aqui ficam os detalhes de cada parte.

Um site só, com menu lateral. Clique numa parte para abrir as páginas dela; o botão « no topo recolhe o menu e deixa só os ícones.

| Parte | Páginas |
|---|---|
| 🏠 **Início** | Números do dia (faturamento, gasto, lucro, ROI, ROAS), **gráfico de ROI diário** e de faturamento × gasto × lucro dos últimos 30 dias, resumo de cada ferramenta e checklist do que falta conectar |
| 🧬 **Clonador** | Minerar ofertas · Clonar criativos & copy |
| 📣 **Gerenciador de anúncios** | Visão geral · Campanhas · Piloto automático · Ciclo de criativos · Criar campanha · Contas de anúncio |
| 💰 **UTMFy** | Dashboard · Campanhas e ROI · Vendas · Criativos · Produtos e pagamentos · Integrações |
| 🔔 **Avisos no celular** | Telegram: vendas, reembolsos, piloto automático, criativos cansados e resumo do dia |

Cada página tem endereço próprio (ex.: `http://localhost:3000/#utmfy/vendas`), então dá para salvar nos favoritos.

**🇧🇷 Português / 🇺🇸 English:** o botão com as bandeiras no topo troca o app inteiro de idioma na hora. A escolha fica salva no navegador.

**R$ · € · US$:** ao lado das bandeiras, escolha se o painel mostra os valores em Real, Euro ou Dólar.

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

Cada oferta ganha uma **nota de força** de 0 a 100 (tempo no ar, volume de anúncios, crescimento, criativos diferentes, tamanho do anunciante e constância), com tendência ▲ subindo, ▼ caindo ou ✨ nova, e a lista “Por que é forte” no detalhe. Se a Meta mudar o site e o robô passar a ler menos anúncios que o normal, aparece um aviso no topo do Clonador (e no Telegram, se você ligou).

No modo computador ainda tem o **📣 Gerenciador de anúncios**, a **💰 UTMFy**, que mostra as vendas reais, o lucro e o ROI de cada campanha, e os **🔔 avisos no celular** (veja mais abaixo).

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

## 📣 Gerenciador de anúncios (só no modo computador)

Gerencia suas campanhas da **Meta (Facebook/Instagram)**, do **Google Ads**, do **TikTok Ads** e do **Kwai Ads** a partir do mesmo painel.

| Página | O que faz |
|---|---|
| **Visão geral** | Investido, conversões, CPA, ROAS, CTR e CPM somando todas as plataformas, diagnóstico automático, sugestões para aprovar e alertas. Tem o botão **🧠 Analisar com Claude**. |
| **Campanhas** | Campanhas, conjuntos e anúncios de todas as plataformas, com filtro por plataforma. Pausar, ativar, mudar orçamento e marcar 🤖 as campanhas que o piloto automático pode mexer. |
| **Piloto automático** | Seu CPA alvo, ROAS mínimo, teto de orçamento e as regras: pausar anúncio ruim, escalar o que vende, reduzir o que está caro, **criativo cansado** e **reembolsos**. |
| **Ciclo de criativos** | Lista os anúncios cansados e traz **ganchos novos** de ofertas escaladas do mesmo assunto, tirados do Clonador. Um clique copia o gancho; outro manda as referências para o gerador de copy. |
| **Criar campanha** | Sobe vídeos/imagens e cria na Meta: campanha com orçamento na campanha, conjunto com público Advantage+ e 1 anúncio por criativo. Tudo **pausado** até você ativar. |
| **Criativos & copy** | A partir do seu briefing e das ofertas escaladas do Clonador, gera ganchos, textos, títulos, roteiros de vídeo (inclusive verticais para TikTok e Kwai) e anúncios do Google, em **português, inglês ou espanhol**. |
| **Contas de anúncio** | Onde você cola os tokens. Cada plataforma tem o passo a passo. |

**Modos do piloto:**
- **Desligado:** só métricas.
- **Sugerir** (padrão): analisa a cada 3h e você aprova cada ação com um clique.
- **Automático:** age sozinho, **só nas campanhas marcadas com 🤖**. Nunca passa do teto diário, escala no máximo uma vez a cada 24h e nunca pausa o último anúncio ativo de um conjunto.

**Criativo cansado:** o agente avisa quando a frequência passa de 3 ou quando o CTR dos últimos 3 dias + hoje cai mais de 30% em relação aos 4 dias anteriores (com pelo menos 2.000 impressões). Tudo ajustável no Piloto automático.

**Reembolsos e chargebacks:** com as vendas reais da UTMFy, o agente calcula a taxa de reembolso + chargeback de cada anúncio nos últimos 30 dias. Acima de 15% (a partir de 4 vendas), ele avisa e **não escala** a campanha.

**Por plataforma:**
- **Meta:** tudo (análise, piloto, criação de campanhas).
- **Google Ads:** análise, pausar e orçamento. Precisa de um *developer token* aprovado pelo Google (pedido na conta de administrador).
- **TikTok Ads:** análise, pausar/ativar e orçamento (de campanha ou de grupo de anúncios). Precisa de um app aprovado no TikTok API for Business e do *access token* de longa duração.
- **Kwai Ads:** análise e orçamento de grupos de anúncios. Precisa pedir o acesso à API ao Kwai (pelo Business Center ou com o seu gerente de conta). O Kwai só deixa a API pausar anúncios **criados pela API**: nos criados no painel do Kwai, o agente avisa e você aplica a mudança lá. Se a conta for em outra moeda, informe a cotação.

**Importante:**
- O agente roda enquanto a janela do app estiver aberta.
- Os tokens ficam só no arquivo `trafego.local.json`, no seu computador. Esse arquivo não vai para o GitHub.
- **Copy e análise grátis:** sem a chave da API do Claude, os botões copiam o pedido pronto e abrem o Claude no navegador. Com a chave (paga por uso), o resultado aparece direto no painel.
- Use vídeos e copies seus. Modele as ofertas escaladas, não copie: material de terceiros gera denúncia e bloqueio da conta de anúncios.

## 💰 UTMFy (só no modo computador)

Mostra quanto está entrando de verdade, quanto você gasta, o lucro e o ROI de cada campanha, conjunto e anúncio, em qualquer plataforma.

- **Dashboard:** faturamento líquido e bruto, gastos, lucro, ROI, ROAS, margem, vendas, ticket médio, CPA real, pendentes, reembolsos, chargebacks e **taxa de reembolso**. Também gráfico por dia, criativos campeões e no prejuízo, tabela de campanhas (com a coluna de reembolso de cada anúncio), produtos, aprovação por forma de pagamento, checkouts e últimas vendas.
- **35+ checkouts e gateways**, separados por região em Integrações:
  - 🇧🇷 **Brasil:** Hotmart, Kiwify, Cakto, Eduzz, Monetizze, Braip, PerfectPay, Ticto, Greenn, Kirvano, Lastlink, Hubla, Digital Manager Guru, Yampi, Cartpanda, Appmax, Pagar.me, Asaas, PagBank, Nuvemshop, Mercado Pago
  - 🌎 **Global:** Stripe, PayPal, Shopify, WooCommerce e “Outra plataforma” (leitor genérico)
  - 🇺🇸 **EUA:** ClickBank, BuyGoods, ThriveCart, SamCart, Gumroad, Lemon Squeezy
  - 🇪🇺 **Europa:** Digistore24, Paddle, Mollie
- **Moedas:** troque entre **Real, Euro e Dólar** pelo seletor **R$ · € · US$** no topo de qualquer página (a libra £ fica em Integrações). Vendas em outra moeda são convertidas para a principal pelas cotações, e cada venda continua mostrando a moeda original. Em Integrações, informe também a **moeda das contas de anúncio** para o gasto ser convertido certo; ao trocar a moeda pelo topo, o app guarda a moeda anterior como a das contas. O Gerenciador de anúncios sempre mostra os valores na moeda das contas.
- **Mercado Pago** avisa só o ID do pagamento: cole o Access Token em Integrações para o app buscar os detalhes. **ClickBank** manda avisos criptografados: cole a Secret Key.
- **Receptor 24h grátis:** um Cloudflare Worker com banco D1 recebe as vendas mesmo com o computador desligado. O painel gera o código e mostra o passo a passo em Integrações. **Na v0.2.0 o código do Worker mudou:** copie e cole de novo no Cloudflare.
- **Atribuição:** UTMs no formato `nome|id` no Meta e no TikTok, IDs no Google e no Kwai, e o `sck` compacto que o script da página repassa para o checkout. Nos gateways globais, as UTMs também são lidas de `metadata`, `custom_id`, `client_reference_id` e da atribuição de pedidos do Shopify/WooCommerce.
- **Integração com o Gerenciador:** com “Usar vendas reais no piloto automático”, o agente passa a escalar campanhas com ROI real acima do mínimo e a pausar anúncios no prejuízo, já descontando impostos, taxas e o custo de chargeback.
- Os dados de vendas ficam em `trafego-dados/` (no seu computador, fora do GitHub).

## 🔔 Avisos no celular (Telegram)

1. No Telegram, abra o **@BotFather**, mande `/newbot`, escolha um nome e copie o token.
2. Em **🔔 Avisos no celular**, cole o token, abra o seu bot no Telegram e mande um “oi”.
3. Clique em **Encontrar meu chat** e depois em **Salvar e mandar teste**.

Você escolhe o idioma dos avisos (português ou inglês), a hora do resumo do dia e o que quer receber: vendas aprovadas, reembolsos e chargebacks, o que o piloto fez, sugestões esperando, criativos cansados (com ganchos novos), resumo do dia e problemas no robô do Clonador. Os avisos saem do seu computador enquanto o app estiver aberto.

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
- **Força da oferta** (0–100): tempo no ar (25), volume de anúncios (30), crescimento (20), criativos diferentes (10), tamanho do anunciante (10) e constância no histórico (5). As mais fortes aparecem primeiro.
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
