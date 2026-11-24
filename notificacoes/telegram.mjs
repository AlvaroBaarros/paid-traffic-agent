// Avisos no celular pelo Telegram (grátis): vendas, ações do piloto, criativo cansado, resumo do dia e problemas do robô.
import { formatarMoeda, NOME_PLAT } from "../trafego/plataformas.mjs";

let FETCH = fetch;
export function configurar({ fetchFn } = {}) { if (fetchFn) FETCH = fetchFn; }

export const TIPOS_AVISO = ["vendas", "reembolsos", "piloto", "sugestoes", "criativos", "resumo", "clonador"];

const escH = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function api(token, metodo, corpo) {
  const r = await FETCH(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: corpo ? "POST" : "GET",
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram: ${j.description || "HTTP " + r.status}`);
  return j.result;
}

// Descobre o chat: a pessoa manda qualquer mensagem para o bot e a gente lê o último chat que falou com ele.
export async function descobrirChat(token) {
  if (!token) throw new Error("Cole o token do bot primeiro.");
  const eu = await api(token, "getMe");
  const ups = await api(token, "getUpdates");
  const ult = [...(ups || [])].reverse().find((u) => (u.message || u.channel_post || u.my_chat_member)?.chat);
  const chat = ult && (ult.message || ult.channel_post || ult.my_chat_member).chat;
  return { bot: eu.username, chatId: chat ? String(chat.id) : null, nome: chat ? chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username : null };
}

export async function enviarTexto(tg, texto) {
  if (!tg?.token || !tg?.chatId) throw new Error("Telegram não configurado.");
  return api(tg.token, "sendMessage", { chat_id: tg.chatId, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
}

// c = configuração completa (trafego.local.json). Nunca derruba quem chamou.
export async function avisar(c, tipo, texto) {
  const tg = c?.telegram || {};
  if (!tg.ativo || !tg.token || !tg.chatId || !texto) return false;
  if (tg.tipos && tg.tipos[tipo] === false) return false;
  try { await enviarTexto(tg, texto); return true; }
  catch (e) { console.log("🔔 " + e.message); return false; }
}

// ---------- mensagens (pt / en) ----------
const L = (c) => (c?.telegram?.idioma === "en" ? "en" : "pt");
const moeda = (c) => c?.analytics?.moeda || "BRL";

export function msgVendas(c, vendas) {
  const en = L(c) === "en", $ = (n) => formatarMoeda(n, moeda(c));
  const linhas = vendas.slice(0, 8).map((v) => {
    if (v.status === "aprovada") return `💰 <b>${en ? "New sale" : "Venda aprovada"}</b> · ${$(v.liquido ?? v.valor)}\n${escH(v.produto)}${v.anuncio ? `\n🎯 ${escH(v.anuncio)}${v.plataforma ? ` (${NOME_PLAT[v.plataforma] || v.plataforma})` : ""}` : `\n${en ? "no UTM" : "sem UTM"}`}`;
    if (v.status === "reembolsada") return `↩️ <b>${en ? "Refund" : "Reembolso"}</b> · ${$(v.liquido ?? v.valor)}\n${escH(v.produto)}${v.anuncio ? ` · ${escH(v.anuncio)}` : ""}`;
    if (v.status === "chargeback") return `⚠️ <b>Chargeback</b> · ${$(v.liquido ?? v.valor)}\n${escH(v.produto)}${v.anuncio ? ` · ${escH(v.anuncio)}` : ""}`;
    return "";
  }).filter(Boolean);
  if (vendas.length > 8) linhas.push(en ? `…and ${vendas.length - 8} more` : `…e mais ${vendas.length - 8}`);
  return linhas.join("\n\n");
}

export function msgPiloto(c, executadas = [], novasPendentes = []) {
  const en = L(c) === "en", $ = (n) => formatarMoeda(n, moeda(c));
  const verbo = (a) => ({
    pausar: en ? "⏸ Paused" : "⏸ Pausei",
    ativar: en ? "▶ Enabled" : "▶ Ativei",
    escalar: (en ? "📈 Scaled " : "📈 Escalei ") + `${$(a.de)} → ${$(a.para)}`,
    reduzir: (en ? "📉 Cut budget " : "📉 Reduzi ") + `${$(a.de)} → ${$(a.para)}`,
  }[a.tipo] || a.tipo);
  const partes = [];
  if (executadas.length) partes.push(`🤖 <b>${en ? "Autopilot did" : "O piloto automático fez"}:</b>\n` + executadas.slice(0, 8).map((a) => `${verbo(a)} · ${escH(a.nome)}${a.ok === false ? ` ❌ ${escH(a.erro || "")}` : ""}\n<i>${escH(en ? a.motivoEn || a.motivo : a.motivo)}</i>`).join("\n"));
  if (novasPendentes.length) partes.push(`💡 <b>${novasPendentes.length} ${en ? "suggestion(s) waiting for your approval" : "sugestão(ões) esperando sua aprovação"}:</b>\n` + novasPendentes.slice(0, 5).map((a) => `• ${verbo(a).replace(/^(\S+) \S+/, "$1")} · ${escH(a.nome)}`).join("\n") + `\n${en ? "Open the app → Ads Manager → Overview." : "Abra o app → Gerenciador de anúncios → Visão geral."}`);
  return partes.join("\n\n");
}

export function msgAlertas(c, alertas = []) {
  const en = L(c) === "en";
  if (!alertas.length) return "";
  return `⚠️ <b>${en ? "Alerts" : "Alertas"}</b>\n` + alertas.slice(0, 6).map((a) => `• ${escH(a.nome)}: ${escH(en ? a.motivoEn || a.motivo : a.motivo)}`).join("\n");
}

export function msgCriativos(c, itens = []) {
  const en = L(c) === "en";
  if (!itens.length) return "";
  return `🔄 <b>${en ? "Creative refresh" : "Ciclo de criativos"}</b>\n` + itens.slice(0, 5).map((i) => `• ${escH(i.nome)}: ${escH(en ? i.motivoEn : i.motivo)}${i.ganchos?.length ? `\n  ${en ? "Hook idea" : "Ideia de gancho"}: “${escH(i.ganchos[0].texto)}”` : ""}`).join("\n") + `\n${en ? "New hooks are ready in Ads Manager → Creative refresh." : "Os ganchos novos estão em Gerenciador de anúncios → Ciclo de criativos."}`;
}

export function msgResumo(c, rel, pendentes = 0) {
  const en = L(c) === "en", $ = (n) => formatarMoeda(n, moeda(c));
  const t = rel?.total || {};
  const pct = (n) => (n === null || n === undefined ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
  const top = (rel?.criativos?.melhores || []).find((a) => a.vendas > 0 && a.lucro > 0);
  return [
    `📊 <b>${en ? "Today's summary" : "Resumo do dia"}</b>`,
    `${en ? "Revenue" : "Faturamento"}: <b>${$(t.liquido)}</b> (${t.vendas || 0} ${en ? "sales" : "vendas"})`,
    `${en ? "Ad spend" : "Gasto"}: ${$(t.gasto)}`,
    `${en ? "Profit" : "Lucro"}: <b>${$(t.lucro)}</b> · ROI ${pct(t.roi)}`,
    t.reembolsos || t.chargebacks ? `${en ? "Refunds" : "Reembolsos"}: ${t.reembolsos || 0} · Chargebacks: ${t.chargebacks || 0}` : "",
    top ? `🏆 ${en ? "Best creative" : "Melhor criativo"}: ${escH(top.nome)} (ROI ${pct(top.roi)})` : "",
    pendentes ? `💡 ${pendentes} ${en ? "suggestion(s) waiting for you" : "sugestão(ões) esperando você"}` : "",
  ].filter(Boolean).join("\n");
}

export function msgClonador(c, saude) {
  const en = L(c) === "en";
  if (!saude || saude.status === "ok") return "";
  const det = (saude.problemas || []).slice(0, 4).map((p) => `• ${escH(p.busca)} (${escH(p.pais)}): ${p.antes} → ${p.agora} ${en ? "ads" : "anúncios"}`).join("\n");
  if (saude.status === "falhou") return `🛑 <b>${en ? "Ad Spy could not read the Ad Library" : "O Clonador não conseguiu ler a Biblioteca de Anúncios"}</b>\n${en ? "No search returned ads. Meta may have changed the site or blocked access for a while." : "Nenhuma busca trouxe anúncios. A Meta pode ter mudado o site ou bloqueado o acesso por um tempo."}${det ? "\n" + det : ""}`;
  return `⚠️ <b>${en ? "Ad Spy: something looks off" : "Clonador: algo parece errado"}</b>\n${saude.reserva ? (en ? "Read in backup mode (Meta probably changed the site).\n" : "Leu pelo modo reserva (a Meta provavelmente mudou o site).\n") : ""}${det}`;
}
