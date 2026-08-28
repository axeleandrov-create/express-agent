/**
 * SignalOdds-стиль: валуй = P_model * odds - 1.
 * ТОП при edge > 8%.
 */

export const VALUE_EDGE = 0.08;

export function valueEdge(prob, odds) {
  const p = Number(prob);
  const o = Number(odds);
  if (!(p > 0) || !(o > 1.01)) return null;
  return Math.round((p * o - 1) * 1000) / 1000;
}

export function isTopValue(prob, odds, minEdge = VALUE_EDGE) {
  const v = valueEdge(prob, odds);
  return v != null && v > minEdge;
}

/**
 * Нормализованный пик для ленты DeepBetting.
 */
export function formatDeepLine({
  label,
  odds,
  home,
  away,
  modelPct,
  valuePct,
  tag,
}) {
  const odd = odds != null ? Number(odds).toFixed(2) : "—";
  const mp = modelPct != null ? `${Math.round(Number(modelPct) * 100)}%` : "—";
  const vp =
    valuePct != null
      ? `${valuePct > 0 ? "+" : ""}${(Number(valuePct) * 100).toFixed(1)}%`
      : "—";
  const t = tag ? `[${tag}] ` : "";
  return `${t}${label} @ ${odd} | ${home} — ${away} | модель ${mp} | валуй ${vp}`;
}

export function attachValueToPick(pick) {
  if (!pick?.label) return pick;
  const odds = pick.odds ?? null;
  const value = valueEdge(pick.prob, odds);
  const top = value != null && value > VALUE_EDGE;
  return {
    ...pick,
    value,
    isTop: top || Boolean(pick.isTop),
    tier: top ? "A" : pick.tier || (pick.prob >= 0.65 ? "B" : "C"),
  };
}
