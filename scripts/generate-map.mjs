import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const canada = JSON.parse(await readFile(new URL('data/canada.geojson', root), 'utf8'));
const { cities } = JSON.parse(await readFile(new URL('data/calendars.json', root), 'utf8'));
// Lambert azimuthal equal-area projection, centred on Canada.
const rad = n => n * Math.PI / 180;
function project([longitude, latitude]) {
  const lon = rad(longitude + 96), lat = rad(latitude), centre = rad(60);
  const k = Math.sqrt(2 / (1 + Math.sin(centre) * Math.sin(lat) + Math.cos(centre) * Math.cos(lat) * Math.cos(lon)));
  return [k * Math.cos(lat) * Math.sin(lon), -k * (Math.cos(centre) * Math.sin(lat) - Math.sin(centre) * Math.cos(lat) * Math.cos(lon))];
}
const polygons = canada.geometry.type === 'MultiPolygon' ? canada.geometry.coordinates : [canada.geometry.coordinates];
const projected = polygons.flat(2).map(project);
const minX = Math.min(...projected.map(p => p[0])), maxX = Math.max(...projected.map(p => p[0]));
const minY = Math.min(...projected.map(p => p[1])), maxY = Math.max(...projected.map(p => p[1]));
const scale = Math.min(830 / (maxX - minX), 490 / (maxY - minY));
function xy(point) {
  const [x, y] = project(point);
  return [85 + (x - minX) * scale, 30 + (y - minY) * scale];
}
const land = polygons.map(rings => rings.map(ring => ring.map((point, i) => {
  const [x, y] = xy(point); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ') + 'Z').join(' ')).join(' ');
const offsets = {
  vancouver: [-18, -22, 'end'], victoria: [-28, 34, 'end'],
  edmonton: [-12, -25, 'end'], calgary: [18, 28, 'start'],
  winnipeg: [-10, 31, 'end'], waterloo: [-36, 65, 'end'],
  toronto: [22, 93, 'start'], ottawa: [-20, -40, 'end'],
  montreal: [36, -8, 'start'], halifax: [20, 36, 'start']
};
const points = cities.map(city => {
  const [x, y] = xy([city.longitude, city.latitude]);
  const [dx, dy, anchor] = offsets[city.id];
  const tx = x + dx, ty = y + dy;
  return `<g class="map-city" data-city="${city.id}" role="button" tabindex="0" aria-label="Show events in ${city.name}" aria-pressed="${city.id === 'vancouver'}">
    <title>${city.name}: explore upcoming tech events</title>
    <path class="map-leader" d="M${x.toFixed(1)},${y.toFixed(1)} L${tx.toFixed(1)},${(ty - 6).toFixed(1)}"/>
    <circle class="map-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16"/>
    <circle class="map-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>
    <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${city.name}</text>
    <rect class="map-hit" x="${(anchor === 'end' ? tx - 110 : tx - 5).toFixed(1)}" y="${(ty - 23).toFixed(1)}" width="120" height="34" rx="8"/>
  </g>`;
}).join('\n');
const svg = `<svg id="canada-map" viewBox="0 0 1000 680" role="group" aria-labelledby="map-title map-desc" xmlns="http://www.w3.org/2000/svg">
  <title id="map-title">Find tech events across Canada</title>
  <desc id="map-desc">Select a city on the map or use the city selector to see its upcoming events.</desc>
  <defs><linearGradient id="map-fill" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#204657"/><stop offset="1" stop-color="#102e40"/></linearGradient></defs>
  <ellipse cx="505" cy="390" rx="360" ry="190" fill="#59e5c0" opacity=".025"/>
  <path d="${land}" fill="url(#map-fill)" stroke="#4e928e" stroke-width="1.3" stroke-linejoin="round"/>
  <text x="460" y="340" class="map-country" text-anchor="middle">C A N A D A</text>
  ${points}
</svg>`;
await writeFile(new URL('assets/canada-map.svg', root), svg);
const index = await readFile(new URL('index.html', root), 'utf8');
await writeFile(new URL('index.html', root), index.replace(/<!-- CANADA_MAP_START -->[\s\S]*?<!-- CANADA_MAP_END -->/, `<!-- CANADA_MAP_START -->${svg}<!-- CANADA_MAP_END -->`));
console.log('Generated a geographically accurate Canada map with 10 accessible city markers.');
