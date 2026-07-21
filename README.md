# Panel

## Run

```bash
python3 serve.py
```

Then open [http://localhost:8642](http://localhost:8642).

### Or run it as a Mac app

Package Panel into either full-screen `.dmg`:

```bash
npm install             # once, pulls Electron + electron-builder
npm run dist            # private: dist/panel-05.1.dmg, includes .env
npm run dist:public     # public: dist/panel-0.5.1-C-public.dmg, no API credentials
```

Open the `.dmg`, drag **Panel** to Applications, and launch it — it opens full-screen (kiosk) and starts the Python server for you. Needs the system `python3` (the app tells you to install it if it's missing). During development, `npm start` runs the same window without packaging.

> The private build bundles your `.env` inside the app, so keep `panel-05.1.dmg`
> to yourself. The public build includes `.env.example` with blank credentials.

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the Composio MCP directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. On macOS, RAM comes from `vm_stat` and `sysctl`, while Apple Silicon temperature comes directly from the read-only SMC sensor interface. Neither reading needs `psutil`, sudo, or a separate monitoring app. Unsupported sensors are shown as unavailable.

Set `ANTHROPIC_API_KEY` (greeting) and `COMPOSIO_MCP_URL` / `COMPOSIO_MCP_TOKEN` (calendar + tasks) in `.env` — see [.env.example](.env.example). Everything degrades gracefully when a key is missing.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current: **0.5.1-C**

- Fixed RAM reporting when Panel launches through a Python installation without `psutil`.
- Added native Apple Silicon CPU temperature reporting through the SMC.
- Calendar and Tasks refresh every 15 minutes and can be refreshed immediately
  by clicking their "Updated … ago" text.
- Packaged as a full-screen macOS `.dmg` app with a six-hour system history dock.

### 0.4.2

- Time-based dark mode (dark 18:00–05:00, light otherwise; auto-switches while running)
- Night owl 🦉 in the "Good Night" greeting during 00:00–04:00
- Top bar: time-based greeting (AI line, local fallback) + wifi state
- Bottom dock: device uptime, live system values, and 12-window status history
- 2 × 2 grid: clock, weather, calendar, tasks
- Weather: UV index with a color-tier background (blue / green / yellow / red by UV band)
- Calendar: vertical timeline of upcoming Google Calendar events
- Tasks: Google Tasks by folder, with checkboxes that complete and sync back
- Calendar + tasks read the Composio MCP directly — no LLM, zero Anthropic tokens

Full version history in [plan.md](plan.md).

## Coworkers
- YuYu9372
- Claude
