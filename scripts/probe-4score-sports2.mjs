import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://4score.ru/events/", { timeoutMs: 30000 });
const t = r.text || "";

const sports = [...t.matchAll(/class="lg__loc">([^:<]+)/g)].map((m) => m[1].trim());
const uniq = [...new Set(sports)];
console.log("countries/sports labels", uniq.length, uniq.slice(0, 40));

const names = [...t.matchAll(/class="lg__name"[^>]*>([^<]+)/g)].map((m) => m[1].trim());
console.log("leagues sample", [...new Set(names)].slice(0, 30));

const liveStatuses = [...t.matchAll(/lg__status-live[^>]*>([^<]+)/g)].map((m) =>
  m[1].trim(),
);
console.log("live statuses", liveStatuses.length, liveStatuses.slice(0, 25));

// sport nav links
const nav = [...t.matchAll(/href="(\/[^"]*(?:hockey|basket|tennis|volley|cybersport|handball|football|soccer)[^"]*)"/gi)].map(
  (m) => m[1],
);
console.log("nav", [...new Set(nav)].slice(0, 30));
