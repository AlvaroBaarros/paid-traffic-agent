# Mudanças

## [0.2.0-beta] - 2026-11-24

Atualização para usar o app em qualquer lugar: Brasil, EUA e Europa. 🌎🐉

### Novidades
- **🇧🇷 Português / 🇺🇸 English:** botão com as bandeiras no topo troca o app inteiro de idioma na hora (menu, páginas, botões, avisos e mensagens de erro). Números e datas seguem o idioma escolhido.
- **TikTok Ads:** conexão pela TikTok API for Business v1.3. Métricas por anúncio, piloto automático (pausar, ativar, orçamento de campanha ou de grupo) e UTMs prontas com as macros do TikTok.
- **Kwai Ads:** conexão pela Kwai for Business API com renovação automática do acesso. Métricas por anúncio, orçamento de grupos de anúncios pelo piloto e UTMs prontas. O Kwai só deixa a API pausar anúncios criados pela API; nos outros, o agente avisa.
- **🔔 Avisos no celular pelo Telegram:** vendas aprovadas, reembolsos e chargebacks, o que o piloto automático fez, sugestões esperando, criativos cansados (com ganchos novos), resumo do dia e problemas no robô do Clonador. Em português ou inglês.
- **🔄 Ciclo de criativos:** detecta criativo cansado (frequência alta ou queda de CTR) e traz ganchos de ofertas escaladas do mesmo assunto, tirados do Clonador, para modelar criativos novos.
- **↩️ Reembolsos e chargebacks por anúncio:** taxa de reembolso no Dashboard, coluna “Reemb.” nas campanhas e no ranking, custo por chargeback no lucro e regra no piloto que avisa e não escala anúncio com reembolso alto.
- **Clonador mais certeiro:** nota de **força da oferta** (0 a 100) com tendência ▲▼ e a lista “Por que é forte”; aviso quando a Meta muda o site e o robô passa a ler menos anúncios.
- **35+ checkouts e gateways do Brasil, EUA e Europa,** separados por região em Integrações. Leitores próprios para Stripe, PayPal, Shopify, WooCommerce, Mercado Pago, ClickBank (avisos criptografados), Digistore24, Paddle, Lemon Squeezy e Gumroad, além dos brasileiros.
- **Real, Euro ou Dólar:** seletor de moeda no topo (R$ · € · US$) troca a moeda de todo o painel com um clique. Vendas e gastos em outras moedas são convertidos pelas cotações (a libra £ também está disponível em Integrações), e você informa em que moeda as contas de anúncio cobram.
- **Menu lateral mais simples:** cada parte abre e fecha as próprias páginas, e o botão « recolhe o menu deixando só os ícones.
- **Copy em português, inglês ou espanhol,** e roteiros verticais para TikTok e Kwai.
- Mais países no Clonador (25+) e fusos horários da Europa e dos EUA nos relatórios.

### Atenção ao atualizar
- **Cole de novo o código do Worker** no Cloudflare (UTMFy → Integrações → “Copiar código do Worker”). O código novo é necessário para os gateways novos.
- TikTok e Kwai exigem acesso à API aprovado pela própria plataforma: o passo a passo está em Gerenciador de anúncios → Contas de anúncio.

## [0.1.0-beta] - 2026-11-23

Primeira versão pública (beta). 🐉

### Novidades
- **Site único** com menu lateral: Início, Clonador, Gerenciador de anúncios e UTMFy.
- **Início:** números do dia, gráfico de ROI diário e de faturamento × gasto × lucro (30 dias), resumo das ferramentas e checklist de configuração.
- **Clonador:** mineração da Biblioteca de Anúncios por tema/palavra-chave e país; ofertas escaladas, anúncios ativos (oferta e anunciante), funil, checkout, selo “estruturada”, vídeos para baixar, copy e geração de criativos modelados.
- **Gerenciador de anúncios:** Meta (completo: análise, piloto automático, criação de campanhas pausadas) e Google Ads (análise e piloto automático); modos Desligado, Sugerir e Automático com teto de orçamento.
- **UTMFy:** vendas reais via webhook (Hotmart, Kiwify e Cakto com leitor próprio; outras pelo leitor genérico), receptor 24h grátis na Cloudflare, atribuição por UTM, lucro, ROI, ROAS, CPA real, páginas de Dashboard, Campanhas, Vendas, Criativos, Produtos e Integrações.
- **Piloto automático por ROI real:** escala o que dá lucro e pausa o que dá prejuízo usando as vendas da UTMFy.
- Instaladores para **Windows, macOS e Linux**, aviso de nova versão no menu lateral.

### Conhecido
- Ainda em teste com contas reais: deixe o piloto no modo **Sugerir** nos primeiros dias.
- O Clonador lê a Biblioteca de Anúncios pública; a Meta pode bloquear acessos automatizados temporariamente.
