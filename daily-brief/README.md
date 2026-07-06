# The Morning Kickoff — daily World Cup PDF brief

A daily, automatically generated A4 brochure (3 pages) covering the FIFA World Cup 26:
yesterday's results and highlights, today's fixtures with French kick-off times, the
Golden Boot race, the knockout bracket, and the week ahead.

## How it works

1. **Data** — each edition is a JSON file in `data/YYYY-MM-DD.json` (see
   `data/2026-07-06.json` for the schema by example). The facts are researched fresh
   each morning (web search: ESPN, CBS, Yahoo, Al Jazeera, FOX, Goal) and written
   into a new data file by the daily routine.
2. **Render** — `generate.cjs` turns the data file into a self-contained HTML page
   (flags inlined as base64, icons as inline SVG) and prints it to PDF with
   Playwright/Chromium. It also writes per-page PNG previews for visual QA.

```bash
NODE_PATH=/opt/node22/lib/node_modules node daily-brief/generate.cjs daily-brief/data/2026-07-06.json
# → daily-brief/out/morning-kickoff-2026-07-06.pdf  (+ preview-*.png)
```

## Daily routine checklist (followed by the scheduled trigger)

1. Research: previous day's matches (scores, scorers + minutes, cards, storylines,
   venues), today's fixtures (venues, kick-off in ET → convert to French time),
   Golden Boot standings, bracket state, week-ahead schedule.
2. Write `data/<today>.json` — bump `editionNumber`, refresh `stageTracker`, `week`,
   `quickFacts`, `hero`, `statTiles`, `sources`.
3. Render, then **look at the preview PNGs** (overflow, collisions, missing flags).
   Missing flags: `curl -o assets/flags/<code>.png https://flagcdn.com/w160/<code>.png`
   (public-domain flag images; country codes are ISO 3166-1 alpha-2, England = `gb-eng`).
4. Send the PDF to the user (proactive), commit the data file + any new flags, push.
5. The edition after the final (19 July 2026) is the last one — send a tournament
   wrap-up edition, then disable the trigger.

## Design notes

- All times displayed in French time (CEST); ET shown as "local".
- Fonts: Liberation Sans (container has no emoji font — use SVG icons, never emoji).
- Palette anchored on the validated dataviz reference palette (navy `#0d366b`,
  blue `#2a78d6`, red `#e34948`, gold `#eda100`, aqua `#1baf7a`).
- No FIFA/team trademarks: national flags (public domain) + generic SVG icons only.
- `out/` is git-ignored (generated artifacts).
