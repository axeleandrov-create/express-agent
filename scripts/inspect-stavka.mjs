import { readFileSync } from "node:fs";

const t = readFileSync("scripts/_probe-stavka-home.html", "utf8");
const hrefs = [...t.matchAll(/href="(\/[^"]{5,120})"/gi)].map((x) => x[1]);
const tips = [...new Set(hrefs)].filter((h) =>
  /forecast|tip|expert|prognoz|prediction|analy/i.test(h),
);
console.log("tip hrefs", tips.slice(0, 40));

const samples = [];
for (const m of t.matchAll(/прогноз/gi)) {
  if (samples.length >= 4) break;
  samples.push(t.slice(Math.max(0, m.index - 150), m.index + 350).replace(/\s+/g, " "));
}
console.log(samples.join("\n---\n"));
