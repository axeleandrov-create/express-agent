import { readFileSync } from "node:fs";
const html = readFileSync("scripts/_probe-zulubet-out/www_zulubet_com_.html", "utf8");
const idx = html.indexOf("match-1315532.html");
console.log(html.slice(idx, idx + 1800));
const tips = readFileSync("scripts/_probe-zulubet-out/tips-27-08-2026.html", "utf8");
console.log("--- tips href sample ---");
console.log((tips.match(/href="[^"]*match[^"]*"/gi) || []).slice(0, 5));
console.log("tips has content_table", /content_table/i.test(tips));
console.log("tips match count", (tips.match(/match-\d+/g) || []).length);
