// test-parse.mjs — validates the scraper's parsing offline (no network)
import { readFileSync, writeFileSync } from "node:fs";
import { findLatestArticleUrl, parseArticle } from "./scrape-pharmacies.mjs";

const read = f => readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), "utf8");

// 1) latest-article detection
const latest = findLatestArticleUrl(read("category.html"));
console.log("latest article →", latest);
console.assert(/paraskeyi-26-ioynioy-2026/.test(latest), "should pick the newest (26 Jun) link");

// 2) table parsing
const pharmacies = parseArticle(read("article.html"));
const counts = Object.entries(pharmacies).map(([d, a]) => `${d}:${a.length}`).join("  ");
console.log("parsed counts →", counts);

const total = Object.values(pharmacies).reduce((n, a) => n + a.length, 0);
console.assert(total === 18, `expected 18 pharmacies, got ${total}`);
console.assert(pharmacies.Nicosia[0].name === "Μαρίνα Νεοφύτου", "name should be 'First Surname'");
console.assert(pharmacies.Nicosia[0].phone === "22322226", "phone should be the first 8-digit number");

console.log("\nsample (Nicosia, first 2):");
console.log(JSON.stringify(pharmacies.Nicosia.slice(0, 2), null, 2));

// 3) emit the file the app will consume
import { mkdirSync } from "node:fs";
mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
writeFileSync(new URL("./data/pharmacies.json", import.meta.url), JSON.stringify({
  source: latest, slug: "tin-pempti-25-ioynioy-2026",
  scrapedAt: new Date().toISOString(), count: total, pharmacies,
}, null, 2));
console.log("\n✓ wrote data/pharmacies.json");
