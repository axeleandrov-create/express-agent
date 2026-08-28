import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("scripts/_probe-form-out");
const files = readdirSync(dir);

const page = files.find((x) => x.startsWith("4score-johor") && x.endsWith(".html"));
const html = readFileSync(resolve(dir, page), "utf8");

const classHits = new Map();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  const c = m[1];
  if (/form|stat|wdl|h2h|xg|last|match/i.test(c)) {
    classHits.set(c, (classHits.get(c) || 0) + 1);
  }
}
const topClasses = [...classHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

const nuxt = html.includes("__NUXT__") || html.includes("window.__");
const jsonLd = [...html.matchAll(/application\/ld\+json/g)].length;

// куски вокруг слова «Форма»
const formIdx = html.toLowerCase().indexOf("форма");
const around = formIdx >= 0 ? html.slice(Math.max(0, formIdx - 120), formIdx + 400) : "";

writeFileSync(
  resolve(dir, "4score-structure.json"),
  JSON.stringify({ page, topClasses, nuxt, jsonLd, around: around.replace(/\s+/g, " ").slice(0, 800) }, null, 2),
  "utf8",
);
console.log("4score classes", topClasses.slice(0, 15));
console.log("around form:", around.replace(/\s+/g, " ").slice(0, 500));

// Soccer365
const online = files.find((x) => x.includes("soccer365.ru_online") && x.includes("date"));
if (online) {
  const t = readFileSync(resolve(dir, online), "utf8");
  const games = [...new Set([...t.matchAll(/\/games\/(\d+)/g)].map((m) => m[1]))];
  console.log("s365 online file", online, "gameIds", games.length, games.slice(0, 10));

  if (games[0]) {
    const gid = games[0];
    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
    const r = await fetch(`https://soccer365.ru/games/${gid}/`, {
      headers: { "User-Agent": UA, "Accept-Language": "ru" },
      signal: AbortSignal.timeout(30000),
    });
    const ghtml = await r.text();
    writeFileSync(resolve(dir, `s365-game-${gid}.html`), ghtml.slice(0, 400000), "utf8");
    const low = ghtml.toLowerCase();
    const hits = ["форма", "факт", "тренд", "последн", "забил", "пропустил", "очн", "статисти"].filter(
      (k) => low.includes(k),
    );
    console.log("s365 game", gid, r.status, ghtml.length, hits);
  }
}

// H2H POST с правильным body как в h2h.mjs
const slug = "johor-darul-tazim-kelantan-26-08-2026";
const hr = await fetch(`https://4score.ru/events/${slug}/h2h-stats/`, {
  method: "POST",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    Referer: `https://4score.ru/events/${slug}/`,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
  },
  body: "filters%5Bindicators%5D=goals&filters%5Bperiods%5D=full",
  signal: AbortSignal.timeout(25000),
});
const ht = await hr.text();
console.log("h2h proper body", hr.status, ht.length, "event-block", ht.includes("event-block"));
