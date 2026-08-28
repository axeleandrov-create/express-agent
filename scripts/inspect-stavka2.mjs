import { readFileSync } from "node:fs";

const t = readFileSync("scripts/_probe-stavka-home.html", "utf8");

const nuxt = t.match(/__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
console.log("nuxt found", Boolean(nuxt), "len", nuxt?.[1]?.length);

const payload = t.match(/window\.__NUXT__|payload|application\/json/i);
console.log("payload hint", payload?.[0]);

const apis = [...t.matchAll(/https?:\/\/[^"'\s]+api[^"'\s]*/gi)].map((m) => m[0]);
console.log("api urls", [...new Set(apis)].slice(0, 30));

const paths = [...t.matchAll(/"(\/[a-z0-9_\-\/]{4,80})"/gi)]
  .map((m) => m[1])
  .filter((p) => /forecast|tip|expert|predict|prognoz|match|article/i.test(p));
console.log("paths", [...new Set(paths)].slice(0, 40));

// Nuxt 3 often embeds in script type="application/json"
const jsonBlocks = [...t.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
console.log("json script blocks", jsonBlocks.length);
for (const b of jsonBlocks.slice(0, 3)) {
  console.log("block len", b[1].length, b[1].slice(0, 200));
}
