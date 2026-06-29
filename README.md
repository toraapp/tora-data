# Tóra — pharmacy roster scraper

Turns the daily Cyprus **overnight (διανυκτερεύοντα) pharmacy** roster published on
[ygeia-news.com](https://ygeia-news.com/dianyktereyonta-farmakeia/) into a
`pharmacies.json` file the Tóra app reads — so the Pharmacies tab updates itself
instead of being a frozen snapshot.

## What it does

1. Loads the roster category page and grabs the **newest** article link
   (the slug pattern `/ta-dianyktereyonta-farmakeia-…-einai-ta-eksis`).
2. Parses each district section (Λευκωσία, Λεμεσός, Λάρνακα, Πάφος, Αμμόχωστος).
3. Writes `pharmacies.json`:

```json
{
  "source": "https://ygeia-news.com/ta-dianyktereyonta-farmakeia-...",
  "scrapedAt": "2026-06-26T18:30:00.000Z",
  "count": 18,
  "pharmacies": {
    "Nicosia":  [{ "name": "...", "area": "...", "address": "...", "note": "...", "phone": "22322226" }],
    "Limassol": [ ... ], "Larnaca": [ ... ], "Paphos": [ ... ], "Famagusta": [ ... ]
  }
}
```

## Run it

```bash
npm install
npm run scrape     # fetches live → writes pharmacies.json
npm test           # parses the offline fixture (no network) and self-checks
```

## Deploy (free, hands-off)

The repo serves three feeds from the **`data/`** folder:

| File | How it updates | Status |
|------|----------------|--------|
| `data/pharmacies.json` | scraped nightly by the GitHub Action | **live now** |
| `data/fuel.json` | seed data; swap to a live fetcher after Observatory access | seed |
| `data/groceries.json` | seed data; swap to a live fetcher after e-Kalathi access | seed |

The included GitHub Action (`.github/workflows/pharmacies.yml`) runs every evening,
re-scrapes the roster into `data/pharmacies.json`, and commits the `data/` folder.
Serve that folder via **GitHub raw** or **GitHub Pages** and point the app's three
feed URLs at the files:

```js
// in the Tóra app
const PHARMACY_FEED_URL  = "https://raw.githubusercontent.com/<you>/tora-data/main/data/pharmacies.json";
const FUEL_FEED_URL      = "https://raw.githubusercontent.com/<you>/tora-data/main/data/fuel.json";
const GROCERIES_FEED_URL = "https://raw.githubusercontent.com/<you>/tora-data/main/data/groceries.json";
```

Each tab fetches its feed on load and falls back to its bundled data if the fetch
fails (offline, or before you've deployed). Fuel and groceries serve seed data for
now, so they're hostable today — once the access requests land, only the *fetchers*
change; the app and its URLs stay exactly the same.

## Notes / things to harden before launch

- **Source.** ygeia-news is a convenient mirror; the authoritative roster is the
  Ministry of Health / Pharmaceutical Services. For a published app, treat
  ygeia-news as the practical feed but ideally cross-check the official list, and
  consider asking the publisher for permission (contact: chr@ygeia-news.com).
- **Resilience.** The parser keys off district headings + table rows. If the site
  redesigns, `npm test` against a fresh saved page is the fastest way to re-tune
  the selectors. The scraper exits non-zero if it parses 0 pharmacies, so a broken
  run won't overwrite good data with an empty file.
- **Phones** are stored as the 8-digit local number; the app dials them as `+357…`.
