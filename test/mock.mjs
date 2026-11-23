// Imitação da Biblioteca de Anúncios para testar o robô inteiro sem acessar o Facebook.
const ts = (d) => Math.floor(Date.parse(d) / 1000);
const ad = (id, page, nome, link, coll, inicio, texto = "Seque a barriga em 21 dias") => ({
  ad_archive_id: id, page_id: page, page_name: nome, is_active: true, start_date: ts(inicio), collation_count: coll, collation_id: "c" + id,
  snapshot: { body: { text: texto }, title: "Protocolo Seca Barriga", link_url: link, cta_text: "Saiba mais",
    videos: [{ video_hd_url: `https://video.example/${id}.mp4`, video_preview_image_url: `https://img.example/${id}.jpg` }] },
});
export async function instalarMock(contexto) {
  await contexto.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/ads/library/") && url.includes("view_all_page_id=111")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<body><h3>~63 results</h3></body>" });
    if (url.includes("/ads/library/") && url.includes("view_all_page_id=")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<body><h3>~3 results</h3></body>" });
    if (url.includes("/ads/library/")) {
      const inicial = { require: [[{ __bbox: { result: { data: { edges: [{ node: { collated_results: [
        ad("1001", "111", "Dra. Ana Saúde", "https://l.facebook.com/l.php?u=https%3A%2F%2Fsecabarriga.com.br%2Fvsl", 12, "2026-10-01"),
        ad("1002", "111", "Dra. Ana Saúde", "https://secabarriga.com.br/vsl", 9, "2026-11-10"),
      ] } }] } } } }]] };
      const html = `<html><body><h3>~39,000 results</h3><div style="height:6000px">cartões</div>
        <script type="application/json">${JSON.stringify(inicial)}</script>
        <script>let foi=false;addEventListener('scroll',()=>{if(foi)return;foi=true;fetch('/api/graphql/',{method:'POST'});});</script></body></html>`;
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (url.includes("/api/graphql")) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: "for (;;);" + JSON.stringify({ data: { x: [ad("1003", "111", "Dra. Ana Saúde", "https://secabarriga.com.br/vsl", 4, "2026-11-18"), ad("2001", "222", "Renda Já", "https://rendaja.com/quiz", 3, "2026-11-20", "Ganhe dinheiro como afiliado")] } }) });
    }
    if (url.startsWith("https://secabarriga.com.br")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<title>Seca Barriga</title><script src="https://scripts.converteai.net/p.js"></script><script>window.fbq=function(){};fbq("init","1")</script><a href="https://pay.kiwify.com.br/abc">Comprar</a>' });
    if (url.startsWith("https://rendaja.com")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<title>Quiz</title><p>Pergunta 1 de 7</p>" });
    return route.fulfill({ status: 404, body: "" });
  });
}
