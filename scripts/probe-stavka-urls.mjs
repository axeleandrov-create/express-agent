import { fetchText } from "../lib/fetch.mjs";

const urls = [
  "https://stavka.tv/matches/soccer",
  "https://stavka.tv/forecasts",
  "https://stavka.tv/tips",
  "https://stavka.tv/experts",
  "https://stavka.tv/predictions",
  "https://stavka.tv/news",
  "https://stavka.tv/articles",
  "https://stavka.tv/prognozy-na-futbol",
];

for (const url of urls) {
  const res = await fetchText(url, { timeoutMs: 20_000 });
  const t = res.text || "";
  const teamNames = (t.match(/team-name/g) || []).length;
  const odds = (t.match(/class="odd"/g) || []).length;
  const vs = (t.match(/\s[–—-]\s/g) || []).length;
  console.log(
    JSON.stringify({
      url,
      status: res.status,
      ok: res.ok,
      len: t.length,
      teamNames,
      odds,
      title: t.match(/<title>([^<]+)/)?.[1],
    }),
  );
}
