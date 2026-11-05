// Luma's public iCalendar feeds contain one VEVENT per published occurrence.
// Keep only public event metadata, never attendee or registration information.
export function unescapeText(value = '') {
  return value.replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? '\n' : c);
}

export function localToUTC(parts, timeZone = 'UTC') {
  const target = Date.UTC(...parts);
  if (timeZone === 'UTC') return new Date(target).toISOString();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  let stamp = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(stamp).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    stamp += target - shown;
  }
  return new Date(stamp).toISOString();
}

function parseDate(property, fallbackTimeZone) {
  if (!property) return null;
  const match = property.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = match;
  const timeZone = utc ? 'UTC' : property.params.TZID || fallbackTimeZone;
  try {
    return localToUTC([+year, +month - 1, +day, +hour, +minute, +second], timeZone);
  } catch { return null; }
}

export function parseICS(text, fallbackTimeZone = 'UTC') {
  if (!text.includes('BEGIN:VCALENDAR') || !text.includes('END:VCALENDAR')) {
    throw new Error('Response is not a complete iCalendar feed');
  }
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let item = null;
  let nested = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { item = {}; nested = 0; continue; }
    if (!item) continue;
    if (line.startsWith('BEGIN:')) { nested++; continue; }
    if (line === 'END:VEVENT') {
      if (item.STATUS?.value.toUpperCase() !== 'CANCELLED') {
        const start = parseDate(item.DTSTART, fallbackTimeZone);
        const allDay = item.DTSTART?.params.VALUE === 'DATE';
        const end = parseDate(item.DTEND, fallbackTimeZone) || (start && new Date(Date.parse(start) + (allDay ? 86400000 : 7200000)).toISOString());
        const description = unescapeText(item.DESCRIPTION?.value);
        const rawURL = item.URL?.value || description.match(/https:\/\/(?:lu\.ma|luma\.com)\/[A-Za-z0-9_-]+/)?.[0];
        const url = safeEventURL(rawURL);
        const [lat, lon] = (item.GEO?.value || '').split(';').map(Number);
        if (start && end && url && item.SUMMARY?.value) events.push({
          id: unescapeText(item.UID?.value || url).replace(/@events\.lu\.ma$/, ''),
          name: unescapeText(item.SUMMARY.value), start, end, allDay,
          date: allDay ? item.DTSTART.value : null,
          endDate: allDay ? item.DTEND?.value || null : null,
          timezone: item.DTSTART?.params.TZID || fallbackTimeZone,
          location: unescapeText(item.LOCATION?.value || ''), url,
          latitude: item.GEO && Number.isFinite(lat) ? lat : null,
          longitude: item.GEO && Number.isFinite(lon) ? lon : null,
          sequence: Number(item.SEQUENCE?.value || 0)
        });
      }
      item = null;
      continue;
    }
    if (line.startsWith('END:')) { nested = Math.max(0, nested - 1); continue; }
    if (nested) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [key, ...attributes] = line.slice(0, colon).split(';');
    const params = Object.fromEntries(attributes.map(x => {
      const eq = x.indexOf('=');
      return [x.slice(0, eq), x.slice(eq + 1).replace(/^"|"$/g, '')];
    }));
    item[key] = { value: line.slice(colon + 1), params };
  }
  return events;
}

export function safeEventURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['luma.com', 'lu.ma'].includes(url.hostname)) return null;
    return 'https://luma.com' + url.pathname;
  } catch { return null; }
}

export function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function belongsToCity(event, city, source) {
  if (Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
    return distanceKm(city, event) <= city.radiusKm;
  }
  const location = normalize(event.location || '');
  if (city.aliases.some(alias => location.includes(normalize(alias)))) return true;
  // Global / national calendars need positive location evidence. City calendars
  // may publish online events or withhold the address until registration.
  if (source.scope === 'global') return false;
  if (/\b(online|virtual|zoom|google meet|remote)\b/.test(location)) return true;
  return !location || /\b(register|registration|announced|tba|tbd|private|revealed)\b/.test(location);
}

export function deduplicate(events) {
  const byURL = new Map();
  for (const event of events) {
    const key = event.url;
    const prior = byURL.get(key);
    if (!prior) { byURL.set(key, { ...event, sources: [...event.sources] }); continue; }
    const sources = [...new Set([...prior.sources, ...event.sources])];
    const newer = (event.sequence || 0) >= (prior.sequence || 0) ? event : prior;
    byURL.set(key, { ...newer, cover: newer.cover || prior.cover || event.cover || null, sources });
  }
  return [...byURL.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.name.localeCompare(b.name));
}
