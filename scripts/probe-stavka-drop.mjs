import { fetchText } from "../lib/fetch.mjs";

const MONTHS_RU = {
  янв: 0, фев: 1, мар: 2, апр: 3, май: 4, июн: 5,
  июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
};
const LIVE_STATUS_RE =
  /^\d+['’′`]|доп\.?\s*время|перерыв|заверш|ft\b|live|лайв/i;

const now = new Date();
const horizon = now.getTime() + 7 * 86400_000;
const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 25000 });
const html = r.text || "";
const chunks = html.split("MatchesRow match-row").slice(1);
const reasons = {};
const bump = (k) => { reasons[k] = (reasons[k] || 0) + 1; };

for (const chunk of chunks) {
  if (/class="[^"]*event-status--past/.test(chunk)) { bump("past-status"); continue; }
  if (/class="[^"]*event-date--past/.test(chunk)) { bump("past-date"); continue; }
  if (/Завершен|>FT</i.test(chunk)) { bump("finished"); continue; }
  const teams = [...chunk.matchAll(/class="team-name[^"]*"[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  if (teams.length < 2) { bump("no-teams"); continue; }
  const statusText = chunk.match(/class="event-status"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  const dateText = chunk.match(/class="event-date"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  if (!statusText || LIVE_STATUS_RE.test(statusText)) { bump("live-or-empty-status:" + (statusText.slice(0, 20) || "empty")); continue; }
  const timeM = statusText.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeM) { bump("bad-time:" + statusText.slice(0, 30)); continue; }
  const dateM = dateText.trim().match(/(\d{1,2})\s+([а-яё]+)/i);
  if (!dateM) { bump("bad-date:" + dateText.slice(0, 30)); continue; }
  const day = Number(dateM[1]);
  const mon = MONTHS_RU[dateM[2].slice(0, 3).toLowerCase()];
  if (mon == null) { bump("bad-month"); continue; }
  const hour = Number(timeM[1]);
  const minute = Number(timeM[2]);
  let kick = new Date(Date.UTC(now.getFullYear(), mon, day, hour - 3, minute));
  if (kick.getTime() < now.getTime() - 2 * 86400_000) {
    kick = new Date(Date.UTC(now.getFullYear() + 1, mon, day, hour - 3, minute));
  }
  const kickMs = kick.getTime();
  if (kickMs <= now.getTime()) { bump("already-started"); continue; }
  if (kickMs > horizon) { bump("beyond-horizon"); continue; }
  const parseOdd = (title) => {
    const m = chunk.match(new RegExp(`title="${title}"[\\s\\S]*?<span class="odd"[^>]*>([0-9.]+)<`));
    const v = m ? Number(m[1]) : null;
    return v && v >= 1.01 ? v : null;
  };
  const odds = { p1: parseOdd("Победа 1"), x: parseOdd("Ничья"), p2: parseOdd("Победа 2") };
  if (!odds.p1 && !odds.x && !odds.p2) { bump("no-odds"); continue; }
  bump("ok");
}

console.log(JSON.stringify({ chunks: chunks.length, reasons }, null, 2));
