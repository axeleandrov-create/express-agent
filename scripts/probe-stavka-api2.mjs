import { fetchText } from "../lib/fetch.mjs";

const tries = [
  "https://stavka.tv/api/matches?sport=soccer",
  "https://stavka.tv/api/matches?filter[sport]=soccer",
  "https://stavka.tv/api/matches?date=2026-08-25",
  "https://stavka.tv/api/matches?date=2026-08-26",
  "https://stavka.tv/api/v1/matches",
  "https://stavka.tv/api/matches/upcoming",
  "https://stavka.tv/matches/soccer/26-08-2026",
  "https://stavka.tv/matches/soccer/27-08-2026",
  "https://stavka.tv/matches/soccer?page=2",
  "https://stavka.tv/matches/soccer?offset=50",
];

for (const u of tries) {
  const r = await fetchText(u, { timeoutMs: 15000 });
  const t = (r.text || "").replace(/\s+/g, " ").slice(0, 120);
  const rows = (r.text || "").split("MatchesRow match-row").length - 1;
  console.log(JSON.stringify({ u: u.replace("https://stavka.tv", ""), status: r.status, rows, t }));
}

// dump NUXT-ish payload snippet
const page = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30000 });
const html = page.text || "";
const i = html.indexOf("__NUXT__");
console.log("nuxt idx", i);
if (i >= 0) console.log(html.slice(i, i + 500));
const j = html.indexOf("window.__");
console.log("window.__", j >= 0 ? html.slice(j, j + 300) : "none");
