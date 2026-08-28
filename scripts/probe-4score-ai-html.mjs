import { writeFileSync } from "node:fs";

const today = new Date().toISOString().slice(0, 10);
const body = new URLSearchParams({
  "filters[market_id]": "5",
  "filters[market_type]": "total_more",
  "filters[argument]": "interval",
  "filters[extra][argument][interval][from]": "1.5",
  "filters[extra][argument][interval][to]": "3.5",
  "filters[dates]": today,
  "filters[confidence]": "interval",
  "filters[extra][confidence][interval][from]": "10",
  "filters[extra][confidence][interval][to]": "100",
  "filters[probability]": "interval",
  "filters[extra][probability][interval][from]": "40",
  "filters[extra][probability][interval][to]": "100",
  "filters[rate]": "interval",
  "filters[extra][rate][interval][from]": "1.2",
  "filters[extra][rate][interval][to]": "8",
  "filters[bookmaker]": "35",
  "filters[roi]": "all",
  "filters[events_count]": "all",
});

const res = await fetch("https://4score.ru/ai/get/", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0",
    Referer: "https://4score.ru/",
  },
  body: body.toString(),
});
const html = await res.text();
writeFileSync("scripts/_4score-ai-sample.html", html.slice(0, 80000));
console.log("len", html.length);
console.log("hml count", (html.match(/class="hml"/g) || []).length);
console.log("snippet", html.slice(0, 1500));
