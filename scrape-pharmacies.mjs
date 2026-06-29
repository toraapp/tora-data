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
  const slug = /ta-dianyktereyonta-farmakeia-[a-z0-9-]*einai-ta-eksis/i;
  const $ = load(categoryHtml);

  let href = null;
  $("a[href]").each((_, a) => {                  // first matching anchor = newest
    if (href) return;
    const h = $(a).attr("href") || "";
    if (slug.test(h)) href = h;
  });

  if (!href) {                                   // fallback: scan the raw HTML directly
    const m = categoryHtml.match(/https?:\/\/[^"'\s<>]*ta-dianyktereyonta-farmakeia-[a-z0-9-]*einai-ta-eksis/i)
           || categoryHtml.match(/\/ta-dianyktereyonta-farmakeia-[a-z0-9-]*einai-ta-eksis/i);
    if (m) href = m[0];
  }

  if (!href) return null;
  return href.startsWith("http") ? href : BASE + (href.startsWith("/") ? href : "/" + href);
}

// a district "label" is a short standalone heading/bold like "Λευκωσία"
const districtFromLabel = txt => {
  const t = key(txt).replace(/[\s:·.\-]+$/, "").trim();
  return DISTRICT_LOOKUP[t] || null;
};

// find a table's district by scanning the elements that precede it (and its wrappers)
function districtForTable($, table) {
  let node = $(table);
  for (let up = 0; up < 6 && node.length; up++) {
    let sib = node.prev();
    for (let i = 0; i < 10 && sib.length; i++) {
      const d = districtFromLabel(sib.text());
      if (d) return d;
      sib = sib.prev();
    }
    node = node.parent();
  }
  return null;
}

// --- turn one article into the district -> pharmacies map ------------------
// Each district has a bold label (e.g. **Λεμεσός**) followed by a table whose
// columns are: surname | first name | street | landmark | area | phone | phone2
export function parseArticle(html) {
  const $ = load(html);
  const out = { Nicosia: [], Limassol: [], Larnaca: [], Paphos: [], Famagusta: [] };

  $("table").each((_, table) => {
    const district = districtForTable($, table);
    if (!district || !out[district]) return;

    $(table).find("tr").each((__, tr) => {
      const cells = $(tr).find("td").map((i, td) =>
        $(td).text().replace(/\s+/g, " ").trim()).get();
      if (cells.length < 3) return;                          // not a data row
      if (HEADER_WORDS.some(w => key(cells.join(" ")).includes(w))) return;

      const [surname = "", first = "", street = "", landmark = "", area = ""] = cells;
      const phone = firstPhone(cells.slice(5).join(" ") || cells[cells.length - 1]);
      const name = `${first} ${surname}`.trim();
      if (name) out[district].push({ name, area, address: street, note: landmark, phone });
    });
  });
  return out;
}

// --- live run --------------------------------------------------------------
const slugDate = url => (url.match(/farmakeia-(.*)-einai-ta-eksis/) || [, ""])[1];

async function get(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function main() {
  const catHtml = await get(CATEGORY);
  const url = findLatestArticleUrl(catHtml);

  if (!url) {
    // Couldn't find a link — capture what the server actually returned, so we can see why.
    mkdirSync("data", { recursive: true });
    writeFileSync("data/_debug.json", JSON.stringify({
      when: new Date().toISOString(),
      stage: "category",
      receivedLength: catHtml.length,
      mentionsRoster: /dianyktereyonta-farmakeia/i.test(catHtml),
      looksBlocked: /cloudflare|just a moment|enable javascript|cf-browser|captcha|access denied|verify you are human/i.test(catHtml),
      head: catHtml.slice(0, 2000),
    }, null, 2));
    console.error("No roster link found — wrote data/_debug.json for inspection.");
    return;                          // exit 0 so the debug file is committed and visible
  }

  const artHtml = await get(url);
  const pharmacies = parseArticle(artHtml);
  const count = Object.values(pharmacies).reduce((n, a) => n + a.length, 0);

  if (count === 0) {
    mkdirSync("data", { recursive: true });
    writeFileSync("data/_debug.json", JSON.stringify({
      when: new Date().toISOString(),
      stage: "article",
      source: url,
      receivedLength: artHtml.length,
      tableCount: (artHtml.match(/<table/gi) || []).length,
      head: artHtml.slice(0, 2000),
    }, null, 2));
    console.error("Parsed 0 pharmacies — wrote data/_debug.json for inspection.");
    return;
  }

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
