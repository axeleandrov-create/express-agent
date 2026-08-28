import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 40000 });
const t = r.text || "";

const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
let best = "";
let m;
while ((m = re.exec(t))) {
  if (m[1].length > best.length) best = m[1];
}
writeFileSync("scripts/_stavka-payload-full.txt", best);
console.log("payload len", best.length);

// Nuxt often uses /_payload.json
const payloadUrls = [
  "https://stavka.tv/matches/soccer/_payload.json",
  "https://stavka.tv/matches/soccer/_payload.json?_payload=full",
  "https://stavka.tv/_payload.json",
];
for (const u of payloadUrls) {
  const x = await fetchText(u, { timeoutMs: 20000 });
  console.log(JSON.stringify({ u: u.replace("https://stavka.tv", ""), status: x.status, len: (x.text || "").length, head: (x.text || "").slice(0, 80) }));
  if (x.ok && x.text && x.text.length > 1000) {
    writeFileSync("scripts/_stavka-payload-url.txt", x.text.slice(0, 200000));
  }
}

// find JS chunks mentioning api/matches
const scripts = [...t.matchAll(/src="(\/_nuxt\/[^"]+\.js)"/g)].map((x) => x[1]);
console.log("nuxt scripts", scripts.length, scripts.slice(0, 5));
for (const s of scripts.slice(0, 8)) {
  const js = await fetchText("https://stavka.tv" + s, { timeoutMs: 20000 });
  const body = js.text || "";
  if (/\/api\/|matchesPage|sport=soccer|page\[size\]/i.test(body)) {
    const hits = [...body.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)].map((x) => x[1]);
    const uniq = [...new Set(hits)].slice(0, 40);
    console.log("script", s, "api hits", uniq);
  }
}
