import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("scripts/_stavka-json-1.json", "utf8");
let j;
try {
  j = JSON.parse(raw);
} catch (e) {
  console.log("parse fail", e.message, "head", raw.slice(0, 200));
  process.exit(1);
}

console.log("type", Array.isArray(j) ? "array" : typeof j);
if (Array.isArray(j)) console.log("len", j.length, "item0 keys", j[0] && Object.keys(j[0]));
else console.log("keys", Object.keys(j).slice(0, 30));

const found = [];
function walk(obj, path, depth) {
  if (!obj || typeof obj !== "object" || depth > 8) return;
  if (Array.isArray(obj)) {
    if (obj.length >= 30 && obj[0] && typeof obj[0] === "object") {
      found.push({ path, n: obj.length, keys: Object.keys(obj[0]).slice(0, 15) });
    }
    if (obj.length && obj[0] && typeof obj[0] === "object") walk(obj[0], path + "[0]", depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj)) walk(v, path ? path + "." + k : k, depth + 1);
}
walk(j, "", 0);
found.sort((a, b) => b.n - a.n);
console.log(JSON.stringify(found.slice(0, 25), null, 2));
if (found[0]) {
  // dump one sample item
  const parts = found[0].path.split(".");
  let cur = j;
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(/^(.+)\[0\]$/);
    cur = m ? cur[m[1]][0] : cur[p];
  }
  writeFileSync("scripts/_stavka-sample-item.json", JSON.stringify(cur, null, 2).slice(0, 5000));
  console.log("sample written");
}
