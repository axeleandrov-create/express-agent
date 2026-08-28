import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("scripts/_probe-form-out");
mkdirSync(OUT, { recursive: true });
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

async function postH2h(slug) {
  const r = await fetch(`https://4score.ru/events/${slug}/h2h-stats/`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: `https://4score.ru/events/${slug}/`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: "filters%5Bindicators%5D=goals&filters%5Bperiods%5D=full",
    signal: AbortSignal.timeout(25000),
  });
  const t = await r.text();
  return {
    slug,
    status: r.status,
    len: t.length,
    eventBlock: t.includes("event-block"),
    sample: t.slice(0, 300).replace(/\s+/g, " "),
  };
}

const known = [
  "olympique-lyonnais-fenerbahce-26-08-2026",
  "real-madrid-real-sociedad-26-08-2026",
  "tottenham-hotspur-charlton-athletic-26-08-2026",
];

const h2hResults = [];
for (const slug of known) {
  try {
    const row = await postH2h(slug);
    h2hResults.push(row);
    console.log("h2h", slug, row.status, row.len, row.eventBlock);
  } catch (e) {
    h2hResults.push({ slug, error: e.message });
    console.log("h2h fail", slug, e.message);
  }
}

// Soccer365 game structure
const gid = "2479321";
const gr = await fetch(`https://soccer365.ru/games/${gid}/`, {
  headers: { "User-Agent": UA, "Accept-Language": "ru" },
  signal: AbortSignal.timeout(30000),
});
const ghtml = await gr.text();
writeFileSync(resolve(OUT, `s365-game-${gid}-full.html`), ghtml, "utf8");

const classHits = new Map();
for (const m of ghtml.matchAll(/class="([^"]+)"/g)) {
  const c = m[1];
  if (/form|stat|result|table|preview|fact|h2h|history/i.test(c)) {
    classHits.set(c, (classHits.get(c) || 0) + 1);
  }
}
const top = [...classHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

const formIdx = ghtml.toLowerCase().indexOf("форма");
const around =
  formIdx >= 0 ? ghtml.slice(Math.max(0, formIdx - 80), formIdx + 500).replace(/\s+/g, " ") : "";

// team names on page
const title = ghtml.match(/<title>([^<]+)/)?.[1];

writeFileSync(
  resolve(OUT, "round2-report.json"),
  JSON.stringify({ h2hResults, s365: { gid, title, topClasses: top, aroundForm: around.slice(0, 700) } }, null, 2),
  "utf8",
);
console.log("title", title);
console.log("s365 classes", top.slice(0, 12));
console.log("around", around.slice(0, 400));
