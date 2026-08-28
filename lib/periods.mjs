/**
 * Временные окна (МСК, UTC+3) для ленты и экспрессов.
 * periods: live | today | 3days | week
 */

const MSK_OFFSET_MS = 3 * 3600_000;

/** «Сейчас» как календарные дата/время в Москве. */
export function mskParts(now = new Date()) {
  const t = new Date(now.getTime() + MSK_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
  };
}

/** Конец календарного дня dayOffset (0=сегодня) в МСК → UTC Date. */
export function endOfMskDay(now = new Date(), dayOffset = 0) {
  const p = mskParts(now);
  // 23:59:59.999 МСК = 20:59:59.999 UTC того же календарного дня
  return new Date(
    Date.UTC(p.y, p.m, p.d + dayOffset, 20, 59, 59, 999),
  );
}

/** Начало календарного дня dayOffset в МСК → UTC Date. */
export function startOfMskDay(now = new Date(), dayOffset = 0) {
  const p = mskParts(now);
  // 00:00 МСК = 21:00 UTC предыдущего календарного дня UTC
  return new Date(Date.UTC(p.y, p.m, p.d + dayOffset, -3, 0, 0, 0));
}

function kickMs(m) {
  const t = new Date(m.kickoff).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Лайв: явный isLive / status LIVE или уже начался и не завершён.
 */
export function isLiveMatch(m, now = new Date()) {
  if (m?.status === "LIVE" || m?.isLive) return true;
  if (m?.status === "FINISHED" || m?.isFinished) return false;
  const k = kickMs(m);
  if (k == null) return false;
  const age = now.getTime() - k;
  return age >= 0 && age <= 130 * 60_000;
}

export function inPeriod(m, period, now = new Date()) {
  if (period === "live") return isLiveMatch(m, now);

  const k = kickMs(m);
  if (k == null) return false;
  const t = now.getTime();
  if (k < t && period !== "live") return false;

  if (period === "today") {
    return k <= endOfMskDay(now, 0).getTime();
  }
  if (period === "3days") {
    // от сейчас до конца послезавтра (день+2)
    return k <= endOfMskDay(now, 2).getTime();
  }
  if (period === "week") {
    return k <= endOfMskDay(now, 6).getTime();
  }
  return true;
}

export function filterByPeriod(matches, period, now = new Date()) {
  return (matches || []).filter((m) => inPeriod(m, period, now));
}

export function tagMatchPeriods(m, now = new Date()) {
  const tags = [];
  if (isLiveMatch(m, now)) tags.push("live");
  if (inPeriod(m, "today", now)) tags.push("today");
  if (inPeriod(m, "3days", now)) tags.push("3days");
  if (inPeriod(m, "week", now)) tags.push("week");
  return tags;
}

export function countByPeriod(matches, now = new Date()) {
  const list = matches || [];
  return {
    live: list.filter((m) => inPeriod(m, "live", now)).length,
    today: list.filter((m) => inPeriod(m, "today", now)).length,
    "3days": list.filter((m) => inPeriod(m, "3days", now)).length,
    week: list.filter((m) => inPeriod(m, "week", now)).length,
  };
}

export const PERIODS = ["live", "today", "3days", "week"];
