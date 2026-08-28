import { fetchText } from "../lib/fetch.mjs";

async function tryApi(url, headers = {}) {
  const ctrl = AbortSignal.timeout(15000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, application/vnd.api+json, */*",
        "User-Agent": "Mozilla/5.0",
        ...headers,
      },
      signal: ctrl,
    });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 200).replace(/\s+/g, " ") };
  } catch (e) {
    return { status: 0, text: e.message };
  }
}

const urls = [
  "https://stavka.tv/api/matches?include=competitors,odds&filter[sport]=1",
  "https://stavka.tv/api/matches?page[size]=100",
  "https://stavka.tv/api/events",
  "https://stavka.tv/api/calendar",
  "https://stavka.tv/api/line",
  "https://wss.stavka.tv",
];

for (const u of urls) {
  console.log(u, await tryApi(u));
}
