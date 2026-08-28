import { fetchText } from "../lib/fetch.mjs";

const urls = [
  "https://4score.ru/",
  "https://4score.ru/football",
  "https://4score.ru/predictions",
  "https://www.forebet.com/en/football-tips-and-predictions-for-today",
  "https://www.soccerway.com/",
  "https://www.sofascore.com/football",
  "https://api.openligadb.de/getmatchdata/bl1",
];

for (const url of urls) {
  const r = await fetchText(url, { timeoutMs: 20000 });
  const t = r.text || "";
  const teamish = (t.match(/team|home|away|матч/gi) || []).length;
  const odds = (t.match(/odd|кф|coeff|1\.[\d]{2}/gi) || []).length;
  const over = (t.match(/over|under|тотал|ТБ|ТМ/gi) || []).length;
  console.log(
    JSON.stringify({
      url: url.replace(/https?:\/\//, "").slice(0, 50),
      status: r.status,
      len: t.length,
      teamish,
      odds,
      over,
      cf: /cloudflare|cf-ray/i.test(t),
    }),
  );
}
