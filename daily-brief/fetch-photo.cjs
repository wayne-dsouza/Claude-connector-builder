#!/usr/bin/env node
/**
 * Fetch a publicly available player photo from Wikipedia/Wikimedia Commons.
 *
 * Usage: node daily-brief/fetch-photo.cjs "Erling Haaland" haaland
 *
 * Downloads the article's lead image (500px thumb) to assets/photos/<slug>.jpg
 * and records author + license attribution in assets/photos/credits.json —
 * Commons photos are typically CC BY-SA and require credit, which the
 * generator prints in the brochure footer.
 */
const fs = require('fs');
const path = require('path');

const [title, slug] = process.argv.slice(2);
if (!title || !slug) {
  console.error('usage: fetch-photo.cjs "<Wikipedia article title>" <slug>');
  process.exit(1);
}
const DIR = path.join(__dirname, 'assets', 'photos');
fs.mkdirSync(DIR, { recursive: true });
const CREDITS = path.join(DIR, 'credits.json');

const get = (url) => fetch(url, { headers: { 'user-agent': 'daily-brief/1.0 (personal newsletter; contact: repo owner)' } });
const api = (params) =>
  get('https://en.wikipedia.org/w/api.php?format=json&' + params).then((r) => r.json());

(async () => {
  const q = await api(`action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=500&redirects=1`);
  const page = Object.values(q.query.pages)[0];
  if (!page || !page.thumbnail) throw new Error('no lead image for ' + title);
  const thumbUrl = page.thumbnail.source;
  const fileName = 'File:' + page.pageimage;

  // attribution metadata from Commons
  const meta = await api(`action=query&titles=${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|Credit`);
  const info = Object.values(meta.query.pages)[0]?.imageinfo?.[0] || {};
  const em = info.extmetadata || {};
  const strip = (h) => (h ? String(h.value ?? h).replace(/<[^>]+>/g, '').trim() : '');

  const img = await get(thumbUrl);
  if (!img.ok) throw new Error('download failed ' + img.status);
  fs.writeFileSync(path.join(DIR, slug + '.jpg'), Buffer.from(await img.arrayBuffer()));

  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  credits[slug] = {
    file: fileName,
    artist: strip(em.Artist) || 'Wikimedia Commons',
    license: strip(em.LicenseShortName) || 'see Commons',
    source: info.descriptionurl || thumbUrl,
  };
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  console.log(slug, '←', fileName, '·', credits[slug].artist, '·', credits[slug].license);
})().catch((e) => { console.error(e.message); process.exit(1); });
