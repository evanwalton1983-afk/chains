# Changelog

Newest first. One dated line per change. The version is the one shown in the app under Settings (gear icon, top right).

- 2026-10-14, v2.4.0: Fair prices four ways. New fairPrice module removes the vig by multiplicative (the old method), additive, power and Shin, ported from the MIT licensed shin and penaltyblog packages with their notices. New Settings > Fair prices: Fair price method for the fair price shown (default Shin) and EV gate for every estimate, expected value, stake, clears-the-bar call and Better number flag (default Worst case, the lowest of the four for the side being bet). The method now shows next to each fair price. Closing values and the consensus stored on picks stay multiplicative so the Record stays on one scale. Unit tests in tests/, run with node --test.
- 2026-10-14, v2.3.0: Added CLAUDE.md with house rules for future changes. No app files changed, so the version stays at 2.3.0. Earlier changes were not logged here.
