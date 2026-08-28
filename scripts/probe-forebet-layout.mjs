/**
 * Разведка разметки Forebet (образец UX для ленты).
 * Запуск: node scripts/probe-forebet-layout.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "scripts/_probe-forebet-out");
mkdirSync(OUT, { recursive: true });

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  const text = await r.text();
  return { status: r.status, text, url: r.url };
}

function snippet(text, needle, pad = 100) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return null;
  return text.slice(Math.max(0, i - pad), i + pad).replace(/\s+/g, " ");
}

function classHits(text, re) {
  const set = new Set();
  for (const m of text.matchAll(re)) set.add(m[1]);
  return [...set].slice(0, 40);
}

const listUrl = "https://www.forebet.com/en/football/predictions";
const list = await get(listUrl);
writeFileSync(resolve(OUT, "list.html"), list.text, "utf8");
console.log("LIST", list.status, list.text.length, list.url);

// найти первую ссылку на матч
const matchLinks = [
  ...list.text.matchAll(/href="(\/en\/football\/matches\/[^"]+)"/g),
].map((m) => m[1]);
console.log("match links sample:", matchLinks.slice(0, 5));

const matchPath =
  matchLinks[0] || "/en/football/matches/real-madrid-real-sociedad-2495184";
const match = await get("https://www.forebet.com" + matchPath);
writeFileSync(resolve(OUT, "match.html"), match.text, "utf8");
console.log("MATCH", match.status, match.text.length, match.url);

for (const [label, html] of [
  ["list", list.text],
  ["match", match.text],
]) {
  console.log("\n===", label, "===");
  for (const k of [
    "prc_",
    "fprc",
    "rcnt",
    "form_bg",
    "h2h",
    "Prediction",
    "Under/Over",
    "Both scored",
    "Recent matches",
    "Overall statistics",
  ]) {
    const s = snippet(html, k, 80);
    if (s) console.log(k, "→", s);
  }
  const classes = classHits(
    html,
    /class="([^"]*(?:prc_|fprc|rcnt|form_|h2h|prob|st_row|tnms)[^"]*)"/gi
  );
  console.log("classes:", classes.join(" | ") || "(none)");
  const pct = [...html.matchAll(/>\s*(\d{1,2})\s*%\s*</g)]
    .slice(0, 12)
    .map((m) => m[1] + "%");
  console.log("inline %:", pct.join(" "));
}

// таблица прогнозов на листе — типичные ячейки
const trSample = snippet(list.text, "tnms", 200);
console.log("\nlist tnms:", trSample);
