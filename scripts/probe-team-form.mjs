import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

const urls = [
  "https://4score.ru/team/392/",
  "https://4score.ru/teams/392/",
  "https://api.4score.ru/team/392",
  "https://4score.ru/wa-apps/sf2/team/392/",
  "https://4score.ru/events/tsska-ofi-27-08-2026/h2h-stats/",
];

for (const url of urls) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ru", Referer: "https://4score.ru/" },
      signal: AbortSignal.timeout(20000),
    });
    const t = await r.text();
    console.log(r.status, t.length, url.slice(0, 60), /event-block|1:0|0:1|счет/i.test(t) ? "YES" : "");
    if (r.ok && t.length > 2000 && t.length < 500000) {
      writeFileSync(
        `scripts/_probe-form-out/team-${url.replace(/[^\w]+/g, "_").slice(0, 40)}.html`,
        t.slice(0, 100000),
        "utf8",
      );
    }
  } catch (e) {
    console.log("ERR", url, e.message);
  }
}

// POST h2h with goals to see structure we already know
const h2h = await fetch("https://4score.ru/events/tsska-ofi-27-08-2026/h2h-stats/", {
  method: "POST",
  headers: {
    "User-Agent": UA,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://4score.ru/events/tsska-ofi-27-08-2026/",
  },
  body: "filters%5Bindicators%5D=goals&filters%5Blength%5D=10",
  signal: AbortSignal.timeout(20000),
});
const ht = await h2h.text();
console.log("h2h", h2h.status, ht.length, (ht.match(/event-block/g) || []).length);
writeFileSync("scripts/_probe-form-out/cska-h2h.html", ht, "utf8");
