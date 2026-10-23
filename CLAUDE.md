# CLAUDE.md

Follow these house rules in every task in this folder.

## House rules

1. Additive changes only. Keep every existing feature, data field and prediction formula working unless the task says otherwise.
2. Keep the current architecture. If this is a single-file HTML PWA, keep it single-file, load libraries from a CDN with pinned versions, and add no build step.
3. Free plans only (Supabase free, Netlify free). Warn me before anything that could push past a free limit.
4. Don't add paid services or new API keys without asking me first.
5. No em dashes or en dashes anywhere: UI text, code comments, docs.
6. If you copy code from an MIT licensed repo, keep its copyright and license notice in a comment above that code.
7. Bump the version number shown in the app and add a dated line to CHANGELOG.md.
8. Before saying done, test at phone width and tell me exactly what to tap to check it.

## How the rules apply to Chains

Facts about this app as of 2026-10-23 (version 2.5.0), so each rule can be followed without digging.

- **Architecture (rule 2).** This is a single-file HTML PWA. All markup, CSS and JS are inline in `index.html`. Next to it: `sw.js` (service worker), `manifest.webmanifest`, `_headers` (Netlify cache headers) and the icons. No package.json, no build step. The only outside asset is the Google Fonts stylesheet; there are no CDN scripts yet.
- **Version (rule 7).** It lives in two places that must always match: `VERSION` in `index.html` and `APP_VERSION` in `sw.js`. The `sw.js` change is what makes an installed phone show "A new version is ready" and drop the old cache, so never bump one without the other. The app shows the version in Settings (gear icon, top right): "Chains X.Y.Z, stored only on this device". The folder name and the README title still say 2.1; go by the code.
- **Changelog (rule 7).** `CHANGELOG.md`, newest first, one line per change: `- YYYY-MM-DD, vX.Y.Z: what changed.`
- **Data fields (rule 1).** User data stays on the phone in IndexedDB (database `chains`, stores `kv`, `cache`, `props` and `picks`). Settings > Export backup writes JSON with `app`, `version`, `exportedAt`, `settings`, `props`, `picks` and `parlay`; Import backup accepts any file with `app: 'chains'`. Saved picks and older backups must keep loading after every change.
- **Prediction formulas (rule 1).** The sections of `index.html` headed `defense vs position`, `fair price`, `market math`, `the model` and `picks, grading, closing line value`, plus `parlayMath` and `pairCorr`, the odds and EV helpers in the `helpers` section, the `altLines` module (the alt line ladder, added in 2.5, which reads the fair prices and feeds nothing back into them), and the thresholds in `DEFAULTS`. Their outputs must not change unless the task asks for a model change. Since 2.4 the fair price shown follows the `fairMethod` setting and every estimate, EV, stake and verdict follows `evGate`, while closing value and the consensus stored on picks (`consAtBet`) stay multiplicative on purpose.
- **Tests.** Run `node --test` in this folder (Node 24, nothing to install). The tests in `tests/` read the fairPrice module out of `index.html` between the `/* ---------- fair price ---------- */` and `/* ---------- end fair price ---------- */` markers, and the altLines module between `/* ---------- alt lines ---------- */` and `/* ---------- end alt lines ---------- */`, so keep all four markers and keep each block free of other app code. `tests/altlines.test.mjs` also fails if any em or en dash appears in the app, the tests or the docs.
- **Free limits (rule 3).** No Supabase here. Hosting is Netlify free, deployed by drag and drop. The tightest limit is the free Odds API key: 500 credits a month, and a pull costs games x markets. Warn before anything that pulls more markets, adds regions or pulls more often. The alt line ladder pulls nothing: its best prices are only the lines your books already hang in a normal pull. Pulling the alternate markets would add credits for every market and game, roughly doubling a pull at the default five markets, so ask first.
- **Phone width test (rule 8).** Run `python -m http.server 8080` in this folder and open `http://localhost:8080/` at 390 x 844, then glance at 360 wide. Localhost lets the service worker register. Python's server sends no cache headers, so the test browser can keep serving an older `index.html`: open the page as `http://localhost:8080/?t=` plus something new each run, and confirm the version in Settings before testing anything. The tabs (Board, Slate, Parlay, Record) sit fixed at the bottom; Settings is the gear at top right. Write the tap steps from those. The Playwright tools save snapshots into `.playwright-mcp/` in this folder; delete it after testing so it does not ship with a drag and drop deploy.
