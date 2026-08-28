import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30000 });
const t = r.text || "";
writeFileSync("scripts/_stavka-soccer-now.html", t.slice(0, 400000));

const urls = [...t.matchAll(/https?:\/\/[^"'\\\s]+/g)]
  .map((m) => m[0])
  .filter((u) => /api|graphql|json|matches|event|cdn/i.test(u));
console.log("unique urls", [...new Set(urls)].slice(0, 50));

const paths = [...t.matchAll(/["'](\/[a-z0-9_\/\-\.?=&]+)["']/gi)]
  .map((m) => m[1])
  .filter((p) => /api|match|event|odds|fixture/i.test(p));
console.log("paths", [...new Set(paths)].slice(0, 60));

console.log("has NUXT", /__NUXT__|payload/.test(t));
console.log("rows", t.split("MatchesRow match-row").length - 1);

// try common API guesses
const guesses = [
  "https://stavka.tv/api/matches",
  "https://stavka.tv/api/matches/soccer",
  "https://api.stavka.tv/matches/soccer",
  "https://stavka.tv/matches/soccer.json",
  "https://stavka.tv/_payload.json",
];
for (const g of guesses) {
  const x = await fetchText(g, { timeoutMs: 12000 });
  console.log("guess", g, x.status, (x.text || "").slice(0, 80).replace(/\s+/g, " "));
}
