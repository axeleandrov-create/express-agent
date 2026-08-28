import { readFileSync } from "node:fs";

const h2h = readFileSync("scripts/_probe-form-out/post-h2h.html", "utf8");
console.log("h2h sample", h2h.slice(0, 500).replace(/\s+/g, " "));
const scores = [...h2h.matchAll(/(\d+)\s*:\s*(\d+)/g)].slice(0, 30).map((m) => m[0]);
console.log("scores", scores);
const textRows = [...h2h.matchAll(/>([^<]{2,80})</g)]
  .map((m) => m[1].trim())
  .filter((t) => t && !/^[\d\s.:]+$/.test(t))
  .slice(0, 40);
console.log("texts", textRows);

const trends = readFileSync("scripts/_probe-form-out/post-trends.html", "utf8");
console.log("\ntrends len", trends.length);
const trows = [
  ...trends.matchAll(
    /table__name">([^<]+)<\/div>[\s\S]*?<b>([^<]*)<\/b>[\s\S]*?<b>([^<]*)<\/b>/g,
  ),
];
console.log("trend rows", trows.length);
for (const m of trows.slice(0, 25)) {
  console.log("-", m[1].trim(), "|", m[2].trim(), "|", m[3].trim());
}

// percent patterns
const pct = [...trends.matchAll(/(\d+)\s*%|\b(\d+)\s*из\s*(\d+)/gi)].slice(0, 20);
console.log("pct", pct.map((m) => m[0]));
