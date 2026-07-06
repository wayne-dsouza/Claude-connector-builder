#!/usr/bin/env node
/**
 * Fetch live World Cup match prices from Kalshi's public prediction-market API
 * (no auth required for market data). Used to feed The Crystal Ball's
 * "where the money is" numbers with real traded prices.
 *
 * List today's (or all open) World Cup match events:
 *   node daily-brief/fetch-market.cjs --list
 *
 * Get implied probabilities for one match event:
 *   node daily-brief/fetch-market.cjs KXWCGAME-26JUL06PORESP
 *
 * Event tickers follow KXWCGAME-<YY><MON><DD><HOME><AWAY> (3-letter codes),
 * e.g. KXWCGAME-26JUL06PORESP. Markets are regulation-time moneylines:
 * home / TIE / away. Implied % = mid of yes_bid/yes_ask (falls back to last).
 */
const BASE = 'https://api.elections.kalshi.com/trade-api/v2';

async function get(path) {
  const r = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Kalshi ${r.status} for ${path}`);
  return r.json();
}

(async () => {
  const arg = process.argv[2];
  if (!arg || arg === '--list') {
    let cursor = '';
    const events = [];
    do {
      const d = await get(`/events?series_ticker=KXWCGAME&status=open&limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      events.push(...(d.events || []));
      cursor = d.cursor && d.events?.length ? d.cursor : '';
    } while (cursor);
    for (const e of events.sort((a, b) => a.event_ticker.localeCompare(b.event_ticker))) {
      console.log(`${e.event_ticker}  ${e.title}`);
    }
    if (!events.length) console.log('No open KXWCGAME events.');
    return;
  }

  const d = await get(`/markets?event_ticker=${encodeURIComponent(arg)}`);
  const out = { event: arg, source: 'Kalshi', legs: [], totalVolumeUsd: 0 };
  for (const m of d.markets || []) {
    const bid = parseFloat(m.yes_bid_dollars);
    const ask = parseFloat(m.yes_ask_dollars);
    const last = parseFloat(m.last_price_dollars);
    const mid = isFinite(bid) && isFinite(ask) && (bid || ask) ? (bid + ask) / 2 : last;
    const vol = parseFloat(m.volume_fp || '0');
    out.totalVolumeUsd += isFinite(vol) ? vol : 0;
    out.legs.push({
      side: m.ticker.split('-').pop(),
      label: (m.yes_sub_title || '').replace('Reg Time: ', ''),
      impliedPct: isFinite(mid) ? Math.round(mid * 100) : null,
      lastPct: isFinite(last) ? Math.round(last * 100) : null,
    });
  }
  out.totalVolumeUsd = Math.round(out.totalVolumeUsd);
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
