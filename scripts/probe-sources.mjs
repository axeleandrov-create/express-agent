import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const targets = [
  { name: "4score-home", url: "https://4score.ru/" },
  { name: "4score-events", url: "https://4score.ru/events/" },
  { name: "stavka-prognozy", url: "https://stavka.tv/prognozy" },
  { name: "stavka-home", url: "https://stavka.tv/" },
  { name: "forebet", url: "https://www.forebet.com/en/football/predictions" },
];

for (const t of targets) {
  const res = await fetchText(t.url, {
    timeoutMs: 25_000,
    headers: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8" },
  });
  const text = res.text || "";
  writeFileSync(`scripts/_probe-${t.name}.html`, text.slice(0, 200_000));
  console.log(
    JSON.stringify({
      name: t.name,
      status: res.status,
      ok: res.ok,
      len: text.length,
      cloudflare: /just a moment|challenge-platform/i.test(text),
      hml: (text.match(/class="hml"/g) || []).length,
      percent: (text.match(/\d{1,2}%/g) || []).length,
      fprc: (text.match(/fprc/g) || []).length,
      prognoz: (text.match(/прогноз|forecast|prediction/gi) || []).length,
    }),
  );
}
