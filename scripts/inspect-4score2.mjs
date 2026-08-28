import { readFileSync } from "node:fs";

const t = readFileSync("scripts/_probe-4score-home.html", "utf8");
const keys = [
  "ai/get",
  "probability",
  "market_id",
  "победа",
  "1x2",
  "hml",
  "/ai/",
];
for (const k of keys) {
  console.log(k, (t.match(new RegExp(k.replace("/", "\\/"), "gi")) || []).length);
}

const apiIdx = t.search(/\/ai\/[a-z]+/i);
console.log("api sample", t.slice(apiIdx, apiIdx + 200));

const scripts = [...t.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /ai|app|main|chunk/i.test(s));
console.log("scripts", scripts.slice(0, 20));
