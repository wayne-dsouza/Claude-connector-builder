# The Morning Kickoff — daily World Cup PDF brief

A daily, automatically generated A4 magazine (6 pages) covering the FIFA World Cup 26:
cover with hero photo, one full report page per match (timeline graphic, stat bars,
star of the match), today's fixtures with key-man panels, the Golden Boot race with
photo podium, and the knockout bracket + week ahead.

## How it works

1. **Data** — each edition is a JSON file in `data/YYYY-MM-DD.json` (see
   `data/2026-07-06.json` for the schema by example). The facts are researched fresh
   each morning (web search: ESPN, CBS, Yahoo, Al Jazeera, Opta Analyst, NBC, FOX)
   and written into a new data file by the daily routine.
2. **Images** — national flags (public domain, flagcdn.com) in `assets/flags/`;
   player photos (Wikimedia Commons, CC BY-SA) fetched by `fetch-photo.cjs`, which
   records attribution in `assets/photos/credits.json`. The generator prints photo
   credits on the back page automatically. No FIFA/team trademarks.
3. **Render** — `generate.cjs` builds a self-contained HTML file (all images as data
   URIs) and prints it to PDF with Playwright/Chromium, plus per-page PNG previews.

```bash
# fetch a new player photo (records CC attribution automatically)
node daily-brief/fetch-photo.cjs "Erling Haaland" haaland
# space out multiple fetches (Wikipedia rate-limits bursts; sleep ~20s between calls)

# render an edition
NODE_PATH=/opt/node22/lib/node_modules node daily-brief/generate.cjs daily-brief/data/2026-07-06.json
# → daily-brief/out/morning-kickoff-<date>.pdf  (+ preview-*.png)
```

## Daily routine checklist (followed by the scheduled trigger)

1. **Research**: previous day's matches (scores, scorers + exact minutes, cards,
   match stats — possession/shots/passes from Opta-style sources, attendance,
   storylines, star performers), today's fixtures (venues, kick-off ET → French
   time = ET+6h), Golden Boot standings, bracket state, week ahead. Verify facts
   across at least two sources; don't state squad details you haven't verified.
2. **Data file**: write `data/<today>.json` (copy previous edition's structure;
   bump `editionNumber`; refresh hero, briefing, insideToday, timelines, stats,
   stageTracker, week, tomorrow, statTiles, signoff, sources).
3. **Photos**: fetch any new star/key-man photos with `fetch-photo.cjs`
   (~20s between calls). Missing flags: `curl -o assets/flags/<code>.png
   https://flagcdn.com/w160/<code>.png` (ISO alpha-2; England = `gb-eng`).
4. **Render & QA**: run the generator, then **Read every preview PNG** — check for
   overflow, label collisions, missing images — and fix before shipping.
5. **Deliver**:
   a. Send the PDF in the session with SendUserFile (status: proactive).
   b. Copy `out/brief-<date>.html` to `out/morning-kickoff.html` and redeploy the
      Artifact with `url: https://claude.ai/code/artifact/9882aba5-ebdb-46aa-9fae-34c82e94bbda`
      (same URL every day — it's linked from the emails; keep favicon ⚽).
   c. Create a Gmail **draft** to wayne@liquidmbs.fr + shanice@liquidmbs.fr:
      subject `The Morning Kickoff #N — <top story>`, short HTML summary
      (yesterday / tonight / golden boot) + button linking to the artifact URL
      above. The Gmail connector cannot send or attach files — the draft is
      ready-to-send; Wayne taps Send. Phrase the body around the link
      ("read today's edition online"), do not promise an attachment.
6. **Commit** the new data file + any new photos/flags and push to
   `claude/world-cup-daily-pdf-gwjr86`.
7. If no matches were played yesterday (rest day), lead with previews and bracket.
   The edition on **20 July 2026** (morning after the final) is the last: make it a
   tournament wrap-up special, then disable the trigger via update_trigger.

## Design notes

- All times displayed in French time (CEST); ET shown as "local".
- Fonts: Liberation Sans (container has no emoji font — SVG icons only, never emoji).
- Palette anchored on the validated dataviz reference palette (navy `#0d366b`,
  blue `#2a78d6`, red `#e34948`, gold `#eda100`, aqua `#1baf7a`).
- Stat bars: home team = blue, away = red, legend on every chart.
- Timeline graphic: away events above the track, home below; only place events at
  verified minutes (red cards with unknown minutes get a label, approximate slot).
- `out/` is git-ignored (generated artifacts).
