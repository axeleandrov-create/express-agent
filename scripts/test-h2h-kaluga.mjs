import { fetchH2hBySlug } from "../lib/h2h.mjs";

const h = await fetchH2hBySlug(
  "avangard-kursk-kaluga-25-08-2026",
  "Авангард Курск",
  "Калуга",
);
console.log(JSON.stringify(h, null, 2));
