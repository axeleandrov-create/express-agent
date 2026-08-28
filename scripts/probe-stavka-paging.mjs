import { fetchText } from "../lib/fetch.mjs";

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
      if (["Reactive", "ShallowReactive", "Ref", "ShallowRef"].includes(v[0])) {
        out = resolve(v[1], stack);
      } else out = v.map((x) => resolve(x, stack));
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

function extractPayloadJson(html) {
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let best = "";
  let m;
  while ((m = re.exec(html || ""))) {
    if (m[1].length > best.length) best = m[1];
  }
  return best;
}

function pageStats(html) {
  const raw = extractPayloadJson(html);
  if (!raw) return { err: "no payload" };
  const root = reviveNuxt(raw);
  const key = Object.keys(root.data || {}).find((k) =>
    k.startsWith("matchesPageAsyncData-/"),
  );
  const page = key ? root.data[key] : null;
  if (!page) return { err: "no page", keys: Object.keys(root.data || {}).slice(0, 10) };
  let nested = 0;
  let withOdds = 0;
  let future = 0;
  const now = Date.now();
  for (const t of page.matchesList || []) {
    for (const m of t.matches || []) {
      nested++;
      const o = m.odds?.one_x_two;
      if (o?.w1?.value || o?.w2?.value || o?.x?.value) withOdds++;
      const kick = m.matchDate ? new Date(m.matchDate).getTime() : 0;
      if (kick > now && !m.isLive) future++;
    }
  }
  return {
    key,
    matchesTotal: page.matchesTotal,
    tournaments: (page.matchesList || []).length,
    nested,
    withOdds,
    future,
  };
}

const urls = [
  "https://stavka.tv/matches/soccer",
  "https://stavka.tv/matches/soccer?page=2",
  "https://stavka.tv/matches/soccer?page=1&limit=300",
  "https://stavka.tv/matches/soccer?limit=300",
  "https://stavka.tv/matches/soccer?perPage=300",
  "https://stavka.tv/matches/soccer?pageSize=300",
  "https://stavka.tv/matches/soccer?offset=150",
  "https://stavka.tv/matches/soccer?skip=150",
];

for (const u of urls) {
  const r = await fetchText(u, { timeoutMs: 25000 });
  const st = pageStats(r.text || "");
  console.log(JSON.stringify({ path: u.replace("https://stavka.tv", ""), status: r.status, ...st }));
}
