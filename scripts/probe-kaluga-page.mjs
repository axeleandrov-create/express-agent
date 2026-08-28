const url =
  "https://4score.ru/events/avangard-kursk-kaluga-25-08-2026/";
const page = await (
  await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://4score.ru/",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(30000),
  })
).text();
console.log("len", page.length, "status ok");

import { writeFileSync } from "node:fs";
writeFileSync("scripts/_probe-kaluga-h2h.html", page.slice(0, 400000), "utf8");

const keys = ["личн", "h2h", "встреч", "очн", "прошл", "head-to", "hh__", "vs__", "history"];
for (const k of keys) {
  const i = page.toLowerCase().indexOf(k.toLowerCase());
  if (i >= 0) console.log("hit", k, "at", i, page.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, " "));
}

const classes = [
  ...page.matchAll(/class="([^"]*(?:hh|h2h|hist|meet|last|form|confront|личн)[^"]*)"/gi),
].map((m) => m[1]);
console.log("classes", [...new Set(classes)].slice(0, 40));

// Look for JSON embeds
const jsonBits = [...page.matchAll(/h2h[^<{]{0,40}|confrontation|last_meetings|personal/gi)].slice(0, 20);
console.log("jsonish", jsonBits.map((m) => m[0]));

// API candidates in page
const apis = [...page.matchAll(/https?:\/\/[^"'\s]+(?:h2h|history|stat|meeting)[^"'\s]*/gi)].slice(0, 20);
console.log("apis", apis.map((m) => m[0]));
const paths = [...page.matchAll(/["'](\/[^"']*(?:h2h|history|stat|meeting|confront)[^"']*)["']/gi)].slice(
  0,
  30,
);
console.log("paths", paths.map((m) => m[1]));
