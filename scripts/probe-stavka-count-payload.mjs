import { readFileSync, writeFileSync } from "node:fs";

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
      if (
        v[0] === "Reactive" ||
        v[0] === "ShallowReactive" ||
        v[0] === "Ref" ||
        v[0] === "ShallowRef"
      ) {
        out = resolve(v[1], stack);
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
const root = reviveNuxt(raw);
const page = root.data["matchesPageAsyncData-/matches/soccer"];
console.log({
  matchesTotal: page.matchesTotal,
  tournaments: page.matchesList?.length,
  grouping: Array.isArray(page.groupingByTournaments)
    ? page.groupingByTournaments.length
    : typeof page.groupingByTournaments,
});

let n = 0;
const sample = [];
for (const t of page.matchesList || []) {
  const ms = t.matches || [];
  n += ms.length;
  if (sample.length < 3 && ms[0]) {
    sample.push({
      tournament: t.name,
      matchKeys: Object.keys(ms[0]),
      match: ms[0],
    });
  }
}
console.log("nested matches", n);
writeFileSync("scripts/_stavka-match-sample.json", JSON.stringify(sample, null, 2).slice(0, 30000));

// flatten statuses
const statusCount = {};
for (const t of page.matchesList || []) {
  for (const m of t.matches || []) {
    const st = m.status || m.state || m.matchStatus || "?";
    statusCount[st] = (statusCount[st] || 0) + 1;
  }
}
console.log("statuses", statusCount);
