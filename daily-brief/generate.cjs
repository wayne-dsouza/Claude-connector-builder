#!/usr/bin/env node
/**
 * The Morning Kickoff — daily FIFA World Cup 26 PDF brochure generator.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node daily-brief/generate.js daily-brief/data/2026-07-06.json
 *
 * Reads an edition JSON file, builds a 3-page A4 HTML brochure (flags inlined
 * as data URIs, all icons inline SVG — fully self-contained), renders it to
 * PDF with Playwright/Chromium, and writes per-page PNG previews next to it.
 *
 * Flag images are public-domain national flags served by flagcdn.com, cached
 * in assets/flags/. No trademarked marks (FIFA logos, emblems) are used.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const dataFile = process.argv[2] || path.join(ROOT, 'data', new Date().toISOString().slice(0, 10) + '.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const OUT_DIR = path.join(ROOT, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------------------------------------------------------------- flags -- */
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
  tv: S('<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M9 21.5h6"/>'),
  arrow: S('<path d="M5 12h13M13 6.5L18.5 12 13 17.5"/>'),
};
const icon = (name, sz, color) =>
  `<span class="ic" style="width:${sz}px;height:${sz}px;${color ? `color:${color};` : ''}">${ICONS[name] || ''}</span>`;

/* -------------------------------------------------------------- helpers -- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function teamCell(t, side) {
  return `<div class="team ${side}">
    ${flag(t.code, 'flag flag-lg')}
    <div class="team-name">${esc(t.name)}</div>
  </div>`;
}

function scorerList(m, side) {
  const rows = (m.scorers || []).filter((s) => s.side === side);
  if (!rows.length) return '<div class="scorers"></div>';
  return `<div class="scorers ${side}">${rows
    .map(
      (s) => `<div class="scorer">${icon('ball', 9, '#898781')}<span class="sc-name">${esc(s.player)}</span><span class="sc-min">${esc(s.minute)}${s.note ? ' · ' + esc(s.note) : ''}</span></div>`
    )
    .join('')}</div>`;
}

function matchCard(m) {
  return `<div class="card match-card">
    <div class="mc-top">
      <span class="chip" style="background:${m.tagColor}">${icon('bolt', 9)}<span>${esc(m.tag)}</span></span>
      <span class="mc-stage">${esc(m.stage)}</span>
      <span class="mc-venue">${icon('pin', 10, '#898781')}${esc(m.venue)}</span>
    </div>
    <div class="mc-main">
      ${teamCell(m.home, 'home')}
      <div class="score"><span class="s-n">${m.home.score}</span><span class="s-d">–</span><span class="s-n">${m.away.score}</span><div class="ft">FULL TIME</div></div>
      ${teamCell(m.away, 'away')}
    </div>
    <div class="mc-scorers">${scorerList(m, 'home')}${scorerList(m, 'away')}</div>
    ${(m.events || [])
      .map((e) => `<div class="mc-event">${icon(e.icon, 11)}<span>${esc(e.text)}</span></div>`)
      .join('')}
    <p class="mc-report">${esc(m.report)}</p>
  </div>`;
}

function fixtureCard(f) {
  return `<div class="card fixture-card">
    <div class="fx-kicker">${esc(f.kicker)}</div>
    <div class="fx-main">
      <div class="fx-team">${flag(f.home.code, 'flag flag-lg')}<span>${esc(f.home.name)}</span></div>
      <div class="fx-vs">VS</div>
      <div class="fx-team fx-away"><span>${esc(f.away.name)}</span>${flag(f.away.code, 'flag flag-lg')}</div>
    </div>
    <div class="fx-meta">
      <span class="time-chip">${icon('clock', 11)}${esc(f.timeFr)}${f.timeFrNote ? `<em>${esc(f.timeFrNote)}</em>` : ''}</span>
      <span class="fx-local">${esc(f.timeLocal)} local</span>
      <span class="fx-venue">${icon('pin', 10, '#898781')}${esc(f.venue)}</span>
    </div>
    <p class="fx-preview">${esc(f.preview)}</p>
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

  /* masthead */
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

  /* hero */
  .hero-kicker { display:inline-flex; align-items:center; gap:6px; color:var(--red); font-weight:bold; font-size:10px; letter-spacing:2.5px; }
  .hero h2 { font-size:42px; letter-spacing:-.5px; color:var(--navy); margin:3px 0 6px; line-height:1.02; }
  .hero p { font-size:12.5px; color:var(--ink2); line-height:1.45; max-width:640px; }

  /* cards */
  .card { background:#fff; border:1px solid var(--grid); border-radius:10px; padding:16px 20px; box-shadow:0 1px 3px rgba(11,11,11,.05); }
  .chip { display:inline-flex; align-items:center; gap:4px; color:#fff; font-size:8px; font-weight:bold; letter-spacing:1.5px; border-radius:20px; padding:3px 9px; }
  .mc-top { display:flex; align-items:center; gap:10px; font-size:9.5px; color:var(--muted); }
  .mc-stage { font-weight:bold; letter-spacing:1px; }
  .mc-venue { margin-left:auto; display:inline-flex; align-items:center; gap:4px; }
  .mc-main { display:flex; align-items:center; margin:10px 0 2px; }
  .team { flex:1; display:flex; align-items:center; gap:10px; }
  .team.away { flex-direction:row-reverse; }
  .team-name { font-size:19px; font-weight:bold; }
  .score { display:flex; align-items:baseline; gap:7px; padding:0 18px; position:relative; flex-direction:row; }
  .s-n { font-size:46px; font-weight:bold; color:var(--navy); line-height:.9; }
  .s-d { font-size:22px; color:var(--muted); }
  .ft { position:absolute; left:50%; transform:translateX(-50%); bottom:-11px; font-size:6.5px; letter-spacing:2px; color:var(--muted); font-weight:bold; white-space:nowrap; }
  .mc-scorers { display:flex; margin-top:12px; padding-top:8px; border-top:1px solid var(--grid); }
  .scorers { flex:1; display:flex; flex-direction:column; gap:3px; }
  .scorers.away { align-items:flex-end; }
  .scorer { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; }
  .sc-name { font-weight:bold; }
  .sc-min { color:var(--muted); }
  .mc-event { display:flex; align-items:center; gap:6px; font-size:9px; color:#a33; background:#fdf1f1; border-radius:6px; padding:4px 9px; margin-top:8px; }
  .mc-report { font-size:10.6px; line-height:1.5; color:var(--ink2); margin-top:9px; }

  /* earlier strip */
  .earlier { display:flex; gap:10px; }
  .early { flex:1; display:flex; align-items:center; gap:8px; background:var(--plane); border:1px solid var(--grid); border-radius:8px; padding:12px 14px; font-size:11px; }
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
  .fx-main { display:flex; align-items:center; margin:11px 0; }
  .fx-team { flex:1; display:flex; align-items:center; gap:12px; font-size:20px; font-weight:bold; }
  .fx-away { justify-content:flex-end; }
  .fx-vs { font-size:11px; font-weight:bold; color:#fff; background:var(--red); border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; margin:0 14px; }
  .fx-meta { display:flex; align-items:center; gap:10px; font-size:9px; color:var(--muted); }
  .time-chip { display:inline-flex; align-items:center; gap:5px; background:var(--navy); color:#fff; font-weight:bold; font-size:12px; border-radius:6px; padding:4px 10px; }
  .time-chip em { font-style:normal; font-size:7.5px; color:#9ec5f4; font-weight:normal; }
  .fx-venue { display:inline-flex; align-items:center; gap:4px; margin-left:auto; }
  .fx-preview { font-size:10.6px; line-height:1.5; color:var(--ink2); margin-top:8px; }

  /* golden boot */
  .gb { display:flex; flex-direction:column; gap:9px; }
  .gb-row { display:flex; align-items:center; gap:8px; }
  .gb-rank { width:14px; font-size:9px; font-weight:bold; color:var(--muted); text-align:right; }
  .gb-name { width:195px; font-size:11.5px; font-weight:bold; white-space:nowrap; }
  .gb-name em { display:block; font-style:normal; font-weight:normal; font-size:8px; color:var(--muted); }
  .gb-track { flex:1; height:16px; background:var(--plane); border-radius:0 4px 4px 0; overflow:hidden; }
  .gb-bar { display:block; height:100%; background:var(--blue); border-radius:0 4px 4px 0; box-shadow:inset -1px 0 0 rgba(255,255,255,.5); }
  .gb-val { width:18px; font-size:14px; font-weight:bold; color:var(--navy); font-variant-numeric:tabular-nums; }
  .gb-note { font-size:8.5px; color:var(--muted); margin-top:3px; padding-left:22px; }

  /* stat tiles */
  .tiles { display:flex; gap:12px; }
  .tile { flex:1; background:#fff; border:1px solid var(--grid); border-radius:10px; padding:16px 18px 15px; border-top:4px solid var(--gold); box-shadow:0 1px 3px rgba(11,11,11,.05); }
  .tile:nth-child(2) { border-top-color:var(--red); }
  .tile:nth-child(3) { border-top-color:var(--aqua); }
  .tile-v { font-size:32px; font-weight:bold; color:var(--navy); letter-spacing:-.5px; }
  .tile-l { font-size:9.4px; color:var(--ink2); line-height:1.4; margin-top:3px; }

  /* bracket */
  .bracket { display:flex; gap:14px; align-items:stretch; }
  .bk-col { flex:1.25; display:flex; flex-direction:column; gap:8px; }
  .bk-col.bk-mid { flex:1; justify-content:space-around; }
  .bk-round { font-size:8.5px; font-weight:bold; letter-spacing:2px; color:var(--muted); margin-bottom:1px; }
  .bk-card { background:#fff; border:1px solid var(--grid); border-radius:8px; padding:11px 13px; box-shadow:0 1px 2px rgba(11,11,11,.04); }
  .bk-when { font-size:8.2px; color:var(--muted); font-weight:bold; letter-spacing:.8px; margin-bottom:4px; }
  .bk-row { display:flex; align-items:center; gap:7px; padding:3px 0; }
  .bk-name { font-size:11.5px; font-weight:bold; }
  .bk-tbd { color:var(--ink2); font-weight:normal; font-size:9.5px; }
  .bk-flags { display:inline-flex; gap:3px; }
  .bk-pending { background:var(--plane); border-style:dashed; }
  .bk-sf { padding:10px; }
  .bk-label { font-size:9.5px; color:var(--ink2); }
  .bk-final { border:2px solid var(--gold); background:#fffaf0; text-align:center; padding:24px 12px; display:flex; flex-direction:column; align-items:center; gap:5px; }
  .bk-final-day { font-size:15px; font-weight:bold; color:var(--navy); }
  .bk-final-venue { font-size:8.5px; color:var(--ink2); }

  /* week strip */
  .week { display:flex; gap:7px; }
  .wk-day { flex:1; border:1px solid var(--grid); border-radius:8px; padding:10px 9px 11px; background:#fff; }
  .wk-today { background:var(--navy); border-color:var(--navy); color:#fff; }
  .wk-dow { font-size:8.5px; font-weight:bold; letter-spacing:1.5px; color:var(--blue); }
  .wk-today .wk-dow { color:#86b6ef; }
  .wk-date { font-size:13px; font-weight:bold; margin:1px 0 7px; }
  .wk-item { font-size:8.4px; line-height:1.35; color:var(--ink2); padding:2px 0; border-top:1px solid var(--grid); }
  .wk-today .wk-item { color:#e8f0fb; border-top-color:rgba(255,255,255,.2); }

  /* teaser bar (page 1) */
  .teaser { background:linear-gradient(120deg,#08244a, var(--navy)); color:#fff; border-radius:10px; padding:14px 20px; display:flex; align-items:center; gap:14px; }
  .teaser-k { font-size:9px; font-weight:bold; letter-spacing:2px; color:#eda100; white-space:nowrap; }
  .teaser-m { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:bold; }
  .teaser-m .t-time { background:rgba(255,255,255,.14); border-radius:5px; padding:2px 8px; font-size:10px; color:#cde2fb; }
  .teaser-arrow { margin-left:auto; display:flex; align-items:center; gap:6px; font-size:8.5px; letter-spacing:1.5px; color:#9ec5f4; font-weight:bold; }

  /* stage tracker (page 3) */
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

  /* page furniture */
  .pg-head { background:var(--navy); color:#fff; padding:12px 34px; display:flex; align-items:center; gap:10px; }
  .pg-head .ph-title { font-size:13px; font-weight:bold; letter-spacing:3px; }
  .pg-head .ph-right { margin-left:auto; font-size:9px; color:#9ec5f4; letter-spacing:1px; }
  .foot { margin-top:auto; padding:10px 34px 14px; display:flex; align-items:center; gap:8px; font-size:7.5px; color:var(--muted); border-top:1px solid var(--grid); }
  .foot .f-brand { font-weight:bold; letter-spacing:1.5px; color:var(--ink2); }
  .foot .f-page { margin-left:auto; font-weight:bold; }
  .signoff { background:linear-gradient(120deg,#08244a, var(--navy)); color:#fff; border-radius:10px; padding:20px 22px; display:flex; align-items:center; gap:12px; }
  .signoff b { font-size:14px; }
  .signoff span { font-size:9.5px; color:#cde2fb; }
`;

/* ----------------------------------------------------------------- HTML -- */
function footer(pageNo) {
  return `<div class="foot">
    ${icon('ball', 10, '#898781')}
    <span class="f-brand">THE MORNING KICKOFF</span>
    <span>${esc(data.dateLabel)} · Edition #${data.editionNumber} · ${esc(data.sources)}</span>
    <span class="f-page">${pageNo} / 3</span>
  </div>`;
}

const pageHead = (title, right) => `<div class="pg-head">
  ${icon('ball', 16, '#86b6ef')}
  <span class="ph-title">${title}</span>
  <span class="ph-right">${esc(right)}</span>
</div>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>

<!-- ============================== PAGE 1 ============================== -->
<div class="page">
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
    <div class="hero">
      <span class="hero-kicker">${icon('bolt', 11)}${esc(data.hero.kicker)}</span>
      <h2>${esc(data.hero.headline)}</h2>
      <p>${esc(data.hero.standfirst)}</p>
    </div>
    ${data.yesterday.map(matchCard).join('')}
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
      <span class="teaser-k">TONIGHT ON YOUR SCREEN</span>
      ${data.today.map((f) => `<span class="teaser-m">${flag(f.home.code, 'flag flag-sm')} ${esc(f.home.name)} – ${esc(f.away.name)} ${flag(f.away.code, 'flag flag-sm')} <span class="t-time">${esc(f.timeFr)}</span></span>`).join('')}
      <span class="teaser-arrow">FULL PREVIEWS PAGE 2 ${icon('arrow', 12)}</span>
    </div>
  </div>
  ${footer(1)}
</div>

<!-- ============================== PAGE 2 ============================== -->
<div class="page">
  ${pageHead('TODAY ON THE PITCH', 'Two places in the quarter-finals up for grabs')}
  <div class="body">
    ${data.today.map(fixtureCard).join('')}
    ${sectionHead('boot', 'THE GOLDEN BOOT RACE', 'Top scorers after the round of 16 openers')}
    <div class="card">${goldenBoot(data.goldenBoot)}</div>
    ${sectionHead('bolt', 'NUMBERS OF THE DAY', '')}
    <div class="tiles">
      ${data.statTiles.map((t) => `<div class="tile"><div class="tile-v">${esc(t.value)}</div><div class="tile-l">${esc(t.label)}</div></div>`).join('')}
    </div>
  </div>
  ${footer(2)}
</div>

<!-- ============================== PAGE 3 ============================== -->
<div class="page">
  ${pageHead('THE ROAD TO THE FINAL', 'All kick-off times in French time (CEST)')}
  <div class="body">
    <div class="card"><div class="tracker">
      ${data.stageTracker.stages.map((t) => `<div class="trk ${t.state}"><div class="trk-dot"></div><div class="trk-label">${esc(t.label)}</div><div class="trk-sub">${esc(t.sub)}</div></div>`).join('')}
    </div></div>
    ${sectionHead('bracket', 'KNOCKOUT BRACKET', 'Quarter-finals 9–12 July · Semi-finals 14–15 July')}
    ${bracket(data.bracket)}
    ${sectionHead('calendar', 'YOUR WEEK IN FOOTBALL', 'Monday 6 — Sunday 12 July')}
    ${weekStrip(data.week)}
    <div class="signoff">
      ${icon('ball', 26, '#eda100')}
      <div><b>See you tomorrow morning.</b><br><span>Next edition: the last two quarter-finalists — Argentina–Egypt and Switzerland–Colombia reports, plus the full last-eight preview.</span></div>
    </div>
  </div>
  ${footer(3)}
</div>

</body></html>`;

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
  console.log('PDF:', pdfPath);
})();
