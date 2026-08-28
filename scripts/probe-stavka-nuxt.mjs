import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30000 });
const t = r.text || "";

const nuxtIdx = t.indexOf("window.__NUXT__");
console.log("nuxtIdx", nuxtIdx);
if (nuxtIdx >= 0) {
  const slice = t.slice(nuxtIdx, nuxtIdx + 800000);
  writeFileSync("scripts/_stavka-nuxt-raw.txt", slice.slice(0, 500000));
  console.log("nuxt slice head", slice.slice(0, 500));
}

// script tags with application/json
const jsonScripts = [...t.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
console.log("json scripts", jsonScripts.length);
for (let i = 0; i < Math.min(3, jsonScripts.length); i++) {
  writeFileSync(`scripts/_stavka-json-${i}.json`, jsonScripts[i][1].slice(0, 300000));
  console.log("json", i, "len", jsonScripts[i][1].length);
}

// look for payload / state
for (const key of ["payload", "matches", "events", "initialState", "data-page"]) {
  const n = (t.match(new RegExp(key, "gi")) || []).length;
  if (n) console.log("key", key, n);
}

// try graphql
const gqlTries = [
  { url: "https://stavka.tv/graphql", body: { query: "{ __typename }" } },
  { url: "https://stavka.tv/api/graphql", body: { query: "{ __typename }" } },
];
for (const g of gqlTries) {
  try {
    const res = await fetch(g.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(g.body),
    });
    const text = await res.text();
    console.log("gql", g.url, res.status, text.slice(0, 120));
  } catch (e) {
    console.log("gql fail", g.url, e.message);
  }
}

// API with headers like browser
const hdr = {
  accept: "application/json, text/plain, */*",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://stavka.tv/matches/soccer",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
const api2 = [
  "https://stavka.tv/api/matches?include=competitors,odds&filter[sport]=soccer&page[size]=100",
  "https://stavka.tv/api/sports",
  "https://stavka.tv/api/sports/soccer/matches",
  "https://stavka.tv/api/line/soccer",
  "https://stavka.tv/api/catalog/soccer",
];
for (const u of api2) {
  const res = await fetch(u, { headers: hdr });
  const text = await res.text();
  console.log(JSON.stringify({ u: u.replace("https://stavka.tv", ""), status: res.status, len: text.length, body: text.slice(0, 100).replace(/\s+/g, " ") }));
}
