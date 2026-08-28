import { fetchText } from "../lib/fetch.mjs";
import { writeFileSync } from "node:fs";

const url = "https://4score.ru/events/tsska-ofi-27-08-2026/";
const res = await fetchText(url, {
  timeoutMs: 25000,
  headers: { Accept: "text/html", "Accept-Language": "ru" },
});
const html = res.text || "";
console.log("len", html.length, "ok", res.ok);
writeFileSync(new URL("./_probe-form-out/cska-page.html", import.meta.url), html);

const labels = [
  "Последние",
  "последние матчи",
  "Форма",
  "Результаты",
  "event-result",
  "team-form",
  "form-item",
  "history-event",
];
for (const lab of labels) {
  const i = html.indexOf(lab);
  console.log(lab, i);
  if (i >= 0) {
    const plain = html
      .slice(i, i + 1200)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    console.log(" ", plain.slice(0, 280));
  }
}

const scoreish = [...html.matchAll(/\b(\d+)\s*[:\-]\s*(\d+)\b/g)].slice(0, 20);
console.log(
  "scores sample",
  scoreish.map((m) => m[0]).join(", "),
);
