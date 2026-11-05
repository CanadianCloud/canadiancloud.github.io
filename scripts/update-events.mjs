import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseICS, belongsToCity, deduplicate } from './feed-utils.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/calendars.json', root), 'utf8'));
const now = Date.now();
const fixtureMode = globalThis.process?.env?.CPCA_FIXTURES === '1';
let previous = { sources: {} };
try { previous = JSON.parse(await readFile(new URL('data/feed-cache.json', root), 'utf8')); } catch {}

async function request(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'CPCA-Community-Events/1.0 (+https://canadiancloud.org)' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchSource(source) {
  const city = config.cities.find(city => city.id === source.city);
  try {
    let text;
    // Fixture mode validates all currently supplied calendars without network.
    if (fixtureMode) {
      text = await readFile(new URL(`data/sample-${source.id}.ics`, root), 'utf8');
    } else {
      text = await request(`https://api.lu.ma/ics/get?entity=calendar&id=${source.id}`);
    }
    const events = parseICS(text, city.timezone)
      .filter(event => Date.parse(event.end) > now && belongsToCity(event, city, source))
      .map(event => ({ ...event, sources: [source.id], cover: null }));

    // Public calendar-page metadata supplies thumbnails and local timezones.
    // iCal remains the authoritative complete event list (no pagination cap).
    if (!fixtureMode && events.length) {
      try {
        const html = await request(source.url);
        const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        const data = match && JSON.parse(match[1]).props?.pageProps?.initialData?.data;
        const entries = [...(data?.upcoming?.entries || []), ...(data?.featured_items || [])];
        const lookup = new Map(entries.map(entry => [entry.event?.api_id, entry.event]));
        for (const event of events) {
          const detail = lookup.get(event.id);
          if (!detail) continue;
          if (/^https:\/\/images\.lumacdn\.com\//.test(detail.cover_url || '')) event.cover = detail.cover_url;
          if (detail.timezone) event.timezone = detail.timezone;
          if (detail.geo_address_info?.city) event.venueCity = detail.geo_address_info.city;
          if (detail.location_type === 'online') event.online = true;
        }
      } catch (error) { console.warn(`Thumbnails unavailable for ${source.name}: ${error.message}`); }
    }
    console.log(`${city.name} / ${source.name}: ${events.length} upcoming`);
    return { ...source, status: 'ok', last_success: new Date(now).toISOString(), error: null, events };
  } catch (error) {
    console.warn(`${source.name}: ${error.message}`);
    const cached = previous.sources[source.id];
    const recent = cached && now - Date.parse(cached.last_success) < 7 * 86400000;
    return {
      ...source, status: recent ? 'cached' : 'unavailable', error: error.message,
      last_success: cached?.last_success || null,
      events: recent ? cached.events.filter(event => Date.parse(event.end) > now) : []
    };
  }
}

const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < config.sources.length) results.push(await fetchSource(config.sources[cursor++]));
}));
if (!results.some(source => source.status === 'ok')) {
  throw new Error('All calendar feeds failed. Keeping the previously published data.');
}
results.sort((a, b) => config.sources.findIndex(x => x.id === a.id) - config.sources.findIndex(x => x.id === b.id));
const cache = { sources: Object.fromEntries(results.map(source => [source.id, source])) };
const output = {
  updated_at: new Date(now).toISOString(),
  cities: config.cities,
  sources: results.map(({ events, error, ...metadata }) => metadata),
  events: config.cities.flatMap(city => deduplicate(
    results.filter(source => source.city === city.id).flatMap(source => source.events)
  ).map(event => ({ ...event, city: city.id })))
};
await writeFile(new URL('data/feed-cache.json', root), JSON.stringify(cache, null, 2) + '\n');
await writeFile(new URL('data/events.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(`Saved ${output.events.length} events across ${config.cities.length} cities to ${fileURLToPath(new URL('data/events.json', root))}`);
