import { fetchText } from "../lib/fetch.mjs";

const urls = [
  "https://4score.ru/events/",
  "https://4score.ru/events/football/",
  "https://4score.ru/events/hockey/",
  "https://4score.ru/events/basketball/",
  "https://4score.ru/events/tennis/",
  "https://4score.ru/events/volleyball/",
  "https://4score.ru/events/cybersport/",
  "https://4score.ru/",
];

for (const u of urls) {
  const r = await fetchText(u, { timeoutMs: 20000 });
  const t = r.text || "";
  const live = (t.match(/lg__status-live/g) || []).length;
  const blocks = t.split('class="lg__block"').length - 1;
  console.log(
    JSON.stringify({
      path: u.replace("https://4score.ru", ""),
      status: r.status,
      blocks,
      live,
      len: t.length,
    }),
  );
}
