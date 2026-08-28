import { fetchText } from "../lib/fetch.mjs";

const MONTHS_RU = {
  янв: 0, фев: 1, мар: 2, апр: 3, май: 4, июн: 5,
  июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
};

const now = new Date();
const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 25000 });
const chunks = (r.text || "").split("MatchesRow match-row").slice(1);
const futureish = [];
const started = [];

for (const chunk of chunks) {
  if (/event-status--past|event-date--past|Завершен|>FT</i.test(chunk)) continue;
  const teams = [...chunk.matchAll(/class="team-name[^"]*"[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  if (teams.length < 2) continue;
  const statusText = chunk.match(/class="event-status"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  const dateText = chunk.match(/class="event-date"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  const timeM = statusText.match(/^(\d{1,2}):(\d{2})$/);
  const dateM = dateText.trim().match(/(\d{1,2})\s+([а-яё]+)/i);
  if (!timeM || !dateM) continue;
  const mon = MONTHS_RU[dateM[2].slice(0, 3).toLowerCase()];
  if (mon == null) continue;
  const kick = new Date(Date.UTC(now.getFullYear(), mon, Number(dateM[1]), Number(timeM[1]) - 3, Number(timeM[2])));
  const row = { home: teams[0], away: teams[1], dateText, statusText, kick: kick.toISOString(), past: kick.getTime() <= now.getTime() };
  if (row.past) started.push(row);
  else futureish.push(row);
}

console.log("now", now.toISOString(), "future", futureish.length, "started-but-not-past-class", started.length);
console.log("future sample", futureish.slice(0, 8));
console.log("started sample", started.slice(0, 8));
