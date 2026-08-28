import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30000 });
const t = r.text || "";

const leagueHrefs = [
  ...new Set(
    [...t.matchAll(/href="(\/matches\/soccer\/[^"#?]+)"/g)].map((m) => m[1]),
  ),
].filter((h) => !/\/\d{2}-\d{2}-\d{4}/.test(h));

console.log("league-like hrefs", leagueHrefs.length);
console.log(leagueHrefs.slice(0, 40));

function countRows(html) {
  return (html || "").split("MatchesRow match-row").length - 1;
}

let total = 0;
const samples = [];
for (const h of leagueHrefs.slice(0, 25)) {
  const x = await fetchText("https://stavka.tv" + h, { timeoutMs: 15000 });
  const n = countRows(x.text);
  total += n;
  if (n > 0) samples.push({ h, n, status: x.status });
}
console.log("sum rows first 25 leagues", total, samples.slice(0, 15));

// also try sports list / tournaments
const more = [
  "/matches/soccer/england",
  "/matches/soccer/spain",
  "/matches/soccer/italy",
  "/matches/soccer/germany",
  "/matches/soccer/russia",
  "/matches/soccer/world",
  "/matches?sport=soccer",
];
for (const h of more) {
  const x = await fetchText("https://stavka.tv" + h, { timeoutMs: 15000 });
  console.log(JSON.stringify({ h, status: x.status, rows: countRows(x.text), len: (x.text || "").length }));
}
