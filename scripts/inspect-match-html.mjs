import { readFileSync } from "node:fs";

const t = readFileSync("scripts/_stavka-match.html", "utf8");
for (const pat of [
  /тотал[^<{]{0,40}/gi,
  /"total"[^}]{0,80}/gi,
  /overUnder|over_under|btts|handicap/gi,
  /__NUXT__|payload|markets/gi,
]) {
  const m = [...t.matchAll(pat)].slice(0, 8).map((x) => x[0].slice(0, 100));
  if (m.length) console.log(String(pat), m);
}

// look for JSON-like odds beyond 1x2
const nums = [...t.matchAll(/"(?:name|title|label)":"([^"]{3,40})"/g)].map((m) => m[1]);
const interesting = [...new Set(nums)].filter((x) =>
  /тотал|фора|обе|total|handicap|btts|over|under/i.test(x),
);
console.log("json labels", interesting.slice(0, 30));
console.log("file len", t.length);
