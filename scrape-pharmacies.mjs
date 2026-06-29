// scrape-pharmacies.mjs
// ---------------------------------------------------------------------------
// Fetches the latest overnight (διανυκτερεύοντα) pharmacy roster from
// ygeia-news.com and writes pharmacies.json in the exact shape the Tóra app
// consumes:  { Nicosia:[{name,area,address,note,phone}, ...], Limassol:[...] }
//
//   Run:    node scrape-pharmacies.mjs
//   Needs:  Node 18+ (built-in fetch) and cheerio  ->  npm install
//
// Parsing functions are exported so they can be unit-tested offline against a
// saved HTML fixture (see test-parse.mjs) without hitting the network.
// ---------------------------------------------------------------------------

import { load } from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://ygeia-news.com";
const CATEGORY = `${BASE}/dianyktereyonta-farmakeia/`;

// Greek district heading -> the key the app uses
const DISTRICTS = {
  "Λευκωσία": "Nicosia",
  "Λεμεσός":  "Limassol",
  "Λάρνακα":  "Larnaca",
  "Πάφος":    "Paphos",
  "Αμμόχωστος":"Famagusta",
};

// accent-insensitive matching so "ΛΕΜΕΣΟΣ" / "Λεμεσός" both resolve
const deaccent = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const key = s => deaccent(s).trim().toUpperCase();
const DISTRICT_LOOKUP = Object.fromEntries(
  Object.entries(DISTRICTS).map(([gr, en]) => [key(gr), en])
);
const matchDistrict = txt => DISTRICT_LOOKUP[key(txt)] || null;

const HEADER_WORDS = ["ΕΠΩΝΥΜΟ", "ΟΝΟΜΑ", "ΔΙΕΥΘΥΝΣΗ", "ΠΕΡΙΟΧΗ", "ΤΗΛΕΦΩΝΟ", "ΤΗΛ"];
const firstPhone = s => {
  const m = (s || "").replace(/[^\d/]/g, "").match(/\d{8}/);
  return m ? m[0] : "";
};

// --- find the newest roster link on the category page ----------------------
export function findLatestArticleUrl(categoryHtml) {
  const $ = load(categoryHtml);
  const re = /\/ta-dianyktereyonta-farmakeia-[a-z0-9-]*einai-ta-eksis/i;
  let url = null;
  $("a[href]").each((_, a) => {
    if (url) return;                       // first match = newest (top of list)
    const href = $(a).attr("href") || "";
    if (re.test(href)) url = href.startsWith("http") ? href : BASE + href;
  });
  return url;
}

// --- turn one article into the district -> pharmacies map ------------------
export function parseArticle(html) {
  const $ = load(html);
  const root = $("article").first().length ? $("article").first()
             : $("main").first().length    ? $("main").first()
             : $("body");

  const out = { Nicosia: [], Limassol: [], Larnaca: [], Paphos: [], Famagusta: [] };
  let current = null;

  // walk headings + rows in document order, tracking the current district
  root.find("h1,h2,h3,h4,h5,h6,strong,b,p,tr").each((_, el) => {
    const tag = (el.tagName || "").toLowerCase();

    if (tag === "tr") {
      if (!current) return;
      const cells = $(el).find("td").map((__, td) =>
        $(td).text().replace(/\s+/g, " ").trim()).get();
      if (cells.length < 3) return;                         // not a data row
      if (HEADER_WORDS.some(w => key(cells.join(" ")).includes(w))) return;

      const [surname = "", first = "", street = "", landmark = "", area = ""] = cells;
      const phone = firstPhone(cells.slice(5).join(" ") || cells[cells.length - 1]);
      const name = `${first} ${surname}`.trim();
      if (!name) return;
      out[current].push({ name, area, address: street, note: landmark, phone });
    } else {
      const d = matchDistrict($(el).text());
      if (d) current = d;                                   // entered a district section
    }
  });
  return out;
}

// --- live run --------------------------------------------------------------
const slugDate = url => (url.match(/farmakeia-(.*)-einai-ta-eksis/) || [, ""])[1];

async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": "ToraBot/1.0 (+pharmacy roster)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function main() {
  const url = findLatestArticleUrl(await get(CATEGORY));
  if (!url) throw new Error("Could not find a roster link on the category page");

  const pharmacies = parseArticle(await get(url));
  const count = Object.values(pharmacies).reduce((n, a) => n + a.length, 0);
  if (count === 0) throw new Error("Parsed 0 pharmacies — page structure may have changed");

  const payload = {
    source: url,
    slug: slugDate(url),
    scrapedAt: new Date().toISOString(),
    count,
    pharmacies,
  };
  mkdirSync("data", { recursive: true });
  writeFileSync("data/pharmacies.json", JSON.stringify(payload, null, 2));
  console.log(`✓ wrote data/pharmacies.json — ${count} pharmacies from ${url}`);
}

// only run when invoked directly (so imports for testing stay side-effect free)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("✗", e.message); process.exit(1); });
}
