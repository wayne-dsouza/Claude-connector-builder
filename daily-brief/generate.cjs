#!/usr/bin/env node
/**
 * The Morning Kickoff — daily FIFA World Cup 26 PDF brochure generator (6-page).
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node daily-brief/generate.cjs daily-brief/data/2026-07-06.json
 *
 * Reads an edition JSON file, builds a 6-page A4 HTML magazine (flags and
 * player photos inlined as data URIs, all icons inline SVG — fully
 * self-contained), renders it to PDF with Playwright/Chromium, and writes
 * per-page PNG previews next to it.
 *
 * Imagery: public-domain national flags (flagcdn.com) and CC BY-SA player
 * photos from Wikimedia Commons (fetched by fetch-photo.cjs); attribution for
 * every photo used is printed in the back-page credits line. No trademarked
 * marks (FIFA logos, team crests) are used.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const dataFile = process.argv[2] || path.join(ROOT, 'data', new Date().toISOString().slice(0, 10) + '.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const OUT_DIR = path.join(ROOT, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ------------------------------------------------------- flags & photos -- */
const flagCache = {};
function flag(code, cls = 'flag') {
  if (!code) return '';
  if (!(code in flagCache)) {
    const p = path.join(ROOT, 'assets', 'flags', code + '.png');
    flagCache[code] = fs.existsSync(p)
      ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
      : null;
  }
  if (!flagCache[code]) return `<span class="${cls} flag-missing"></span>`;
  return `<img class="${cls}" src="${flagCache[code]}" alt="">`;
}

const usedPhotos = new Set();
const photoCache = {};
function photo(slug, cls = 'photo') {
  if (!slug) return '';
  if (!(slug in photoCache)) {
    const p = path.join(ROOT, 'assets', 'photos', slug + '.jpg');
    photoCache[slug] = fs.existsSync(p)
      ? `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`
      : null;
  }
  if (!photoCache[slug]) return '';
  usedPhotos.add(slug);
  return `<img class="${cls}" src="${photoCache[slug]}" alt="">`;
}

function photoCredits() {
  const p = path.join(ROOT, 'assets', 'photos', 'credits.json');
  if (!fs.existsSync(p)) return '';
  const credits = JSON.parse(fs.readFileSync(p, 'utf8'));
  const byArtist = {};
  for (const slug of usedPhotos) {
    const c = credits[slug];
    if (!c) continue;
    byArtist[`${c.artist} (${c.license})`] = true;
  }
  const artists = Object.keys(byArtist);
  return artists.length
    ? `Player photos: ${artists.join(', ')}, via Wikimedia Commons.`
    : '';
}

/* ---------------------------------------------------------------- icons -- */
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICONS = {
  ball: S('<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4.2 3-1.6 5h-5.2l-1.6-5z" fill="currentColor" stroke="none"/><path d="M12 3v4.5M19.4 9l-3.2 1.5M17.5 18.5l-2.9-3M6.5 18.5l2.9-3M4.6 9l3.2 1.5"/>'),
  trophy: S('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4.5a0 0 0 0 0 0 0c0 3 1.5 4.7 3 5M17 5h2.5c0 3-1.5 4.7-3 5"/><path d="M12 14v3.5"/><path d="M8.5 20.5h7l-.8-3h-5.4z"/>'),
  boot: S('<path d="M4 15l7-8 2.5 2.5L11 12l2 1.5 6.5 2a2 2 0 0 1-1.8 3H6a2 2 0 0 1-2-2z"/><path d="M8 18.5v-2M11 18.5v-2M14 18.5v-2"/>'),
  bracket: S('<path d="M4 5h5M4 11h5M4 5v6M9 8h5v4M14 12h0M4 19h5M9 19v-4M14 12h6"/>'),
  pin: S('<path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  redcard: '<svg viewBox="0 0 24 24"><rect x="7" y="4" width="11" height="16" rx="1.6" transform="rotate(8 12 12)" fill="#d03b3b"/></svg>',
  bolt: S('<path d="M13 2L5 13.5h5.5L10 22l8.5-11.5H13z" fill="currentColor" stroke="none"/>'),
  calendar: S('<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  whistle: S('<circle cx="9" cy="14" r="5.5"/><path d="M13.5 10.5L20 7.5v4l-5.5 1.5M9 12.5v3"/>'),
  arrow: S('<path d="M5 12h13M13 6.5L18.5 12 13 17.5"/>'),
  star: S('<path d="M12 2.8l2.8 5.9 6.2.8-4.6 4.4 1.2 6.2L12 17l-5.6 3.1 1.2-6.2L3 9.5l6.2-.8z" fill="currentColor" stroke="none"/>'),
  eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
};
const icon = (name, sz, color) =>
  `<span class="ic" style="width:${sz}px;height:${sz}px;${color ? `color:${color};` : ''}">${ICONS[name] || ''}</span>`;

/* -------------------------------------------------------------- helpers -- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function scorerList(m, side) {
  const rows = (m.scorers || []).filter((s) => s.side === side);
  if (!rows.length) return '<div class="scorers"></div>';
  return `<div class="scorers ${side}">${rows
    .map(
      (s) => `<div class="scorer">${icon('ball', 10, '#898781')}<span class="sc-name">${esc(s.player)}</span><span class="sc-min">${esc(s.minute)}${s.note ? ' · ' + esc(s.note) : ''}</span></div>`
    )
    .join('')}</div>`;
}

function scoreBlock(m) {
  return `<div class="mc-main">
    <div class="team home">${flag(m.home.code, 'flag flag-lg')}<div class="team-name">${esc(m.home.name)}</div></div>
    <div class="score"><span class="s-n">${m.home.score}</span><span class="s-d">–</span><span class="s-n">${m.away.score}</span><div class="ft">FULL TIME</div></div>
    <div class="team away">${flag(m.away.code, 'flag flag-lg')}<div class="team-name">${esc(m.away.name)}</div></div>
  </div>`;
}

function statBars(m) {
  if (!m.stats || !m.stats.length) return '';
  return `<div class="stats">
    <div class="st-legend"><span><i style="background:var(--blue)"></i>${esc(m.home.name)}</span><span><i style="background:var(--red)"></i>${esc(m.away.name)}</span></div>
    ${m.stats
      .map((s) => {
        const total = s.home + s.away || 1;
        const hw = (s.home / total) * 100;
        return `<div class="st-row">
        <span class="st-v">${s.home}</span>
        <div class="st-mid"><div class="st-label">${esc(s.label)}</div>
          <div class="st-track"><span class="st-h" style="width:${hw}%"></span><span class="st-a" style="width:${100 - hw}%"></span></div>
        </div>
        <span class="st-v">${s.away}</span>
      </div>`;
      })
      .join('')}
  </div>`;
}

function timeline(m) {
  if (!m.timeline || !m.timeline.length) return '';
  const seen = { home: [], away: [] };
  const marks = m.timeline
    .map((e) => {
      const x = Math.min(100, (e.pos / 97) * 100);
      const prev = seen[e.side];
      const bump = prev.some((px) => Math.abs(px - x) < 13) ? ' tl-bump' : '';
      prev.push(x);
      const dot = e.type === 'red'
        ? '<span class="tl-red"></span>'
        : `<span class="tl-dot ${e.side === 'home' ? 'tl-h' : 'tl-a'}"></span>`;
      return `<div class="tl-ev tl-${e.side}${bump}" style="left:${x}%">${dot}<span class="tl-lbl">${esc(e.label)}</span></div>`;
    })
    .join('');
  return `<div class="tl">
    <div class="tl-head">MATCH TIMELINE <span class="tl-key"><i class="tl-dot tl-a"></i>${esc(m.away.name)} above · <i class="tl-dot tl-h"></i>${esc(m.home.name)} below</span></div>
    <div class="tl-wrap">
      <div class="tl-track">
        ${[15, 30, 45, 60, 75, 90].map((t) => `<span class="tl-tick" style="left:${(t / 97) * 100}%"><i></i>${t === 45 ? 'HT' : t + "'"}</span>`).join('')}
      </div>
      ${marks}
    </div>
  </div>`;
}

/* Full-page match report (pages 2 & 3) */
function reportPage(m, idx, total, pageNo) {
  return `<div class="page">
  ${pageHead(`YESTERDAY'S MATCH REPORTS · ${idx} OF ${total}`, m.stage)}
  <div class="body">
    <div class="card match-card">
      <div class="mc-top">
        <span class="chip" style="background:${m.tagColor}">${icon('bolt', 9)}<span>${esc(m.tag)}</span></span>
        <span class="mc-venue">${icon('pin', 11, '#898781')}${esc(m.venue)}</span>
      </div>
      ${scoreBlock(m)}
      <div class="mc-scorers">${scorerList(m, 'home')}${scorerList(m, 'away')}</div>
      ${(m.events || []).map((e) => `<div class="mc-event">${icon(e.icon, 11)}<span>${esc(e.text)}</span></div>`).join('')}
    </div>

    <div class="rp-grid">
      <div class="rp-text">
        <p class="mc-report">${esc(m.report)}</p>
        <p class="mc-report">${esc(m.report2 || '')}</p>
        ${timeline(m)}
        ${statBars(m)}
      </div>
      <div class="rp-side">
        <div class="star-panel">
          ${photo(m.star.photo, 'star-photo')}
          <div class="star-role">${icon('star', 10, '#eda100')} ${esc(m.star.role).toUpperCase()}</div>
          <div class="star-name">${esc(m.star.name)}</div>
          <p class="star-line">${esc(m.star.line)}</p>
        </div>
        ${m.aside ? `<div class="aside-panel">
          ${photo(m.aside.photo, 'aside-photo')}
          <div><div class="aside-name">${esc(m.aside.name)}</div><p class="aside-line">${esc(m.aside.line)}</p></div>
        </div>` : ''}
      </div>
    </div>

    <div class="fact-row">
      ${(m.facts || []).map((f) => `<div class="fact-chip">${icon(f.icon, 13, '#0d366b')}<span>${esc(f.text)}</span></div>`).join('')}
    </div>

    <div class="wim">${icon('arrow', 13, '#eda100')}<div><b>WHAT IT MEANS&nbsp;&nbsp;</b>${esc(m.whatItMeans)}</div></div>
  </div>
  ${footer(pageNo)}
</div>`;
}

/* --------------------------------------------------- kick-off time zones -- */
const ZONES = [
  { tz: 'Europe/Vienna', flags: ['at', 'es', 'fr'] },
  { tz: 'Europe/Sofia', flags: ['bg'] },
  { tz: 'Asia/Kolkata', flags: ['in'] },
  { tz: 'America/Toronto', flags: ['ca'] },
  { tz: 'America/Mexico_City', flags: ['mx'] },
];
function zoneChips(kickUtc) {
  if (!kickUtc) return '';
  const d = new Date(kickUtc);
  return `<div class="tz-row">${ZONES.map((z) => {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: z.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: z.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const marker = localDate > data.edition ? '+1' : localDate < data.edition ? '−1' : '';
    return `<span class="tz-chip">${z.flags.map((fl) => flag(fl, 'flag flag-xxs')).join('')}<b>${time}</b>${marker ? `<em>${marker}</em>` : ''}</span>`;
  }).join('')}</div>`;
}

function fixtureCard(f) {
  return `<div class="card fixture-card">
    <div class="fx-kicker">${esc(f.kicker)}</div>
    <div class="fx-grid">
      <div class="fx-left">
        <div class="fx-main">
          <div class="fx-team">${flag(f.home.code, 'flag flag-lg')}<span>${esc(f.home.name)}</span></div>
          <div class="fx-vs">VS</div>
          <div class="fx-team fx-away"><span>${esc(f.away.name)}</span>${flag(f.away.code, 'flag flag-lg')}</div>
        </div>
        ${f.kickUtc ? zoneChips(f.kickUtc) : `<span class="time-chip">${icon('clock', 11)}${esc(f.timeFr)}${f.timeFrNote ? `<em>${esc(f.timeFrNote)}</em>` : ''}</span>`}
        <div class="fx-meta">
          <span class="fx-local">Kick-off ${esc(f.timeLocal)} at the stadium</span>
          <span class="fx-venue">${icon('pin', 10, '#898781')}${esc(f.venue)}</span>
        </div>
        <p class="fx-preview">${esc(f.preview)}</p>
        <div class="watch">
          ${(f.watch || []).map((w) => `<div class="watch-item">${icon('eye', 11, '#2a78d6')}<span>${esc(w)}</span></div>`).join('')}
        </div>
      </div>
      ${f.keyMan ? `<div class="keyman">
        ${photo(f.keyMan.photo, 'km-photo')}
        <div class="km-role">KEY MAN · ${esc(f.keyMan.team).toUpperCase()}</div>
        <div class="km-name">${esc(f.keyMan.name)}</div>
        <p class="km-line">${esc(f.keyMan.line)}</p>
      </div>` : ''}
    </div>
  </div>`;
}

function goldenBoot(gb) {
  const max = Math.max(...gb.players.map((p) => p.goals));
  return `<div class="gb">
    ${gb.players
      .map((p, i) => {
        const w = (p.goals / max) * 100;
        return `<div class="gb-row">
        <span class="gb-rank">${i + 1}</span>
        ${flag(p.code, 'flag flag-sm')}
        <span class="gb-name">${esc(p.player)}<em>${esc(p.team)}${p.detail ? ' · ' + esc(p.detail) : ''}</em></span>
        <span class="gb-track"><span class="gb-bar" style="width:${w}%"></span></span>
        <span class="gb-val">${p.goals}</span>
      </div>`;
      })
      .join('')}
    <div class="gb-note">${esc(gb.note)}</div>
  </div>`;
}

function podium(gb) {
  return `<div class="podium">
    ${gb.podium
      .map(
        (p) => `<div class="pd-card">
      <div class="pd-photo-wrap">${photo(p.photo, 'pd-photo')}<span class="pd-goals">${p.goals}</span></div>
      <div class="pd-name">${flag(p.code, 'flag flag-xs')} ${esc(p.player)}</div>
      <p class="pd-line">${esc(p.line)}</p>
    </div>`
      )
      .join('')}
  </div>`;
}

function bracketTeam(t) {
  if (t.codes) return `<span class="bk-flags">${t.codes.map((c) => flag(c, 'flag flag-xs')).join('')}</span><span class="bk-name bk-tbd">${esc(t.name)}</span>`;
  return `${flag(t.code, 'flag flag-xs')}<span class="bk-name">${esc(t.name)}</span>`;
}

function bracket(b) {
  return `<div class="bracket">
    <div class="bk-col">
      <div class="bk-round">QUARTER-FINALS</div>
      ${b.quarterFinals
        .map(
          (q, i) => `<div class="bk-card ${q.confirmed ? '' : 'bk-pending'}">
          <div class="bk-when">QF${i + 1} · ${esc(q.day)} · ${esc(q.timeFr)} · ${esc(q.venue)}</div>
          <div class="bk-row">${bracketTeam(q.home)}</div>
          <div class="bk-row">${bracketTeam(q.away)}</div>
        </div>`
        )
        .join('')}
    </div>
    <div class="bk-col bk-mid">
      <div class="bk-round">SEMI-FINALS</div>
      ${b.semiFinals
        .map(
          (s) => `<div class="bk-card bk-pending bk-sf">
          <div class="bk-when">${esc(s.day)} · ${esc(s.venue)}</div>
          <div class="bk-label">${esc(s.label)}</div>
        </div>`
        )
        .join('')}
    </div>
    <div class="bk-col bk-mid">
      <div class="bk-round">THE FINAL</div>
      <div class="bk-card bk-final">
        ${icon('trophy', 26, '#eda100')}
        <div class="bk-final-day">${esc(b.final.day)}</div>
        <div class="bk-final-venue">${esc(b.final.venue)}</div>
      </div>
    </div>
  </div>`;
}

function weekStrip(week) {
  return `<div class="week">${week
    .map(
      (d) => `<div class="wk-day ${d.highlight ? 'wk-today' : ''}">
      <div class="wk-dow">${esc(d.day)}</div>
      <div class="wk-date">${esc(d.date)}</div>
      ${d.items.map((it) => `<div class="wk-item">${esc(it)}</div>`).join('')}
    </div>`
    )
    .join('')}</div>`;
}

function predictionCard(f) {
  const p = f.prediction;
  if (!p) return '';
  const seg = (cls, pct, lbl) => pct > 0 ? `<span class="pb-seg ${cls}" style="width:${pct}%"><i>${lbl}</i></span>` : '';
  return `<div class="card pred-card">
    <div class="pr-head">
      ${flag(f.home.code, 'flag flag-sm')}<span class="pr-title">${esc(f.home.name)} v ${esc(f.away.name)}</span>${flag(f.away.code, 'flag flag-sm')}
      <span class="pr-call">${icon('star', 10)}OUR CALL: ${esc(p.call).toUpperCase()}</span>
    </div>
    <div class="pb-label">RESULT AFTER 90 MINUTES</div>
    <div class="pb">
      ${seg('pb-h', p.probs.home, p.probs.home + '%')}${seg('pb-d', p.probs.draw, p.probs.draw + '%')}${seg('pb-a', p.probs.away, p.probs.away + '%')}
    </div>
    <div class="pb-legend"><span><i class="pb-h"></i>${esc(f.home.name)} win</span><span><i class="pb-d"></i>Draw</span><span><i class="pb-a"></i>${esc(f.away.name)} win</span></div>
    <div class="pb-label">${esc(p.advanceLabel || 'TO ADVANCE')}</div>
    <div class="pb pb-thin">
      ${seg('pb-h', p.advance.home, esc(f.home.name) + ' ' + p.advance.home + '%')}${seg('pb-a', p.advance.away, esc(f.away.name) + ' ' + p.advance.away + '%')}
    </div>
    ${p.market ? `<div class="pr-market">
      ${icon('bolt', 10, '#1baf7a')}<span class="prm-src">LIVE MARKET · ${esc(p.market.source).toUpperCase()} · ${esc(p.market.volume).toUpperCase()}</span>
      ${p.market.legs.map((l) => `<span class="prm-chip prm-${l.cls}">${esc(l.label)} <b>${l.pct}%</b></span>`).join('')}
    </div>` : ''}
    <div class="pr-factors">
      ${p.factors.map((fa) => `<div class="pr-factor">${icon(fa.icon, 13, '#0d366b')}<div><div class="prf-label">${esc(fa.label)}</div><div class="prf-text">${esc(fa.text)}</div></div></div>`).join('')}
    </div>
    <div class="pr-verdict">${icon('bolt', 12, '#eda100')}<div><b>THE VERDICT&nbsp;&nbsp;</b>${esc(p.verdict)}</div></div>
  </div>`;
}

const sectionHead = (ic, title, sub) => `<div class="sec">
  <span class="sec-ic">${icon(ic, 15, '#fff')}</span>
  <span class="sec-title">${title}</span>
  ${sub ? `<span class="sec-sub">${esc(sub)}</span>` : ''}
</div>`;

/* ------------------------------------------------------------------ CSS -- */
const CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --navy:#0d366b; --blue:#2a78d6; --blue-d:#1c5cab; --red:#e34948; --gold:#eda100;
    --green:#008300; --aqua:#1baf7a;
    --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
    --grid:#e1e0d9; --surface:#fcfcfb; --plane:#f4f4f1;
    --ring:rgba(11,11,11,.10);
  }
  body { font-family:'Liberation Sans','DejaVu Sans',sans-serif; color:var(--ink); background:#fff; }
  .page { width:210mm; height:296.5mm; overflow:hidden; position:relative; background:var(--surface); page-break-after:always; display:flex; flex-direction:column; }
  .page:last-child { page-break-after:auto; }
  .ic { display:inline-flex; flex:none; }
  .ic svg { width:100%; height:100%; }
  .flag { object-fit:cover; border-radius:3px; box-shadow:0 0 0 1px var(--ring); }
  .flag-lg { width:56px; height:40px; border-radius:4px; }
  .flag-sm { width:22px; height:16px; }
  .flag-xs { width:20px; height:14px; }
  .flag-missing { display:inline-block; background:var(--grid); }

  /* masthead (cover) */
  .mast { background:linear-gradient(120deg,#08244a 0%, var(--navy) 45%, var(--blue-d) 100%); color:#fff; padding:30px 34px 24px; position:relative; overflow:hidden; }
  .mast::after { content:''; position:absolute; right:-70px; top:-90px; width:300px; height:300px; border:2px solid rgba(255,255,255,.08); border-radius:50%; }
  .mast::before { content:''; position:absolute; right:40px; top:-90px; width:80px; height:300px; border-left:2px solid rgba(255,255,255,.08); border-right:2px solid rgba(255,255,255,.08); }
  .mast-top { display:flex; align-items:center; gap:8px; font-size:9.5px; letter-spacing:2.5px; color:#b7d3f6; font-weight:bold; }
  .mast h1 { font-size:52px; letter-spacing:-1px; margin:6px 0 4px; line-height:1; }
  .mast h1 .thin { color:#86b6ef; }
  .mast-sub { font-size:11px; color:#cde2fb; display:flex; align-items:center; gap:8px; }
  .mast-badge { position:absolute; right:34px; top:26px; width:64px; height:64px; border-radius:50%; background:rgba(255,255,255,.10); display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 2px rgba(255,255,255,.18); }
  .facts { display:flex; gap:10px; background:var(--navy); padding:0 34px 18px; }
  .fact { flex:1; display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.09); border-radius:7px; padding:8px 11px; color:#e8f0fb; font-size:9.5px; font-weight:bold; }

  .body { padding:22px 34px 0; flex:1; display:flex; flex-direction:column; gap:17px; }

  /* cover hero with photo */
  .hero-grid { display:flex; gap:20px; flex:1; min-height:0; }
  .hero-left { flex:1.15; display:flex; flex-direction:column; }
  .hero-kicker { display:inline-flex; align-items:center; gap:6px; color:var(--red); font-weight:bold; font-size:10.5px; letter-spacing:2.5px; }
  .hero-left h2 { font-size:47px; letter-spacing:-.8px; color:var(--navy); margin:6px 0 10px; line-height:1.0; }
  .hero-left .stand { font-size:13.5px; color:var(--ink2); line-height:1.55; }
  .briefing { margin-top:auto; background:var(--plane); border:1px solid var(--grid); border-radius:10px; padding:13px 15px; }
  .brief-h { font-size:8.5px; font-weight:bold; letter-spacing:2.5px; color:var(--muted); margin-bottom:8px; }
  .brief-row { display:flex; align-items:flex-start; gap:8px; font-size:9.8px; line-height:1.45; color:var(--ink2); padding:4px 0; }
  .inside { margin-top:auto; border-top:3px solid var(--navy); padding-top:12px; }
  .inside-h { font-size:9.5px; font-weight:bold; letter-spacing:2.5px; color:var(--navy); margin-bottom:9px; }
  .inside-row { display:flex; gap:9px; align-items:baseline; padding:5.5px 0; border-bottom:1px solid var(--grid); }
  .inside-row:last-child { border-bottom:none; }
  .inside-pg { font-size:10px; font-weight:bold; color:var(--gold); width:26px; flex:none; }
  .inside-tx { font-size:10.5px; color:var(--ink); line-height:1.35; }
  .hero-right { flex:1; position:relative; border-radius:12px; overflow:hidden; min-height:0; box-shadow:0 2px 8px rgba(11,11,11,.15); }
  .hero-photo { width:100%; height:100%; object-fit:cover; object-position:top; display:block; }
  .hero-cap { position:absolute; left:0; right:0; bottom:0; padding:26px 14px 11px; background:linear-gradient(transparent, rgba(4,16,34,.88)); color:#fff; font-size:9.5px; font-weight:bold; }

  /* cards */
  .card { background:#fff; border:1px solid var(--grid); border-radius:10px; padding:16px 20px; box-shadow:0 1px 3px rgba(11,11,11,.05); }
  .chip { display:inline-flex; align-items:center; gap:4px; color:#fff; font-size:8px; font-weight:bold; letter-spacing:1.5px; border-radius:20px; padding:3px 9px; }
  .mc-top { display:flex; align-items:center; gap:10px; font-size:9.5px; color:var(--muted); }
  .mc-venue { margin-left:auto; display:inline-flex; align-items:center; gap:4px; }
  .mc-main { display:flex; align-items:center; margin:10px 0 2px; }
  .team { flex:1; display:flex; align-items:center; gap:12px; }
  .team.away { flex-direction:row-reverse; }
  .team-name { font-size:21px; font-weight:bold; }
  .score { display:flex; align-items:baseline; gap:8px; padding:0 18px; position:relative; }
  .s-n { font-size:48px; font-weight:bold; color:var(--navy); line-height:.9; }
  .s-d { font-size:22px; color:var(--muted); }
  .ft { position:absolute; left:50%; transform:translateX(-50%); bottom:-11px; font-size:6.5px; letter-spacing:2px; color:var(--muted); font-weight:bold; white-space:nowrap; }
  .mc-scorers { display:flex; margin-top:14px; padding-top:9px; border-top:1px solid var(--grid); }
  .scorers { flex:1; display:flex; flex-direction:column; gap:3px; }
  .scorers.away { align-items:flex-end; }
  .scorer { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; }
  .sc-name { font-weight:bold; }
  .sc-min { color:var(--muted); }
  .mc-event { display:flex; align-items:center; gap:6px; font-size:9.5px; color:#a33; background:#fdf1f1; border-radius:6px; padding:5px 10px; margin-top:9px; }
  .mc-report { font-size:12px; line-height:1.75; color:var(--ink2); }

  /* report page grid */
  .rp-grid { display:flex; gap:16px; }
  .rp-text { flex:1.5; display:flex; flex-direction:column; gap:11px; }
  .rp-side { flex:1; display:flex; flex-direction:column; gap:12px; min-width:0; }
  .rp-side .star-panel { flex:1; display:flex; flex-direction:column; }
  .star-panel { background:linear-gradient(160deg,#08244a,var(--navy)); border-radius:12px; overflow:hidden; color:#fff; }
  .star-photo { width:100%; height:210px; flex:1; min-height:210px; object-fit:cover; object-position:top; display:block; }
  .star-role { display:flex; align-items:center; gap:5px; font-size:8px; font-weight:bold; letter-spacing:2px; color:#eda100; padding:10px 14px 0; }
  .star-name { font-size:17px; font-weight:bold; padding:3px 14px 0; }
  .star-line { font-size:9.5px; line-height:1.5; color:#cde2fb; padding:5px 14px 13px; }
  .aside-panel { display:flex; gap:11px; background:var(--plane); border:1px solid var(--grid); border-radius:10px; padding:11px; align-items:flex-start; }
  .aside-photo { width:64px; height:76px; object-fit:cover; object-position:top; border-radius:7px; flex:none; }
  .aside-name { font-size:11px; font-weight:bold; }
  .aside-line { font-size:9.6px; line-height:1.45; color:var(--ink2); margin-top:2px; }

  /* stat bars */
  .stats { border-top:1px solid var(--grid); padding-top:12px; }
  .st-legend { display:flex; justify-content:space-between; font-size:8.5px; font-weight:bold; color:var(--ink2); margin-bottom:7px; }
  .st-legend i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; }
  .st-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
  .st-v { width:34px; font-size:12.5px; font-weight:bold; color:var(--navy); font-variant-numeric:tabular-nums; text-align:center; }
  .st-mid { flex:1; }
  .st-label { text-align:center; font-size:7.8px; letter-spacing:1.2px; font-weight:bold; color:var(--muted); margin-bottom:2.5px; }
  .st-track { display:flex; height:11px; border-radius:4px; overflow:hidden; background:var(--plane); }
  .st-h { background:var(--blue); border-right:2px solid #fff; }
  .st-a { background:var(--red); }

  /* match timeline */
  .tl { border-top:1px solid var(--grid); padding-top:12px; }
  .tl-head { font-size:8px; font-weight:bold; letter-spacing:2px; color:var(--muted); margin-bottom:34px; display:flex; }
  .tl-key { margin-left:auto; letter-spacing:.3px; font-weight:normal; display:inline-flex; align-items:center; gap:4px; }
  .tl-key .tl-dot { position:static; display:inline-block; width:7px; height:7px; }
  .tl-wrap { position:relative; height:86px; }
  .tl-track { position:absolute; top:38px; left:0; right:0; height:5px; background:var(--grid); border-radius:3px; }
  .tl-tick { position:absolute; top:9px; font-size:6.8px; color:var(--muted); transform:translateX(-50%); }
  .tl-tick i { display:block; width:1px; height:5px; background:#c3c2b7; margin:-7px auto 2px; }
  .tl-ev { position:absolute; transform:translateX(-50%); text-align:center; }
  .tl-dot { display:block; width:11px; height:11px; border-radius:50%; margin:0 auto; box-shadow:0 0 0 2px #fff; }
  .tl-h { background:var(--blue); } .tl-a { background:var(--red); }
  .tl-red { display:block; width:8px; height:11px; border-radius:2px; background:#d03b3b; margin:0 auto; box-shadow:0 0 0 2px #fff; transform:rotate(8deg); }
  .tl-away { top:35px; } .tl-away .tl-lbl { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); }
  .tl-away.tl-bump .tl-lbl { bottom:30px; }
  .tl-home { top:35px; } .tl-home .tl-lbl { position:absolute; top:16px; left:50%; transform:translateX(-50%); }
  .tl-home.tl-bump .tl-lbl { top:30px; }
  .tl-lbl { font-size:7.6px; font-weight:bold; color:var(--ink2); white-space:nowrap; }

  /* fact chips + what it means */
  .fact-row { display:flex; gap:10px; }
  .fact-chip { flex:1; display:flex; align-items:flex-start; gap:8px; background:#fff; border:1px solid var(--grid); border-left:4px solid var(--gold); border-radius:8px; padding:13px 14px; font-size:9.6px; line-height:1.4; color:var(--ink2); }
  .fact-chip:nth-child(2) { border-left-color:var(--red); }
  .fact-chip:nth-child(3) { border-left-color:var(--aqua); }
  .wim { display:flex; align-items:center; gap:10px; background:#fffaf0; border:1px solid #f3ddaa; border-radius:10px; padding:12px 16px; font-size:10.5px; color:var(--ink); }
  .wim b { letter-spacing:1.5px; font-size:9px; color:var(--gold); }

  /* earlier strip */
  .earlier { display:flex; flex-wrap:wrap; gap:10px; }
  .early { flex:1 1 44%; display:flex; align-items:center; gap:8px; background:var(--plane); border:1px solid var(--grid); border-radius:8px; padding:12px 14px; font-size:11px; }
  .early b { font-size:13px; }
  .early .e-score { font-weight:bold; color:var(--navy); font-size:13px; margin:0 4px; }
  .early .e-note { margin-left:auto; color:var(--muted); font-size:8.5px; }

  /* section heads */
  .sec { display:flex; align-items:center; gap:9px; margin-top:2px; }
  .sec-ic { width:26px; height:26px; border-radius:7px; background:var(--navy); display:flex; align-items:center; justify-content:center; }
  .sec-title { font-size:19px; font-weight:bold; letter-spacing:.5px; color:var(--navy); }
  .sec-sub { margin-left:auto; font-size:9px; color:var(--muted); font-weight:bold; letter-spacing:1px; }

  /* fixtures */
  .fx-kicker { font-size:9px; font-weight:bold; letter-spacing:2px; color:var(--blue); }
  .fx-grid { display:flex; gap:18px; }
  .fx-left { flex:1.6; }
  .fx-main { display:flex; align-items:center; margin:11px 0; }
  .fx-team { flex:1; display:flex; align-items:center; gap:12px; font-size:19px; font-weight:bold; }
  .fx-away { justify-content:flex-end; }
  .fx-vs { font-size:11px; font-weight:bold; color:#fff; background:var(--red); border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; margin:0 14px; flex:none; }
  .fx-meta { display:flex; align-items:center; gap:10px; font-size:9px; color:var(--muted); }
  .time-chip { display:inline-flex; align-items:center; gap:5px; background:var(--navy); color:#fff; font-weight:bold; font-size:12px; border-radius:6px; padding:4px 10px; }
  .time-chip em { font-style:normal; font-size:7.5px; color:#9ec5f4; font-weight:normal; }
  .fx-venue { display:inline-flex; align-items:center; gap:4px; margin-left:auto; }
  .fx-preview { font-size:11.2px; line-height:1.65; color:var(--ink2); margin-top:9px; }
  .watch { margin-top:9px; display:flex; flex-direction:column; gap:4px; }
  .watch-item { display:flex; align-items:flex-start; gap:6px; font-size:10px; color:var(--ink); font-weight:bold; }
  .keyman { flex:1; background:var(--plane); border:1px solid var(--grid); border-radius:11px; overflow:hidden; display:flex; flex-direction:column; }
  .km-photo { width:100%; height:185px; object-fit:cover; object-position:top; display:block; }
  .km-role { font-size:7.5px; font-weight:bold; letter-spacing:2px; color:var(--blue); padding:9px 12px 0; }
  .km-name { font-size:14px; font-weight:bold; padding:2px 12px 0; }
  .km-line { font-size:9.6px; line-height:1.45; color:var(--ink2); padding:4px 12px 11px; }

  /* kick-off zone chips */
  .flag-xxs { width:15px; height:11px; border-radius:2px; }
  .tz-row { display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 9px; }
  .tz-chip { display:inline-flex; align-items:center; gap:4px; background:var(--navy); color:#fff; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:bold; }
  .tz-chip b { font-variant-numeric:tabular-nums; }
  .tz-chip em { font-style:normal; font-size:8px; font-weight:bold; color:#eda100; }

  /* crystal ball predictions */
  .pred-card { display:flex; flex-direction:column; gap:8px; }
  .pr-head { display:flex; align-items:center; gap:9px; }
  .pr-title { font-size:16px; font-weight:bold; }
  .pr-call { margin-left:auto; display:inline-flex; align-items:center; gap:5px; background:var(--gold); color:#fff; font-size:10px; font-weight:bold; letter-spacing:1px; border-radius:20px; padding:5px 12px; }
  .pb-label { font-size:7.8px; font-weight:bold; letter-spacing:1.8px; color:var(--muted); margin-top:3px; }
  .pb { display:flex; height:24px; border-radius:6px; overflow:hidden; }
  .pb-thin { height:17px; }
  .pb-seg { display:flex; align-items:center; justify-content:center; }
  .pb-seg + .pb-seg { border-left:2px solid #fff; }
  .pb-seg i { font-style:normal; font-size:9.5px; font-weight:bold; color:#fff; white-space:nowrap; }
  .pb-seg.pb-h { background:var(--blue); }
  .pb-seg.pb-d { background:#c9c8bf; } .pb-seg.pb-d i { color:var(--ink); }
  .pb-seg.pb-a { background:var(--red); }
  .pb-legend { display:flex; gap:16px; font-size:8.5px; color:var(--ink2); font-weight:bold; margin-top:2px; }
  .pb-legend i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; }
  .pb-legend i.pb-h { background:var(--blue); } .pb-legend i.pb-d { background:#c9c8bf; } .pb-legend i.pb-a { background:var(--red); }
  .pr-market { display:flex; align-items:center; gap:7px; background:#f0faf5; border:1px solid #bfe8d4; border-radius:8px; padding:7px 11px; margin-top:3px; }
  .prm-src { font-size:7.5px; font-weight:bold; letter-spacing:1.2px; color:#0e7a52; margin-right:auto; }
  .prm-chip { font-size:9px; color:var(--ink2); background:#fff; border:1px solid var(--grid); border-radius:12px; padding:2.5px 8px; }
  .prm-chip b { color:var(--ink); }
  .prm-chip.prm-h b { color:var(--blue); } .prm-chip.prm-a b { color:var(--red); }
  .pr-factors { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:4px; }
  .pr-factor { display:flex; gap:8px; align-items:flex-start; background:var(--plane); border:1px solid var(--grid); border-radius:8px; padding:9px 11px; }
  .prf-label { font-size:8px; font-weight:bold; letter-spacing:1.5px; color:var(--blue); }
  .prf-text { font-size:9.2px; line-height:1.45; color:var(--ink2); margin-top:2px; }
  .pr-verdict { display:flex; align-items:center; gap:9px; background:#fffaf0; border:1px solid #f3ddaa; border-radius:8px; padding:10px 13px; font-size:9.8px; }
  .pr-verdict b { letter-spacing:1.5px; font-size:8.5px; color:var(--gold); }
  .pred-disclaimer { font-size:8px; color:var(--muted); font-style:italic; text-align:center; padding:0 20px; }

  /* golden boot */
  .podium { display:flex; gap:12px; }
  .pd-card { flex:1; background:#fff; border:1px solid var(--grid); border-radius:11px; overflow:hidden; box-shadow:0 1px 3px rgba(11,11,11,.05); }
  .pd-photo-wrap { position:relative; }
  .pd-photo { width:100%; height:205px; object-fit:cover; object-position:top; display:block; }
  .pd-goals { position:absolute; right:9px; bottom:-13px; width:34px; height:34px; border-radius:50%; background:var(--gold); color:#fff; font-size:16px; font-weight:bold; display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 3px #fff; }
  .pd-name { display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:bold; padding:12px 14px 0; }
  .pd-line { font-size:9.6px; line-height:1.45; color:var(--ink2); padding:4px 12px 12px; }
  .gb { display:flex; flex-direction:column; gap:13px; }
  .gb-row { display:flex; align-items:center; gap:8px; }
  .gb-rank { width:14px; font-size:9px; font-weight:bold; color:var(--muted); text-align:right; }
  .gb-name { width:210px; font-size:12.5px; font-weight:bold; white-space:nowrap; }
  .gb-name em { display:block; font-style:normal; font-weight:normal; font-size:8.8px; color:var(--muted); }
  .gb-track { flex:1; height:19px; background:var(--plane); border-radius:0 4px 4px 0; overflow:hidden; }
  .gb-bar { display:block; height:100%; background:var(--blue); border-radius:0 4px 4px 0; box-shadow:inset -1px 0 0 rgba(255,255,255,.5); }
  .gb-val { width:18px; font-size:14px; font-weight:bold; color:var(--navy); font-variant-numeric:tabular-nums; }
  .gb-note { font-size:8.5px; color:var(--muted); margin-top:3px; padding-left:22px; }

  /* stat tiles */
  .tiles { display:flex; gap:12px; }
  .tile { flex:1; background:#fff; border:1px solid var(--grid); border-radius:10px; padding:20px 18px 18px; border-top:4px solid var(--gold); box-shadow:0 1px 3px rgba(11,11,11,.05); }
  .tile:nth-child(2) { border-top-color:var(--red); }
  .tile:nth-child(3) { border-top-color:var(--aqua); }
  .tile:nth-child(4) { border-top-color:var(--blue); }
  .tile-v { font-size:34px; font-weight:bold; color:var(--navy); letter-spacing:-.5px; }
  .tile-l { font-size:9.8px; color:var(--ink2); line-height:1.4; margin-top:3px; }

  /* teaser bar (cover) */
  .teaser { background:linear-gradient(120deg,#08244a, var(--navy)); color:#fff; border-radius:10px; padding:14px 20px; display:flex; align-items:center; gap:14px; }
  .teaser-k { font-size:9px; font-weight:bold; letter-spacing:2px; color:#eda100; white-space:nowrap; }
  .teaser-m { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:bold; }
  .teaser-m .t-time { background:rgba(255,255,255,.14); border-radius:5px; padding:2px 8px; font-size:10px; color:#cde2fb; }
  .teaser-arrow { margin-left:auto; display:flex; align-items:center; gap:6px; font-size:8.5px; letter-spacing:1.5px; color:#9ec5f4; font-weight:bold; }

  /* stage tracker */
  .tracker { display:flex; align-items:flex-start; gap:0; padding:4px 0 0; }
  .trk { flex:1; text-align:center; position:relative; }
  .trk::before { content:''; position:absolute; top:9px; left:0; right:0; height:3px; background:var(--grid); }
  .trk:first-child::before { left:50%; } .trk:last-child::before { right:50%; }
  .trk.done::before { background:var(--aqua); }
  .trk.current::before { background:linear-gradient(90deg, var(--aqua) 0 50%, var(--grid) 50%); }
  .trk-dot { position:relative; width:13px; height:13px; margin:3px auto 6px; border-radius:50%; background:#fff; border:3px solid var(--grid); }
  .trk.done .trk-dot { background:var(--aqua); border-color:var(--aqua); }
  .trk.current .trk-dot { background:#fff; border-color:var(--navy); width:15px; height:15px; margin-top:2px; box-shadow:0 0 0 3px rgba(42,120,214,.25); }
  .trk-label { font-size:8px; font-weight:bold; letter-spacing:1px; color:var(--muted); }
  .trk.done .trk-label, .trk.current .trk-label { color:var(--ink); }
  .trk.current .trk-label { color:var(--navy); }
  .trk-sub { font-size:7.2px; color:var(--muted); margin-top:1px; }

  /* bracket */
  .bracket { display:flex; gap:14px; align-items:stretch; }
  .bk-col { flex:1.25; display:flex; flex-direction:column; gap:8px; }
  .bk-col.bk-mid { flex:1; justify-content:space-around; }
  .bk-round { font-size:8.5px; font-weight:bold; letter-spacing:2px; color:var(--muted); margin-bottom:1px; }
  .bk-card { background:#fff; border:1px solid var(--grid); border-radius:8px; padding:14px 15px; box-shadow:0 1px 2px rgba(11,11,11,.04); }
  .bk-when { font-size:8.2px; color:var(--muted); font-weight:bold; letter-spacing:.8px; margin-bottom:4px; }
  .bk-row { display:flex; align-items:center; gap:7px; padding:4.5px 0; }
  .bk-name { font-size:12.5px; font-weight:bold; }
  .bk-tbd { color:var(--ink2); font-weight:normal; font-size:9.5px; }
  .bk-flags { display:inline-flex; gap:3px; }
  .bk-pending { background:var(--plane); border-style:dashed; }
  .bk-sf { padding:10px; }
  .bk-label { font-size:9.5px; color:var(--ink2); }
  .bk-final { border:2px solid var(--gold); background:#fffaf0; text-align:center; padding:34px 12px; display:flex; flex-direction:column; align-items:center; gap:5px; }
  .bk-final-day { font-size:15px; font-weight:bold; color:var(--navy); }
  .bk-final-venue { font-size:8.5px; color:var(--ink2); }

  /* week strip */
  .week { display:flex; gap:7px; }
  .wk-day { flex:1; border:1px solid var(--grid); border-radius:8px; padding:13px 10px 14px; background:#fff; }
  .wk-today { background:var(--navy); border-color:var(--navy); color:#fff; }
  .wk-dow { font-size:8.5px; font-weight:bold; letter-spacing:1.5px; color:var(--blue); }
  .wk-today .wk-dow { color:#86b6ef; }
  .wk-date { font-size:13px; font-weight:bold; margin:1px 0 7px; }
  .wk-item { font-size:8.8px; line-height:1.35; color:var(--ink2); padding:2px 0; border-top:1px solid var(--grid); }
  .wk-today .wk-item { color:#e8f0fb; border-top-color:rgba(255,255,255,.2); }

  /* page furniture */
  .pg-head { background:var(--navy); color:#fff; padding:12px 34px; display:flex; align-items:center; gap:10px; }
  .pg-head .ph-title { font-size:13px; font-weight:bold; letter-spacing:3px; }
  .pg-head .ph-right { margin-left:auto; font-size:9px; color:#9ec5f4; letter-spacing:1px; }
  .foot { margin-top:auto; padding:10px 34px 14px; display:flex; align-items:center; gap:8px; font-size:7.5px; color:var(--muted); border-top:1px solid var(--grid); }
  .foot .f-brand { font-weight:bold; letter-spacing:1.5px; color:var(--ink2); }
  .foot .f-page { margin-left:auto; font-weight:bold; }
  .credits { font-size:7.5px; color:var(--muted); text-align:center; padding:0 34px 4px; }
  .signoff { background:linear-gradient(120deg,#08244a, var(--navy)); color:#fff; border-radius:10px; padding:26px 24px; display:flex; align-items:center; gap:12px; }
  .signoff b { font-size:14px; }
  .signoff span { font-size:9.5px; color:#cde2fb; }
`;

/* ----------------------------------------------------------------- HTML -- */
const HAS_PREDICTIONS = (data.today || []).some((f) => f.prediction);
const PAGE_COUNT = (HAS_PREDICTIONS ? 5 : 4) + data.yesterday.length;
function footer(pageNo) {
  return `<div class="foot">
    ${icon('ball', 10, '#898781')}
    <span class="f-brand">THE MORNING KICKOFF</span>
    <span>${esc(data.dateLabel)} · Edition #${data.editionNumber} · ${esc(data.sources)}</span>
    <span class="f-page">${pageNo} / ${PAGE_COUNT}</span>
  </div>`;
}

const pageHead = (title, right) => `<div class="pg-head">
  ${icon('ball', 16, '#86b6ef')}
  <span class="ph-title">${title}</span>
  <span class="ph-right">${esc(right)}</span>
</div>`;

const coverPage = `<div class="page">
  <div class="mast">
    <div class="mast-top">${icon('whistle', 13)}<span>YOUR DAILY WORLD CUP BRIEF · ${esc(data.dateLabel).toUpperCase()} · EDITION #${data.editionNumber}</span></div>
    <h1>THE MORNING <span class="thin">KICKOFF</span></h1>
    <div class="mast-sub">${icon('trophy', 12, '#eda100')}<span>${esc(data.tournament)}</span><span>·</span><span>${esc(data.stageLabel)}</span></div>
    <div class="mast-badge">${icon('ball', 36, '#fff')}</div>
  </div>
  <div class="facts">
    ${data.quickFacts.map((f) => `<div class="fact">${icon(f.icon, 14, '#eda100')}<span>${esc(f.text)}</span></div>`).join('')}
  </div>
  <div class="body">
    <div class="hero-grid">
      <div class="hero-left">
        <span class="hero-kicker">${icon('bolt', 11)}${esc(data.hero.kicker)}</span>
        <h2>${esc(data.hero.headline)}</h2>
        <p class="stand">${esc(data.hero.standfirst)}</p>
        <div class="briefing">
          <div class="brief-h">ALSO THIS MORNING</div>
          ${(data.hero.briefing || []).map((b) => `<div class="brief-row">${icon(b.icon, 13, '#2a78d6')}<span>${esc(b.text)}</span></div>`).join('')}
        </div>
        <div class="inside">
          <div class="inside-h">INSIDE TODAY'S EDITION</div>
          ${data.insideToday.map((r) => `<div class="inside-row"><span class="inside-pg">${esc(r.page)}</span><span class="inside-tx">${esc(r.text)}</span></div>`).join('')}
        </div>
      </div>
      <div class="hero-right">
        ${photo(data.hero.photo, 'hero-photo')}
        <div class="hero-cap">${esc(data.hero.photoCaption)}</div>
      </div>
    </div>
    <div class="teaser">
      <span class="teaser-k">TONIGHT (CENTRAL EUROPE)</span>
      ${data.today.map((f) => `<span class="teaser-m">${flag(f.home.code, 'flag flag-sm')} ${esc(f.home.name)} – ${esc(f.away.name)} ${flag(f.away.code, 'flag flag-sm')} <span class="t-time">${esc(f.timeFr)}</span></span>`).join('')}
      <span class="teaser-arrow">FULL PREVIEWS PAGE ${2 + data.yesterday.length} ${icon('arrow', 12)}</span>
    </div>
  </div>
  ${footer(1)}
</div>`;

const reportPages = data.yesterday
  .map((m, i) => reportPage(m, i + 1, data.yesterday.length, 2 + i))
  .join('');

const todayPage = `<div class="page">
  ${pageHead(data.todayTitle || 'TODAY ON THE PITCH', data.todaySub || '')}
  <div class="body">
    ${data.today.map(fixtureCard).join('')}
    ${!(data.earlier || []).length ? '' : sectionHead('ball', data.earlierTitle || 'EARLIER RESULTS', data.earlierSub || '')}
    <div class="earlier">
      ${data.earlier
        .map(
          (e) => `<div class="early">
        ${flag(e.home.code, 'flag flag-sm')}<b>${esc(e.home.name)}</b>
        <span class="e-score">${e.home.score} – ${e.away.score}</span>
        <b>${esc(e.away.name)}</b>${flag(e.away.code, 'flag flag-sm')}
        <span class="e-note">${esc(e.note)}</span>
      </div>`
        )
        .join('')}
    </div>
    <div class="teaser">
      <span class="teaser-k">${esc(data.tomorrowLabel || 'TOMORROW')}</span>
      ${(data.tomorrow || []).map((f) => `<span class="teaser-m">${flag(f.home.code, 'flag flag-sm')} ${esc(f.home.name)} – ${esc(f.away.name)} ${flag(f.away.code, 'flag flag-sm')} <span class="t-time">${esc(f.timeFr)}</span></span>`).join('')}
    </div>
  </div>
  ${footer(2 + data.yesterday.length)}
</div>`;

const predictionsPage = !HAS_PREDICTIONS ? '' : `<div class="page">
  ${pageHead('THE CRYSTAL BALL', "Tonight's calls — for family bragging rights only")}
  <div class="body">
    ${data.today.map(predictionCard).join('')}
    <div class="pred-disclaimer">${esc(data.predictionsDisclaimer || '')}</div>
  </div>
  ${footer(3 + data.yesterday.length)}
</div>`;

const statsPage = `<div class="page">
  ${pageHead('THE GOLDEN BOOT RACE', data.goldenBoot.sub || '')}
  <div class="body">
    ${podium(data.goldenBoot)}
    <div class="card">${goldenBoot(data.goldenBoot)}</div>
    ${sectionHead('bolt', 'NUMBERS OF THE DAY', '')}
    <div class="tiles">
      ${data.statTiles.map((t) => `<div class="tile"><div class="tile-v">${esc(t.value)}</div><div class="tile-l">${esc(t.label)}</div></div>`).join('')}
    </div>
  </div>
  ${footer((HAS_PREDICTIONS ? 4 : 3) + data.yesterday.length)}
</div>`;

const roadPage = `<div class="page">
  ${pageHead('THE ROAD TO THE FINAL', 'All kick-off times in Central European time (CEST)')}
  <div class="body">
    <div class="card"><div class="tracker">
      ${data.stageTracker.stages.map((t) => `<div class="trk ${t.state}"><div class="trk-dot"></div><div class="trk-label">${esc(t.label)}</div><div class="trk-sub">${esc(t.sub)}</div></div>`).join('')}
    </div></div>
    ${sectionHead('bracket', 'KNOCKOUT BRACKET', 'Quarter-finals 9–12 July · Semi-finals 14–15 July')}
    ${bracket(data.bracket)}
    ${sectionHead('calendar', 'YOUR WEEK IN FOOTBALL', data.weekSub || '')}
    ${weekStrip(data.week)}
    <div class="signoff">
      ${icon('ball', 26, '#eda100')}
      <div><b>See you tomorrow morning.</b><br><span>${esc(data.signoff)}</span></div>
    </div>
  </div>
  <div class="credits">__PHOTO_CREDITS__</div>
  ${footer((HAS_PREDICTIONS ? 5 : 4) + data.yesterday.length)}
</div>`;

let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
${coverPage}
${reportPages}
${todayPage}
${predictionsPage}
${statsPage}
${roadPage}
</body></html>`;
html = html.replace('__PHOTO_CREDITS__', esc(photoCredits()));

/* --------------------------------------------------------------- render -- */
(async () => {
  const htmlPath = path.join(OUT_DIR, `brief-${data.edition}.html`);
  fs.writeFileSync(htmlPath, html);

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });

  const pdfPath = path.join(OUT_DIR, `morning-kickoff-${data.edition}.pdf`);
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });

  // per-page PNG previews for visual verification
  const pages = await page.$$('.page');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: path.join(OUT_DIR, `preview-${data.edition}-p${i + 1}.png`) });
  }
  await browser.close();
  console.log('PDF:', pdfPath, `(${pages.length} pages)`);
})();
