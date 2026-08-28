import { readFileSync, writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

/** Разворачивает Nuxt/devalue payload (упрощённо). */
function reviveNuxt(raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return data;
  const cache = new Map();
  function resolve(i, stack = new Set()) {
    if (typeof i !== "number") return i;
    if (cache.has(i)) return cache.get(i);
    if (stack.has(i)) return null;
    stack.add(i);
    const v = data[i];
    let out;
    if (v === null || typeof v !== "object") out = v;
    else if (Array.isArray(v)) {
      if (v[0] === "Reactive" || v[0] === "ShallowReactive" || v[0] === "Ref" || v[0] === "ShallowRef") {
        out = resolve(v[1], stack);
      } else if (v[0] === "Set") {
        out = v.slice(1).map((x) => resolve(x, stack));
      } else if (v[0] === "Map") {
        out = {};
      } else {
        out = v.map((x) => resolve(x, stack));
      }
    } else {
      out = {};
      for (const [k, val] of Object.entries(v)) out[k] = resolve(val, stack);
    }
    cache.set(i, out);
    stack.delete(i);
    return out;
  }
  return resolve(0);
}

const raw = readFileSync("scripts/_stavka-payload-full.txt", "utf8");
let root;
try {
  root = reviveNuxt(raw);
} catch (e) {
  console.log("revive fail", e.message);
  process.exit(1);
}

writeFileSync("scripts/_stavka-revived-keys.json", JSON.stringify(Object.keys(root || {}), null, 2));
const data = root?.data || root;
console.log("root keys", Object.keys(root || {}).slice(0, 20));
console.log("data keys", data && typeof data === "object" ? Object.keys(data).slice(0, 30) : typeof data);

const matchKey = Object.keys(data || {}).find((k) => /matchesPageAsyncData/i.test(k));
console.log("matchKey", matchKey);
const page = matchKey ? data[matchKey] : null;
console.log("page type", page && typeof page, Array.isArray(page) ? page.length : page && Object.keys(page).slice(0, 20));

if (page && typeof page === "object") {
  writeFileSync("scripts/_stavka-page-sample.json", JSON.stringify(page, null, 2).slice(0, 80000));
  const found = [];
  function walk(obj, path, depth) {
    if (!obj || typeof obj !== "object" || depth > 10) return;
    if (Array.isArray(obj)) {
      if (obj.length >= 20 && obj[0] && typeof obj[0] === "object") {
        found.push({ path, n: obj.length, keys: Object.keys(obj[0]).slice(0, 20) });
      }
      for (let i = 0; i < Math.min(obj.length, 2); i++) walk(obj[i], `${path}[${i}]`, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k, depth + 1);
  }
  walk(page, "page", 0);
  found.sort((a, b) => b.n - a.n);
  console.log(JSON.stringify(found.slice(0, 20), null, 2));
}

// Compare two list URLs after parse with current extractor heuristics
function countFuture(html) {
  return (html || "").split("MatchesRow match-row").length - 1;
}
const a = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 25000 });
const b = await fetchText("https://stavka.tv/matches?sport=soccer", { timeoutMs: 25000 });
console.log("soccer page rows", countFuture(a.text), "matches?sport rows", countFuture(b.text));
