# Panel - Personal Dashboard

## Main

### Goal
- A personal home screen showing info I care about.
- Runs on a small screen, always on, fullscreen in a browser.
- Built to last: start small, keep adding widgets.

### Stack
- `HTML` + `CSS` + `JS`, no framework.
- JS calls APIs directly (front-end only). Add a Node backend only if an API blocks front-end access.
- Electron (make `.app`) later if needed. Core stays web, so nothing is wasted.

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
└── widgets/
    ├── theme.js
    ├── greeting.js
    ├── clock.js
    ├── weather.js
    ├── calendar.js
    ├── tasks.js
    └── device-status.js
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

### 0.4.2 <- Currently
- [x] Time-based dark mode: dark 18:00–05:00, light otherwise. Auto-switches while running; each card keeps its hue.
- [x] Night owl 🦉 in the "Good Night" greeting during 00:00–04:00.

---

## Notes
- Weather API: Open-Meteo (free, no key). Location hardcoded to Taipei for now.
- Greeting line: Anthropic API (`claude-haiku-4-5`), key in `.env` as `ANTHROPIC_API_KEY`; falls back to a local phrase without it. Only remaining AI/token use.
- Calendar + Tasks: Composio MCP called directly (JSON-RPC over HTTP, no LLM) via `COMPOSIO_MCP_URL` / `COMPOSIO_MCP_TOKEN` in `.env`. Tools: `GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS`, `GOOGLETASKS_LIST_ALL_TASKS`, `GOOGLETASKS_PATCH_TASK` (via `COMPOSIO_MULTI_EXECUTE_TOOL`). Cached 10 min / 5 min.
- Layout: top bar (greeting + system status) above a fixed 2 × 2 grid (clock, weather, calendar, tasks).
- Device thresholds: warning at 70% load or 75°C; danger at 90% load or 90°C; critical at 98% load or 100°C.
- Style: soft floating cards on a cream canvas, system fonts, inline SVG icons.
- Theme: `widgets/theme.js` sets `data-theme` on `<html>` by hour (dark 18:00–05:00); CSS overrides live in a `:root[data-theme='dark']` block. An inline `<head>` script sets it before first paint to avoid a flash.
