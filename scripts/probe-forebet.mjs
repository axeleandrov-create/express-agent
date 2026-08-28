import { fetchText } from "../lib/fetch.mjs";

const url = "https://www.forebet.com/en/football/predictions";
const res = await fetchText(url, {
  timeoutMs: 30_000,
  headers: { "Accept-Language": "en-US,en;q=0.9" },
});

console.log("status", res.status, "ok", res.ok, "len", res.text.length, "err", res.error || "");
const t = res.text;
const i = t.toLowerCase().indexOf("fprc");
console.log("fprc idx", i);
console.log("rcnt", (t.match(/class="rcnt/g) || []).length);
console.log("tr_0", (t.match(/tr_0/g) || []).length);
console.log("tnmscn", (t.match(/tnmscn/g) || []).length);
console.log("forepr", (t.match(/forepr/g) || []).length);
if (i >= 0) console.log("sample\n", t.slice(Math.max(0, i - 250), i + 500));
else console.log("head\n", t.slice(0, 800));
