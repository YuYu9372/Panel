# Panel - Personal Dashboard

## Main

### Goal
- A personal home screen showing info I care about.
- Runs on a small screen, always on, fullscreen in a browser.
- Built to last: start small, keep adding widgets.

### Stack
- `HTML` + `CSS` + `JS`, no framework.
- JS calls APIs directly (front-end only). Add a Node backend only if an API blocks front-end access.
- Electron wrapper (`electron/main.js`) packages the web app into a full-screen macOS `.dmg`; it spawns `serve.py` and points a kiosk window at it. Core stays web, so nothing is wasted.

### Rules
> Adding a new widget should be easy.

- Each widget is a standalone module: fetches, updates, and renders itself.
- Main app only loads widgets, lays them out, and triggers updates on a timer.
- New feature = new widget, no need to touch anything else.

### Files
```
Panel/
├── plan.md
├── index.html         
├── style.css
├── serve.py            # Static server + local device API
├── app.js              
├── package.json        # Electron app + electron-builder (.dmg)
├── electron/
│   └── main.js         # Spawns serve.py, opens a kiosk window
└── widgets/
    ├── util.js            # Shared helpers (relative time)
    ├── theme.js
    ├── greeting.js
    ├── clock.js
    ├── weather.js
    ├── calendar.js
    ├── tasks.js
    ├── status-grid.js     # 5×12 status history grid (CPU/GPU/RAM/TEMP/WIFI)
    └── connectivity.js    # Wifi/latency indicator + offline screen
```

---

## Version

### 0.1.0
- [x] Clock + date
- [x] Weather
- [x] Greeting bar
- [x] Add git

### 0.2.0
- [x] Time-based greeting bar
- [x] 2 × 2 fullscreen layout
- [x] Clock (top left)
- [x] Weather (top right)
- [x] GitHub contribution count + yearly heatmap (bottom left)
- [x] Device status: CPU, GPU, RAM, temperature (bottom right)
- [x] Green / yellow / red / purple device alert states

### 0.3.0
- [x] AI greeting line via Anthropic API (local fallback)
- [x] Remove GitHub contributions widget
- [x] AI chat widget (bottom left), same API key
- [x] Chat model switcher: Haiku 4.5 / Sonnet 4.6 low / Opus 4.8 low, tier backgrounds

### 0.4.0
- [x] Remove AI chat (was burning tokens fast)
- [x] Call Composio MCP directly from serve.py (no LLM, zero Anthropic tokens)
- [x] Calendar widget: vertical timeline of upcoming Google Calendar events (bottom left)
- [x] Tasks widget: Google Tasks by folder, checkbox completes + syncs back (bottom right)
- [x] Move System status into the top bar (compact chips); calendar + tasks take the bottom row

### 0.4.1
- [x] UV index in weather + color-tier background (blue / green / yellow / red by UV band). Was stranded on the unmerged 0.3.1 branch; re-applied on top of the 0.4.0 layout.

### 0.4.2
- [x] Time-based dark mode: dark 18:00–05:00, light otherwise. Auto-switches while running; each card keeps its hue.
- [x] Night owl 🦉 in the "Good Night" greeting during 00:00–04:00.

### 1.0.0-beta
- [x] Package as a full-screen macOS `.dmg`: an Electron wrapper (`electron/main.js`) spawns `serve.py`, waits for the port, and opens a kiosk window. Uses system `python3`; prompts to install if missing. Build with `npm run dist`.
- [x] Clock ticks aligned to the wall clock: it self-schedules to each whole second (`1000 - Date.now() % 1000`) instead of a free-running `setInterval`, removing the 1–2 s lag and drift.

### 0.5.0
- [x] Connectivity probe: `serve.py` `/api/net` TCP-pings 1.1.1.1 / 8.8.8.8 by IP, returns online + round-trip latency (cached ~2.5 s).
- [x] Wifi indicator (top bar, right): green < 30 ms, yellow ≥ 30 ms, red + slashed icon when offline.
- [x] Offline screen: after the probe fails twice, the dashboard is replaced by a big live clock with "Offline" in red at the bottom, plus the (local) CPU/GPU/RAM/temp chips and the version tag; auto-hides on reconnect.
- [x] Last-updated time on weather, calendar and tasks ("Updated 3 min ago"), refreshed every 30 s.
- [x] Strip a leading "Good <period>" from the AI greeting line so it never doubles the greeting bar's title.
- [x] Version tag in the bottom-left corner ("0.5.0 Beta-A").
- [x] Device chips hold their last-known reading on a failed poll instead of blanking to "—" (only blank on a cold start).
- [x] Fix: `serve.py` `IndentationError` in the greeting prompt that stopped the server from starting.
- [x] `serve.py` honors `PORT` (fallback after `PANEL_PORT`) so it can run on an assigned port.

### 0.5.0 Beta-B
- [x] Bottom **system history dock**: 5 horizontal metric groups (CPU/GPU/RAM/TEMP/WIFI),
  each with 12 clock-aligned **30-min windows**. The first 11 blocks are frozen p95 values;
  block 12 is the current window's running average. Raw live values update every ~2 s.
- [x] Device uptime appears in the dock summary. The current block has a visible outline,
  and every block exposes its time range, aggregation, and value in an English tooltip.
- [x] `serve.py` background sampler + `/api/history`: samples every 2 s (live) / every 30 s
  (window), finalizes each half-hour, persists to `~/.panel/history.json` and restores on restart.
- [x] Offline / no-reading blocks render gray; wifi icon + offline screen unchanged (offline screen mirrors the grid).

### 0.5.1 <- Currently
- [x] Read macOS RAM from `vm_stat` and `sysctl`, independent of `psutil`.
- [x] Read Apple Silicon CPU temperature directly from the SMC without sudo.
- [x] Align the app bundle, dashboard, package, and public artifact version at 0.5.1.

---

## Notes
- Weather API: Open-Meteo (free, no key). Location hardcoded to Taipei for now.
- Greeting line: Anthropic API (`claude-haiku-4-5`), key in `.env` as `ANTHROPIC_API_KEY`; falls back to a local phrase without it. Only remaining AI/token use.
- Calendar + Tasks: Composio MCP called directly (JSON-RPC over HTTP, no LLM) via `COMPOSIO_MCP_URL` / `COMPOSIO_MCP_TOKEN` in `.env`. Tools: `GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS`, `GOOGLETASKS_LIST_ALL_TASKS`, `GOOGLETASKS_PATCH_TASK` (via `COMPOSIO_MULTI_EXECUTE_TOOL`). Cached 10 min / 5 min.
- Layout: top bar (greeting + wifi indicator), fixed 2 × 2 dashboard grid (clock, weather,
  calendar, tasks), and a full-width system history dock at the bottom.
- Connectivity: `/api/net` measures internet reachability via a raw TCP connect (no DNS, no LLM). Widget polls every 5 s; latency ≈ ping. Offline overlay is debounced (2 fails) so brief blips don't flash it.
- Status grid (`/api/history`): server samples device + net and aggregates clock-aligned
  30-min windows. Completed blocks use p95; the current block uses its running average.
  History persists to `~/.panel/history.json` (home dir — the packaged bundle is read-only).
  Block tiers: CPU/GPU `<60 / 60-79 / 80-93 / >93`; RAM `<40 / 40-69 / 70-85 / >85`;
  TEMP `<60 / 60-79 / 80-90 / >90`°C; WIFI `<20 / 20-29 / 30-50 / >50`ms →
  green/yellow/red/purple; gray = no reading / offline.
- Style: soft floating cards on a cream canvas, system fonts, inline SVG icons.
- Theme: `widgets/theme.js` sets `data-theme` on `<html>` by hour (dark 18:00–05:00); CSS overrides live in a `:root[data-theme='dark']` block. An inline `<head>` script sets it before first paint to avoid a flash.
