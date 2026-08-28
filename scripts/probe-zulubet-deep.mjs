/**
 * Глубже: tips на дату + одна страница матча.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "_probe-zulubet-out");
mkdirSync(OUT, { recursive: true });
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(35000),
    redirect: "follow",
  });
  const text = await res.text();
  return { status: res.status, url: res.url, text };
}

const day = await get("https://www.zulubet.com/tips-27-08-2026.html");
writeFileSync(resolve(OUT, "tips-27-08-2026.html"), day.text.slice(0, 300000));
console.log("tips", day.status, day.text.length);

const match = await get("https://www.zulubet.com/match-1315462.html");
writeFileSync(resolve(OUT, "match-1315462.html"), match.text.slice(0, 200000));
console.log("match", match.status, match.text.length, (match.text.match(/<title[^>]*>([^<]+)/i)||[])[1]);

// naive parse home rows from main page structure
const home = await get("https://www.zulubet.com/");
const re = /match-(\d+)\.html[^>]*>([^<]+)<[\s\S]{0,400}?(\d+\.\d{2})[\s\S]{0,80}?(\d+\.\d{2})[\s\S]{0,80}?(\d+\.\d{2})/gi;
let n = 0;
const samples = [];
let m;
while ((m = re.exec(home.text)) && n < 8) {
  samples.push({ id: m[1], teams: m[2].replace(/\s+/g, " ").trim(), o1: m[3], ox: m[4], o2: m[5] });
  n++;
}
console.log(JSON.stringify({ sampleMatches: samples }, null, 2));
