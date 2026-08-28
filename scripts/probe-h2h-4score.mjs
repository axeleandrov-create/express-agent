const res = await fetch("https://4score.ru/events/", {
  headers: { "User-Agent": "Mozilla/5.0" },
  signal: AbortSignal.timeout(25000),
});
const html = await res.text();
const hrefs = [...html.matchAll(/href="(\/events\/[^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(hrefs)].slice(0, 8);
console.log("status", res.status, "hrefs", uniq.length, uniq.slice(0, 3));

if (!uniq[0]) process.exit(0);
const url = "https://4score.ru" + uniq[0];
const page = await (
  await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://4score.ru/" },
    signal: AbortSignal.timeout(25000),
  })
).text();
console.log("event", url, "len", page.length);

const keys = [
  "личн",
  "h2h",
  "встреч",
  "история",
  "прошл",
  "очн",
  "head",
  "vs__history",
  "stat",
  "scoreboard",
];
for (const k of keys) {
  const re = new RegExp(k, "i");
  if (re.test(page)) console.log("hit:", k);
}

// dump interesting class names
const classes = [...page.matchAll(/class="([^"]*(?:hist|h2h|vs|meet|last|form|stat)[^"]*)"/gi)]
  .map((m) => m[1])
  .slice(0, 40);
console.log("classes", [...new Set(classes)].slice(0, 25));

// score-like patterns near history
const scores = [...page.matchAll(/(\d{1,2})\s*[:\-]\s*(\d{1,2})/g)].slice(0, 15);
console.log("scores sample", scores.map((m) => m[0]));
