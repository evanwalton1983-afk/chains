# Chains 2.1

Personal NFL player prop research PWA. No subscription, no server, no account.

## Deploy (Netlify drag and drop)
1. Unzip. Drag the whole folder onto app.netlify.com/drop (or onto your existing Chains site's Deploys page to update it).
2. On your phone: open the site, Share > Add to Home Screen.
3. First thing: Settings > Check data sources. Every line should say working.

## Lines (optional, free)
Free key at the-odds-api.com, 500 credits a month. Settings > paste key > tick the books you can bet at.
One pull brings every US book for the same credits as one book: cost is games x markets.

## What 2.0 adds
- Price shopping: best price across your books, per side, with the full book table.
- Consensus fair price: median no-vig probability across all books, moved to your line when books disagree.
- Closing-line value: closes captured automatically in the 3 hours before kickoff while the app is open,
  or tap Get closes, or enter them by hand. Record leads with average value at close and a 200-pick verdict.
- Defense vs position: 2025 baseline built from nflverse (17 games per team), updated each week from
  this season's ESPN box scores.
- Decision gate: the Record tab states up front what happens at 200 picks and gives a verdict in all four outcomes.
- Unmatched players from a pull are listed by name so a dropped starter never goes unnoticed.
- Alternate line explorer, board filters and sort, stale-price guard, backup reminder, persistent storage.

## Data sources
- Schedule, spreads, totals, roofs: nflverse games.csv
- Rosters, injuries, game logs, box scores: ESPN public JSON (unofficial, can change without notice)
- Weather: Open-Meteo
- Lines: The Odds API

Research tool only. 1-800-GAMBLER.
