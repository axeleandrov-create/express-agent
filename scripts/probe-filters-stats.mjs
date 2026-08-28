import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";
const eventId = "19709621";
const r = await fetch(`https://4score.ru/events/${eventId}/filters/`, {
  headers: {
    "User-Agent": UA,
    Referer: "https://4score.ru/events/lindo-ff-malmyo-27-08-2026/",
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/javascript, */*",
  },
  signal: AbortSignal.timeout(30000),
});
const raw = await r.text();
writeFileSync("scripts/_probe-form-out/filters-raw.json", raw, "utf8");
const j = JSON.parse(raw);
const statsHtml = j?.data?.html?.stats || "";
writeFileSync("scripts/_probe-form-out/filters-stats.html", statsHtml, "utf8");
console.log("stats len", statsHtml.length);

// extract score-like rows
const rows = [
  ...statsHtml.matchAll(
    /<tr[\s\S]*?<\/tr>/gi,
  ),
];
console.log("tr count", rows.length);
const sampleRows = rows.slice(0, 15).map((m) =>
  m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
);
console.log(sampleRows.join("\n"));

// look for percentages / N/M
const nm = [...statsHtml.matchAll(/(\d+)\s*\/\s*(\d+)/g)].slice(0, 30).map((m) => m[0]);
console.log("n/m", nm);

const headers = [...statsHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
  .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
  .filter(Boolean)
  .slice(0, 40);
console.log("ths", headers);
