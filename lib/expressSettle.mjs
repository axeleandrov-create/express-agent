/**
 * Сверка исходов ног экспресса по финальному счёту.
 */

function normGoals(m) {
  const h = m.homeGoals ?? m.score?.homeGoals;
  const a = m.awayGoals ?? m.score?.awayGoals;
  if (h == null || a == null) return null;
  return { h: Number(h), a: Number(a) };
}

function kickoffMs(m, leg) {
  const k = m?.kickoff || m?.stavkaKickoff || leg?.kickoff;
  if (!k) return null;
  const t = new Date(k).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Матч уже должен был начаться (с запасом 5 мин на задержку). */
function hasStarted(m, leg) {
  const kick = kickoffMs(m, leg);
  if (kick == null) return null;
  return kick <= Date.now() - 5 * 60_000;
}

function parseMatchMinute(minute) {
  if (minute == null || minute === "") return null;
  if (typeof minute === "number" && Number.isFinite(minute)) return minute;
  const s = String(minute).trim();
  if (/перерыв|HT|half/i.test(s)) return 45;
  if (/доп|ET/i.test(s)) return 90;
  const m = s.match(/^(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

function isFinished(m, leg) {
  if (!m) return false;

  const started = hasStarted(m, leg);
  if (started === false) return false;

  if (m.isFinished || m.status === "FINISHED" || m.status === "FT") return true;
  if (/заверш/i.test(String(m.statusText || ""))) return true;

  const min = parseMatchMinute(m.minute);
  if (m.isLive === true && min != null && min < 90) return false;

  const g = normGoals(m);
  if (!g) return false;

  if (min != null && min >= 90) return true;

  // 0:0 без минуты/статуса «завершён» — прематч, не финал
  return false;
}

function normPick(pick) {
  const s = String(pick || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
  if (s === "П1" || s === "P1" || s === "1") return "П1";
  if (s === "П2" || s === "P2" || s === "2") return "П2";
  if (s === "Х" || s === "X" || s === "0") return "Х";
  if (s === "1X") return "1X";
  if (s === "X2") return "X2";
  if (s === "12") return "12";
  return s;
}

/** @returns {"win"|"loss"|null} */
export function evaluateLegPick(pick, homeGoals, awayGoals) {
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;

  const p = normPick(pick);
  const homeWin = h > a;
  const awayWin = a > h;
  const draw = h === a;

  if (p === "П1") return homeWin ? "win" : "loss";
  if (p === "П2") return awayWin ? "win" : "loss";
  if (p === "Х") return draw ? "win" : "loss";
  if (p === "1X") return homeWin || draw ? "win" : "loss";
  if (p === "X2") return awayWin || draw ? "win" : "loss";
  if (p === "12") return !draw ? "win" : "loss";
  return null;
}

function matchKey(home, away) {
  return `${String(home || "").trim().toLowerCase()}|${String(away || "").trim().toLowerCase()}`;
}

function findMatch(matches, leg) {
  const key = matchKey(leg.home, leg.away);
  return (matches || []).find(
    (m) => matchKey(m.home, m.away) === key,
  );
}

function clearLegResult(leg) {
  const { result, score, ...rest } = leg;
  return rest;
}

function shouldReopenLeg(leg, m) {
  if (leg.result !== "win" && leg.result !== "loss") return false;
  const kick = kickoffMs(m, leg);
  if (kick != null && kick > Date.now() - 5 * 60_000) return true;
  if (m && !isFinished(m, leg)) return true;
  return false;
}

/**
 * @param {object[]} expresses — записи из localStorage
 * @param {object[]} matches — полная лента с сервера
 */
export function settleExpresses(expresses, matches) {
  return (expresses || []).map((ex) => {
    if (ex.result && ex.result !== "pending") return ex;

    const legs = (ex.legs || []).map((leg) => {
      const m = findMatch(matches, leg);

      if (shouldReopenLeg(leg, m)) {
        return clearLegResult(leg);
      }

      if (leg.result === "win" || leg.result === "loss") return leg;
      if (!m || !isFinished(m, leg)) return leg;
      const g = normGoals(m);
      if (!g) return leg;
      const r = evaluateLegPick(leg.pick, g.h, g.a);
      if (!r) return leg;
      return { ...leg, result: r, score: `${g.h}:${g.a}` };
    });

    const allSettled = legs.length > 0 && legs.every((l) => l.result === "win" || l.result === "loss");
    if (!allSettled) {
      const changed = legs.some((l, i) => l.result !== ex.legs[i]?.result || l.score !== ex.legs[i]?.score);
      return changed ? { ...ex, legs, result: "pending", settledAt: null } : ex;
    }

    const result = legs.every((l) => l.result === "win") ? "win" : "loss";
    return { ...ex, legs, result, settledAt: new Date().toISOString() };
  });
}
