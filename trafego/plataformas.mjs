// Plataformas de anúncio que o Gerenciador entende.
export const PLATAFORMAS = ["meta", "google", "tiktok", "kwai"];
export const NOME_PLAT = { meta: "Meta", google: "Google", tiktok: "TikTok", kwai: "Kwai" };

// Moeda principal do painel (todas as vendas e gastos são convertidos para ela).
export const MOEDAS = { BRL: { simbolo: "R$", locale: "pt-BR" }, USD: { simbolo: "US$", locale: "en-US" }, EUR: { simbolo: "€", locale: "de-DE" } };
export function formatarMoeda(n, moeda = "BRL") {
  const m = MOEDAS[moeda] || MOEDAS.BRL;
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return m.simbolo + " " + v.toLocaleString(m.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
