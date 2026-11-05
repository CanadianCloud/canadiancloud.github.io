const $ = selector => document.querySelector(selector);
const citySelect = $('#city-select');
const search = $('#event-search');
const dateFilter = $('#date-filter');
const grid = $('#event-grid');
const more = $('#load-more');
const sourceLinks = $('#calendar-links');
let data = null;
let loadFailed = false;
let limit = 6;
let selectedCity = 'vancouver';

try {
  const city = new URL(location.href).searchParams.get('city') || localStorage.getItem('cpca_city');
  if ([...citySelect.options].some(option => option.value === city)) selectedCity = city;
} catch {}
citySelect.value = selectedCity;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`); svg.append(use); return svg;
}
function link(url, className, text) {
  const a = el('a', className, text);
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a;
}
function safeURL(value, allowedHosts) {
  try { const url = new URL(value); return url.protocol === 'https:' && allowedHosts.includes(url.hostname) ? url.href : null; } catch { return null; }
}
function normalized(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function selectCity(id, save = true) {
  selectedCity = id; citySelect.value = id; limit = 6;
  search.value = ''; dateFilter.value = 'all';
  document.querySelectorAll('.map-city').forEach(marker => marker.setAttribute('aria-pressed', String(marker.dataset.city === id)));
  if (save) {
    try { localStorage.setItem('cpca_city', id); const url = new URL(location.href); url.searchParams.set('city', id); history.replaceState(null, '', url); } catch {}
  }
  render();
}
function eventDate(event, city) {
  const timezone = event.timezone || city.timezone;
  // All-day dates are calendar dates, so never shift them across time zones.
  const date = event.allDay && event.date ? new Date(`${event.date.slice(0,4)}-${event.date.slice(4,6)}-${event.date.slice(6,8)}T12:00:00Z`) : new Date(event.start);
  const tz = event.allDay ? 'UTC' : timezone;
  const fmt = (options) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...options }).format(date);
  const day = fmt({ day: 'numeric' });
  const month = fmt({ month: 'short' });
  let time;
  if (event.allDay) {
    time = 'All day';
    if (event.endDate && event.endDate > event.date) {
      const end = new Date(`${event.endDate.slice(0,4)}-${event.endDate.slice(4,6)}-${event.endDate.slice(6,8)}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      if (end.getTime() !== date.getTime()) time = 'Through ' + new Intl.DateTimeFormat('en-CA', { month:'short', day:'numeric', timeZone:'UTC' }).format(end);
    }
  } else time = fmt({ weekday:'short', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
  const thisYear = new Intl.DateTimeFormat('en-CA',{year:'numeric',timeZone:tz}).format(new Date());
  if (fmt({year:'numeric'}) !== thisYear) time = fmt({year:'numeric'}) + ' · ' + time;
  return { day, month, time };
}
function eventCard(event, city, sources) {
  const url = safeURL(event.url, ['luma.com', 'lu.ma']);
  if (!url) return null;
  const a = link(url, 'event-card');
  const date = eventDate(event, city);
  const badge = el('div', 'event-date');
  badge.append(el('span', '', date.month), el('strong', '', date.day));
  badge.setAttribute('aria-hidden','true');
  const body = el('div', 'event-body');
  const names = event.sources.map(id => sources.find(source => source.id === id)?.name).filter(Boolean);
  body.append(el('p', 'event-source', names.join(' · ')), el('h4', '', event.name));
  const time = el('time', 'event-time', `${date.month} ${date.day} · ${date.time}`);
  time.dateTime = event.start; body.append(time);
  const isOnline = event.online || /\b(online|virtual|zoom|google meet)\b/i.test(event.location || '');
  const location = el('p', 'event-location');
  const locationText = isOnline ? 'Online' : event.venueCity || event.location || 'Location shared on Luma';
  location.title = locationText;
  location.append(icon('pin'), el('span', '', locationText.length > 95 ? locationText.slice(0,92) + '…' : locationText));
  body.append(location); a.append(badge, body, el('span', 'event-external', '↗'));
  const cover = safeURL(event.cover, ['images.lumacdn.com']);
  if (cover) { const image = el('img', 'event-thumb'); image.src = cover; image.alt = ''; image.loading = 'lazy'; image.width = 58; image.height = 58; image.addEventListener('error', () => image.remove(), { once:true }); a.append(image); }
  return a;
}
function render() {
  if (!data) return;
  const city = data.cities.find(city => city.id === selectedCity);
  if (!city) return;
  $('#selected-city').textContent = city.name;
  $('#selected-province').textContent = city.province;
  const sources = data.sources.filter(source => source.city === city.id);
  sourceLinks.replaceChildren();
  for (const source of sources) {
    const url = safeURL(source.url, ['luma.com', 'lu.ma']);
    if (url) sourceLinks.append(link(url, source.status !== 'ok' && source.status ? 'source-warning' : '', source.name + ' ↗'));
  }
  $('#source-count').textContent = `(${sources.length})`;
  const now = Date.now();
  const upcoming = data.events.filter(event => event.city === city.id && Date.parse(event.end || event.start) > now);
  const query = normalized(search.value.trim());
  const maxDate = dateFilter.value === 'all' ? Infinity : now + Number(dateFilter.value) * 86400000;
  const filtered = upcoming.filter(event => Date.parse(event.start) <= maxDate && (!query || normalized([event.name,event.location,...event.sources.map(id => sources.find(s => s.id === id)?.name || '')].join(' ')).includes(query))).sort((a,b) => Date.parse(a.start) - Date.parse(b.start));
  const hasFailures = sources.some(source => source.status === 'cached' || source.status === 'unavailable');
  const allUnavailable = sources.length && sources.every(source => source.status === 'unavailable');
  const stale = data.updated_at && now - Date.parse(data.updated_at) > 3 * 3600000;
  const notice = $('#feed-notice');
  notice.hidden = !(hasFailures || stale || loadFailed);
  notice.textContent = loadFailed ? 'We could not load event listings. You can still browse the community calendars below.' : hasFailures ? 'Some community calendars could not be refreshed. Available listings are shown below; check the original calendars for the latest details.' : stale ? 'The automatic refresh is delayed. Check the original community calendars for the latest updates.' : '';
  $('#results-status').textContent = loadFailed || allUnavailable ? 'Event listings are temporarily unavailable.' : `${filtered.length} upcoming ${filtered.length === 1 ? 'event' : 'events'}${query || dateFilter.value !== 'all' ? ' matching your filters' : ''} from ${sources.length} community ${sources.length === 1 ? 'calendar' : 'calendars'}. Times shown in each event's local time.`;
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const event of filtered.slice(0, limit)) { const card = eventCard(event, city, sources); if (card) fragment.append(card); }
  grid.append(fragment);
  grid.setAttribute('aria-busy','false');
  if (!filtered.length) {
    const empty = el('div', 'empty-events'); empty.append(icon('cloud'));
    const filteredOut = upcoming.length > 0;
    empty.append(el('h4', '', loadFailed || allUnavailable ? 'The community is still here.' : filteredOut ? 'No events match those filters.' : 'Something good is on the horizon.'));
    empty.append(el('p', '', loadFailed || allUnavailable ? 'Visit the calendars below to see current events and connect with your local community.' : filteredOut ? 'Try another keyword or a wider date range to find your next connection.' : `There are no upcoming events currently listed for ${city.name}. Explore the community calendars below or try another city.`));
    const button = el('button','',filteredOut ? 'Clear filters →' : 'Explore community calendars ↓');
    button.type = 'button'; button.addEventListener('click', () => {
      if (filteredOut) { search.value='';dateFilter.value='all';render();search.focus(); }
      else { $('.calendar-sources').open=true;$('.calendar-sources').scrollIntoView({block:'nearest',behavior:'smooth'});$('.calendar-sources summary').focus(); }
    }); empty.append(button); grid.append(empty);
  }
  more.hidden = filtered.length <= limit;
  more.textContent = `Show more events (${Math.max(0, filtered.length - limit)} more) ↓`;
  const updated = $('#last-updated');
  updated.replaceChildren(document.createTextNode('Events are hosted by their respective communities. Check Luma for details and registration.'));
  if (data.updated_at) {
    const date = new Date(data.updated_at);
    const time = el('time','',new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date));
    time.dateTime = data.updated_at; updated.append(document.createTextNode(' Last refreshed '),time,document.createTextNode('.'));
  }
}
citySelect.addEventListener('change', () => selectCity(citySelect.value));
document.querySelectorAll('.map-city').forEach(marker => {
  marker.addEventListener('click', () => selectCity(marker.dataset.city));
  marker.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCity(marker.dataset.city); } });
});
search.addEventListener('input', () => { limit = 6; render(); });
dateFilter.addEventListener('change', () => { limit = 6; render(); });
more.addEventListener('click', () => { const oldLength = grid.children.length; limit += 6; render(); grid.children[oldLength]?.focus(); });
document.querySelector('.discover-button').addEventListener('click', () => setTimeout(() => $('#city-events').focus({preventScroll:true}), 0));
selectCity(selectedCity, false);

async function loadEvents() {
try {
  const response = await fetch('data/events.json', {cache:'no-cache', signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const loaded = await response.json();
  if (!Array.isArray(loaded.events) || !Array.isArray(loaded.cities) || !Array.isArray(loaded.sources)) throw new Error('Invalid feed');
  data = loaded; render();
} catch {
  loadFailed = true;
  try { const response = await fetch('data/calendars.json'); data = {...await response.json(),events:[]}; render(); }
  catch { $('#results-status').textContent='Event listings are temporarily unavailable.'; grid.setAttribute('aria-busy','false'); grid.replaceChildren(link('https://luma.com/CloudCanada','button button-outline','Browse Cloud Events on Luma ↗')); }
}
}
loadEvents();
// Remove ended events if someone leaves the page open for a long time.
setInterval(() => render(), 60000);

const menuToggle = $('.menu-toggle');
const nav = $('#main-nav');
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); nav.classList.toggle('is-open',open);
});
function closeMenu() { menuToggle.setAttribute('aria-expanded','false'); menuToggle.setAttribute('aria-label','Open menu'); nav.classList.remove('is-open'); }
nav.querySelectorAll('a,button').forEach(item => item.addEventListener('click',closeMenu));
document.addEventListener('keydown',event => { if(event.key==='Escape') closeMenu(); });
$('#current-year').textContent = new Date().getFullYear();

const dialog = $('#login-dialog');
const loginError = $('#login-error');
const pwInput = $('#pw');
let loginOpener;
function openLogin(event) {
  loginOpener = event.currentTarget; loginError.hidden = true; pwInput.value = ''; dialog.showModal();
  ($('#email').value ? pwInput : $('#email')).focus();
}
$('#openLogin').addEventListener('click',openLogin);
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click',openLogin));
$('#closeLogin').addEventListener('click', () => dialog.close());
dialog.addEventListener('click',event => { if(event.target===dialog) { const rect=dialog.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close(); } });
dialog.addEventListener('close', () => loginOpener?.focus());
$('#loginForm').addEventListener('submit',event => {
  event.preventDefault();
  const SHARED_PASSWORD = "CloudisGreat!";
  if(pwInput.value===SHARED_PASSWORD) { sessionStorage.setItem('cc_auth','1'); location.href='committee.html'; }
  else { loginError.hidden=false; pwInput.focus();pwInput.select(); }
});
