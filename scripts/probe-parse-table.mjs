import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("scripts/_probe-form-out/lindo-page.html", "utf8");

// extract team stats table rows from main page
const tableStart = html.indexOf("Показатели команд");
const chunk = html.slice(tableStart, tableStart + 8000);
writeFileSync("scripts/_probe-form-out/lindo-table-chunk.html", chunk, "utf8");

const rows = [
  ...chunk.matchAll(
    /table__name">([^<]+)<\/div>\s*<b>([^<]*)<\/b>\s*<b>([^<]*)<\/b>/g,
  ),
];
console.log("rows from page:");
for (const m of rows) console.log("-", m[1].trim(), "|", m[2].trim(), "|", m[3].trim());

// find ajax urls
const ajax = [...html.matchAll(/url\s*:\s*["']([^"']+)["']/gi)].map((m) => m[1]);
const ajax2 = [...html.matchAll(/["'](\/events\/[^"']*ajax[^"']*)["']/gi)].map(
  (m) => m[1],
);
const ajax3 = [...html.matchAll(/filters\.php|applyFilter|loadStats|\/filters\//gi)];
console.log("ajax urls", [...new Set([...ajax, ...ajax2])].slice(0, 30));
console.log("filter mentions", ajax3.length);

// Try POST filters with goals indicator
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";
const body = new URLSearchParams({
  "filters[event_id]": "19709621",
  "filters[common][indicators]": "goals",
  "filters[common][periods]": "full",
  "filters[localteam_type_side]": "all",
  "filters[visitorteam_type_side]": "all",
  "filters[localteam_length]": "10",
  "filters[visitorteam_length]": "10",
}).toString();

const r = await fetch("https://4score.ru/events/19709621/filters/", {
  method: "POST",
  headers: {
    "User-Agent": UA,
    Referer: "https://4score.ru/events/lindo-ff-malmyo-27-08-2026/",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/javascript, */*",
  },
  body,
  signal: AbortSignal.timeout(30000),
});
const raw = await r.text();
writeFileSync("scripts/_probe-form-out/filters-post.json", raw.slice(0, 200000), "utf8");
let j;
try {
  j = JSON.parse(raw);
} catch {
  console.log("not json", raw.slice(0, 200));
  process.exit(0);
}
console.log("keys", Object.keys(j?.data || {}), Object.keys(j?.data?.html || {}));
for (const [k, v] of Object.entries(j?.data?.html || {})) {
  console.log("html", k, String(v).length);
  writeFileSync(`scripts/_probe-form-out/post-${k}.html`, String(v), "utf8");
}
