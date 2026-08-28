import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30000 });
const t = r.text || "";
writeFileSync("scripts/_stavka-soccer-scan.html", t.slice(0, 500000));

const urls = new Set();
for (const m of t.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
  const u = m[0];
  if (/api|graphql|wss|json|match|event|line|odds/i.test(u)) urls.add(u.slice(0, 200));
}
for (const m of t.matchAll(/["'](\/api\/[^"']+)["']/g)) urls.add(m[1]);
for (const m of t.matchAll(/["'](\/_next\/data\/[^"']+)["']/g)) urls.add(m[1]);
for (const m of t.matchAll(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/g)) {
  writeFileSync("scripts/_stavka-next-data.json", m[1].slice(0, 400000));
  console.log("NEXT_DATA len", m[1].length);
}

console.log("hint urls", [...urls].slice(0, 40));
console.log("has __NUXT__", t.includes("__NUXT__"));
console.log("has __NEXT_DATA__", t.includes("__NEXT_DATA__"));
console.log("rows", t.split("MatchesRow match-row").length - 1);

// try common endpoints
const tries = [
  "https://stavka.tv/api/matches?sport=soccer",
  "https://stavka.tv/api/matches?filter[sport]=soccer&page[size]=200",
  "https://stavka.tv/api/v1/matches?sport=soccer",
  "https://stavka.tv/api/events?sport=1",
  "https://stavka.tv/matches/soccer.json",
  "https://api.stavka.tv/matches?sport=soccer",
];
for (const u of tries) {
  const x = await fetchText(u, { timeoutMs: 15000 });
  const body = (x.text || "").slice(0, 120).replace(/\s+/g, " ");
  console.log(JSON.stringify({ u: u.replace("https://", ""), status: x.status, len: (x.text || "").length, body }));
}
