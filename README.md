# Canadian Public Cloud Association

The Northern Lights homepage for [canadiancloud.org](https://canadiancloud.org), hosted on GitHub Pages.

## Local development

The website is buildless HTML, CSS and JavaScript. Serve the repository with any static HTTP server, for example `python -m http.server 8080`, and open http://localhost:8080. The public files are `index.html`, `northern-lights.css`, `app.js`, the original brand assets, `assets/`, and `data/events.json` / `data/calendars.json`.

## Community event finder

`data/calendars.json` contains the 10 cities and 24 public Luma calendars. `node scripts/update-events.mjs` pulls their public iCalendar subscriptions, supplements thumbnails from the public calendar pages, removes cancelled/ended events, filters locations to the relevant metro area, deduplicates event URLs and sorts events by start time. No Luma API key, paid subscription, attendee data or browser CORS proxy is needed.

The GitHub Actions workflow runs at minute 17 of every hour, on pushes to `main`, and manually through Actions. It refreshes the event data and publishes the resulting static site with the official GitHub Pages actions. Scheduled GitHub jobs can be delayed by GitHub. A successful deployment is the published data source; scheduled refreshes do not create repository commits. Run the workflow manually to publish calendar configuration changes immediately.

Events from national/global calendars (Cloud Events, AI Salon, The AI Collective) must have matching location information. Local calendars may also show online events and events with addresses shared only after registration. Events without positive local evidence are excluded from global calendars. An empty city shows an honest empty state and links to its calendars.

A failed source retains future events from its last successful pull for up to seven days; the page identifies partial refresh failures. If every source fails, the workflow fails before deployment, preserving the live site. The source snapshot in the repository provides an initial fallback; the deployed data is refreshed each run. The page removes ended events even between deployments and displays its refresh timestamp.

Run `node --test tests/*.test.mjs` for the feed parser, city filtering and deduplication checks.

## Branding and retained pages

`favicon.ico`, the footer's `logo.png`, `committee.html`, the existing login password and session key are preserved. The new header combines a mint maple leaf with the CPCA wordmark. Community, sponsor, speaker and social links are retained.

The Canada map is generated from the public-domain Natural Earth 1:110m countries dataset, [Natural Earth repository](https://github.com/nvkelso/natural-earth-vector). `node scripts/generate-map.mjs` regenerates the accessible inline map from `data/canada.geojson`. The aurora artwork was generated for this website.
